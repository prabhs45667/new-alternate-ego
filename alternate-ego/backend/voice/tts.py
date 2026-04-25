"""Text-to-Speech — Coqui XTTS v2 (voice cloning) + Edge-TTS (fallback).

Coqui XTTS v2 clones the user's voice from their interview recordings.
Edge-TTS is the fallback with voice matching based on user's gender/pitch.
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
    """Generate speech using Microsoft Edge TTS (free, no model download).
    
    Args:
        text: Text to speak
        output_path: Path to save the audio file
        voice: Edge TTS voice name (default from settings)
    
    Returns:
        Path to the generated audio file, or empty string on failure
    """
    try:
        import edge_tts
        
        voice = voice or settings.EDGE_TTS_VOICE
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(output_path)
        
        logger.info(f"✅ Edge-TTS generated: {output_path}")
        return output_path
    except Exception as e:
        logger.error(f"❌ Edge-TTS failed: {e}")
        return ""


def generate_speech_sync(text: str, output_path: str, voice: str = None) -> str:
    """Synchronous wrapper for Edge TTS — safe to call from a thread."""
    try:
        import asyncio
        try:
            # If called from a thread (no running loop), create a fresh one
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            result = loop.run_until_complete(generate_speech_edge(text, output_path, voice))
            loop.close()
            return result
        except RuntimeError:
            # If there's already a running loop (shouldn't happen in thread), fallback
            import subprocess
            # Use edge-tts CLI as ultimate fallback
            voice = voice or settings.EDGE_TTS_VOICE
            subprocess.run(
                ["edge-tts", "--voice", voice, "--text", text, "--write-media", output_path],
                capture_output=True, timeout=30
            )
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                logger.info(f"✅ Edge-TTS (CLI) generated: {output_path}")
                return output_path
            return ""
    except Exception as e:
        logger.error(f"❌ TTS sync wrapper failed: {e}")
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
        # Try to create reference from interview recordings
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
        # Ensure output uses .wav extension for XTTS
        wav_output = output_path.replace('.mp3', '.wav')
        
        tts.tts_to_file(
            text=text,
            speaker_wav=ref_path,
            language="en",
            file_path=wav_output
        )
        
        # Convert to mp3 if needed (smaller file, faster transfer)
        try:
            from pydub import AudioSegment
            audio = AudioSegment.from_wav(wav_output)
            audio.export(output_path, format="mp3", bitrate="128k")
            os.remove(wav_output)  # Clean up wav
            logger.info(f"✅ XTTS voice clone generated: {output_path}")
            return output_path
        except Exception:
            # If pydub fails, just use the wav file
            logger.info(f"✅ XTTS voice clone generated (WAV): {wav_output}")
            return wav_output
        
    except Exception as e:
        logger.error(f"❌ XTTS voice cloning failed: {e}")
        return ""


def generate_speech(text: str, twin_id: str, output_dir: str = None) -> str:
    """Main TTS function — tries XTTS voice cloning first, falls back to Edge-TTS.
    
    Generates speech for the FULL text (no truncation).
    
    Returns:
        Path to generated audio file
    """
    if not text or len(text.strip()) < 2:
        return ""
    
    if not output_dir:
        output_dir = os.path.join(settings.VOICES_DIR, twin_id)
    os.makedirs(output_dir, exist_ok=True)
    
    filename = f"tts_{uuid.uuid4().hex[:8]}.mp3"
    output_path = os.path.join(output_dir, filename)
    
    # For very long texts, truncate to reasonable length for TTS
    # (keeps response fast while still reading most of the reply)
    tts_text = text[:500] if len(text) > 500 else text
    
    # Try Coqui XTTS voice cloning first (sounds like the actual user)
    if settings.USE_COQUI:
        result = generate_speech_xtts(tts_text, twin_id, output_path)
        if result:
            return result
        logger.info("XTTS failed or unavailable, falling back to Edge-TTS")
    
    # Fallback to Edge-TTS (generic voice but very reliable, no downloads needed)
    result = generate_speech_sync(tts_text, output_path)
    if result:
        return result
    
    logger.warning("All TTS methods failed — no audio generated")
    return ""
