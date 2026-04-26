"""Speech-to-Text using faster-whisper — local CPU transcription.

Upgraded for higher accuracy:
- Uses 'small' model (461MB) instead of 'base' (74MB)
- Beam search with beam_size=5 for better word selection
- VAD filter to remove silence and improve accuracy
- Condition on previous text for better context
"""
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
    """Transcribe audio file to text with high accuracy.
    
    Uses beam search + VAD filtering for precise word capture.
    
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
        segments, info = model.transcribe(
            audio_path, 
            language="en",
            beam_size=5,                    # Better word accuracy (default is 1)
            best_of=5,                      # Sample 5 candidates, pick best
            temperature=0.0,                # Greedy decoding = more precise
            condition_on_previous_text=True, # Use context from previous segments
            vad_filter=True,                # Filter silence, reduce hallucination
            initial_prompt="I express love and care through small actions more than words. I am Prabhdeep Singh. Hello.", # Biases the model vocabulary to recognize user's common words
            vad_parameters=dict(
                min_silence_duration_ms=500, # Don't split too aggressively
            ),
            word_timestamps=False,          # We only need full text
            no_speech_threshold=0.6,        # Skip segments that are likely not speech
        )
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
