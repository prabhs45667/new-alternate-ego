"""Topic-based text chunker — splits by meaning, not fixed size."""
import re
from typing import List, Dict


def chunk_by_topic(text: str, source_type: str = "unknown", source_url: str = "") -> List[Dict]:
    """Split text into topic-based chunks with source metadata.
    
    Args:
        text: Raw text to chunk
        source_type: One of 'social_profile', 'voice_transcript', 'data_export', 'web_search'
        source_url: Original source URL for citation
    
    Returns:
        List of chunk dicts with 'text', 'source_type', 'source_url', 'chunk_index'
    """
    if not text or not text.strip():
        return []
    
    # Clean the text
    text = text.strip()
    text = re.sub(r'\n{3,}', '\n\n', text)  # Normalize multiple newlines
    
    chunks = []
    
    # Strategy 1: Split by double newlines (paragraphs)
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
    
    if len(paragraphs) <= 1:
        # Strategy 2: Split by single newlines
        paragraphs = [p.strip() for p in text.split('\n') if p.strip()]
    
    if len(paragraphs) <= 1:
        # Strategy 3: Split by sentences for very long text
        sentences = re.split(r'(?<=[.!?])\s+', text)
        if len(sentences) > 3:
            # Group sentences into chunks of ~3
            for i in range(0, len(sentences), 3):
                chunk_text = ' '.join(sentences[i:i+3]).strip()
                if chunk_text and len(chunk_text) > 20:
                    chunks.append({
                        "text": chunk_text,
                        "source_type": source_type,
                        "source_url": source_url,
                        "chunk_index": len(chunks)
                    })
            return chunks
    
    # Build chunks from paragraphs, merging small ones
    current_chunk = ""
    MIN_CHUNK_SIZE = 50
    MAX_CHUNK_SIZE = 500
    
    for para in paragraphs:
        if len(current_chunk) + len(para) < MAX_CHUNK_SIZE:
            current_chunk = (current_chunk + "\n\n" + para).strip() if current_chunk else para
        else:
            if current_chunk and len(current_chunk) >= MIN_CHUNK_SIZE:
                chunks.append({
                    "text": current_chunk,
                    "source_type": source_type,
                    "source_url": source_url,
                    "chunk_index": len(chunks)
                })
            current_chunk = para
    
    # Don't forget the last chunk
    if current_chunk and len(current_chunk) >= MIN_CHUNK_SIZE:
        chunks.append({
            "text": current_chunk,
            "source_type": source_type,
            "source_url": source_url,
            "chunk_index": len(chunks)
        })
    elif current_chunk and len(chunks) == 0:
        # If we only have one small chunk, keep it anyway
        chunks.append({
            "text": current_chunk,
            "source_type": source_type,
            "source_url": source_url,
            "chunk_index": 0
        })
    
    return chunks


def chunk_voice_answers(answers: List[Dict[str, str]]) -> List[Dict]:
    """Chunk voice interview answers into RAG-ready pieces.
    
    Args:
        answers: List of {'question': str, 'answer': str}
    
    Returns:
        List of chunk dicts
    """
    chunks = []
    for i, qa in enumerate(answers):
        question = qa.get("question", f"Question {i+1}")
        answer = qa.get("answer", "").strip()
        if not answer:
            continue
        
        # Each Q&A pair becomes its own chunk with context
        chunk_text = f"When asked: \"{question}\"\nThey answered: \"{answer}\""
        chunks.append({
            "text": chunk_text,
            "source_type": "voice_transcript",
            "source_url": f"voice_interview_q{i+1}",
            "chunk_index": i
        })
    
    return chunks
