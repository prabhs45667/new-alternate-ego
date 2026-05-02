"""Onboarding API endpoints — handles the full twin creation flow."""
import uuid
import json
import os
import logging
from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks
from typing import Optional, List

from db.database import (
    create_user, create_twin, update_twin, get_twin,
    create_onboarding_session, update_onboarding, get_onboarding
)
from db.models import StartRequest, StartResponse, OnboardingStatus
from rag.scrape_processor import scrape_and_index, parse_data_export
from rag.transcript_processor import (
    process_transcripts, extract_personality_from_transcripts, INTERVIEW_QUESTIONS, get_random_questions
)
from rag.prompt_builder import build_system_prompt
from avatar.avatar_generator import save_original_photo_base64, get_photos_count, generate_all_emotion_avatars, get_all_avatars
from voice.voice_manager import save_interview_audio, save_voice_reference
from voice.stt import transcribe
from security.encryption import encrypt_file
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/start", response_model=StartResponse)
async def start_onboarding(req: StartRequest):
    """Step 1: Start the onboarding process. Creates user, twin, and session."""
    user_id = str(uuid.uuid4())
    twin_id = str(uuid.uuid4())
    session_id = str(uuid.uuid4())

    # Store social URLs
    social_urls = json.dumps({
        "linkedin": req.linkedin_url,
        "instagram": req.instagram_url,
        "twitter": req.twitter_url,
        "facebook": req.facebook_url,
        "other": req.other_url
    })

    create_user(user_id, req.name, social_urls, req.email, req.phone)
    create_twin(twin_id, user_id)
    create_onboarding_session(session_id, user_id, twin_id)

    logger.info(f"Onboarding started: user={user_id}, twin={twin_id}")

    return StartResponse(
        user_id=user_id,
        twin_id=twin_id,
        session_id=session_id,
        message=f"Welcome, {req.name}! Your digital twin creation has begun."
    )


@router.post("/scrape")
async def scrape_social(
    twin_id: str = Form(...),
    session_id: str = Form(...),
    name: str = Form(...),
    linkedin_url: str = Form(""),
    instagram_url: str = Form(""),
    twitter_url: str = Form(""),
    facebook_url: str = Form(""),
    other_url: str = Form(""),
    background_tasks: BackgroundTasks = None
):
    """Step 2: Scrape social media profiles for data."""
    update_onboarding(session_id, scraping_status="in_progress")

    # Split comma-separated other URLs into individual URLs
    other_urls_list = [u.strip() for u in other_url.split(',') if u.strip()] if other_url.strip() else []
    urls = [u for u in [linkedin_url, instagram_url, twitter_url, facebook_url] if u.strip()]
    urls.extend(other_urls_list)

    try:
        # Fetch email and phone from DB
        email = None
        phone = None
        twin = get_twin(twin_id)
        if twin:
            from db.database import get_connection
            conn = get_connection()
            user = conn.execute("SELECT email, phone FROM users WHERE id = ?", (twin.get("user_id", ""),)).fetchone()
            conn.close()
            if user:
                email = user["email"]
                phone = user["phone"]

        result = scrape_and_index(name, twin_id, urls, email=email, phone=phone, session_id=session_id)
        update_onboarding(session_id, scraping_status="done")
        return {"status": "success", **result}
    except Exception as e:
        update_onboarding(session_id, scraping_status="failed")
        logger.error(f"Scraping failed: {e}")
        return {"status": "failed", "error": str(e), "chunks_indexed": 0}


