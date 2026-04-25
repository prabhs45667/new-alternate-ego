"""Chat API — RAG-powered conversation with the digital twin."""
import uuid
import json
import os
import logging
import threading
from fastapi import APIRouter
from typing import Optional

from db.database import (
    get_twin, create_conversation, add_message, get_messages,
    get_conversations_for_twin, get_connection
)
from db.models import ChatRequest, ChatResponse
from rag.prompt_builder import build_chat_messages
from rag.llm import generate_response_with_mood, get_mood_emoji
from rag.source_tracker import format_sources
from mcp.slash_parser import parse_slash_command
from mcp.social_poster import post_to_platform
from voice.tts import generate_speech
from avatar.avatar_generator import get_emotion_photo
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/message", response_model=ChatResponse)
async def send_message(req: ChatRequest):
    """Send a message and get a RAG-powered response from the digital twin."""
    twin = get_twin(req.twin_id)
    if not twin:
        return ChatResponse(
            reply="I don't recognize this twin. Please complete the onboarding first.",
            mood="neutral"
        )

    # Check for slash commands
    slash = parse_slash_command(req.message)
    if slash:
        return await _handle_slash_command(slash, req, twin)

    # Get or create conversation
    conversation_id = req.conversation_id
    if not conversation_id:
        conversation_id = str(uuid.uuid4())
        create_conversation(conversation_id, req.twin_id)

    # Save user message
    user_msg_id = str(uuid.uuid4())
    add_message(user_msg_id, conversation_id, "user", req.message)

    # Get chat history
    history = get_messages(conversation_id, limit=20)

    # Get user name
    conn = get_connection()
    user = conn.execute("SELECT name FROM users WHERE id = ?", (twin.get("user_id", ""),)).fetchone()
    conn.close()
    name = user["name"] if user else "User"

    # Get system prompt and personality
    system_prompt = twin.get("system_prompt", "")
    personality = json.loads(twin.get("personality_profile", "{}"))
    if not system_prompt:
        from rag.prompt_builder import build_system_prompt
        system_prompt = build_system_prompt(name, personality)

    # Build messages with RAG context
    messages, sources = build_chat_messages(
        twin_id=req.twin_id,
        user_message=req.message,
        system_prompt=system_prompt,
        chat_history=[{"role": m["role"], "content": m["content"]} for m in history[:-1]],  # Exclude last (just added)
        top_k=3
    )

    # Generate LLM response + mood in ONE call (saves ~15s)
    reply, mood = generate_response_with_mood(messages)

    # Format sources
    formatted_sources = format_sources(sources)

    # Save assistant message
    assistant_msg_id = str(uuid.uuid4())
    add_message(
        assistant_msg_id, conversation_id, "assistant",
        reply, json.dumps(formatted_sources), mood
    )

    # Generate TTS audio in background thread (non-blocking)
    audio_url = ""
    tts_path_holder = {"path": ""}
    
    def _generate_tts():
        try:
            audio_path = generate_speech(reply, req.twin_id)
            if audio_path:
                tts_path_holder["path"] = f"/static/{audio_path.replace(os.sep, '/')}"
        except Exception as e:
            logger.warning(f"TTS failed: {e}")
    
    # Run TTS in background but wait briefly for it
    tts_thread = threading.Thread(target=_generate_tts, daemon=True)
    tts_thread.start()
    tts_thread.join(timeout=8)  # Wait max 8 seconds for TTS
    audio_url = tts_path_holder["path"]

    # Emotion-syncing avatar — switch photo based on mood (use avatar version)
    avatar_url = ""
    # Try avatar (stylized) version first, fallback to raw photo
    avatar_path = get_emotion_photo(req.twin_id, mood, prefer_avatar=True)
    if avatar_path:
        avatar_url = f"/static/{avatar_path.replace(os.sep, '/')}"

    return ChatResponse(
        reply=reply,
        sources=formatted_sources,
        mood=mood,
        emoji=get_mood_emoji(mood),
        conversation_id=conversation_id,
        audio_url=audio_url,
        avatar_url=avatar_url
    )


async def _handle_slash_command(slash: dict, req: ChatRequest, twin: dict) -> ChatResponse:
    """Handle a slash command (social media posting, scheduling, auto-reply, help)."""
    # Get user name for personalization
    conn = get_connection()
    user = conn.execute("SELECT name FROM users WHERE id = ?", (twin.get("user_id", ""),)).fetchone()
    conn.close()
    name = user["name"] if user else "User"

    cmd_type = slash.get("type", "social")

    if cmd_type == "social":
        result = post_to_platform(
            platform=slash["platform"],
            action=slash["action"],
            content=slash["content"],
            twin_name=name
        )
    elif cmd_type == "schedule":
        from mcp.social_poster import schedule_post
        result = schedule_post(
            platform=slash["platform"],
            content=slash["content"],
            delay=slash.get("delay", "1h"),
            twin_name=name
        )
    elif cmd_type == "autoreply":
        from mcp.social_poster import set_auto_reply
        result = set_auto_reply(
            twin_id=req.twin_id,
            enabled=slash.get("mode", True)
        )
    elif cmd_type == "help":
        from mcp.social_poster import get_help_message
        result = get_help_message()
    else:
        result = {"success": False, "message": f"Unknown command type: {cmd_type}"}

    cmd_mood = "happy" if result.get("success") else "neutral"
    return ChatResponse(
        reply=result["message"],
        mood=cmd_mood,
        emoji=get_mood_emoji(cmd_mood),
        is_action=True,
        action_result=result,
        conversation_id=req.conversation_id
    )


