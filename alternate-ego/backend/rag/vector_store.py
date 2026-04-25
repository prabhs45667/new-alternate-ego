"""Pure Python JSON Vector Store — zero DLL dependencies.

Replaces ChromaDB (which crashes with hnswlib DLL errors on Windows).
Uses exact cosine similarity with math.sqrt().

Trade-off: O(n) search instead of O(log n), but perfectly fine for 
per-user data sizes (<1000 chunks).
"""
import json
import os
import math
import uuid
import logging
from typing import List, Dict, Optional
from rag.embedder import generate_embedding
from config import settings

logger = logging.getLogger(__name__)

STORE_PATH = settings.VECTOR_STORE_PATH


def _load_store() -> Dict:
    """Load the vector store from disk."""
    if os.path.exists(STORE_PATH):
        try:
            with open(STORE_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            logger.warning("Vector store corrupted, starting fresh.")
    return {}


def _save_store(store: Dict):
    """Save the vector store to disk."""
    with open(STORE_PATH, 'w', encoding='utf-8') as f:
        json.dump(store, f, ensure_ascii=False)


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    """Compute cosine similarity between two vectors."""
    if not a or not b or len(a) != len(b):
        return 0.0
    
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    
    if mag_a == 0 or mag_b == 0:
        return 0.0
    
    return dot / (mag_a * mag_b)


def add_chunks(twin_id: str, chunks: List[Dict]) -> int:
    """Add text chunks to the vector store for a specific twin.
    
    Args:
        twin_id: The twin's ID
        chunks: List of {'text': str, 'source_type': str, 'source_url': str, 'chunk_index': int}
    
    Returns:
        Number of chunks successfully added
    """
    store = _load_store()
    
    if twin_id not in store:
        store[twin_id] = []
    
    added = 0
    for chunk in chunks:
        text = chunk.get("text", "").strip()
        if not text:
            continue
        
        # Generate embedding
        embedding = generate_embedding(text)
        if not embedding:
            logger.warning(f"Failed to embed chunk: {text[:50]}...")
            continue
        
        entry = {
            "id": str(uuid.uuid4()),
            "text": text,
            "embedding": embedding,
            "source_type": chunk.get("source_type", "unknown"),
            "source_url": chunk.get("source_url", ""),
            "chunk_index": chunk.get("chunk_index", 0)
        }
        
        store[twin_id].append(entry)
        added += 1
    
    _save_store(store)
    logger.info(f"✅ Added {added}/{len(chunks)} chunks for twin {twin_id}")
    return added


def search(twin_id: str, query: str, top_k: int = 5) -> List[Dict]:
    """Search for the most relevant chunks for a query.
    
    Args:
        twin_id: The twin's ID
        query: User's question/message
        top_k: Number of top results to return
    
    Returns:
        List of matching chunks with similarity scores
    """
    store = _load_store()
    
    if twin_id not in store or not store[twin_id]:
        return []
    
    # Embed the query
    query_embedding = generate_embedding(query)
    if not query_embedding:
        return []
    
    # Calculate similarity for all chunks
    scored = []
    for entry in store[twin_id]:
        similarity = _cosine_similarity(query_embedding, entry["embedding"])
        scored.append({
            "text": entry["text"],
            "source_type": entry["source_type"],
            "source_url": entry["source_url"],
            "relevance": round(similarity, 4)
        })
    
    # Sort by similarity (descending) and return top_k
    scored.sort(key=lambda x: x["relevance"], reverse=True)
    return scored[:top_k]


def get_chunk_count(twin_id: str) -> int:
    """Get the number of chunks stored for a twin."""
    store = _load_store()
    return len(store.get(twin_id, []))


def delete_twin_data(twin_id: str) -> int:
    """Delete all vector data for a twin."""
    store = _load_store()
    count = len(store.get(twin_id, []))
    if twin_id in store:
        del store[twin_id]
        _save_store(store)
    return count


def get_all_chunks(twin_id: str) -> List[Dict]:
    """Get all chunks for a twin (without embeddings, for display)."""
    store = _load_store()
    entries = store.get(twin_id, [])
    return [{
        "text": e["text"],
        "source_type": e["source_type"],
        "source_url": e["source_url"]
    } for e in entries]