@router.post("/upload-photo")
async def upload_photo(
    twin_id: str = Form(...),
    session_id: str = Form(...),
    emotion: str = Form("neutral"),
    photo: str = Form(...)  # Base64 encoded image
):
    """Step 3: Upload a SINGLE photo. System generates all 4 emotion avatars from it.
    
    New flow:
    1. User captures ONE normal photo
    2. Original photo is saved
    3. Gemini generates 4 emotion cartoon avatars (neutral, happy, sad, angry)
    4. Returns all avatar URLs
    """
    try:
        # Save the single original photo
        path = save_original_photo_base64(twin_id, photo)
        update_onboarding(session_id, photos_captured=1)
        
        original_url = f"/static/{path.replace(os.sep, '/')}"

        # Generate ALL emotion avatars from this single photo
        avatar_urls = {}
        try:
            results = generate_all_emotion_avatars(twin_id)
            all_avatars = get_all_avatars(twin_id)
            for key, apath in all_avatars.items():
                avatar_urls[key] = f"/static/{apath.replace(os.sep, '/')}"
            update_onboarding(session_id, photos_captured=len(results) + 1)
        except Exception as e:
            logger.warning(f"Avatar generation failed (non-critical): {e}")

        return {
            "status": "success",
            "original_url": original_url,
            "avatar_urls": avatar_urls,
            "avatars_generated": len(avatar_urls),
            "path": path,
        }
    except Exception as e:
        logger.error(f"Photo upload failed: {e}")
        return {"status": "error", "message": str(e)}


@router.post("/upload-voice")
async def upload_voice(
    twin_id: str = Form(...),
    session_id: str = Form(...),
    question_index: int = Form(...),
    audio: UploadFile = File(...)
):
    """Step 4: Upload a voice interview recording."""
    try:
        audio_bytes = await audio.read()
        audio_path = save_interview_audio(twin_id, audio_bytes, question_index)

        # Transcribe the audio
        transcript = transcribe(audio_path)
        question = INTERVIEW_QUESTIONS[question_index] if question_index < len(INTERVIEW_QUESTIONS) else f"Question {question_index + 1}"

        update_onboarding(session_id, questions_answered=question_index + 1)

        return {
            "status": "success",
            "question_index": question_index,
            "transcript": transcript,
            "question": question
        }
    except Exception as e:
        logger.error(f"Voice upload failed: {e}")
        return {"status": "error", "message": str(e)}


@router.post("/upload-data")
async def upload_data_export(
    twin_id: str = Form(...),
    session_id: str = Form(...),
    file: UploadFile = File(...)
):
    """Upload social media data export (.zip or .json)."""
    try:
        upload_dir = os.path.join(settings.UPLOADS_DIR, twin_id)
        os.makedirs(upload_dir, exist_ok=True)

        file_path = os.path.join(upload_dir, file.filename)
        with open(file_path, 'wb') as f:
            f.write(await file.read())

        # Parse and index into RAG
        result = parse_data_export(file_path, twin_id)

        # Encrypt and delete raw file
        try:
            encrypt_file(file_path)
        except Exception:
            # If encryption fails, just delete the raw file
            if os.path.exists(file_path):
                os.remove(file_path)

        return {"status": "success", **result}
    except Exception as e:
        logger.error(f"Data upload failed: {e}")
        return {"status": "error", "message": str(e)}


@router.post("/complete")
async def complete_onboarding(
    twin_id: str = Form(...),
    session_id: str = Form(...),
    transcripts: str = Form("[]")  # JSON string of [{question, answer}]
):
    """Final step: Process transcripts, extract personality, build system prompt."""
    try:
        # Parse transcripts
        transcript_list = json.loads(transcripts) if transcripts else []

        # Get twin info early
        twin = get_twin(twin_id)
        if not twin:
            return {"status": "error", "message": "Twin not found"}

        # Try to find the user name
        from db.database import get_connection
        conn = get_connection()
        user = conn.execute("SELECT name FROM users WHERE id = ?", (twin.get("user_id", ""),)).fetchone()
        conn.close()
        name = user["name"] if user else "User"

        # Load Gen Z Trivia if available
        try:
            trivia_path = os.path.join(settings.UPLOADS_DIR, twin_id, "trivia", "trivia_answers.json")
            if os.path.exists(trivia_path):
                with open(trivia_path, 'r', encoding='utf-8') as f:
                    trivia_data = json.load(f)
                    for item in trivia_data:
                        transcript_list.append({"question": item.get("question", ""), "answer": item.get("answer", "")})
        except Exception as e:
            logger.warning(f"Failed to load trivia answers: {e}")

        from avatar.vision_analyzer import extract_personality_from_faces
        
        personality = {}
        if transcript_list:
            # Process into RAG
            process_transcripts(twin_id, transcript_list)

            # Extract personality traits
            personality = extract_personality_from_transcripts(transcript_list)

        # Create voice clone reference from interview recordings
        try:
            from voice.voice_manager import create_voice_reference
            ref_path = create_voice_reference(twin_id)
            if ref_path:
                logger.info(f"✅ Voice reference created: {ref_path}")
        except Exception as e:
            logger.warning(f"Voice reference creation failed (non-critical): {e}")

        # Regenerate all cartoon avatars from pre-stored images
        try:
            generate_all_emotion_avatars(twin_id)
            logger.info(f"✅ Avatar stylization complete for twin {twin_id}")
        except Exception as e:
            logger.warning(f"Avatar regeneration failed (non-critical): {e}")

        # Ollama-based personality analysis from photos
        vision_traits = extract_personality_from_faces(twin_id)
        if vision_traits:
            personality["facial_analysis"] = vision_traits


        # Build system prompt
        system_prompt = build_system_prompt(name, personality)

        # Update twin
        update_twin(
            twin_id,
            personality_profile=json.dumps(personality),
            system_prompt=system_prompt,
            status="active"
        )

        update_onboarding(session_id, status="complete")

        logger.info(f"✅ Onboarding complete for twin {twin_id}")

        return {
            "status": "success",
            "twin_id": twin_id,
            "message": f"Your digital twin is ready! Chat with yourself now.",
            "personality": personality
        }
    except Exception as e:
        logger.error(f"Completion failed: {e}")
        return {"status": "error", "message": str(e)}


