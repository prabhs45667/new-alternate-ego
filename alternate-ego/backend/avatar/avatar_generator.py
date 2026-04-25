"""Avatar photo management — saves 4 emotion photos + generates AI avatars via Gemini."""
import os
import base64
import logging
import io
from typing import Dict, Optional
from PIL import Image
from config import settings

logger = logging.getLogger(__name__)

EMOTIONS = ["neutral", "happy", "sad", "angry"]


def save_photo(twin_id: str, emotion: str, photo_bytes: bytes) -> str:
    """Save an emotion photo for a twin.
    
    Args:
        twin_id: Twin ID
        emotion: One of 'neutral', 'happy', 'sad', 'angry'
        photo_bytes: Raw image bytes (JPEG/PNG)
    
    Returns:
        Path to saved photo
    """
    if emotion not in EMOTIONS:
        raise ValueError(f"Invalid emotion: {emotion}. Must be one of {EMOTIONS}")
    
    avatar_dir = os.path.join(settings.AVATARS_DIR, twin_id)
    os.makedirs(avatar_dir, exist_ok=True)
    
    file_path = os.path.join(avatar_dir, f"{emotion}.jpg")
    with open(file_path, 'wb') as f:
        f.write(photo_bytes)
    
    logger.info(f"✅ Photo saved: {file_path}")
    
    # Auto-generate avatar via Gemini API
    try:
        if settings.GEMINI_API_KEY:
            avatar_path = create_avatar_gemini(twin_id, emotion)
            if avatar_path:
                logger.info(f"✅ Gemini avatar generated: {avatar_path}")
        else:
            logger.warning("No Gemini API key set — avatar generation skipped.")
    except Exception as e:
        logger.warning(f"Avatar generation failed (non-critical): {e}")
    
    return file_path


def save_photo_base64(twin_id: str, emotion: str, base64_data: str) -> str:
    """Save a base64-encoded photo."""
    # Strip data URL prefix if present
    if ',' in base64_data:
        base64_data = base64_data.split(',')[1]
    
    photo_bytes = base64.b64decode(base64_data)
    return save_photo(twin_id, emotion, photo_bytes)


def create_avatar_gemini(twin_id: str, emotion: str) -> str:
    """Generate a stylized cartoon avatar using Gemini REST API with image generation.
    
    Uses the gemini-2.0-flash-preview-image-generation model which supports
    responseModalities: ["TEXT", "IMAGE"] for actual image output.
    
    Returns:
        Path to the generated avatar image, or empty string on failure.
    """
    import requests as req
    import json
    
    avatar_dir = os.path.join(settings.AVATARS_DIR, twin_id)
    source_path = os.path.join(avatar_dir, f"{emotion}.jpg")
    avatar_path = os.path.join(avatar_dir, f"{emotion}_avatar.jpg")
    
    if not os.path.exists(source_path):
        return ""
    
    if not settings.GEMINI_API_KEY:
        logger.warning("No Gemini API key — cannot generate avatar")
        return ""
    
    try:
        # Read and encode source image as base64
        with open(source_path, 'rb') as f:
            image_bytes = f.read()
        img_b64 = base64.b64encode(image_bytes).decode('utf-8')
        
        # Determine mime type
        mime_type = "image/jpeg"
        if source_path.lower().endswith('.png'):
            mime_type = "image/png"
        
        # Build REST API request for image generation model
        api_url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"gemini-2.0-flash-preview-image-generation:generateContent"
            f"?key={settings.GEMINI_API_KEY}"
        )
        
        prompt = (
            f"Convert this photo into a stylized cartoon/anime avatar. "
            f"Keep the person's face recognizable and maintain their features. "
            f"Expression: {emotion}. "
            f"Clean lines, flat colors, digital art style. No text or watermarks. "
            f"Output only the avatar image."
        )
        
        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": img_b64
                        }
                    }
                ]
            }],
            "generationConfig": {
                "responseModalities": ["TEXT", "IMAGE"]
            }
        }
        
        response = req.post(api_url, json=payload, timeout=60)
        
        if response.status_code != 200:
            logger.warning(f"Gemini image API returned {response.status_code}: {response.text[:200]}")
            return ""
        
        result = response.json()
        
        # Parse response — look for inline image data in candidates
        candidates = result.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            for part in parts:
                inline_data = part.get("inlineData", {})
                if inline_data.get("data"):
                    # Decode the generated image
                    generated_bytes = base64.b64decode(inline_data["data"])
                    avatar_img = Image.open(io.BytesIO(generated_bytes))
                    avatar_img = avatar_img.resize((512, 512), Image.Resampling.LANCZOS)
                    avatar_img.save(avatar_path, "JPEG", quality=92)
                    logger.info(f"✅ Gemini avatar created: {avatar_path}")
                    return avatar_path
        
        logger.warning(f"Gemini didn't return image data for {emotion}")
        return ""
        
    except Exception as e:
        logger.warning(f"Gemini avatar failed: {e}")
        return ""


