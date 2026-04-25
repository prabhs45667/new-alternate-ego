"""Social media scraping + data export parsing — Phase 6 Upgraded.

Uses DuckDuckGo Search API (reliable) + Crawl4AI + Instaloader 
+ BeautifulSoup (fallback) for maximum data collection.
Includes real-time WebSocket log emission for live frontend updates.
"""
import requests
import json
import zipfile
import csv
import os
import re
import logging
from typing import List, Dict, Optional, Callable
from bs4 import BeautifulSoup
from rag.chunker import chunk_by_topic
from rag.vector_store import add_chunks

logger = logging.getLogger(__name__)

# Log callback helper — emits to WebSocket if session_id is provided
def _emit(session_id: Optional[str], message: str):
    """Emit a log message both to logger and WebSocket (if session connected)."""
    logger.info(message)
    if session_id:
        try:
            from api.ws_logs import emit_log
            emit_log(session_id, message)
        except Exception:
            pass


# ── MAIN ENTRY POINT ─────────────────────────────────────────────

def scrape_and_index(name: str, twin_id: str, social_urls: List[str] = None, session_id: str = None) -> Dict:
    """Scrape public profiles and web mentions, then index into RAG.

    Uses a multi-layer strategy:
    1. DuckDuckGo search for public info (MOST RELIABLE)
    2. Crawl4AI / BeautifulSoup for provided URLs
    3. Instaloader for Instagram profiles
    4. Google search fallback
    
    Args:
        session_id: Optional session ID for real-time WebSocket log streaming.
    """
    all_chunks = []
    _emit(session_id, f"🚀 Starting data collection for {name}...")

    # 1. DuckDuckGo search for public info (PRIORITY — most reliable)
    _emit(session_id, f"🔍 Searching the web for {name}'s public information...")
    search_queries = [
        f'"{name}" LinkedIn profile',
        f'"{name}" about bio',
        f'"{name}" portfolio website',
        f'"{name}" achievements accomplishments',
        f'"{name}" projects work experience',
        f'"{name}" education skills',
        f'"{name}" blog posts articles',
        f'{name} social media',
    ]
    ddg_chunks = 0
    for query in search_queries:
        try:
            _emit(session_id, f"🔎 Searching: '{query}'...")
            results = _duckduckgo_search_api(query)
            for result in results[:5]:
                text = result.get("body", "")
                title = result.get("title", "")
                url = result.get("href", "")
                if text and len(text) > 20:
                    full_text = f"{title}\n{text}" if title else text
                    chunks = chunk_by_topic(full_text, "web_search", url)
                    all_chunks.extend(chunks)
                    ddg_chunks += len(chunks)
        except Exception as e:
            _emit(session_id, f"⚠️ Search failed for '{query}': {str(e)[:60]}")
    
    if ddg_chunks > 0:
        _emit(session_id, f"✅ Found {ddg_chunks} knowledge chunks from web search")

    # 2. Scrape provided direct URLs
    if social_urls:
        valid_urls = [u.strip() for u in social_urls if u.strip()]
        _emit(session_id, f"🔗 Found {len(valid_urls)} social profile URL(s) to scan")
        for idx, url in enumerate(valid_urls):
            try:
                platform = _detect_source_type(url).replace('_', ' ').title()
                _emit(session_id, f"🔍 [{idx+1}/{len(valid_urls)}] Scanning {platform}: {url[:60]}...")

                # Use specialized scraper based on URL type
                if "instagram.com" in url:
                    _emit(session_id, f"📸 Using Instagram specialist scraper...")
                    text = _scrape_instagram(url)
                elif "linkedin.com" in url:
                    _emit(session_id, f"💼 Scraping LinkedIn profile...")
                    text = _scrape_linkedin_public(url, name)
                else:
                    text = _scrape_with_crawl4ai(url)
                    if not text or len(text) < 50:
                        _emit(session_id, f"🔄 Crawl4AI insufficient, falling back to BeautifulSoup...")
                        text = _scrape_url_beautifulsoup(url)

                if text and len(text) > 50:
                    source_type = _detect_source_type(url)
                    chunks = chunk_by_topic(text, source_type, url)
                    all_chunks.extend(chunks)
                    _emit(session_id, f"✅ Extracted {len(chunks)} knowledge chunks ({len(text)} chars) from {platform}")
                else:
                    _emit(session_id, f"⚠️ Limited data from {url[:50]} — will rely on uploaded data + web search")
            except Exception as e:
                _emit(session_id, f"❌ Failed to scrape {url[:50]}: {str(e)[:80]}")

    # 3. Google search fallback for more coverage
    _emit(session_id, f"🌐 Running Google search for additional mentions...")
    google_chunks = _google_search_and_scrape(name, session_id)
    all_chunks.extend(google_chunks)
    if google_chunks:
        _emit(session_id, f"✅ Found {len(google_chunks)} additional chunks from Google")

    # 4. Index all chunks
    if all_chunks:
        _emit(session_id, f"💾 Indexing {len(all_chunks)} total chunks into vector store...")
        added = add_chunks(twin_id, all_chunks)
        _emit(session_id, f"🎉 Data collection complete! {added} chunks indexed successfully.")
        return {"chunks_indexed": added, "sources_found": len(all_chunks)}

    _emit(session_id, f"📭 Limited public data found — twin will be enriched from voice interview & uploaded data.")
    return {"chunks_indexed": 0, "sources_found": 0}


