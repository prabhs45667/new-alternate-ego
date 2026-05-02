"""Pre-seeded Data Cache — loads ZIP exports for instant onboarding.

Instead of spending 5+ minutes scraping, this module:
1. Pre-parses LinkedIn and Instagram ZIP files at startup
2. Stores extracted text chunks in a cache file
3. When a matching name is detected, loads cached data instantly

This dramatically reduces onboarding time from 5+ minutes to ~30 seconds.
"""
import os
import json
import zipfile
import re
import logging
import hashlib
from typing import Dict, List, Optional
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# Cache file path
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "storage")
CACHE_FILE = os.path.join(CACHE_DIR, "preseed_cache.json")

# Known user data — maps normalized names to their pre-processed data
# These are ZIP file paths that can be pre-processed
# Try multiple possible locations
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_ALT_ROOT = r"c:\Users\hp\Downloads\Alternate-ego"

def _find_zip(filename: str) -> str:
    """Find a ZIP file in project root or alternate locations."""
    for root in [_PROJECT_ROOT, _ALT_ROOT]:
        path = os.path.join(root, filename)
        if os.path.exists(path):
            return path
    return os.path.join(_PROJECT_ROOT, filename)

KNOWN_ZIP_FILES = {
    "linkedin": _find_zip("Basic_LinkedInDataExport_04-26-2026.zip.zip"),
    "instagram": _find_zip("instagram-prabhdeep_singh_12300-2026-04-20-gWwboXdR.zip"),
}

# Names that match the pre-seeded data
PRESEED_NAMES = [
    "prabhdeep singh",
    "prabhdeep singh narula",
    "prabhdeep",
    "deep singhala",
    "deep singh",
    "prabhdeep singhala",
    "prabh singh",
]


def _normalize_name(name: str) -> str:
    """Normalize a name for matching."""
    return re.sub(r'\s+', ' ', name.strip().lower())


def is_preseeded_user(name: str) -> bool:
    """Check if this user has pre-seeded data available."""
    normalized = _normalize_name(name)
    return any(normalized == n or normalized.startswith(n.split()[0]) 
               for n in PRESEED_NAMES)


def _load_cache() -> Dict:
    """Load the pre-seed cache from disk."""
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            logger.warning("Pre-seed cache corrupted, will rebuild.")
    return {}


