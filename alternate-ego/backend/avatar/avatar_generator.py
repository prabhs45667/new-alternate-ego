"""Avatar photo management - generates 4 emotion AI cartoon avatars.

Strategy (Priority Order):
  1. Gemini API (if key available and quota not exceeded)
  2. Pollinations.ai KLEIN model (FREE image-to-image via catbox hosting)
     - Upload photo to free temporary host (catbox.moe)
     - Use FLUX.2 Klein model for actual photo-to-cartoon conversion
  3. Pollinations.ai text-to-image fallback (if image upload fails)
  
Result: 1 input photo -> 4 emotion avatar PNGs (neutral, happy, sad, angry)
"""
import os
import base64
import logging
import io
import time
import urllib.parse
from typing import Dict, Optional
from PIL import Image
from config import settings

logger = logging.getLogger(__name__)

EMOTIONS = ["neutral", "happy", "sad", "angry"]

# ── Emotion-specific style descriptors ──
EMOTION_STYLES = {
    "neutral": "calm neutral expression, looking straight ahead, relaxed face",
    "happy": "big warm genuine smile, sparkling cheerful eyes, joyful radiant expression",
    "sad": "sad melancholic expression, slightly downturned mouth, gentle sorrowful eyes",
    "angry": "angry fierce expression, furrowed eyebrows, intense determined eyes, clenched jaw",
}

# ── Gemini prompts ──
GEMINI_PROMPTS = {
    "neutral": (
        "Create a stylized cartoon/anime avatar of this person. "
        "Keep the person's face highly recognizable and maintain all their distinct features "
        "(face shape, hair style, skin tone, eye shape). "
        "Expression: calm and neutral, looking straight. "
        "Style: clean vector art, flat vibrant colors, smooth shading, digital illustration. "
        "No text, no watermarks, no background clutter. Output only the avatar image."
    ),
    "happy": (
        "Create a stylized cartoon/anime avatar of this person with a BIG HAPPY SMILE. "
        "Keep the person's face highly recognizable. "
        "Expression: genuinely happy, wide smile, cheerful sparkling eyes. "
        "Style: clean vector art, flat vibrant colors, smooth shading, digital illustration. "
        "No text, no watermarks. Output only the avatar image."
    ),
    "sad": (
        "Create a stylized cartoon/anime avatar of this person with a SAD expression. "
        "Keep the person's face highly recognizable. "
        "Expression: sad, downturned mouth, slightly teary eyes, melancholic. "
        "Style: clean vector art, flat vibrant colors, smooth shading, digital illustration. "
        "No text, no watermarks. Output only the avatar image."
    ),
    "angry": (
        "Create a stylized cartoon/anime avatar of this person with an ANGRY expression. "
        "Keep the person's face highly recognizable. "
        "Expression: angry, furrowed eyebrows, intense eyes, clenched jaw. "
        "Style: clean vector art, flat vibrant colors, smooth shading, digital illustration. "
        "No text, no watermarks. Output only the avatar image."
    ),
}


def save_original_photo(twin_id: str, photo_bytes: bytes) -> str:
    """Save the single original captured photo."""
    avatar_dir = os.path.join(settings.AVATARS_DIR, twin_id)
    os.makedirs(avatar_dir, exist_ok=True)
    
    file_path = os.path.join(avatar_dir, "original.jpg")
    with open(file_path, 'wb') as f:
        f.write(photo_bytes)
    
    # Also save as neutral.jpg for backward compatibility
    neutral_path = os.path.join(avatar_dir, "neutral.jpg")
    with open(neutral_path, 'wb') as f:
        f.write(photo_bytes)
    
    logger.info(f"Original photo saved: {file_path}")
    return file_path


def save_original_photo_base64(twin_id: str, base64_data: str) -> str:
    """Save a base64-encoded original photo."""
    if ',' in base64_data:
        base64_data = base64_data.split(',')[1]
    photo_bytes = base64.b64decode(base64_data)
    return save_original_photo(twin_id, photo_bytes)