def _detect_source_type(url: str) -> str:
    """Detect the source type from URL."""
    url_lower = url.lower()
    if "linkedin" in url_lower:
        return "social_profile"
    elif "instagram" in url_lower:
        return "social_profile"
    elif "twitter" in url_lower or "x.com" in url_lower:
        return "social_profile"
    elif "facebook" in url_lower:
        return "social_profile"
    return "web_search"


# ── DUCKDUCKGO SEARCH API (PRIMARY — MOST RELIABLE) ──────────────

def _duckduckgo_search_api(query: str) -> List[Dict]:
    """Search DuckDuckGo using the duckduckgo_search Python library."""
    try:
        try:
            from ddgs import DDGS
        except ImportError:
            from duckduckgo_search import DDGS
        
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=5))
        
        formatted = []
        for r in results:
            formatted.append({
                "title": r.get("title", ""),
                "href": r.get("href", r.get("link", "")),
                "body": r.get("body", r.get("snippet", ""))
            })
        
        return formatted
    except ImportError:
        logger.warning("duckduckgo_search not installed, trying HTML fallback")
        return _duckduckgo_search_html(query)
    except Exception as e:
        logger.warning(f"DuckDuckGo API error: {e}")
        return _duckduckgo_search_html(query)


def _duckduckgo_search_html(query: str) -> List[Dict]:
    """Fallback: Search DuckDuckGo via HTML scraping."""
    try:
        url = "https://html.duckduckgo.com/html/"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        response = requests.post(url, data={"q": query}, headers=headers, timeout=10)

        soup = BeautifulSoup(response.text, 'html.parser')
        results = []

        for result in soup.find_all('div', class_='result'):
            title_tag = result.find('a', class_='result__a')
            snippet_tag = result.find('a', class_='result__snippet')

            if title_tag and snippet_tag:
                results.append({
                    "title": title_tag.get_text(strip=True),
                    "href": title_tag.get('href', ''),
                    "body": snippet_tag.get_text(strip=True)
                })

        return results[:5]
    except Exception as e:
        logger.warning(f"DuckDuckGo HTML search error: {e}")
        return []


# ── GOOGLE SEARCH FALLBACK ────────────────────────────────────────

def _google_search_and_scrape(name: str, session_id: str = None) -> List[Dict]:
    """Search Google for public info and scrape the results."""
    chunks = []
    try:
        from googlesearch import search as google_search
        
        queries = [f"{name} LinkedIn", f"{name} about", f"{name} bio achievements"]
        for query in queries:
            try:
                urls = list(google_search(query, num_results=3, lang="en"))
                for url in urls[:3]:
                    try:
                        text = _scrape_url_beautifulsoup(url)
                        if text and len(text) > 50:
                            new_chunks = chunk_by_topic(text, "web_search", url)
                            chunks.extend(new_chunks)
                    except Exception:
                        pass
            except Exception as e:
                logger.warning(f"Google search failed for '{query}': {e}")
    except ImportError:
        logger.info("googlesearch-python not installed, skipping Google search")
    except Exception as e:
        logger.warning(f"Google search error: {e}")
    
    return chunks


# ── LINKEDIN SCRAPER ──────────────────────────────────────────────