from pydantic import BaseModel
class TriviaItem(BaseModel):
    id: int
    question: str
    answer: str
    type: str

class TriviaRequest(BaseModel):
    twin_id: str
    session_id: str
    trivia: List[TriviaItem]

@router.post("/save-trivia")
async def save_trivia(req: TriviaRequest):
    """Save Gen Z trivia quiz answers for personality training."""
    try:
        trivia_dir = os.path.join(settings.UPLOADS_DIR, req.twin_id, "trivia")
        os.makedirs(trivia_dir, exist_ok=True)
        
        filepath = os.path.join(trivia_dir, "trivia_answers.json")
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump([t.model_dump() if hasattr(t, "model_dump") else t.dict() for t in req.trivia], f, ensure_ascii=False, indent=2)
            
        logger.info(f"Saved trivia answers for twin {req.twin_id}")
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Failed to save trivia: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/status/{session_id}", response_model=OnboardingStatus)
async def get_status(session_id: str):
    """Get current onboarding progress."""
    session = get_onboarding(session_id)
    if not session:
        return OnboardingStatus(
            session_id=session_id,
            scraping_status="unknown",
            photos_captured=0,
            questions_answered=0,
            avatar_status="unknown",
            voice_clone_status="unknown",
            status="not_found"
        )

    return OnboardingStatus(
        session_id=session_id,
        scraping_status=session.get("scraping_status", "pending"),
        photos_captured=session.get("photos_captured", 0),
        questions_answered=session.get("questions_answered", 0),
        avatar_status=session.get("avatar_status", "pending"),
        voice_clone_status=session.get("voice_clone_status", "pending"),
        status=session.get("status", "in_progress")
    )


@router.get("/questions")
async def get_interview_questions(twin_id: str = None, count: int = 5):
    """Get randomized voice interview questions from the 100-question bank.
    
    Selects questions ensuring category diversity (8 categories).
    Pass twin_id to get consistent questions for the same twin.
    """
    questions = get_random_questions(count=count, seed=twin_id)
    return {
        "questions": questions,
        "total": len(questions),
        "max_seconds_per_question": 120,
        "total_questions_in_bank": 100
    }


@router.post("/refresh-question")
async def refresh_question(
    exclude: str = Form("[]"),  # JSON string of current question texts to exclude
):
    """Get a single new random question, excluding the ones already shown.
    
    Used when user wants to skip/refresh a question without counting it.
    """
    import random as rng
    from rag.transcript_processor import ALL_QUESTIONS
    
    try:
        exclude_list = json.loads(exclude) if exclude else []
    except Exception:
        exclude_list = []
    
    # Filter out already-shown questions
    available = [q for q in ALL_QUESTIONS if q["text"] not in exclude_list]
    
    if not available:
        # All questions exhausted, just pick any random one
        available = ALL_QUESTIONS
    
    chosen = rng.choice(available)
    return {
        "question": {
            "text": chosen["text"],
            "category": chosen["category"],
            "max_seconds": 120
        }
    }