# ══════════════════════════════════════════════════
#  PHOTO HOSTING (for image-to-image API calls)
# ══════════════════════════════════════════════════

def _upload_photo_to_temp_host(photo_path: str) -> Optional[str]:
    """Upload photo to a free temporary image host.
    Returns a public URL or None if all hosts fail.
    """
    import requests as req
    
    with open(photo_path, 'rb') as f:
        img_bytes = f.read()
    
    # Try litterbox.catbox.moe (free, 1-hour temporary hosting)
    try:
        resp = req.post(
            "https://litterbox.catbox.moe/resources/internals/api.php",
            data={"reqtype": "fileupload", "time": "1h"},
            files={"fileToUpload": ("photo.jpg", img_bytes, "image/jpeg")},
            timeout=30
        )
        if resp.status_code == 200 and resp.text.strip().startswith("http"):
            url = resp.text.strip()
            logger.info(f"Photo uploaded to catbox: {url}")
            return url
    except Exception as e:
        logger.warning(f"Catbox upload failed: {e}")
    
    # Fallback: try 0x0.st
    try:
        resp = req.post(
            "https://0x0.st",
            files={"file": ("photo.jpg", img_bytes, "image/jpeg")},
            timeout=30
        )
        if resp.status_code == 200 and resp.text.strip().startswith("http"):
            url = resp.text.strip()
            logger.info(f"Photo uploaded to 0x0.st: {url}")
            return url
    except Exception as e:
        logger.warning(f"0x0.st upload failed: {e}")
    
    return None


# ══════════════════════════════════════════════════
#  METHOD 1: Gemini API (if quota available)
# ══════════════════════════════════════════════════

def _generate_via_gemini(twin_id: str, emotion: str) -> str:
    """Generate avatar using Gemini API. Returns path or empty string."""
    import requests as req
    
    avatar_dir = os.path.join(settings.AVATARS_DIR, twin_id)
    source_path = os.path.join(avatar_dir, "original.jpg")
    avatar_path = os.path.join(avatar_dir, f"{emotion}_avatar.png")
    
    if not os.path.exists(source_path) or not settings.GEMINI_API_KEY:
        return ""
    
    try:
        with open(source_path, 'rb') as f:
            image_bytes = f.read()
        img_b64 = base64.b64encode(image_bytes).decode('utf-8')
        
        api_url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"gemini-2.5-flash-image:generateContent"
            f"?key={settings.GEMINI_API_KEY}"
        )
        
        prompt = GEMINI_PROMPTS.get(emotion, GEMINI_PROMPTS["neutral"])
        payload = {
            "contents": [{"parts": [
                {"text": prompt},
                {"inlineData": {"mimeType": "image/jpeg", "data": img_b64}}
            ]}],
            "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}
        }
        
        logger.info(f"Trying Gemini for {emotion} avatar...")
        response = req.post(api_url, json=payload, timeout=90)
        
        if response.status_code == 429:
            logger.warning("Gemini quota exceeded, will fallback to Pollinations")
            return ""
        
        if response.status_code != 200:
            logger.warning(f"Gemini returned {response.status_code}")
            return ""
        
        result = response.json()
        candidates = result.get("candidates", [])
        if not candidates:
            return ""
        
        parts = candidates[0].get("content", {}).get("parts", [])
        for part in parts:
            inline_data = part.get("inlineData") or part.get("inline_data") or {}
            img_data_b64 = inline_data.get("data") if isinstance(inline_data, dict) else None
            if img_data_b64:
                generated_bytes = base64.b64decode(img_data_b64)
                avatar_img = Image.open(io.BytesIO(generated_bytes))
                avatar_img = avatar_img.resize((512, 512), Image.Resampling.LANCZOS)
                avatar_img.save(avatar_path, "PNG")
                logger.info(f"Gemini {emotion} avatar saved: {avatar_path}")
                return avatar_path
        
        return ""
    except Exception as e:
        logger.warning(f"Gemini failed for {emotion}: {e}")
        return ""