def _scrape_linkedin_public(url: str, name: str = "") -> str:
    """Scrape a public LinkedIn profile page.
    
    LinkedIn blocks most scrapers, so we use multiple strategies:
    1. Direct BeautifulSoup scrape (works for some public profiles)
    2. DuckDuckGo search for LinkedIn cached data
    3. Trafilatura for text extraction
    """
    text = ""
    
    # Strategy 1: Direct scrape with realistic headers
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
        }
        response = requests.get(url, headers=headers, timeout=15, allow_redirects=True)
        
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Extract profile data from meta tags (LinkedIn puts key info here)
            parts = []
            
            # OG meta tags contain profile summary
            og_title = soup.find('meta', property='og:title')
            if og_title:
                parts.append(f"Name: {og_title.get('content', '')}")
            
            og_desc = soup.find('meta', property='og:description')
            if og_desc:
                parts.append(f"About: {og_desc.get('content', '')}")
            
            # Twitter meta tags also have info
            tw_desc = soup.find('meta', attrs={'name': 'twitter:description'})
            if tw_desc:
                desc = tw_desc.get('content', '')
                if desc and desc not in str(parts):
                    parts.append(f"Summary: {desc}")
            
            # Description meta tag
            meta_desc = soup.find('meta', attrs={'name': 'description'})
            if meta_desc:
                desc = meta_desc.get('content', '')
                if desc and len(desc) > 50:
                    parts.append(f"Profile: {desc}")
            
            # Try extracting visible text
            for tag in soup(['script', 'style', 'nav', 'footer', 'header']):
                tag.decompose()
            
            body_text = soup.get_text(separator='\n', strip=True)
            lines = [l.strip() for l in body_text.split('\n') if l.strip() and len(l.strip()) > 15]
            
            # Filter LinkedIn noise
            noise_words = ['sign in', 'sign up', 'join now', 'forgot password', 'cookie', 'privacy policy']
            clean_lines = [l for l in lines if not any(n in l.lower() for n in noise_words)]
            
            if clean_lines:
                parts.append("Content:\n" + "\n".join(clean_lines[:50]))
            
            text = "\n\n".join(parts)
    except Exception as e:
        logger.warning(f"Direct LinkedIn scrape failed: {e}")
    
    # Strategy 2: Search DuckDuckGo for LinkedIn cached info
    if not text or len(text) < 100:
        try:
            # Extract username from URL
            username = url.rstrip('/').split('/')[-1]
            search_queries = [
                f'site:linkedin.com "{name}" "{username}"',
                f'"{name}" linkedin experience education skills',
                f'"{name}" professional background achievements',
            ]
            for query in search_queries:
                results = _duckduckgo_search_api(query)
                for r in results[:3]:
                    body = r.get("body", "")
                    title = r.get("title", "")
                    if body and len(body) > 20:
                        text += f"\n\n{title}\n{body}"
        except Exception as e:
            logger.warning(f"LinkedIn search fallback failed: {e}")
    
    # Strategy 3: Trafilatura
    if not text or len(text) < 100:
        try:
            import trafilatura
            downloaded = trafilatura.fetch_url(url)
            if downloaded:
                extracted = trafilatura.extract(downloaded)
                if extracted:
                    text += f"\n\n{extracted}"
        except Exception:
            pass
    
    return text[:8000] if text else ""


# ── CRAWL4AI (GENERAL URL SCRAPER) ────────────────────────────────

def _scrape_with_crawl4ai(url: str) -> str:
    """Scrape a URL using Crawl4AI for LLM-ready markdown output."""
    try:
        from crawl4ai import WebCrawler

        crawler = WebCrawler(verbose=False)
        crawler.warmup()
        result = crawler.run(url=url)

        if result and result.markdown:
            text = result.markdown[:8000]  # Cap at 8000 chars
            logger.info(f"Crawl4AI scraped {url}: {len(text)} chars")
            return text
        return ""
    except ImportError:
        logger.warning("Crawl4AI not installed, falling back to BeautifulSoup")
        return ""
    except Exception as e:
        logger.warning(f"Crawl4AI failed for {url}: {e}")
        return ""


# ── INSTALOADER (INSTAGRAM SPECIALIST) ─────────────────────────────

