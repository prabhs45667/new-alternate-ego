import requests
import logging
from config import settings

logger = logging.getLogger(__name__)

OLLAMA_URL = "http://127.0.0.1:11434/api"

def is_ollama_available() -> bool:
    """Check if Ollama local server is running."""
    try:
        response = requests.get("http://127.0.0.1:11434/", timeout=2)
        return response.status_code == 200
    except requests.RequestException:
        return False

# Reduced from 6000 → 4000 to prevent "input length exceeds context length" errors
MAX_EMBED_CHARS = 4000  # Safe limit for nomic-embed-text (8192 token context)


def generate_embedding(text: str) -> list[float]:
    """
    Generate an embedding vector using Ollama's local embedding model.
    Truncates input to MAX_EMBED_CHARS to avoid exceeding context length.
    """
    if not text or not text.strip():
        return [0.0] * 768

    # Aggressively truncate to stay within the model's context window
    text = text.strip()
    if len(text) > MAX_EMBED_CHARS:
        text = text[:MAX_EMBED_CHARS]

    try:
        response = requests.post(
            f"{OLLAMA_URL}/embeddings",
            json={
                "model": settings.EMBEDDING_MODEL,
                "prompt": text
            },
            timeout=10  # Reduced from 15s — fail fast
        )
        if response.status_code == 200:
            return response.json().get("embedding", [0.0] * 768)
        else:
            logger.error(f"Ollama embedding error HTTP {response.status_code}: {response.text[:100]}")
            return [0.0] * 768
    except requests.RequestException as e:
        logger.error(f"Ollama connection error: {e}")
        return [0.0] * 768