# ══════════════════════════════════════════════════
#  METHOD 2: Pollinations KLEIN (image-to-image, FREE!)
# ══════════════════════════════════════════════════

def _generate_via_pollinations_klein(twin_id: str, emotion: str, photo_url: str) -> str:
    """Generate avatar using Pollinations FLUX.2 Klein model.
    
    This is TRUE image-to-image: it SEES the actual photo and converts it.
    Uses the klein model which is FREE and supports image input.
    
    Args:
        twin_id: The twin identifier
        emotion: One of 'neutral', 'happy', 'sad', 'angry'
        photo_url: Public URL of the uploaded original photo
    """
    import requests as req
    
    avatar_dir = os.path.join(settings.AVATARS_DIR, twin_id)
    os.makedirs(avatar_dir, exist_ok=True)
    avatar_path = os.path.join(avatar_dir, f"{emotion}_avatar.png")
    
    emotion_style = EMOTION_STYLES.get(emotion, EMOTION_STYLES["neutral"])
    
    prompt = (
        f"Transform this exact person into a 3D Disney Pixar cartoon avatar. "
        f"CRITICAL: preserve the EXACT same gender (if male keep MALE, if female keep FEMALE). "
        f"Keep the SAME face shape, SAME hair style and color, SAME skin tone, SAME jawline. "
        f"Do NOT change the gender. The cartoon MUST look like THIS specific person. "
        f"Expression: {emotion_style}. "
        f"Style: 3D Disney Pixar render, vibrant colorful background, clean digital illustration, "
        f"smooth shading, studio lighting, bust portrait, no text, no watermark. "
        f"Maintain masculine features if male, feminine features if female."
    )
    
    # Use consistent seed per twin+emotion for reproducibility
    seed_base = abs(hash(twin_id)) % 10000
    emotion_offset = {"neutral": 0, "happy": 1, "sad": 2, "angry": 3}
    seed = seed_base + emotion_offset.get(emotion, 0)
    
    encoded_prompt = urllib.parse.quote(prompt)
    encoded_image = urllib.parse.quote(photo_url)
    
    url = (
        f"https://image.pollinations.ai/prompt/{encoded_prompt}"
        f"?model=klein&width=512&height=512&nologo=true&seed={seed}"
        f"&image={encoded_image}"
    )
    
    try:
        logger.info(f"Generating {emotion} avatar via Pollinations Klein (img2img)...")
        response = req.get(url, timeout=120)
        
        if response.status_code == 200 and "image" in response.headers.get("content-type", ""):
            avatar_img = Image.open(io.BytesIO(response.content))
            avatar_img = avatar_img.resize((512, 512), Image.Resampling.LANCZOS)
            avatar_img.save(avatar_path, "PNG")
            logger.info(f"Klein {emotion} avatar saved: {avatar_path}")
            return avatar_path
        else:
            logger.warning(f"Klein returned {response.status_code} for {emotion}")
            return ""
    except Exception as e:
        logger.warning(f"Klein failed for {emotion}: {e}")
        return ""


# ══════════════════════════════════════════════════
#  METHOD 3: Pollinations text-to-image (last resort)
# ══════════════════════════════════════════════════

