"""Memory Graph API — visualize what the twin knows."""
import logging
from fastapi import APIRouter
from rag.vector_store import get_all_chunks
from collections import defaultdict

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/graph/{twin_id}")
async def get_memory_graph(twin_id: str):
    """Get a visual knowledge graph of the twin's memory.
    
    Returns nodes (topics) and edges (connections) for D3.js visualization.
    """
    chunks = get_all_chunks(twin_id)
    
    if not chunks:
        return {"nodes": [], "edges": [], "stats": {"total_chunks": 0}}
    
    nodes = []
    edges = []
    category_map = defaultdict(list)
    
    for i, chunk in enumerate(chunks):
        source = chunk.get("source_type", "unknown")
        text = chunk.get("text", "")[:100]
        
        category_map[source].append(i)
        
        nodes.append({
            "id": f"chunk_{i}",
            "label": text[:50] + "..." if len(text) > 50 else text,
            "category": source,
            "source": chunk.get("source_url", ""),
            "full_text": chunk.get("text", "")[:300],
            "size": min(len(text) / 20, 10) + 3,
        })
    
    # Category hub nodes
    icon_map = {
        "voice_interview": "🎙️",
        "voice_transcript": "🗣️",
        "linkedin": "💼",
        "instagram": "📸",
        "twitter": "🐦",
        "facebook": "📘",
        "web": "🌐",
        "zip_export": "📦",
        "search": "🔍",
        "unknown": "📄",
    }
    
    for cat, chunk_ids in category_map.items():
        cat_id = f"cat_{cat}"
        icon = icon_map.get(cat, "📄")
        
        nodes.append({
            "id": cat_id,
            "label": f"{icon} {cat.replace('_', ' ').title()}",
            "category": "hub",
            "source": "system",
            "full_text": f"{len(chunk_ids)} knowledge chunks from {cat}",
            "size": 15 + len(chunk_ids),
        })
        
        for cid in chunk_ids:
            edges.append({
                "source": cat_id,
                "target": f"chunk_{cid}",
                "strength": 0.3,
            })
    
    cats = list(category_map.keys())
    for i in range(len(cats)):
        for j in range(i + 1, len(cats)):
            edges.append({
                "source": f"cat_{cats[i]}",
                "target": f"cat_{cats[j]}",
                "strength": 0.1,
            })
    
    return {
        "nodes": nodes,
        "edges": edges,
        "stats": {
            "total_chunks": len(chunks),
            "categories": len(category_map),
            "category_counts": {k: len(v) for k, v in category_map.items()},
        }
    }


@router.get("/stats/{twin_id}")
async def get_memory_stats(twin_id: str):
    """Get memory statistics for a twin."""
    chunks = get_all_chunks(twin_id)
    
    category_counts = defaultdict(int)
    total_words = 0
    
    for chunk in chunks:
        category_counts[chunk.get("source_type", "unknown")] += 1
        total_words += len(chunk.get("text", "").split())
    
    return {
        "twin_id": twin_id,
        "total_chunks": len(chunks),
        "total_words": total_words,
        "categories": dict(category_counts),
        "estimated_pages": total_words // 250,
    }
