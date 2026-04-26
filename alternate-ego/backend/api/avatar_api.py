"""Avatar API — photo upload, avatar generation, and serving endpoints."""
import os
import base64
import logging
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, Dict
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


class GenerateAvatarsRequest(BaseModel):
    twin_id: str


class SinglePhotoUploadRequest(BaseModel):
    twin_id: str
    session_id: str
    photo: str  # Base64 encoded image


@router.post("/upload-single-photo")
async def upload_single_photo(req: SinglePhotoUploadRequest):
    """Upload a single photo and get back the original stored path.
    
    This is step 1 — just saves the original photo.
    Avatar generation happens separately via /generate-all.
    """
    from avatar.avatar_generator import save_original_photo_base64
    
    try:
        path = save_original_photo_base64(req.twin_id, req.photo)
        photo_url = f"/static/{path.replace(os.sep, '/')}"
        
        return {
            "status": "success",
            "original_url": photo_url,
            "message": "Original photo saved. Ready for avatar generation."
        }
    except Exception as e:
        logger.error(f"Photo upload failed: {e}")
        return {"status": "error", "message": str(e)}


@router.post("/generate-all")
async def generate_all_avatars(req: GenerateAvatarsRequest):
    """Generate ALL 4 emotion cartoon avatars from the single original photo.
    
    This calls Gemini API 4 times (neutral, happy, sad, angry) and returns
    URLs for all generated avatars.
    
    Expected output:
    - original: The raw captured photo
    - neutral_avatar: Cartoon avatar with neutral expression
    - happy_avatar: Cartoon avatar with happy/smile expression
    - sad_avatar: Cartoon avatar with sad expression
    - angry_avatar: Cartoon avatar with angry expression
    """
    from avatar.avatar_generator import generate_all_emotion_avatars, get_all_avatars
    
    try:
        # Generate all emotion avatars from original photo
        results = generate_all_emotion_avatars(req.twin_id)
        
        # Build response with URLs
        all_avatars = get_all_avatars(req.twin_id)
        avatar_urls = {}
        for key, path in all_avatars.items():
            avatar_urls[key] = f"/static/{path.replace(os.sep, '/')}"
        
        return {
            "status": "success",
            "avatars_generated": len(results),
            "avatar_urls": avatar_urls,
            "message": f"Generated {len(results)} emotion avatars successfully!"
        }
    except Exception as e:
        logger.error(f"Avatar generation failed: {e}")
        return {
            "status": "error",
            "message": str(e),
            "avatars_generated": 0,
            "avatar_urls": {}
        }


@router.post("/generate-single")
async def generate_single_emotion(twin_id: str, emotion: str):
    """Generate a single emotion avatar (for retry/regeneration)."""
    from avatar.avatar_generator import generate_single_avatar
    
    try:
        path = generate_single_avatar(twin_id, emotion)
        if path:
            url = f"/static/{path.replace(os.sep, '/')}"
            return {"status": "success", "emotion": emotion, "avatar_url": url}
        return {"status": "error", "message": f"Failed to generate {emotion} avatar"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/status/{twin_id}")
async def avatar_status(twin_id: str):
    """Check what avatar assets are available for a twin."""
    from avatar.avatar_generator import get_all_avatars
    
    avatars = get_all_avatars(twin_id)
    avatar_urls = {}
    for key, path in avatars.items():
        avatar_urls[key] = f"/static/{path.replace(os.sep, '/')}"
    
    return {
        "twin_id": twin_id,
        "has_original": "original" in avatars,
        "emotions_available": [e for e in ["neutral", "happy", "sad", "angry"] if e in avatars],
        "avatars_generated": len([k for k in avatars if k != "original"]),
        "avatar_urls": avatar_urls,
    }


@router.get("/emotion/{twin_id}/{mood}")
async def get_emotion_avatar(twin_id: str, mood: str):
    """Get the correct avatar URL for a specific mood/emotion.
    
    Used by the chat frontend to dynamically load the right avatar.
    """
    from avatar.avatar_generator import get_emotion_photo
    
    path = get_emotion_photo(twin_id, mood, prefer_avatar=True)
    if path:
        url = f"/static/{path.replace(os.sep, '/')}"
        return {"mood": mood, "avatar_url": url}
    return {"mood": mood, "avatar_url": ""}