def _scrape_instagram(url: str) -> str:
    """Scrape Instagram public profile using Instaloader."""
    try:
        import instaloader

        # Extract username from URL
        username = _extract_instagram_username(url)
        if not username:
            return _scrape_url_beautifulsoup(url)

        L = instaloader.Instaloader(
            download_pictures=False,
            download_videos=False,
            download_video_thumbnails=False,
            download_comments=False,
            save_metadata=False,
            compress_json=False
        )

        profile = instaloader.Profile.from_username(L.context, username)

        # Build profile text
        parts = []
        parts.append(f"Instagram Profile: @{username}")
        parts.append(f"Full Name: {profile.full_name}")
        if profile.biography:
            parts.append(f"Bio: {profile.biography}")
        parts.append(f"Followers: {profile.followers}")
        parts.append(f"Following: {profile.followees}")
        parts.append(f"Posts: {profile.mediacount}")
        if profile.external_url:
            parts.append(f"Website: {profile.external_url}")
        if profile.is_business_account:
            parts.append(f"Business Category: {profile.business_category_name}")

        # Get recent post captions (public profiles only, limit 20)
        try:
            post_count = 0
            for post in profile.get_posts():
                if post_count >= 20:
                    break
                if post.caption:
                    caption_preview = post.caption[:300]
                    parts.append(f"Post ({post.date_local.strftime('%Y-%m-%d')}): {caption_preview}")
                    # Also extract hashtags
                    hashtags = post.caption_hashtags
                    if hashtags:
                        parts.append(f"  Hashtags: {', '.join(hashtags[:10])}")
                post_count += 1
        except Exception as e:
            logger.warning(f"Could not fetch Instagram posts for @{username}: {e}")

        text = "\n\n".join(parts)
        logger.info(f"Instaloader scraped @{username}: {len(text)} chars, {post_count} posts")
        return text

    except ImportError:
        logger.warning("Instaloader not installed, falling back to BeautifulSoup")
        return _scrape_url_beautifulsoup(url)
    except Exception as e:
        logger.warning(f"Instaloader failed for {url}: {e}")
        return _scrape_url_beautifulsoup(url)


def _extract_instagram_username(url: str) -> str:
    """Extract username from Instagram URL or @handle."""
    url = url.strip().rstrip("/")
    if url.startswith("@"):
        return url[1:]
    match = re.search(r'instagram\.com/([A-Za-z0-9_.]+)', url)
    return match.group(1) if match else ""


# ── BEAUTIFULSOUP (FALLBACK) ──────────────────────────────────────

def _scrape_url_beautifulsoup(url: str) -> str:
    """Scrape text content from a URL using BeautifulSoup."""
    try:
        # Try trafilatura first (better text extraction)
        import trafilatura
        downloaded = trafilatura.fetch_url(url)
        if downloaded:
            text = trafilatura.extract(downloaded)
            if text:
                return text[:5000]
    except ImportError:
        pass
    except Exception:
        pass

    # Fallback to BeautifulSoup
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'html.parser')

        # Remove noise
        for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside']):
            tag.decompose()

        text = soup.get_text(separator='\n', strip=True)

        # Clean up
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        text = '\n'.join(lines)

        return text[:5000]
    except Exception as e:
        logger.error(f"BeautifulSoup scraping failed for {url}: {e}")
        return ""


# ── ZIP DATA EXPORT DEEP PARSER ───────────────────────────────────

def parse_data_export(file_path: str, twin_id: str, session_id: str = None) -> Dict:
    """Parse a user's data export (.zip or .json) and index into RAG.

    Supports deep parsing for:
    - Instagram data export (posts, stories, comments, bio, DMs, reels)
    - LinkedIn data export (profile, positions, skills, recommendations)
    - Twitter/X data export (tweets, likes, bio)
    - Facebook data export (posts, comments, about info)
    - Generic JSON/text files
    """
    all_chunks = []
    _emit(session_id, f"📦 Parsing uploaded data file: {os.path.basename(file_path)}")

    if file_path.endswith('.zip'):
        all_chunks = _parse_zip_deep(file_path, session_id)
    elif file_path.endswith('.json'):
        all_chunks = _parse_json_export(file_path)
    else:
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                text = f.read()
            all_chunks = chunk_by_topic(text, "data_export", file_path)
        except Exception as e:
            logger.error(f"Cannot parse {file_path}: {e}")

    if all_chunks:
        _emit(session_id, f"💾 Indexing {len(all_chunks)} chunks from uploaded data...")
        added = add_chunks(twin_id, all_chunks)
        _emit(session_id, f"✅ Uploaded data processed: {added} chunks indexed!")
        return {"chunks_indexed": added, "file": os.path.basename(file_path)}

    _emit(session_id, f"⚠️ No extractable data found in uploaded file.")
    return {"chunks_indexed": 0, "file": os.path.basename(file_path)}


