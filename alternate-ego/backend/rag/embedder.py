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

def generate_embedding(text: str) -> list[float]:
    """
    Generate an embedding vector using Ollama's local embedding model.
    Defaulting to 768 dimensions representing common embedding model sizes.
    """
    try:
        response = requests.post(
            f"{OLLAMA_URL}/embeddings",
            json={
                "model": settings.EMBEDDING_MODEL,
                "prompt": text
            },
            timeout=10
        )
        if response.status_code == 200:
            return response.json().get("embedding", [0.0] * 768)
        else:
            logger.error(f"Ollama embedding error HTTP {response.status_code}: {response.text}")
            return [0.0] * 768
    except requests.RequestException as e:
        logger.error(f"Ollama connection error: {e}")
        return [0.0] * 768