def regenerate_all_avatars(twin_id: str):
    """Regenerate cartoon avatars for all existing photos of a twin using Gemini."""
    if not settings.GEMINI_API_KEY:
        logger.warning("No Gemini API key — cannot regenerate avatars")
        return
    
    for emotion in EMOTIONS:
        try:
            source_path = os.path.join(settings.AVATARS_DIR, twin_id, f"{emotion}.jpg")
            if os.path.exists(source_path):
                create_avatar_gemini(twin_id, emotion)
        except Exception as e:
            logger.warning(f"Failed to regenerate {emotion} avatar: {e}")


def get_avatar_path(twin_id: str) -> str:
    """Get the default avatar path (neutral photo — avatar version preferred)."""
    avatar_path = os.path.join(settings.AVATARS_DIR, twin_id, "neutral_avatar.jpg")
    if os.path.exists(avatar_path):
        return avatar_path
    # Fallback to raw photo
    path = os.path.join(settings.AVATARS_DIR, twin_id, "neutral.jpg")
    return path if os.path.exists(path) else ""


def get_emotion_photo(twin_id: str, mood: str, prefer_avatar: bool = True) -> str:
    """Get the appropriate emotion photo based on mood.
    
    Maps detected moods to the 4 stored emotions.
    If prefer_avatar=True, returns the cartoon avatar version.
    """
    mood_to_emotion = {
        "happy": "happy",
        "excited": "happy",
        "sad": "sad",
        "angry": "angry",
        "frustrated": "angry",
        "neutral": "neutral",
        "thoughtful": "neutral"
    }
    
    emotion = mood_to_emotion.get(mood, "neutral")
    
    if prefer_avatar:
        # Try avatar version first
        avatar_path = os.path.join(settings.AVATARS_DIR, twin_id, f"{emotion}_avatar.jpg")
        if os.path.exists(avatar_path):
            return avatar_path
    
    # Fallback to raw photo
    path = os.path.join(settings.AVATARS_DIR, twin_id, f"{emotion}.jpg")
    
    if os.path.exists(path):
        return path
    
    # Fallback to neutral
    if prefer_avatar:
        neutral_avatar = os.path.join(settings.AVATARS_DIR, twin_id, "neutral_avatar.jpg")
        if os.path.exists(neutral_avatar):
            return neutral_avatar
    
    neutral_path = os.path.join(settings.AVATARS_DIR, twin_id, "neutral.jpg")
    return neutral_path if os.path.exists(neutral_path) else ""


def get_all_photos(twin_id: str) -> Dict[str, str]:
    """Get all stored emotion photo paths (prefer avatar versions)."""
    photos = {}
    for emotion in EMOTIONS:
        # Try avatar version first
        avatar_path = os.path.join(settings.AVATARS_DIR, twin_id, f"{emotion}_avatar.jpg")
        if os.path.exists(avatar_path):
            photos[emotion] = avatar_path
        else:
            path = os.path.join(settings.AVATARS_DIR, twin_id, f"{emotion}.jpg")
            if os.path.exists(path):
                photos[emotion] = path
    return photos


def get_photos_count(twin_id: str) -> int:
    """Count how many emotion photos are stored."""
    count = 0
    for emotion in EMOTIONS:
        path = os.path.join(settings.AVATARS_DIR, twin_id, f"{emotion}.jpg")
        if os.path.exists(path):
            count += 1
    return count


def delete_photos(twin_id: str):
    """Delete all photos for a twin."""
    import shutil
    avatar_dir = os.path.join(settings.AVATARS_DIR, twin_id)
    if os.path.exists(avatar_dir):
        shutil.rmtree(avatar_dir)
        logger.info(f"🗑️ Deleted avatar photos: {avatar_dir}")