def _generate_via_pollinations_text(twin_id: str, emotion: str, person_desc: str = "") -> str:
    """Generate avatar using text-to-image as last resort.
    
    This does NOT see the original photo — uses text description only.
    Less accurate but always works.
    """
    import requests as req
    
    avatar_dir = os.path.join(settings.AVATARS_DIR, twin_id)
    os.makedirs(avatar_dir, exist_ok=True)
    avatar_path = os.path.join(avatar_dir, f"{emotion}_avatar.png")
    
    if not person_desc:
        person_desc = "a young person with dark hair"
    
    emotion_style = EMOTION_STYLES.get(emotion, EMOTION_STYLES["neutral"])
    
    prompt = (
        f"A beautiful 3D Disney Pixar style cartoon avatar portrait of {person_desc}, "
        f"{emotion_style}, "
        f"vibrant colorful background, clean digital illustration, "
        f"high quality 3D render, smooth shading, studio lighting, "
        f"single character centered, bust portrait, no text, no watermark"
    )
    
    seed_base = abs(hash(twin_id)) % 10000
    emotion_offset = {"neutral": 0, "happy": 1, "sad": 2, "angry": 3}
    seed = seed_base + emotion_offset.get(emotion, 0)
    
    encoded_prompt = urllib.parse.quote(prompt)
    url = (
        f"https://image.pollinations.ai/prompt/{encoded_prompt}"
        f"?width=512&height=512&model=flux&nologo=true&seed={seed}"
    )
    
    try:
        logger.info(f"Generating {emotion} avatar via Pollinations text2img (fallback)...")
        response = req.get(url, timeout=120)
        
        if response.status_code == 200 and "image" in response.headers.get("content-type", ""):
            avatar_img = Image.open(io.BytesIO(response.content))
            avatar_img = avatar_img.resize((512, 512), Image.Resampling.LANCZOS)
            avatar_img.save(avatar_path, "PNG")
            logger.info(f"Text2img {emotion} avatar saved: {avatar_path}")
            return avatar_path
        else:
            logger.warning(f"Text2img returned {response.status_code} for {emotion}")
            return ""
    except Exception as e:
        logger.warning(f"Text2img failed for {emotion}: {e}")
        return ""


# ══════════════════════════════════════════════════
#  MAIN: Generate all emotion avatars (auto-fallback)
# ══════════════════════════════════════════════════

def generate_single_avatar(twin_id: str, emotion: str) -> str:
    """Generate a single emotion avatar with smart fallback chain."""
    # Try Gemini first
    if settings.GEMINI_API_KEY:
        result = _generate_via_gemini(twin_id, emotion)
        if result:
            return result
    
    # Try Klein (image-to-image)
    source_path = os.path.join(settings.AVATARS_DIR, twin_id, "original.jpg")
    if os.path.exists(source_path):
        photo_url = _upload_photo_to_temp_host(source_path)
        if photo_url:
            result = _generate_via_pollinations_klein(twin_id, emotion, photo_url)
            if result:
                return result
    
    # Fallback: text-to-image
    return _generate_via_pollinations_text(twin_id, emotion)


def generate_all_emotion_avatars(twin_id: str) -> Dict[str, str]:
    """Generate ALL 4 emotion cartoon avatars.
    
    Fallback chain: Gemini -> Klein (img2img) -> Text2img
    """
    results = {}
    
    original_path = os.path.join(settings.AVATARS_DIR, twin_id, "original.jpg")
    if not os.path.exists(original_path):
        logger.warning(f"No original photo found for twin {twin_id}")
        return results
    
    # ── Step 1: Try Gemini for all emotions ──
    gemini_works = False
    if settings.GEMINI_API_KEY:
        logger.info("Attempting Gemini API for avatar generation...")
        first = _generate_via_gemini(twin_id, "neutral")
        if first:
            gemini_works = True
            results["neutral"] = first
            for emotion in ["happy", "sad", "angry"]:
                path = _generate_via_gemini(twin_id, emotion)
                if path:
                    results[emotion] = path
    
    if len(results) == 4:
        logger.info("All 4 avatars generated via Gemini!")
        return results
    
    # ── Step 2: Try Klein (image-to-image) for remaining ──
    remaining = [e for e in EMOTIONS if e not in results]
    if remaining:
        logger.info(f"Uploading photo for Klein img2img ({len(remaining)} remaining)...")
        photo_url = _upload_photo_to_temp_host(original_path)
        
        if photo_url:
            logger.info(f"Photo URL: {photo_url}")
            for emotion in remaining:
                path = _generate_via_pollinations_klein(twin_id, emotion, photo_url)
                if path:
                    results[emotion] = path
                    logger.info(f"✓ {emotion} avatar generated via Klein")
                time.sleep(2)  # Be nice to the free API
    
    # ── Step 3: Text-to-image fallback for any still missing ──
    still_missing = [e for e in EMOTIONS if e not in results]
    if still_missing:
        logger.info(f"Text2img fallback for {len(still_missing)} remaining avatars...")
        for emotion in still_missing:
            path = _generate_via_pollinations_text(twin_id, emotion)
            if path:
                results[emotion] = path
            time.sleep(1)
    
    logger.info(f"Avatar generation complete: {len(results)}/4 avatars generated")
    return results