def _parse_zip_deep(zip_path: str, session_id: str = None) -> List[Dict]:
    """Deep parse a ZIP data export — detects platform and extracts maximum data."""
    chunks = []
    try:
        with zipfile.ZipFile(zip_path, 'r') as z:
            file_list = z.namelist()

            # Detect platform based on file structure
            platform = _detect_platform(file_list)
            _emit(session_id, f"🔍 Detected platform: {platform.upper()} ({len(file_list)} files)")

            if platform == "instagram":
                chunks = _parse_instagram_zip(z, file_list, session_id)
            elif platform == "linkedin":
                chunks = _parse_linkedin_zip(z, file_list, session_id)
            elif platform == "twitter":
                chunks = _parse_twitter_zip(z, file_list)
            elif platform == "facebook":
                chunks = _parse_facebook_zip(z, file_list)
            else:
                # Generic: parse all JSON, HTML, TXT files
                chunks = _parse_generic_zip(z, file_list)

    except zipfile.BadZipFile:
        logger.error(f"Invalid ZIP file: {zip_path}")
    except Exception as e:
        logger.error(f"ZIP parsing error: {e}")

    return chunks


def _detect_platform(file_list: List[str]) -> str:
    """Detect which platform's data export this is."""
    joined = " ".join(file_list).lower()

    if "your_instagram" in joined or "content/posts" in joined or "personal_information" in joined:
        return "instagram"
    elif "connections.csv" in joined or "positions.csv" in joined or "profile.csv" in joined:
        return "linkedin"
    elif "tweet.js" in joined or "tweets.js" in joined or "twitter" in joined:
        return "twitter"
    elif "your_posts" in joined and "facebook" in joined:
        return "facebook"
    return "generic"


# ── INSTAGRAM ZIP PARSER ──────────────────────────────────────────

def _parse_instagram_zip(z: zipfile.ZipFile, file_list: List[str], session_id: str = None) -> List[Dict]:
    """Parse Instagram data export ZIP — extracts everything."""
    chunks = []
    files_parsed = 0

    for fname in file_list:
        fname_lower = fname.lower()
        try:
            if fname.endswith('.json'):
                data = json.loads(z.read(fname).decode('utf-8', errors='ignore'))

                # Posts & captions
                if 'content' in fname_lower and 'posts' in fname_lower:
                    _emit(session_id, f"  📝 Parsing Instagram posts...")
                    texts = _extract_instagram_posts(data)
                    for t in texts:
                        chunks.extend(chunk_by_topic(t, "data_export", "instagram/posts"))
                    files_parsed += 1

                # Profile bio
                elif 'personal_information' in fname_lower or 'profile' in fname_lower:
                    _emit(session_id, f"  👤 Parsing Instagram profile...")
                    text = _extract_instagram_profile(data)
                    if text:
                        chunks.extend(chunk_by_topic(text, "data_export", "instagram/profile"))
                    files_parsed += 1

                # Comments
                elif 'comment' in fname_lower:
                    _emit(session_id, f"  💬 Parsing Instagram comments...")
                    texts = _extract_instagram_comments(data)
                    for t in texts:
                        chunks.extend(chunk_by_topic(t, "data_export", "instagram/comments"))
                    files_parsed += 1

                # Stories
                elif 'stories' in fname_lower:
                    texts = _extract_text_recursive(data)
                    if texts:
                        chunks.extend(chunk_by_topic(texts, "data_export", "instagram/stories"))

                # Messages / DMs
                elif 'message' in fname_lower or 'inbox' in fname_lower:
                    _emit(session_id, f"  📩 Parsing Instagram messages...")
                    texts = _extract_instagram_messages(data)
                    for t in texts:
                        chunks.extend(chunk_by_topic(t, "data_export", "instagram/messages"))
                    files_parsed += 1

                # Reels
                elif 'reel' in fname_lower:
                    texts = _extract_text_recursive(data)
                    if texts:
                        chunks.extend(chunk_by_topic(texts, "data_export", "instagram/reels"))

                # Saved posts
                elif 'saved' in fname_lower:
                    texts = _extract_text_recursive(data)
                    if texts:
                        chunks.extend(chunk_by_topic(texts, "data_export", "instagram/saved"))

                # Liked posts
                elif 'like' in fname_lower:
                    texts = _extract_text_recursive(data)
                    if texts:
                        chunks.extend(chunk_by_topic(texts, "data_export", "instagram/likes"))

                # Following / Followers lists
                elif 'follow' in fname_lower:
                    texts = _extract_text_recursive(data)
                    if texts:
                        chunks.extend(chunk_by_topic(texts, "data_export", "instagram/connections"))

                # Catch-all for other JSON files
                else:
                    text = _extract_text_from_json(data)
                    if text and len(text) > 30:
                        chunks.extend(chunk_by_topic(text, "data_export", f"instagram/{fname}"))

            elif fname.endswith('.html'):
                content = z.read(fname).decode('utf-8', errors='ignore')
                soup = BeautifulSoup(content, 'html.parser')
                text = soup.get_text(separator='\n', strip=True)
                if text and len(text) > 50:
                    chunks.extend(chunk_by_topic(text, "data_export", f"instagram/{fname}"))

        except Exception as e:
            logger.warning(f"Error parsing {fname}: {e}")

    _emit(session_id, f"  ✅ Instagram ZIP: {len(chunks)} chunks from {files_parsed} files")
    logger.info(f"Instagram ZIP: extracted {len(chunks)} chunks")
    return chunks


