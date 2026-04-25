"""Avatar API — photo serving + status endpoints."""
import os
import logging
from fastapi import APIRouter
from pydantic import BaseModel
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/status/{twin_id}")
async def avatar_status(twin_id: str):
    """Check what avatar assets are available for a twin."""
    avatars_dir = os.path.join(settings.AVATARS_DIR, twin_id)
    emotions_available = []
    avatars_available = []
    for emotion in ["neutral", "happy", "sad", "angry"]:
        path = os.path.join(avatars_dir, f"{emotion}.jpg")
        avatar_path = os.path.join(avatars_dir, f"{emotion}_avatar.jpg")
        if os.path.exists(path):
            emotions_available.append(emotion)
        if os.path.exists(avatar_path):
            avatars_available.append(emotion)

    return {
        "twin_id": twin_id,
        "emotions_captured": emotions_available,
        "avatars_generated": avatars_available,
        "photos_ready": len(emotions_available),
        "avatars_ready": len(avatars_available),
    }
