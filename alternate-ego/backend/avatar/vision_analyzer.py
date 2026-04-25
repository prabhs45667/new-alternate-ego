"""Local personality analysis from avatar photos — no paid APIs needed.

Uses Ollama LLM to generate personality insights based on the emotions
captured during onboarding. This replaces the Gemini Vision approach
to keep everything 100% free and local.
"""
import os
import logging
from config import settings

logger = logging.getLogger(__name__)


def extract_personality_from_faces(twin_id: str) -> str:
    """Analyze personality based on captured emotion photos.
    
    Since we can't do local vision analysis for free without heavy GPU models,
    we use the FACT that the user provided 4 emotion photos to enrich the 
    personality profile via the LLM.
    
    Returns:
        Personality trait string, or empty string if no photos found.
    """
    photo_dir = os.path.join(settings.AVATARS_DIR, twin_id)
    emotions_found = []
    
    for emotion in ["neutral", "happy", "sad", "angry"]:
        path = os.path.join(photo_dir, f"{emotion}.jpg")
        if os.path.exists(path):
            emotions_found.append(emotion)
    
    if not emotions_found:
        return ""
    
    # Use Ollama to generate personality insights based on emotion availability
    try:
        from rag.llm import generate_response
        
        prompt = (
            f"A person has provided {len(emotions_found)} facial expression photos "
            f"showing these emotions: {', '.join(emotions_found)}. "
            f"Based on someone willing to express these emotions openly, "
            f"generate 4-5 bullet points about their likely personality traits. "
            f"Focus on emotional openness, expressiveness, and authenticity. "
            f"Keep it warm and insightful. Output ONLY the bullet points."
        )
        
        result = generate_response(prompt)
        if result and "Error" not in result:
            logger.info(f"✅ Personality analysis complete for twin {twin_id}")
            return result
        return ""
        
    except Exception as e:
        logger.error(f"Personality analysis error: {e}")
        return ""