@router.post("/replace-voice")
async def replace_voice(
    twin_id: str = Form(...),
    session_id: str = Form(...),
    question_index: int = Form(...),
    audio: UploadFile = File(...)
):
    """Replace a previously recorded voice answer (Try Again feature).
    
    Overwrites the audio file and re-transcribes it.
    """
    try:
        audio_bytes = await audio.read()
        audio_path = save_interview_audio(twin_id, audio_bytes, question_index)

        # Transcribe the new audio
        transcript = transcribe(audio_path)
        question = INTERVIEW_QUESTIONS[question_index] if question_index < len(INTERVIEW_QUESTIONS) else f"Question {question_index + 1}"

        return {
            "status": "success",
            "question_index": question_index,
            "transcript": transcript,
            "question": question
        }
    except Exception as e:
        logger.error(f"Voice replace failed: {e}")
        return {"status": "error", "message": str(e)}


from pydantic import BaseModel

class TriviaItem(BaseModel):
    question_id: int
    question: str
    answer: str

class TriviaRequest(BaseModel):
    twin_id: str
    session_id: str
    answers: List[TriviaItem]

@router.post("/save-trivia")
async def save_trivia(req: TriviaRequest):
    """Save trivia quiz answers for personality enrichment."""
    try:
        upload_dir = os.path.join(settings.UPLOADS_DIR, req.twin_id, "trivia")
        os.makedirs(upload_dir, exist_ok=True)
        filepath = os.path.join(upload_dir, "trivia_answers.json")
        data = [{"question_id": a.question_id, "question": a.question, "answer": a.answer} for a in req.answers]
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        logger.info(f"✅ Saved {len(data)} trivia answers for twin {req.twin_id}")
        return {"status": "success", "saved": len(data)}
    except Exception as e:
        logger.error(f"Trivia save failed: {e}")
        return {"status": "error", "message": str(e)}


class GameScoreRequest(BaseModel):
    twin_id: str
    session_id: str
    game: str  # "pong" or "bubble"
    score: int
    hi_score: int

@router.post("/save-game-scores")
async def save_game_scores(req: GameScoreRequest):
    """Save game scores for cognitive/personality analysis.
    
    Game scores reveal: reflexes, speed, accuracy, strategic thinking, persistence.
    These traits feed into the digital twin's personality profile.
    """
    try:
        upload_dir = os.path.join(settings.UPLOADS_DIR, req.twin_id, "games")
        os.makedirs(upload_dir, exist_ok=True)
        filepath = os.path.join(upload_dir, f"{req.game}_scores.json")
        
        # Load existing scores or create new
        existing = []
        if os.path.exists(filepath):
            with open(filepath, "r") as f:
                existing = json.load(f)
        
        existing.append({
            "score": req.score,
            "hi_score": req.hi_score,
            "session_id": req.session_id,
            "timestamp": str(uuid.uuid4())[:8],
        })
        
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)
        
        # Personality analysis from game scores
        analysis = {}
        if req.game == "pong":
            analysis = {
                "reflexes": "fast" if req.hi_score > 30 else "moderate" if req.hi_score > 15 else "developing",
                "hand_eye_coordination": "excellent" if req.hi_score > 40 else "good" if req.hi_score > 20 else "average",
                "persistence": "high" if len(existing) > 3 else "moderate",
            }
        elif req.game == "bubble":
            analysis = {
                "strategic_thinking": "strong" if req.hi_score > 500 else "moderate" if req.hi_score > 200 else "developing",
                "pattern_recognition": "excellent" if req.hi_score > 800 else "good" if req.hi_score > 300 else "average",
                "persistence": "high" if len(existing) > 3 else "moderate",
            }
        
        logger.info(f"🎮 Game score saved: {req.game}={req.score} (hi={req.hi_score}) for twin {req.twin_id}")
        return {"status": "success", "analysis": analysis}
    except Exception as e:
        logger.error(f"Game score save failed: {e}")
        return {"status": "error", "message": str(e)}

