"""Source citation tracker — formats RAG sources for the frontend."""
from typing import List, Dict


# Source type to emoji mapping
SOURCE_ICONS = {
    "social_profile": "🌐",
    "voice_transcript": "🎙️",
    "data_export": "📦",
    "web_search": "🔍",
    "unknown": "📚"
}

SOURCE_LABELS = {
    "social_profile": "Social Profile",
    "voice_transcript": "Voice Answer",
    "data_export": "Data Export",
    "web_search": "Web Search",
    "unknown": "Source"
}


def format_sources(sources: List[Dict]) -> List[Dict]:
    """Format raw source data into displayable citation objects.
    
    Args:
        sources: List of {'text': str, 'source_type': str, 'source_url': str, 'relevance': float}
    
    Returns:
        List of formatted source dicts for the frontend
    """
    formatted = []
    seen_texts = set()
    
    for source in sources:
        # Deduplicate by text content
        text_preview = source.get("text", "")[:80]
        if text_preview in seen_texts:
            continue
        seen_texts.add(text_preview)
        
        source_type = source.get("source_type", "unknown")
        
        formatted.append({
            "icon": SOURCE_ICONS.get(source_type, "📚"),
            "label": SOURCE_LABELS.get(source_type, "Source"),
            "text": text_preview,
            "url": source.get("source_url", ""),
            "relevance": source.get("relevance", 0.0),
            "type": source_type
        })
    
    return formatted


def format_source_summary(sources: List[Dict]) -> str:
    """Create a brief text summary of sources used."""
    if not sources:
        return ""
    
    type_counts = {}
    for s in sources:
        t = s.get("source_type", "unknown")
        type_counts[t] = type_counts.get(t, 0) + 1
    
    parts = []
    for source_type, count in type_counts.items():
        icon = SOURCE_ICONS.get(source_type, "📚")
        label = SOURCE_LABELS.get(source_type, "Source")
        parts.append(f"{icon} {count} {label}{'s' if count > 1 else ''}")
    
    return " • ".join(parts)
