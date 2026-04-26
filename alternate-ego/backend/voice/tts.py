"""Text-to-Speech — Coqui XTTS v2 (voice cloning) + Edge-TTS + gTTS (fallback chain).

Priority:
1. Coqui XTTS v2 — clones user's actual voice (if model loaded)
2. Edge-TTS — high quality Microsoft voices (if not blocked)
3. gTTS (Google) — always works, decent quality (FREE fallback)
4. pyttsx3 — offline local TTS (last resort)
"""
import os
import asyncio
import logging
import uuid
from typing import Optional
from config import settings

logger = logging.getLogger(__name__)

# Cache the TTS model instance to avoid reloading every request
_tts_model = None
_tts_model_loaded = False


def _get_tts_model():
    """Load and cache the Coqui XTTS model (only loads once)."""
    global _tts_model, _tts_model_loaded
    
    if _tts_model_loaded:
        return _tts_model
    
    _tts_model_loaded = True
    
    if not settings.USE_COQUI:
        logger.info("Coqui XTTS disabled in settings")
        return None
    
    try:
        from TTS.api import TTS
        logger.info("🔄 Loading Coqui XTTS v2 model (first time may download ~2GB)...")
        _tts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
        logger.info("✅ Coqui XTTS v2 model loaded successfully!")
        return _tts_model
    except ImportError:
        logger.warning("❌ TTS library not installed. Using Edge-TTS fallback.")
        return None
    except Exception as e:
        logger.error(f"❌ Failed to load XTTS model: {e}")
        return None


async def generate_speech_edge(text: str, output_path: str, voice: str = None) -> str:
    """Generate speech using Microsoft Edge TTS (free, no model download)."""
    try:
        import edge_tts
        
        voice = voice or settings.EDGE_TTS_VOICE
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(output_path)
        
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            logger.info(f"✅ Edge-TTS generated: {output_path}")
            return output_path
        return ""
    except Exception as e:
        logger.error(f"❌ Edge-TTS failed: {e}")
        return ""


def generate_speech_sync(text: str, output_path: str, voice: str = None) -> str:
    """Synchronous wrapper for Edge TTS — safe to call from a thread."""
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(generate_speech_edge(text, output_path, voice))
        loop.close()
        return result
    except Exception as e:
        logger.error(f"❌ Edge-TTS sync wrapper failed: {e}")
        return ""


def generate_speech_gtts(text: str, output_path: str) -> str:
    """Generate speech using Google TTS (gTTS) — FREE, always works.
    
    This is the most reliable fallback. Requires internet but no API key.
    Quality is decent for conversational text.
    """
    try:
        from gtts import gTTS
        
        tts = gTTS(text=text, lang='en', slow=False)
        tts.save(output_path)
        
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            logger.info(f"✅ gTTS generated: {output_path}")
            return output_path
        return ""
    except ImportError:
        logger.warning("gTTS not installed. Install with: pip install gTTS")
        return ""
    except Exception as e:
        logger.error(f"❌ gTTS failed: {e}")
        return ""


def generate_speech_pyttsx3(text: str, output_path: str) -> str:
    """Generate speech using pyttsx3 — offline, no internet needed.
    
    This is the absolute last resort. Works offline but sounds robotic.
    """
    try:
        import pyttsx3
        
        # Use wav output, then convert
        wav_path = output_path.replace('.mp3', '.wav')
        
        engine = pyttsx3.init()
        engine.setProperty('rate', 150)  # Speed
        engine.setProperty('volume', 0.9)
        engine.save_to_file(text, wav_path)
        engine.runAndWait()
        
        if os.path.exists(wav_path) and os.path.getsize(wav_path) > 0:
            # Try converting to mp3
            try:
                from pydub import AudioSegment
                audio = AudioSegment.from_wav(wav_path)
                audio.export(output_path, format="mp3", bitrate="128k")
                os.remove(wav_path)
                logger.info(f"✅ pyttsx3 generated: {output_path}")
                return output_path
            except Exception:
                logger.info(f"✅ pyttsx3 generated (WAV): {wav_path}")
                return wav_path
        return ""
    except ImportError:
        logger.warning("pyttsx3 not installed")
        return ""
    except Exception as e:
        logger.error(f"❌ pyttsx3 failed: {e}")
        return ""


def generate_speech_xtts(text: str, twin_id: str, output_path: str) -> str:
    """Generate speech using Coqui XTTS v2 voice cloning.
    
    Uses the reference.wav file created from interview recordings.
    The cloned voice sounds like the actual user.
    """
    tts = _get_tts_model()
    if tts is None:
        return ""
    
    ref_path = os.path.join(settings.VOICES_DIR, twin_id, "reference.wav")
    
    if not os.path.exists(ref_path):
        logger.warning(f"No reference voice found for twin {twin_id}. Trying interview recordings...")
        try:
            from voice.voice_manager import create_voice_reference
            ref_path = create_voice_reference(twin_id)
            if not ref_path or not os.path.exists(ref_path):
                logger.warning(f"Could not create voice reference for twin {twin_id}")
                return ""
        except Exception as e:
            logger.warning(f"Voice reference creation failed: {e}")
            return ""
    
    try:
        wav_output = output_path.replace('.mp3', '.wav')
        
        tts.tts_to_file(
            text=text,
            speaker_wav=ref_path,
            language="en",
            file_path=wav_output
        )
        
        try:
            from pydub import AudioSegment
            audio = AudioSegment.from_wav(wav_output)
            audio.export(output_path, format="mp3", bitrate="128k")
            os.remove(wav_output)
            logger.info(f"✅ XTTS voice clone generated: {output_path}")
            return output_path
        except Exception:
            logger.info(f"✅ XTTS voice clone generated (WAV): {wav_output}")
            return wav_output
        
    except Exception as e:
        logger.error(f"❌ XTTS voice cloning failed: {e}")
        return ""


def generate_speech(text: str, twin_id: str, output_dir: str = None) -> str:
    """Main TTS function — tries multiple engines in priority order.
    
    Fallback chain: XTTS → Edge-TTS → gTTS → pyttsx3
    
    Returns:
        Path to generated audio file, or empty string if all fail
    """
    if not text or len(text.strip()) < 2:
        return ""
    
    if not output_dir:
        output_dir = os.path.join(settings.VOICES_DIR, twin_id)
    os.makedirs(output_dir, exist_ok=True)
    
    filename = f"tts_{uuid.uuid4().hex[:8]}.mp3"
    output_path = os.path.join(output_dir, filename)
    
    # Truncate very long texts for TTS
    tts_text = text[:500] if len(text) > 500 else text
    
    # 1. Try Coqui XTTS voice cloning (sounds like actual user)
    if settings.USE_COQUI:
        result = generate_speech_xtts(tts_text, twin_id, output_path)
        if result:
            return result
        logger.info("XTTS failed or unavailable, trying Edge-TTS...")
    
    # 2. Try Edge-TTS (high quality Microsoft voices)
    result = generate_speech_sync(tts_text, output_path)
    if result:
        return result
    logger.info("Edge-TTS failed, trying gTTS...")
    
    # 3. Try gTTS (Google, always works, no API key)
    result = generate_speech_gtts(tts_text, output_path)
    if result:
        return result
    logger.info("gTTS failed, trying pyttsx3...")
    
    # 4. Last resort — pyttsx3 (offline)
    result = generate_speech_pyttsx3(tts_text, output_path)
    if result:
        return result
    
    logger.warning("All TTS methods failed — no audio generated")
    return ""