def _extract_instagram_posts(data) -> List[str]:
    """Extract post captions from Instagram export."""
    texts = []
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                # Instagram exports use "media" -> list -> "title" for captions
                media_list = item.get("media", [])
                if isinstance(media_list, list):
                    for media in media_list:
                        title = media.get("title", "")
                        if title:
                            creation_time = media.get("creation_timestamp", "")
                            texts.append(f"Post: {title}")
                # Also check direct "title" field
                title = item.get("title", "")
                if title and len(title) > 10:
                    texts.append(f"Post: {title}")
    elif isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, list):
                texts.extend(_extract_instagram_posts(value))
    return texts


def _extract_instagram_profile(data) -> str:
    """Extract profile info from Instagram export."""
    parts = []
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        for k, v in item.items():
                            if isinstance(v, str) and len(v) > 5:
                                parts.append(f"{k}: {v}")
                            elif isinstance(v, dict):
                                val = v.get("value", v.get("href", ""))
                                if val:
                                    parts.append(f"{k}: {val}")
            elif isinstance(value, str) and len(value) > 5:
                parts.append(f"{key}: {value}")
    return "\n".join(parts)


def _extract_instagram_comments(data) -> List[str]:
    """Extract comments from Instagram export."""
    texts = []
    if isinstance(data, dict):
        comments = data.get("comments_media_comments", data.get("comments", []))
        if isinstance(comments, list):
            for c in comments[:100]:
                if isinstance(c, dict):
                    for k, v in c.items():
                        if isinstance(v, list):
                            for item in v:
                                if isinstance(item, dict):
                                    text = item.get("value", item.get("text", ""))
                                    if text:
                                        texts.append(f"Comment: {text}")
    return texts


def _extract_instagram_messages(data) -> List[str]:
    """Extract DM messages from Instagram export."""
    texts = []
    if isinstance(data, dict):
        messages = data.get("messages", [])
        if isinstance(messages, list):
            for msg in messages[:200]:
                if isinstance(msg, dict):
                    content = msg.get("content", "")
                    sender = msg.get("sender_name", "")
                    if content and len(content) > 10:
                        texts.append(f"{sender}: {content}")
    return texts


# ── LINKEDIN ZIP PARSER ───────────────────────────────────────────

def _parse_linkedin_zip(z: zipfile.ZipFile, file_list: List[str], session_id: str = None) -> List[Dict]:
    """Parse LinkedIn data export ZIP."""
    chunks = []

    for fname in file_list:
        fname_lower = fname.lower()
        try:
            if fname.endswith('.csv'):
                content = z.read(fname).decode('utf-8', errors='ignore')
                rows = list(csv.reader(content.splitlines()))

                if 'profile' in fname_lower:
                    _emit(session_id, f"  👤 Parsing LinkedIn profile...")
                    text = _csv_to_text(rows, "LinkedIn Profile")
                    chunks.extend(chunk_by_topic(text, "data_export", "linkedin/profile"))
                elif 'position' in fname_lower:
                    _emit(session_id, f"  💼 Parsing LinkedIn work experience...")
                    text = _csv_to_text(rows, "LinkedIn Work Experience")
                    chunks.extend(chunk_by_topic(text, "data_export", "linkedin/positions"))
                elif 'skill' in fname_lower:
                    _emit(session_id, f"  🎯 Parsing LinkedIn skills...")
                    text = _csv_to_text(rows, "LinkedIn Skills")
                    chunks.extend(chunk_by_topic(text, "data_export", "linkedin/skills"))
                elif 'education' in fname_lower:
                    _emit(session_id, f"  🎓 Parsing LinkedIn education...")
                    text = _csv_to_text(rows, "LinkedIn Education")
                    chunks.extend(chunk_by_topic(text, "data_export", "linkedin/education"))
                elif 'recommendation' in fname_lower:
                    text = _csv_to_text(rows, "LinkedIn Recommendations")
                    chunks.extend(chunk_by_topic(text, "data_export", "linkedin/recommendations"))
                elif 'connection' in fname_lower:
                    text = _csv_to_text(rows, "LinkedIn Connections")
                    chunks.extend(chunk_by_topic(text, "data_export", "linkedin/connections"))
                elif 'message' in fname_lower:
                    text = _csv_to_text(rows, "LinkedIn Messages")
                    chunks.extend(chunk_by_topic(text, "data_export", "linkedin/messages"))
                elif 'endorsement' in fname_lower:
                    text = _csv_to_text(rows, "LinkedIn Endorsements")
                    chunks.extend(chunk_by_topic(text, "data_export", "linkedin/endorsements"))
                elif 'certification' in fname_lower or 'certificate' in fname_lower:
                    text = _csv_to_text(rows, "LinkedIn Certifications")
                    chunks.extend(chunk_by_topic(text, "data_export", "linkedin/certifications"))
                elif 'project' in fname_lower:
                    text = _csv_to_text(rows, "LinkedIn Projects")
                    chunks.extend(chunk_by_topic(text, "data_export", "linkedin/projects"))
                else:
                    text = _csv_to_text(rows, f"LinkedIn {fname}")
                    if text and len(text) > 50:
                        chunks.extend(chunk_by_topic(text, "data_export", f"linkedin/{fname}"))

            elif fname.endswith('.json'):
                data = json.loads(z.read(fname).decode('utf-8', errors='ignore'))
                text = _extract_text_from_json(data)
                if text and len(text) > 30:
                    chunks.extend(chunk_by_topic(text, "data_export", f"linkedin/{fname}"))

        except Exception as e:
            logger.warning(f"Error parsing LinkedIn {fname}: {e}")

    _emit(session_id, f"  ✅ LinkedIn ZIP: {len(chunks)} chunks extracted")
    logger.info(f"LinkedIn ZIP: extracted {len(chunks)} chunks")
    return chunks