# ══════════════════════════════════════════════════
#  Utility functions
# ══════════════════════════════════════════════════

def get_avatar_path(twin_id: str) -> str:
    """Get the default avatar path (neutral avatar preferred)."""
    for name in ["neutral_avatar.png", "neutral_avatar.jpg", "original.jpg", "neutral.jpg"]:
        path = os.path.join(settings.AVATARS_DIR, twin_id, name)
        if os.path.exists(path):
            return path
    return ""


def get_emotion_photo(twin_id: str, mood: str, prefer_avatar: bool = True) -> str:
    """Get the appropriate emotion avatar based on mood."""
    mood_to_emotion = {
        "happy": "happy", "excited": "happy",
        "sad": "sad",
        "angry": "angry", "frustrated": "angry",
        "neutral": "neutral", "thoughtful": "neutral"
    }
    emotion = mood_to_emotion.get(mood, "neutral")
    
    if prefer_avatar:
        for ext in ["png", "jpg"]:
            path = os.path.join(settings.AVATARS_DIR, twin_id, f"{emotion}_avatar.{ext}")
            if os.path.exists(path):
                return path
    
    for fallback in ["original.jpg", "neutral.jpg"]:
        path = os.path.join(settings.AVATARS_DIR, twin_id, fallback)
        if os.path.exists(path):
            return path
    return ""


def get_all_avatars(twin_id: str) -> Dict[str, str]:
    """Get all stored avatar paths."""
    avatars = {}
    avatar_dir = os.path.join(settings.AVATARS_DIR, twin_id)
    
    original = os.path.join(avatar_dir, "original.jpg")
    if os.path.exists(original):
        avatars["original"] = original
    
    for emotion in EMOTIONS:
        for ext in ["png", "jpg"]:
            path = os.path.join(avatar_dir, f"{emotion}_avatar.{ext}")
            if os.path.exists(path):
                avatars[emotion] = path
                break
    
    return avatars


def get_photos_count(twin_id: str) -> int:
    """Count how many avatar images are stored."""
    return len(get_all_avatars(twin_id))


def delete_photos(twin_id: str):
    """Delete all photos for a twin."""
    import shutil
    avatar_dir = os.path.join(settings.AVATARS_DIR, twin_id)
    if os.path.exists(avatar_dir):
        shutil.rmtree(avatar_dir)
        logger.info(f"Deleted avatar photos: {avatar_dir}")


# ── Backward compatibility aliases ──
def save_photo(twin_id: str, emotion: str, photo_bytes: bytes) -> str:
    return save_original_photo(twin_id, photo_bytes)

def save_photo_base64(twin_id: str, emotion: str, base64_data: str) -> str:
    return save_original_photo_base64(twin_id, base64_data)

def regenerate_all_avatars(twin_id: str):
    generate_all_emotion_avatars(twin_id)

def get_all_photos(twin_id: str) -> Dict[str, str]:
    return get_all_avatars(twin_id)
