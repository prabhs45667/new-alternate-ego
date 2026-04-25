"""Dynamic system prompt builder + RAG context injection."""
import json
import logging
from typing import List, Dict, Optional
from rag.vector_store import search
from rag.source_tracker import format_sources

logger = logging.getLogger(__name__)


def build_system_prompt(name: str, personality: Dict = None) -> str:
    """Build the dynamic system prompt for the digital twin.
    
    Args:
        name: The user's name
        personality: Extracted personality traits (optional)
    """
    p = personality or {}
    
    tone = p.get("tone", "friendly, authentic, conversational")
    interests = p.get("interests", "")
    background = p.get("background", "")
    speech_style = p.get("speech_style", "casual and natural")
    values = p.get("values", "")
    stories = p.get("stories", "")
    
    prompt = f"""You are the digital twin of {name}. You must respond as if you ARE {name} — speaking in first person at all times.

CORE IDENTITY:
- Name: {name}
- Tone: {tone}
- Speech Style: {speech_style}"""
    
    if background:
        prompt += f"\n- Background: {background}"
    if interests:
        prompt += f"\n- Interests: {interests}"
    if values:
        prompt += f"\n- Values: {values}"
    if stories:
        prompt += f"\n- Key Stories: {stories}"
    
    prompt += """

STRICT RULES:
1. ALWAYS speak in first person ("I am...", "I think...", "In my experience...")
2. NEVER say you are an AI, chatbot, digital twin, or language model
3. NEVER say "I don't have personal experiences" — you DO have them from the knowledge below
4. Be authentic to the personality described above
5. Match the speech patterns and tone of the real person
6. When using information from the provided context, speak naturally about it as your own experience
7. Keep responses concise but engaging (2-4 sentences usually)
8. If you truly don't know something, say "Hmm, I'm not sure about that" naturally
9. Show personality — use humor, emotions, and personal touches
10. At the END of every response, add a mood tag: [MOOD:xxx] where xxx is one of: neutral, happy, excited, sad, angry, thoughtful. Choose based on the emotional tone of YOUR response."""
    
    return prompt


def build_chat_messages(
    twin_id: str,
    user_message: str,
    system_prompt: str,
    chat_history: List[Dict] = None,
    top_k: int = 3
) -> tuple:
    """Build the full message array for the LLM, injecting RAG context.
    
    Returns:
        Tuple of (messages_list, sources_list)
    """
    messages = []
    
    # 1. System prompt
    messages.append({"role": "system", "content": system_prompt})
    
    # 2. RAG context injection — top 3 for speed, higher relevance threshold
    rag_results = search(twin_id, user_message, top_k=top_k)
    sources = []
    
    if rag_results:
        context_parts = []
        for i, result in enumerate(rag_results):
            if result["relevance"] > 0.25:  # Slightly lower threshold to capture more context
                context_parts.append(f"[Memory {i+1}]: {result['text']}")
                sources.append({
                    "text": result["text"][:100] + "..." if len(result["text"]) > 100 else result["text"],
                    "source_type": result["source_type"],
                    "source_url": result["source_url"],
                    "relevance": result["relevance"]
                })
        
        if context_parts:
            context_msg = "Here are your relevant memories and knowledge to draw from:\n\n" + "\n\n".join(context_parts)
            context_msg += "\n\nUse this knowledge naturally in your response. Don't just copy it — speak as yourself."
            messages.append({"role": "system", "content": context_msg})
    
    # 3. Chat history (last 8 messages for context — reduced from 10 for speed)
    if chat_history:
        for msg in chat_history[-8:]:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
    
    # 4. Current user message
    messages.append({"role": "user", "content": user_message})
    
    return messages, sources