def _csv_to_text(rows: List[List[str]], title: str) -> str:
    """Convert CSV rows to readable text."""
    if not rows:
        return ""
    parts = [f"=== {title} ==="]
    headers = rows[0] if rows else []
    for row in rows[1:50]:  # Cap at 50 rows
        row_text = ", ".join(f"{h}: {v}" for h, v in zip(headers, row) if v.strip())
        if row_text:
            parts.append(row_text)
    return "\n".join(parts)


# ── TWITTER ZIP PARSER ────────────────────────────────────────────

def _parse_twitter_zip(z: zipfile.ZipFile, file_list: List[str]) -> List[Dict]:
    """Parse Twitter/X data export ZIP."""
    chunks = []

    for fname in file_list:
        try:
            if fname.endswith('.js'):
                # Twitter exports are JS files: window.YTD.tweet.part0 = [...]
                content = z.read(fname).decode('utf-8', errors='ignore')
                # Strip the JS variable assignment to get pure JSON
                json_start = content.find('[')
                if json_start == -1:
                    json_start = content.find('{')
                if json_start != -1:
                    json_str = content[json_start:]
                    try:
                        data = json.loads(json_str)
                        if 'tweet' in fname.lower():
                            texts = _extract_twitter_tweets(data)
                            for t in texts:
                                chunks.extend(chunk_by_topic(t, "data_export", "twitter/tweets"))
                        elif 'like' in fname.lower():
                            texts = _extract_text_recursive(data)
                            if texts:
                                chunks.extend(chunk_by_topic(texts, "data_export", "twitter/likes"))
                        elif 'profile' in fname.lower() or 'account' in fname.lower():
                            text = _extract_text_from_json(data)
                            if text:
                                chunks.extend(chunk_by_topic(text, "data_export", "twitter/profile"))
                        else:
                            text = _extract_text_from_json(data)
                            if text and len(text) > 30:
                                chunks.extend(chunk_by_topic(text, "data_export", f"twitter/{fname}"))
                    except json.JSONDecodeError:
                        pass
        except Exception as e:
            logger.warning(f"Error parsing Twitter {fname}: {e}")

    logger.info(f"Twitter ZIP: extracted {len(chunks)} chunks")
    return chunks


def _extract_twitter_tweets(data) -> List[str]:
    """Extract tweets from Twitter export data."""
    texts = []
    if isinstance(data, list):
        for item in data[:500]:  # Cap at 500 tweets
            tweet = item.get("tweet", item) if isinstance(item, dict) else {}
            if isinstance(tweet, dict):
                text = tweet.get("full_text", tweet.get("text", ""))
                if text and len(text) > 10:
                    texts.append(f"Tweet: {text}")
    return texts


# ── FACEBOOK ZIP PARSER ───────────────────────────────────────────

