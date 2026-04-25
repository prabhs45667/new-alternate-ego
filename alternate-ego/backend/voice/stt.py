"""Speech-to-Text using faster-whisper — local CPU transcription."""
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Lazy-loaded model to conserve RAM
_whisper_model = None


def _get_model():
    """Lazy-load the whisper model on first use."""
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            from config import settings
            logger.info(f"🎙️ Loading Whisper model: {settings.WHISPER_MODEL}")
            _whisper_model = WhisperModel(
                settings.WHISPER_MODEL, 
                device="cpu", 
                compute_type="int8"
            )
            logger.info("✅ Whisper model loaded")
        except Exception as e:
            logger.error(f"❌ Failed to load Whisper: {e}")
            return None
    return _whisper_model


def transcribe(audio_path: str) -> str:
    """Transcribe audio file to text.
    
    Args:
        audio_path: Path to audio file (webm, wav, mp3, etc.)
    
    Returns:
        Transcribed text, or empty string on failure
    """
    model = _get_model()
    if model is None:
        logger.error("Whisper model not available")
        return ""
    
    try:
        segments, info = model.transcribe(audio_path, language="en")
        text = " ".join([segment.text for segment in segments]).strip()
        logger.info(f"✅ Transcribed {audio_path}: {len(text)} chars")
        return text
    except Exception as e:
        logger.error(f"❌ Transcription failed for {audio_path}: {e}")
        return ""


def is_available() -> bool:
    """Check if faster-whisper is available."""
    try:
        from faster_whisper import WhisperModel
        return True
    except ImportError:
        return False
