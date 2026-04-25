"""Voice reference management — stores and manages voice samples per twin."""
import os
import shutil
import logging
from config import settings

logger = logging.getLogger(__name__)


def save_voice_reference(twin_id: str, audio_bytes: bytes, filename: str = "reference.wav") -> str:
    """Save a voice reference audio file for a twin.
    
    Args:
        twin_id: Twin ID
        audio_bytes: Raw audio bytes
        filename: Output filename
    
    Returns:
        Path to saved file
    """
    voice_dir = os.path.join(settings.VOICES_DIR, twin_id)
    os.makedirs(voice_dir, exist_ok=True)
    
    file_path = os.path.join(voice_dir, filename)
    with open(file_path, 'wb') as f:
        f.write(audio_bytes)
    
    logger.info(f"✅ Voice reference saved: {file_path}")
    return file_path


def save_interview_audio(twin_id: str, audio_bytes: bytes, question_index: int) -> str:
    """Save a voice interview recording."""
    audio_dir = os.path.join(settings.AUDIO_DIR, twin_id)
    os.makedirs(audio_dir, exist_ok=True)
    
    filename = f"q{question_index + 1}.webm"
    file_path = os.path.join(audio_dir, filename)
    with open(file_path, 'wb') as f:
        f.write(audio_bytes)
    
    logger.info(f"✅ Interview audio saved: {file_path}")
    return file_path


def get_voice_reference(twin_id: str) -> str:
    """Get path to voice reference file if it exists."""
    ref_path = os.path.join(settings.VOICES_DIR, twin_id, "reference.wav")
    return ref_path if os.path.exists(ref_path) else ""


def get_interview_recordings(twin_id: str) -> list:
    """Get list of interview recording paths."""
    audio_dir = os.path.join(settings.AUDIO_DIR, twin_id)
    if not os.path.exists(audio_dir):
        return []
    
    files = sorted([
        os.path.join(audio_dir, f)
        for f in os.listdir(audio_dir)
        if f.endswith(('.webm', '.wav', '.mp3'))
    ])
    return files


def delete_voice_data(twin_id: str):
    """Delete all voice data for a twin."""
    for base_dir in [settings.VOICES_DIR, settings.AUDIO_DIR]:
        dir_path = os.path.join(base_dir, twin_id)
        if os.path.exists(dir_path):
            shutil.rmtree(dir_path)
            logger.info(f"🗑️ Deleted voice data: {dir_path}")


def create_voice_reference(twin_id: str) -> str:
    """Combine all interview recordings into a single reference.wav for Coqui XTTS.
    
    Takes all q1.webm, q2.webm, etc. files and concatenates them into one
    reference.wav file that Coqui XTTS uses for voice cloning.
    
    Returns:
        Path to the reference.wav file, or empty string on failure
    """
    recordings = get_interview_recordings(twin_id)
    if not recordings:
        logger.warning(f"No interview recordings found for twin {twin_id}")
        return ""
    
    voice_dir = os.path.join(settings.VOICES_DIR, twin_id)
    os.makedirs(voice_dir, exist_ok=True)
    ref_path = os.path.join(voice_dir, "reference.wav")
    
    try:
        # Try using pydub for proper audio concatenation
        from pydub import AudioSegment
        
        combined = AudioSegment.empty()
        for rec_path in recordings:
            try:
                audio = AudioSegment.from_file(rec_path)
                # Take max 30 seconds from each recording for a good reference
                combined += audio[:30000]
            except Exception as e:
                logger.warning(f"Skipping {rec_path}: {e}")
                continue
        
        if len(combined) > 0:
            # Export as WAV (Coqui needs WAV format)
            # Limit total reference to 5 minutes max
            combined = combined[:300000]
            combined.export(ref_path, format="wav")
            logger.info(f"✅ Voice reference created ({len(combined)/1000:.1f}s): {ref_path}")
            return ref_path
        
        return ""
    except ImportError:
        # pydub not available — just copy the longest recording as reference
        logger.warning("pydub not available, using longest recording as reference")
        longest = max(recordings, key=os.path.getsize)
        shutil.copy2(longest, ref_path)
        return ref_path
    except Exception as e:
        logger.error(f"Voice reference creation failed: {e}")
        # Fallback: copy first recording
        if recordings:
            shutil.copy2(recordings[0], ref_path)
            return ref_path
        return ""