def _parse_facebook_zip(z: zipfile.ZipFile, file_list: List[str]) -> List[Dict]:
    """Parse Facebook data export ZIP."""
    chunks = []

    for fname in file_list:
        fname_lower = fname.lower()
        try:
            if fname.endswith('.json'):
                data = json.loads(z.read(fname).decode('utf-8', errors='ignore'))

                if 'your_posts' in fname_lower or 'posts' in fname_lower:
                    text = _extract_text_from_json(data)
                    if text:
                        chunks.extend(chunk_by_topic(text, "data_export", "facebook/posts"))
                elif 'profile' in fname_lower or 'about' in fname_lower:
                    text = _extract_text_from_json(data)
                    if text:
                        chunks.extend(chunk_by_topic(text, "data_export", "facebook/profile"))
                elif 'comment' in fname_lower:
                    text = _extract_text_from_json(data)
                    if text:
                        chunks.extend(chunk_by_topic(text, "data_export", "facebook/comments"))
                elif 'message' in fname_lower:
                    text = _extract_text_from_json(data)
                    if text:
                        chunks.extend(chunk_by_topic(text, "data_export", "facebook/messages"))
                else:
                    text = _extract_text_from_json(data)
                    if text and len(text) > 30:
                        chunks.extend(chunk_by_topic(text, "data_export", f"facebook/{fname}"))

            elif fname.endswith('.html'):
                content = z.read(fname).decode('utf-8', errors='ignore')
                soup = BeautifulSoup(content, 'html.parser')
                text = soup.get_text(separator='\n', strip=True)
                if text and len(text) > 50:
                    chunks.extend(chunk_by_topic(text, "data_export", f"facebook/{fname}"))

        except Exception as e:
            logger.warning(f"Error parsing Facebook {fname}: {e}")

    logger.info(f"Facebook ZIP: extracted {len(chunks)} chunks")
    return chunks


# ── GENERIC ZIP PARSER ────────────────────────────────────────────

def _parse_generic_zip(z: zipfile.ZipFile, file_list: List[str]) -> List[Dict]:
    """Generic ZIP parser for unknown platforms."""
    chunks = []
    for fname in file_list:
        try:
            if fname.endswith('.json'):
                data = json.loads(z.read(fname).decode('utf-8', errors='ignore'))
                text = _extract_text_from_json(data)
                if text and len(text) > 30:
                    chunks.extend(chunk_by_topic(text, "data_export", fname))
            elif fname.endswith('.txt') or fname.endswith('.csv'):
                content = z.read(fname).decode('utf-8', errors='ignore')
                if content and len(content) > 30:
                    chunks.extend(chunk_by_topic(content[:5000], "data_export", fname))
            elif fname.endswith('.html'):
                content = z.read(fname).decode('utf-8', errors='ignore')
                soup = BeautifulSoup(content, 'html.parser')
                text = soup.get_text(separator='\n', strip=True)
                if text and len(text) > 50:
                    chunks.extend(chunk_by_topic(text, "data_export", fname))
        except Exception:
            pass
    return chunks


# ── JSON PARSER ───────────────────────────────────────────────────

def _parse_json_export(json_path: str) -> List[Dict]:
    """Parse a standalone JSON data export."""
    chunks = []
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        text = _extract_text_from_json(data)
        if text:
            chunks = chunk_by_topic(text, "data_export", json_path)
    except Exception as e:
        logger.error(f"JSON parse error: {e}")
    return chunks


def _extract_text_from_json(data, depth=0) -> str:
    """Recursively extract text content from nested JSON structures."""
    if depth > 5:
        return ""

    texts = []

    if isinstance(data, str):
        if len(data) > 10:
            texts.append(data)
    elif isinstance(data, list):
        for item in data[:200]:  # Cap at 200 items
            text = _extract_text_from_json(item, depth + 1)
            if text:
                texts.append(text)
    elif isinstance(data, dict):
        # Common social media export keys
        text_keys = ['caption', 'text', 'content', 'body', 'message', 'title',
                     'headline', 'summary', 'description', 'bio', 'about',
                     'comment', 'value', 'string_list_data', 'full_text',
                     'full_name', 'biography', 'name', 'note', 'answer',
                     'question', 'reply', 'snippet', 'excerpt']

        for key, value in data.items():
            if any(tk in key.lower() for tk in text_keys):
                text = _extract_text_from_json(value, depth + 1)
                if text:
                    texts.append(text)
            elif isinstance(value, (dict, list)):
                text = _extract_text_from_json(value, depth + 1)
                if text:
                    texts.append(text)

    return '\n'.join(texts)


def _extract_text_recursive(data) -> str:
    """Simple recursive text extraction."""
    return _extract_text_from_json(data, depth=0)