@router.get("/history/{twin_id}")
async def get_chat_history(twin_id: str, conversation_id: str = None):
    """Get chat history for a twin."""
    if conversation_id:
        messages = get_messages(conversation_id)
        return {"conversation_id": conversation_id, "messages": messages}

    # Get all conversations
    conversations = get_conversations_for_twin(twin_id)
    return {"twin_id": twin_id, "conversations": conversations}


@router.get("/conversations/{twin_id}")
async def list_conversations(twin_id: str):
    """List all conversations for a twin."""
    conversations = get_conversations_for_twin(twin_id)
    return {"conversations": conversations}


@router.get("/export/{twin_id}")
async def export_conversation(twin_id: str, conversation_id: str = None):
    """Export conversation history as JSON for download."""
    from datetime import datetime

    twin = get_twin(twin_id)
    if not twin:
        return {"error": "Twin not found"}

    # Get user name
    conn = get_connection()
    user = conn.execute("SELECT name FROM users WHERE id = ?", (twin.get("user_id", ""),)).fetchone()
    conn.close()
    name = user["name"] if user else "User"

    if conversation_id:
        messages = get_messages(conversation_id, limit=1000)
        return {
            "twin_id": twin_id,
            "twin_name": name,
            "conversation_id": conversation_id,
            "messages": messages,
            "exported_at": datetime.now().isoformat(),
            "total_messages": len(messages)
        }

    # Export all conversations
    conversations = get_conversations_for_twin(twin_id)
    all_data = []
    for conv in conversations:
        msgs = get_messages(conv["id"], limit=1000)
        all_data.append({
            "conversation_id": conv["id"],
            "created_at": conv.get("created_at", ""),
            "messages": msgs
        })

    return {
        "twin_id": twin_id,
        "twin_name": name,
        "conversations": all_data,
        "exported_at": datetime.now().isoformat(),
        "total_conversations": len(all_data)
    }


@router.get("/export-pdf/{twin_id}")
async def export_conversation_pdf(twin_id: str, conversation_id: str = None):
    """Export conversation as a downloadable HTML file (styled like a PDF)."""
    from datetime import datetime
    from fastapi.responses import HTMLResponse
    
    twin = get_twin(twin_id)
    if not twin:
        return HTMLResponse("<h1>Twin not found</h1>", status_code=404)
    
    conn = get_connection()
    user = conn.execute("SELECT name FROM users WHERE id = ?", (twin.get("user_id", ""),)).fetchone()
    conn.close()
    name = user["name"] if user else "User"
    
    # Get messages
    if conversation_id:
        messages = get_messages(conversation_id, limit=1000)
    else:
        conversations = get_conversations_for_twin(twin_id)
        messages = []
        for conv in conversations:
            messages.extend(get_messages(conv["id"], limit=1000))
    
    # Build HTML
    msg_html = ""
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "").replace("\n", "<br>")
        mood = msg.get("mood", "")
        ts = msg.get("created_at", "")
        
        if role == "user":
            msg_html += f'''
            <div style="display:flex;justify-content:flex-end;margin:12px 0;">
                <div style="background:linear-gradient(135deg,#5b2da0,#7c3aed);color:white;padding:12px 18px;border-radius:18px 18px 4px 18px;max-width:70%;font-size:14px;box-shadow:0 2px 8px rgba(124,58,237,0.3);">
                    {content}
                    <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:6px;text-align:right;">{ts}</div>
                </div>
            </div>'''
        else:
            mood_emoji = {"happy":"😊","excited":"🤩","sad":"😢","angry":"😠","thoughtful":"🤔","neutral":"😐"}.get(mood, "😐")
            msg_html += f'''
            <div style="display:flex;justify-content:flex-start;margin:12px 0;">
                <div style="background:rgba(30,32,44,0.9);color:#e0e0e0;padding:12px 18px;border-radius:18px 18px 18px 4px;max-width:70%;font-size:14px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 2px 8px rgba(0,0,0,0.3);">
                    <span style="font-size:10px;color:rgba(255,255,255,0.4);">{mood_emoji} {name}'s Twin</span><br>
                    {content}
                    <div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:6px;">{ts}</div>
                </div>
            </div>'''
    
    html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Alternate Ego — Conversation Export</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
        * {{ margin:0; padding:0; box-sizing:border-box; }}
        body {{ font-family:'Inter',sans-serif; background:#0a0c12; color:#f0f0f0; padding:40px; min-height:100vh; }}
        .header {{ text-align:center; margin-bottom:40px; padding-bottom:20px; border-bottom:1px solid rgba(255,255,255,0.1); }}
        .header h1 {{ font-size:2rem; background:linear-gradient(135deg,#8b5cf6,#ec4899); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }}
        .header p {{ color:rgba(255,255,255,0.4); font-size:0.85rem; margin-top:8px; }}
        .messages {{ max-width:700px; margin:0 auto; }}
        .footer {{ text-align:center; margin-top:40px; padding-top:20px; border-top:1px solid rgba(255,255,255,0.05); color:rgba(255,255,255,0.2); font-size:0.75rem; }}
        @media print {{ body {{ background:white; color:black; }} }}
    </style>
</head>
<body>
    <div class="header">
        <h1>Alternate Ego</h1>
        <p>Conversation with {name}'s Digital Twin — Exported {datetime.now().strftime("%B %d, %Y %I:%M %p")}</p>
        <p>{len(messages)} messages</p>
    </div>
    <div class="messages">{msg_html}</div>
    <div class="footer">Generated by Alternate Ego — 100% Local AI Digital Twin Platform</div>
</body>
</html>'''
    
    return HTMLResponse(
        content=html,
        headers={
            "Content-Disposition": f"attachment; filename=alternate_ego_{name}_{datetime.now().strftime('%Y%m%d')}.html"
        }
    )