def _save_cache(cache: Dict):
    """Save the pre-seed cache to disk."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def get_cached_chunks(name: str) -> Optional[List[Dict]]:
    """Get pre-cached chunks for a known user.
    
    Returns:
        List of chunk dicts if cached, None if not found
    """
    cache = _load_cache()
    if "chunks" in cache and len(cache["chunks"]) > 0:
        logger.info(f"✅ Found {len(cache['chunks'])} pre-cached chunks for '{name}'")
        return cache["chunks"]
    return None


def build_preseed_cache(force: bool = False) -> int:
    """Build the pre-seed cache by parsing known ZIP files.
    
    Args:
        force: If True, rebuild even if cache exists
        
    Returns:
        Number of chunks cached
    """
    cache = _load_cache()
    
    if not force and "chunks" in cache and len(cache["chunks"]) > 0:
        logger.info(f"Pre-seed cache already exists with {len(cache['chunks'])} chunks")
        return len(cache["chunks"])
    
    all_chunks = []
    
    # Parse LinkedIn ZIP
    li_path = KNOWN_ZIP_FILES.get("linkedin", "")
    if os.path.exists(li_path):
        logger.info(f"📦 Pre-processing LinkedIn ZIP: {os.path.basename(li_path)}")
        li_chunks = _parse_linkedin_zip(li_path)
        all_chunks.extend(li_chunks)
        logger.info(f"  → Extracted {len(li_chunks)} LinkedIn chunks")
    else:
        logger.warning(f"LinkedIn ZIP not found: {li_path}")
    
    # Parse Instagram ZIP  
    ig_path = KNOWN_ZIP_FILES.get("instagram", "")
    if os.path.exists(ig_path):
        logger.info(f"📦 Pre-processing Instagram ZIP: {os.path.basename(ig_path)}")
        ig_chunks = _parse_instagram_zip(ig_path)
        all_chunks.extend(ig_chunks)
        logger.info(f"  → Extracted {len(ig_chunks)} Instagram chunks")
    else:
        logger.warning(f"Instagram ZIP not found: {ig_path}")
    
    if all_chunks:
        cache["chunks"] = all_chunks
        cache["count"] = len(all_chunks)
        _save_cache(cache)
        logger.info(f"✅ Pre-seed cache built: {len(all_chunks)} total chunks")
    
    return len(all_chunks)


def _parse_linkedin_zip(zip_path: str) -> List[Dict]:
    """Parse a LinkedIn data export ZIP file."""
    chunks = []
    
    try:
        import tempfile
        import shutil
        
        extract_dir = tempfile.mkdtemp(prefix="preseed_li_")
        
        try:
            with zipfile.ZipFile(zip_path, 'r') as z:
                z.extractall(extract_dir)
            
            # Walk all files
            TEXT_EXTENSIONS = {'.html', '.json', '.txt', '.csv'}
            for root, dirs, files in os.walk(extract_dir):
                for filename in files:
                    ext = os.path.splitext(filename)[1].lower()
                    if ext not in TEXT_EXTENSIONS:
                        continue
                    
                    full_path = os.path.join(root, filename)
                    rel_path = os.path.relpath(full_path, extract_dir)
                    
                    try:
                        text = _extract_file_text(full_path, ext)
                        if text and len(text) > 30:
                            chunks.append({
                                "text": f"[LinkedIn Export: {rel_path}]\n{text[:2000]}",
                                "source_type": "data_export",
                                "source_url": f"linkedin_export/{rel_path}",
                                "chunk_index": len(chunks)
                            })
                    except Exception as e:
                        logger.debug(f"Skipping {rel_path}: {e}")
        finally:
            shutil.rmtree(extract_dir, ignore_errors=True)
    
    except Exception as e:
        logger.error(f"LinkedIn ZIP parse error: {e}")
    
    return chunks


def _parse_instagram_zip(zip_path: str) -> List[Dict]:
    """Parse an Instagram data export ZIP file."""
    chunks = []
    
    try:
        import tempfile
        import shutil
        
        extract_dir = tempfile.mkdtemp(prefix="preseed_ig_")
        
        try:
            with zipfile.ZipFile(zip_path, 'r') as z:
                z.extractall(extract_dir)
            
            TEXT_EXTENSIONS = {'.html', '.json', '.txt'}
            processed = 0
            
            for root, dirs, files in os.walk(extract_dir):
                for filename in files:
                    ext = os.path.splitext(filename)[1].lower()
                    if ext not in TEXT_EXTENSIONS:
                        continue
                    
                    full_path = os.path.join(root, filename)
                    rel_path = os.path.relpath(full_path, extract_dir)
                    
                    try:
                        text = _extract_file_text(full_path, ext)
                        if text and len(text) > 30:
                            chunks.append({
                                "text": f"[Instagram Export: {rel_path}]\n{text[:2000]}",
                                "source_type": "data_export", 
                                "source_url": f"instagram_export/{rel_path}",
                                "chunk_index": len(chunks)
                            })
                            processed += 1
                    except Exception as e:
                        logger.debug(f"Skipping {rel_path}: {e}")
                    
                    # Limit to avoid excessive processing
                    if processed > 500:
                        break
                if processed > 500:
                    break
        finally:
            shutil.rmtree(extract_dir, ignore_errors=True)
    
    except Exception as e:
        logger.error(f"Instagram ZIP parse error: {e}")
    
    return chunks


def _extract_file_text(filepath: str, ext: str) -> str:
    """Extract text from a file based on its extension."""
    try:
        if ext == '.html':
            with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
            soup = BeautifulSoup(content, 'html.parser')
            for tag in soup(['script', 'style']):
                tag.decompose()
            return soup.get_text(separator='\n', strip=True)
        
        elif ext == '.json':
            with open(filepath, 'rb') as f:
                raw = f.read()
            # Instagram double-decode trick
            try:
                text = raw.decode('raw_unicode_escape').encode('latin1').decode('utf-8')
            except (UnicodeDecodeError, UnicodeEncodeError):
                try:
                    text = raw.decode('utf-8')
                except UnicodeDecodeError:
                    text = raw.decode('latin1', errors='replace')
            
            data = json.loads(text)
            return _flatten_json(data)
        
        elif ext == '.txt':
            with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                return f.read()
        
        elif ext == '.csv':
            import csv
            with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                reader = csv.reader(f)
                rows = []
                for i, row in enumerate(reader):
                    if i > 100:
                        break
                    rows.append(', '.join(row))
                return '\n'.join(rows)
    
    except Exception as e:
        logger.debug(f"Extract failed for {filepath}: {e}")
    
    return ""


def _flatten_json(data, prefix="") -> str:
    """Recursively flatten JSON into readable text."""
    parts = []
    
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, str) and len(value) > 5:
                parts.append(f"{key}: {value}")
            elif isinstance(value, (dict, list)):
                sub = _flatten_json(value, f"{prefix}{key}.")
                if sub:
                    parts.append(sub)
    
    elif isinstance(data, list):
        for i, item in enumerate(data[:50]):  # Limit list items
            if isinstance(item, str) and len(item) > 5:
                parts.append(item)
            elif isinstance(item, dict):
                sub = _flatten_json(item)
                if sub:
                    parts.append(sub)
    
    return '\n'.join(parts)
