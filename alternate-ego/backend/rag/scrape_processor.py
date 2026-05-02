"""Supreme Data Scraping Pipeline — Priority-Based.

Pipeline order:
  Phase 1: Scrape user's ACTUAL URLs (Playwright/curl_cffi)
  Phase 2: Email/Phone OSINT (Holehe/Sherlock)
  Phase 3: Deep ZIP file parsing (all files, no limits)
  Phase 4: RAG indexing with source trust priorities

NO generic Google/DuckDuckGo name searches as primary source.
"""
import requests
import json
import zipfile
import chardet
import csv
import os
import re
import time
import asyncio
import logging
import subprocess
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

def scrape_and_index(name: str, twin_id: str, social_urls: List[str] = None, email: str = None, phone: str = None, session_id: str = None) -> Dict:
    """Supreme data collection pipeline — Priority-Based with timeout.

    Phase 0: Check pre-seeded cache (instant for known users like Prabhdeep Singh)
    Phase 1: Scrape user's ACTUAL URLs (LinkedIn, Instagram, Twitter, Facebook) — max 90s
    Phase 2: Email & Phone OSINT (Holehe/Sherlock)
    Phase 3: Index all chunks with source trust priorities

    NO generic Google/DuckDuckGo name searches — they return wrong people.
    Enforces a maximum total scraping time of ~90 seconds.
    """
    import threading
    
    all_chunks = []
    scrape_start = time.time()
    MAX_SCRAPE_SECONDS = 90  # Hard limit: 90 seconds total for scraping
    
    _emit(session_id, f"🚀 Starting data collection for {name}...")

    # ═══════════════════════════════════════════════════════════════
    # PHASE 0: Check pre-seeded data cache (INSTANT)
    # ═══════════════════════════════════════════════════════════════
    try:
        from rag.preseed_cache import is_preseeded_user, get_cached_chunks
        
        if is_preseeded_user(name):
            _emit(session_id, f"⚡ Known user detected! Loading pre-cached data...")
            cached = get_cached_chunks(name)
            if cached and len(cached) > 0:
                all_chunks.extend(cached)
                _emit(session_id, f"✅ Loaded {len(cached)} pre-cached chunks from data exports!")
                _emit(session_id, f"⏱️ Saved ~5 minutes of scraping time!")
                
                # SKIP Phase 1 and 2 for pre-seeded users to make onboarding instant
                _emit(session_id, f"🚀 Skipping active scraping due to cached data...")
                added = add_chunks(twin_id, all_chunks)
                _emit(session_id, f"🎉 Data collection complete! {added} chunks indexed instantly.")
                return {"chunks_indexed": added, "sources_found": len(all_chunks)}
                
            else:
                _emit(session_id, f"📦 Building pre-seed cache from ZIP exports (one-time)...")
                from rag.preseed_cache import build_preseed_cache
                count = build_preseed_cache()
                if count > 0:
                    cached = get_cached_chunks(name)
                    if cached:
                        all_chunks.extend(cached)
                        _emit(session_id, f"✅ Built and loaded {len(cached)} chunks from ZIP exports!")
                        # SKIP Phase 1 and 2
                        added = add_chunks(twin_id, all_chunks)
                        return {"chunks_indexed": added, "sources_found": len(all_chunks)}
    except Exception as e:
        logger.warning(f"Pre-seed cache check failed: {e}")

    _emit(session_id, f"⏱️ Smart scraping (max {MAX_SCRAPE_SECONDS}s timeout)...")

    # ═══════════════════════════════════════════════════════════════
    # PHASE 1: Scrape the ACTUAL URLs the user provided (with timeout)
    # ═══════════════════════════════════════════════════════════════
    collected_usernames = []

    if social_urls:
        valid_urls = [u.strip() for u in social_urls if u.strip()]
        _emit(session_id, f"🔗 Phase 1: Scraping {len(valid_urls)} provided URL(s)...")

        for idx, url in enumerate(valid_urls):
            # Check time budget
            elapsed = time.time() - scrape_start
            if elapsed > MAX_SCRAPE_SECONDS:
                _emit(session_id, f"⏱️ Time limit reached ({int(elapsed)}s) — skipping remaining URLs")
                break
            
            try:
                platform = _detect_source_type(url).replace('_', ' ').title()
                _emit(session_id, f"🔍 [{idx+1}/{len(valid_urls)}] Scraping {platform}: {url[:60]}...")

                text = ""
                if "instagram.com" in url:
                    _emit(session_id, f"📸 Instagram: Using curl_cffi TLS bypass...")
                    text = _scrape_instagram_curlffi(url)
                    username = _extract_instagram_username(url)
                    if username:
                        collected_usernames.append(username)

                elif "linkedin.com" in url:
                    _emit(session_id, f"💼 LinkedIn: Using Playwright + Stealth...")
                    text = _scrape_linkedin_playwright(url, name)
                    li_user = url.rstrip('/').split('/')[-1]
                    if li_user and li_user not in ('in', 'pub', 'company'):
                        collected_usernames.append(li_user)

                elif "twitter.com" in url or "x.com" in url:
                    _emit(session_id, f"🐦 Twitter: Scraping profile...")
                    text = _scrape_twitter_profile(url)
                    tw_user = url.rstrip('/').split('/')[-1]
                    if tw_user:
                        collected_usernames.append(tw_user)

                elif "facebook.com" in url:
                    _emit(session_id, f"📘 Facebook: Scraping meta tags...")
                    text = _scrape_url_beautifulsoup(url)

                else:
                    text = _scrape_with_curlffi(url)
                    if not text or len(text) < 50:
                        text = _scrape_url_beautifulsoup(url)

                if text and len(text) > 50:
                    source_type = _detect_source_type(url)
                    chunks = chunk_by_topic(text, source_type, url)
                    all_chunks.extend(chunks)
                    _emit(session_id, f"✅ Extracted {len(chunks)} chunks ({len(text)} chars) from {platform}")
                else:
                    _emit(session_id, f"⚠️ Limited data from {url[:50]}")
                    # Only do fallback search if we still have time
                    if time.time() - scrape_start < MAX_SCRAPE_SECONDS - 10:
                        _targeted_url_search(url, name, all_chunks, session_id)

            except Exception as e:
                _emit(session_id, f"❌ Failed to scrape {url[:50]}: {str(e)[:80]}")
    else:
        _emit(session_id, f"⚠️ No social URLs provided — skipping Phase 1")

    phase1_count = len(all_chunks)
    elapsed = time.time() - scrape_start
    _emit(session_id, f"📊 Phase 1 complete: {phase1_count} chunks in {int(elapsed)}s")

    # ═══════════════════════════════════════════════════════════════
    # PHASE 2: Email & Phone OSINT (only if time remains)
    # ═══════════════════════════════════════════════════════════════
    if time.time() - scrape_start < MAX_SCRAPE_SECONDS:
        if email:
            email_chunks = _osint_email(email, session_id)
            all_chunks.extend(email_chunks)
        
        if phone:
            phone_chunks = _osint_phone(phone, session_id)
            all_chunks.extend(phone_chunks)

    # ═══════════════════════════════════════════════════════════════
    # PHASE 3: INDEX — No search engine padding. Real data only.
    # ═══════════════════════════════════════════════════════════════
    if all_chunks:
        _emit(session_id, f"💾 Indexing {len(all_chunks)} total chunks into vector store...")
        added = add_chunks(twin_id, all_chunks)
        total_time = int(time.time() - scrape_start)
        _emit(session_id, f"🎉 Data collection complete! {added} chunks indexed in {total_time}s.")
        return {"chunks_indexed": added, "sources_found": len(all_chunks)}

    _emit(session_id, f"📭 Limited public data found — twin will be enriched from voice interview & uploaded ZIP data.")
    return {"chunks_indexed": 0, "sources_found": 0}


def _targeted_url_search(url: str, name: str, all_chunks: list, session_id: str = None):
    """Run targeted DuckDuckGo searches specifically for a given URL's content."""
    try:
        # Extract username/identifier from URL
        identifier = url.rstrip('/').split('/')[-1]
        if not identifier or len(identifier) < 2:
            return

        queries = [
            f'"{identifier}" "{name}"',
            f'site:{url.split("/")[2]} "{identifier}"',
        ]
        for query in queries:
            try:
                results = _duckduckgo_search_api(query)
                for r in results[:3]:
                    body = r.get("body", "")
                    title = r.get("title", "")
                    href = r.get("href", "")
                    if body and len(body) > 20:
                        full_text = f"{title}\n{body}" if title else body
                        chunks = chunk_by_topic(full_text, "web_search", href)
                        all_chunks.extend(chunks)
            except Exception:
                pass
    except Exception:
        pass


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


# ── LINKEDIN SCRAPER (PLAYWRIGHT + STEALTH) ───────────────────────

def _scrape_linkedin_playwright(url: str, name: str = "") -> str:
    """Scrape LinkedIn profile using Playwright with stealth mode.
    
    Strategy:
    1. Playwright headless + stealth → extract ld+json structured data
    2. Fall back to meta tags if authwall appears
    3. DuckDuckGo search for cached LinkedIn data
    """
    text = ""
    
    # Strategy 1: Playwright via isolated subprocess (to avoid asyncio loop conflicts in FastAPI)
    try:
        import subprocess
        import sys
        import os
        
        script_path = os.path.join(os.path.dirname(__file__), 'linkedin_scraper_cli.py')
        result = subprocess.run(
            [sys.executable, script_path, url, name], 
            capture_output=True, 
            text=True,
            timeout=30
        )
        
        if result.returncode == 0 and result.stdout:
            text = result.stdout
            logger.info(f"Playwright LinkedIn scraped via subprocess: {len(text)} chars")
        else:
            logger.warning(f"Playwright LinkedIn subprocess failed: {result.stderr}")
            
    except Exception as e:
        logger.warning(f"Playwright LinkedIn execution failed: {e}")
    
    # Strategy 2: curl_cffi with Chrome TLS fingerprint
    if not text or len(text) < 100:
        try:
            text = _scrape_with_curlffi(url)
        except Exception:
            pass
    
    # Strategy 3: DuckDuckGo cached data
    if not text or len(text) < 100:
        try:
            username = url.rstrip('/').split('/')[-1]
            queries = [
                f'site:linkedin.com "{name}" "{username}"',
                f'"{name}" linkedin experience education',
            ]
            parts = []
            for query in queries:
                results = _duckduckgo_search_api(query)
                for r in results[:3]:
                    body = r.get("body", "")
                    if body and len(body) > 20:
                        parts.append(body)
            if parts:
                text = "\n\n".join(parts)
        except Exception:
            pass
    
    return text[:8000] if text else ""


# ── INSTAGRAM SCRAPER (curl_cffi TLS BYPASS) ──────────────────────

def _scrape_instagram_curlffi(url: str) -> str:
    """Scrape Instagram using curl_cffi to bypass 403 TLS fingerprint blocks.
    
    curl_cffi mimics Chrome's TLS handshake, making Instagram think 
    this is a real browser. Much more reliable than requests library.
    """
    username = _extract_instagram_username(url)
    if not username:
        logger.warning(f"Could not extract username from Instagram URL: {url}")
        return _scrape_url_beautifulsoup(url)
    
    parts = [f"Instagram Profile: @{username}"]
    profile_url = f"https://www.instagram.com/{username}/"
    
    # Strategy 1: curl_cffi with Chrome impersonation
    try:
        from curl_cffi import requests as cffi_requests
        
        response = cffi_requests.get(
            profile_url,
            impersonate="chrome",
            timeout=15,
            allow_redirects=True,
        )
        
        if response.status_code == 200:
            html = response.text
            soup = BeautifulSoup(html, 'html.parser')
            
            # Extract meta tags
            og_title = soup.find('meta', property='og:title')
            if og_title:
                parts.append(f"Name: {og_title.get('content', '')}")
            
            og_desc = soup.find('meta', property='og:description')
            if og_desc:
                desc = og_desc.get('content', '')
                if desc:
                    parts.append(f"Profile Summary: {desc}")
                    stats = re.search(r'([\d,.]+[KkMm]?)\s*Followers.*?([\d,.]+[KkMm]?)\s*Following.*?([\d,.]+[KkMm]?)\s*Posts', desc)
                    if stats:
                        parts.append(f"Followers: {stats.group(1)}, Following: {stats.group(2)}, Posts: {stats.group(3)}")
            
            meta_desc = soup.find('meta', attrs={'name': 'description'})
            if meta_desc:
                desc = meta_desc.get('content', '')
                if desc and len(desc) > 20 and desc not in str(parts):
                    parts.append(f"Bio: {desc}")
            
            # Try extracting _sharedData JSON (contains full profile data)
            shared_match = re.search(r'window\._sharedData\s*=\s*(\{.*?\});', html)
            if shared_match:
                try:
                    shared = json.loads(shared_match.group(1))
                    user_data = shared.get('entry_data', {}).get('ProfilePage', [{}])[0].get('graphql', {}).get('user', {})
                    if user_data:
                        if user_data.get('full_name'):
                            parts.append(f"Full Name: {user_data['full_name']}")
                        if user_data.get('biography'):
                            parts.append(f"Bio: {user_data['biography']}")
                        if user_data.get('external_url'):
                            parts.append(f"Website: {user_data['external_url']}")
                        if user_data.get('edge_followed_by', {}).get('count'):
                            parts.append(f"Followers: {user_data['edge_followed_by']['count']}")
                        if user_data.get('is_business_account'):
                            parts.append(f"Business Account: Yes")
                            if user_data.get('business_category_name'):
                                parts.append(f"Category: {user_data['business_category_name']}")
                except Exception:
                    pass
            
            logger.info(f"curl_cffi Instagram @{username}: {len(parts)} data points")
        else:
            logger.warning(f"Instagram curl_cffi returned {response.status_code} for @{username}")
    except ImportError:
        logger.warning("curl_cffi not installed, falling back to requests")
    except Exception as e:
        logger.warning(f"curl_cffi Instagram failed for @{username}: {e}")
    
    # Strategy 2: DuckDuckGo search fallback
    if len(parts) <= 1:
        try:
            queries = [
                f'site:instagram.com "{username}"',
                f'"{username}" instagram bio about',
            ]
            for query in queries:
                results = _duckduckgo_search_api(query)
                for r in results[:3]:
                    body = r.get("body", "")
                    title = r.get("title", "")
                    if body and len(body) > 20:
                        combined = f"{title}: {body}" if title else body
                        if combined not in str(parts):
                            parts.append(f"Web: {combined}")
        except Exception:
            pass
    
    text = "\n\n".join(parts)
    logger.info(f"Instagram scraped @{username}: {len(text)} chars total")
    return text


def _extract_instagram_username(url: str) -> str:
    """Extract username from Instagram URL or @handle."""
    url = url.strip().rstrip("/")
    if url.startswith("@"):
        return url[1:]
    match = re.search(r'instagram\.com/([A-Za-z0-9_.]+)', url)
    if match:
        username = match.group(1)
        non_usernames = {'p', 'reel', 'stories', 'explore', 'accounts', 'about', 'legal', 'api', 'graphql'}
        if username.lower() not in non_usernames:
            return username
    return ""


# ── TWITTER SCRAPER ───────────────────────────────────────────────

def _scrape_twitter_profile(url: str) -> str:
    """Scrape Twitter/X profile using meta tags and Nitter fallback."""
    tw_user = url.rstrip('/').split('/')[-1]
    parts = [f"Twitter Profile: @{tw_user}"]
    
    # Strategy 1: curl_cffi on twitter.com for meta tags
    try:
        from curl_cffi import requests as cffi_requests
        response = cffi_requests.get(url, impersonate="chrome", timeout=15)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            for prop in ['og:title', 'og:description']:
                tag = soup.find('meta', property=prop)
                if tag:
                    content = tag.get('content', '')
                    if content and len(content) > 10:
                        parts.append(content)
    except Exception:
        pass
    
    # Strategy 2: Try Nitter (open-source Twitter frontend, no login)
    if len(parts) <= 1:
        nitter_instances = ['https://nitter.net', 'https://nitter.privacydev.net']
        for nitter in nitter_instances:
            try:
                nitter_url = f"{nitter}/{tw_user}"
                response = requests.get(nitter_url, timeout=10, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"
                })
                if response.status_code == 200:
                    soup = BeautifulSoup(response.text, 'html.parser')
                    # Nitter has clean HTML with profile info
                    bio = soup.find('div', class_='profile-bio')
                    if bio:
                        parts.append(f"Bio: {bio.get_text(strip=True)}")
                    stats = soup.find('div', class_='profile-card-extra')
                    if stats:
                        parts.append(f"Stats: {stats.get_text(strip=True)}")
                    name_el = soup.find('a', class_='profile-card-fullname')
                    if name_el:
                        parts.append(f"Name: {name_el.get_text(strip=True)}")
                    break
            except Exception:
                continue
    
    # Strategy 3: DuckDuckGo search
    if len(parts) <= 1:
        try:
            results = _duckduckgo_search_api(f'"{tw_user}" twitter bio about')
            for r in results[:3]:
                body = r.get("body", "")
                if body and len(body) > 20:
                    parts.append(f"Web: {body}")
        except Exception:
            pass
    
    return "\n\n".join(parts)


# ── CURL_CFFI GENERIC SCRAPER ─────────────────────────────────────

def _scrape_with_curlffi(url: str) -> str:
    """Scrape any URL using curl_cffi with Chrome TLS impersonation."""
    try:
        from curl_cffi import requests as cffi_requests
        response = cffi_requests.get(url, impersonate="chrome", timeout=15)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside']):
                tag.decompose()
            text = soup.get_text(separator='\n', strip=True)
            lines = [l.strip() for l in text.split('\n') if l.strip() and len(l.strip()) > 10]
            return '\n'.join(lines[:100])
    except Exception as e:
        logger.warning(f"curl_cffi scrape failed for {url}: {e}")
    return ""


# ── USERNAME OSINT (SHERLOCK) ─────────────────────────────────────

def _discover_accounts_username(username: str, session_id: str = None) -> List[Dict]:
    """Discover accounts across social networks using DuckDuckGo targeted search.
    
    Searches for the username across major platforms to find additional profiles.
    """
    chunks = []
    
    # Search for username across major platforms
    platforms = [
        ('GitHub', f'site:github.com "{username}"'),
        ('Reddit', f'site:reddit.com/user "{username}"'),
        ('Medium', f'site:medium.com "@{username}"'),
        ('YouTube', f'site:youtube.com "{username}"'),
        ('Pinterest', f'site:pinterest.com "{username}"'),
        ('TikTok', f'site:tiktok.com "@{username}"'),
    ]
    
    found_count = 0
    for platform_name, query in platforms:
        try:
            results = _duckduckgo_search_api(query)
            for r in results[:2]:
                body = r.get("body", "")
                title = r.get("title", "")
                href = r.get("href", "")
                if body and len(body) > 20 and username.lower() in (title + body).lower():
                    text = f"{platform_name} Profile Found:\n{title}\n{body}"
                    new_chunks = chunk_by_topic(text, "osint_discovery", href)
                    chunks.extend(new_chunks)
                    found_count += 1
                    _emit(session_id, f"  ✅ Found {platform_name} profile for '{username}'")
        except Exception:
            pass
    
    if found_count > 0:
        _emit(session_id, f"  🕵️ OSINT: Found {found_count} additional profiles for '{username}'")
    
    return chunks


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

# Maximum chunks to index from a single uploaded file — keeps embedding fast
MAX_UPLOAD_CHUNKS = 200
# Maximum seconds to spend parsing a single uploaded file
MAX_UPLOAD_PARSE_SECONDS = 60

def parse_data_export(file_path: str, twin_id: str, session_id: str = None) -> Dict:
    """Parse a user's data export (.zip or .json) and index into RAG.

    PERFORMANCE LIMITS:
    - Max 200 chunks per file (keeps embedding under 90 seconds)
    - Max 60 seconds parsing time per file
    - Prioritizes profile/bio/about data over bulk posts

    Supports:
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

    # ── HARD CAP: Keep only the best 200 chunks ──
    if len(all_chunks) > MAX_UPLOAD_CHUNKS:
        _emit(session_id, f"⚡ Capping {len(all_chunks)} chunks → {MAX_UPLOAD_CHUNKS} (smart selection)...")
        all_chunks = _select_best_chunks(all_chunks, MAX_UPLOAD_CHUNKS)

    if all_chunks:
        _emit(session_id, f"💾 Indexing {len(all_chunks)} chunks from uploaded data...")
        added = add_chunks(twin_id, all_chunks)
        _emit(session_id, f"✅ Uploaded data processed: {added} chunks indexed!")
        return {"chunks_indexed": added, "file": os.path.basename(file_path)}

    _emit(session_id, f"⚠️ No extractable data found in uploaded file.")
    return {"chunks_indexed": 0, "file": os.path.basename(file_path)}


def _select_best_chunks(chunks: List[Dict], max_count: int) -> List[Dict]:
    """Select the most valuable chunks from a large list.
    
    Priority order:
    1. Profile/bio/about data (most valuable for personality)
    2. Posts with substantial text content
    3. Comments, messages, other data
    """
    # Score each chunk by importance
    scored = []
    for chunk in chunks:
        text = chunk.get('text', '').lower()
        url = chunk.get('source_url', '').lower()
        score = 0
        
        # High priority: profile, bio, about, skills, experience
        if any(kw in url or kw in text[:100] for kw in ['profile', 'bio', 'about', 'skill', 'experience', 'position', 'education', 'recommendation']):
            score += 100
        # Medium: posts, stories with substantial content
        elif any(kw in url for kw in ['post', 'story', 'content', 'tweet']):
            score += 50
        # Lower: messages, comments, likes
        elif any(kw in url for kw in ['message', 'comment', 'like', 'follower', 'following']):
            score += 10
        
        # Boost chunks with more text content (more useful)
        text_len = len(chunk.get('text', ''))
        if text_len > 200:
            score += 20
        elif text_len > 100:
            score += 10
        
        scored.append((score, chunk))
    
    # Sort by score (highest first) and take top N
    scored.sort(key=lambda x: x[0], reverse=True)
    return [chunk for _, chunk in scored[:max_count]]


def _parse_zip_deep(zip_path: str, session_id: str = None) -> List[Dict]:
    """Deep parse a ZIP — with time + chunk limits for performance.
    
    Architecture:
    1. Extract ZIP to temp directory
    2. Sort files by priority (profile/bio first, bulk posts last)
    3. Process files until chunk limit OR time limit is reached
    4. Cleanup temp directory
    
    Limits:
    - MAX_UPLOAD_PARSE_SECONDS (60s) time limit
    - Stops file processing when enough high-quality chunks are collected
    """
    import shutil
    import tempfile
    
    chunks = []
    extract_dir = None
    parse_start = time.time()
    
    try:
        # Step 1: Extract ZIP to temp directory
        extract_dir = tempfile.mkdtemp(prefix="altego_zip_")
        _emit(session_id, f"📦 Unzipping to temporary directory...")
        
        with zipfile.ZipFile(zip_path, 'r') as z:
            z.extractall(extract_dir)
        
        # Step 2: Walk every folder recursively
        all_files = []
        for root, dirs, files in os.walk(extract_dir):
            for filename in files:
                full_path = os.path.join(root, filename)
                rel_path = os.path.relpath(full_path, extract_dir)
                all_files.append((full_path, rel_path))
        
        _emit(session_id, f"📁 Found {len(all_files)} files across all folders")
        
        # Step 3: Filter to text-based files and SORT by priority
        TEXT_EXTENSIONS = {'.html', '.json', '.txt', '.csv', '.js'}
        text_files = [(fp, rp) for fp, rp in all_files if os.path.splitext(fp)[1].lower() in TEXT_EXTENSIONS]
        media_count = len(all_files) - len(text_files)
        
        # Sort: profile/bio/about files first, then posts, then messages/other
        def file_priority(item):
            rp = item[1].lower()
            if any(kw in rp for kw in ['profile', 'bio', 'about', 'skill', 'experience', 'position', 'education']):
                return 0  # Highest priority
            elif any(kw in rp for kw in ['post', 'story', 'content', 'tweet', 'recommendation']):
                return 1  # Medium
            elif any(kw in rp for kw in ['comment', 'message', 'chat']):
                return 2  # Lower
            return 3  # Lowest
        
        text_files.sort(key=file_priority)
        
        _emit(session_id, f"📝 Processing {len(text_files)} text files (skipping {media_count} media files)")
        _emit(session_id, f"⏱️ Speed mode: {MAX_UPLOAD_PARSE_SECONDS}s limit, {MAX_UPLOAD_CHUNKS} chunk cap")
        
        files_processed = 0
        for i, (full_path, rel_path) in enumerate(text_files):
            # ── TIME CHECK: Stop if we've exceeded the time limit ──
            elapsed = time.time() - parse_start
            if elapsed > MAX_UPLOAD_PARSE_SECONDS:
                _emit(session_id, f"⏱️ Time limit ({MAX_UPLOAD_PARSE_SECONDS}s) — stopping with {len(chunks)} chunks")
                break
            
            # ── CHUNK CHECK: Stop if we have enough ──
            if len(chunks) >= MAX_UPLOAD_CHUNKS * 2:  # Collect up to 2x for selection later
                _emit(session_id, f"📊 Chunk limit reached — {len(chunks)} chunks collected")
                break
            
            try:
                ext = os.path.splitext(full_path)[1].lower()
                file_chunks = []
                
                if ext == '.html':
                    file_chunks = _extract_html_file(full_path, rel_path)
                elif ext == '.json':
                    file_chunks = _extract_json_file(full_path, rel_path)
                elif ext == '.txt':
                    file_chunks = _extract_txt_file(full_path, rel_path)
                elif ext == '.csv':
                    file_chunks = _extract_csv_file(full_path, rel_path)
                elif ext == '.js':
                    file_chunks = _extract_js_file(full_path, rel_path)
                
                if file_chunks:
                    chunks.extend(file_chunks)
                    files_processed += 1
                    if files_processed % 20 == 0:
                        elapsed = int(time.time() - parse_start)
                        _emit(session_id, f"  📊 Progress: {files_processed} files → {len(chunks)} chunks ({elapsed}s)")
                        
            except Exception as e:
                logger.warning(f"Error processing {rel_path}: {e}")
                continue
        
        total_time = int(time.time() - parse_start)
        _emit(session_id, f"✅ ZIP complete: {len(chunks)} chunks from {files_processed}/{len(text_files)} files in {total_time}s")
        
    except zipfile.BadZipFile:
        logger.error(f"Invalid ZIP file: {zip_path}")
        _emit(session_id, f"❌ Invalid ZIP file — cannot extract")
    except Exception as e:
        logger.error(f"ZIP parsing error: {e}")
        _emit(session_id, f"❌ ZIP error: {str(e)[:100]}")
    finally:
        # Cleanup temp directory
        if extract_dir and os.path.exists(extract_dir):
            try:
                shutil.rmtree(extract_dir, ignore_errors=True)
            except Exception:
                pass

    return chunks


# ── FILE-TYPE EXTRACTORS (for physical files on disk) ─────────────

def _extract_html_file(filepath: str, rel_path: str) -> List[Dict]:
    """Extract text from an HTML file — primary format for Instagram exports."""
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
        
        soup = BeautifulSoup(content, 'html.parser')
        for tag in soup(['script', 'style']):
            tag.decompose()
        
        text = soup.get_text(separator='\n', strip=True)
        if text and len(text) > 30:
            labeled = f"[Source: {rel_path}]\n{text}"
            return chunk_by_topic(labeled, "data_export", rel_path)
    except Exception as e:
        logger.warning(f"HTML extraction failed for {rel_path}: {e}")
    return []


def _extract_json_file(filepath: str, rel_path: str) -> List[Dict]:
    """Extract text from a JSON file — handles Instagram's latin-1 encoding quirk."""
    try:
        with open(filepath, 'rb') as f:
            raw = f.read()
        
        # Instagram JSON uses raw_unicode_escape for non-ASCII characters
        # Try the double-decode trick first (Instagram-specific)
        try:
            text_content = raw.decode('raw_unicode_escape').encode('latin1').decode('utf-8')
        except (UnicodeDecodeError, UnicodeEncodeError):
            try:
                text_content = raw.decode('utf-8')
            except UnicodeDecodeError:
                text_content = raw.decode('latin1', errors='replace')
        
        data = json.loads(text_content)
        
        # Special handling for DM messages (richest personal data)
        rel_lower = rel_path.lower()
        if 'message' in rel_lower or 'inbox' in rel_lower:
            return _extract_dm_messages(data, rel_path)
        
        # Generic JSON extraction
        text = _extract_text_from_json(data)
        if text and len(text) > 30:
            labeled = f"[Source: {rel_path}]\n{text}"
            return chunk_by_topic(labeled, "data_export", rel_path)
    except Exception as e:
        logger.warning(f"JSON extraction failed for {rel_path}: {e}")
    return []


def _extract_dm_messages(data, rel_path: str) -> List[Dict]:
    """Extract DM conversations — the richest personal data source."""
    chunks_list = []
    if isinstance(data, dict):
        participants = data.get('participants', [])
        p_names = [p.get('name', 'Unknown') for p in participants if isinstance(p, dict)]
        messages = data.get('messages', [])
        
        msg_texts = []
        for msg in messages[:500]:  # Cap at 500 messages per convo
            if isinstance(msg, dict):
                sender = msg.get('sender_name', 'Unknown')
                content = msg.get('content', '')
                if content and len(content) > 5:
                    msg_texts.append(f"{sender}: {content}")
        
        if msg_texts:
            header = f"[DM with {', '.join(p_names)}]"
            # Chunk messages in groups of 20 for better RAG retrieval
            for i in range(0, len(msg_texts), 20):
                batch = msg_texts[i:i+20]
                text = f"{header}\n" + "\n".join(batch)
                chunks_list.extend(chunk_by_topic(text, "data_export", rel_path))
    
    return chunks_list


def _extract_txt_file(filepath: str, rel_path: str) -> List[Dict]:
    """Extract text from a TXT file with auto-encoding detection."""
    try:
        with open(filepath, 'rb') as f:
            raw = f.read()
        
        detected = chardet.detect(raw)
        encoding = detected.get('encoding', 'utf-8') or 'utf-8'
        text = raw.decode(encoding, errors='replace')
        
        if text and len(text) > 30:
            labeled = f"[Source: {rel_path}]\n{text}"
            return chunk_by_topic(labeled, "data_export", rel_path)
    except Exception as e:
        logger.warning(f"TXT extraction failed for {rel_path}: {e}")
    return []


def _extract_csv_file(filepath: str, rel_path: str) -> List[Dict]:
    """Extract text from a CSV file."""
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            rows = list(csv.reader(f))
        
        if rows:
            title = os.path.splitext(os.path.basename(filepath))[0]
            text = _csv_to_text(rows, title)
            if text and len(text) > 30:
                return chunk_by_topic(text, "data_export", rel_path)
    except Exception as e:
        logger.warning(f"CSV extraction failed for {rel_path}: {e}")
    return []


def _extract_js_file(filepath: str, rel_path: str) -> List[Dict]:
    """Extract data from Twitter-style .js export files."""
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
        
        # Twitter exports: window.YTD.tweet.part0 = [...]
        json_start = content.find('[')
        if json_start == -1:
            json_start = content.find('{')
        if json_start != -1:
            json_str = content[json_start:]
            data = json.loads(json_str)
            text = _extract_text_from_json(data)
            if text and len(text) > 30:
                labeled = f"[Source: {rel_path}]\n{text}"
                return chunk_by_topic(labeled, "data_export", rel_path)
    except Exception:
        pass
    return []


def _extract_image_file(filepath: str, rel_path: str) -> List[Dict]:
    """Extract EXIF metadata from images (date, location, camera)."""
    chunks_list = []
    try:
        from PIL import Image
        from PIL.ExifTags import TAGS
        
        img = Image.open(filepath)
        
        # Extract EXIF metadata
        exif_data = img._getexif()
        if exif_data:
            exif_parts = []
            for tag_id, value in exif_data.items():
                tag = TAGS.get(tag_id, tag_id)
                if tag in ('DateTime', 'DateTimeOriginal', 'GPSInfo', 'Make', 'Model', 'ImageDescription'):
                    exif_parts.append(f"{tag}: {value}")
            if exif_parts:
                text = f"[Image EXIF: {rel_path}]\n" + '\n'.join(exif_parts)
                chunks_list.extend(chunk_by_topic(text, "data_export", rel_path))
        
        img.close()
    except Exception:
        pass  # Skip corrupt/unreadable images silently
    return chunks_list


def _extract_video_file(filepath: str, rel_path: str, session_id: str = None) -> List[Dict]:
    """Extract audio from video → transcribe with Whisper."""
    chunks_list = []
    try:
        import sys
        
        # Extract audio track to temp WAV using ffmpeg
        audio_path = filepath + "_audio.wav"
        result = subprocess.run([
            'ffmpeg', '-i', filepath,
            '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1',
            audio_path, '-y', '-loglevel', 'quiet'
        ], capture_output=True, timeout=60)
        
        if result.returncode == 0 and os.path.exists(audio_path):
            # Transcribe with faster-whisper
            try:
                from faster_whisper import WhisperModel
                model = WhisperModel("base", device="cpu", compute_type="int8")
                segments, info = model.transcribe(audio_path, language="en", beam_size=3)
                transcript = " ".join([seg.text for seg in segments]).strip()
                
                if transcript and len(transcript) > 10:
                    text = f"[Video transcript: {rel_path}]\n{transcript}"
                    chunks_list.extend(chunk_by_topic(text, "data_export", rel_path))
                    _emit(session_id, f"  🎥 Transcribed video: {os.path.basename(filepath)} ({len(transcript)} chars)")
            except ImportError:
                logger.warning("faster-whisper not installed, skipping video transcription")
            except Exception as e:
                logger.warning(f"Whisper transcription failed for {rel_path}: {e}")
            finally:
                # Cleanup temp audio
                if os.path.exists(audio_path):
                    os.remove(audio_path)
    except FileNotFoundError:
        logger.info("ffmpeg not found — skipping video transcription")
    except Exception as e:
        logger.warning(f"Video extraction failed for {rel_path}: {e}")
    return chunks_list


def _extract_audio_file(filepath: str, rel_path: str, session_id: str = None) -> List[Dict]:
    """Transcribe audio files with Whisper."""
    chunks_list = []
    try:
        # Convert to WAV first
        wav_path = filepath + ".wav"
        result = subprocess.run([
            'ffmpeg', '-i', filepath,
            '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1',
            wav_path, '-y', '-loglevel', 'quiet'
        ], capture_output=True, timeout=60)
        
        if result.returncode == 0 and os.path.exists(wav_path):
            try:
                from faster_whisper import WhisperModel
                model = WhisperModel("base", device="cpu", compute_type="int8")
                segments, info = model.transcribe(wav_path, language="en", beam_size=3)
                transcript = " ".join([seg.text for seg in segments]).strip()
                
                if transcript and len(transcript) > 10:
                    text = f"[Audio transcript: {rel_path}]\n{transcript}"
                    chunks_list.extend(chunk_by_topic(text, "data_export", rel_path))
                    _emit(session_id, f"  🎵 Transcribed audio: {os.path.basename(filepath)}")
            except ImportError:
                logger.warning("faster-whisper not installed, skipping audio transcription")
            except Exception as e:
                logger.warning(f"Whisper failed for {rel_path}: {e}")
            finally:
                if os.path.exists(wav_path):
                    os.remove(wav_path)
    except FileNotFoundError:
        logger.info("ffmpeg not found — skipping audio transcription")
    except Exception as e:
        logger.warning(f"Audio extraction failed for {rel_path}: {e}")
    return chunks_list


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


def _safe_decode(z: zipfile.ZipFile, fname: str) -> str:
    """Read a file from ZIP and safely decode it, auto-detecting encoding."""
    raw_data = z.read(fname)
    # Fast paths for common encodings
    try:
        return raw_data.decode('utf-8')
    except UnicodeDecodeError:
        pass
    
    try:
        # Very common in Facebook exports
        return raw_data.decode('latin1')
    except UnicodeDecodeError:
        pass
        
    # Fallback to chardet
    detected = chardet.detect(raw_data)
    encoding = detected.get('encoding', 'utf-8')
    try:
        return raw_data.decode(encoding, errors='ignore')
    except Exception:
        return raw_data.decode('utf-8', errors='ignore')


def _parse_instagram_zip(z: zipfile.ZipFile, file_list: List[str], session_id: str = None) -> List[Dict]:
    """Parse Instagram data export ZIP — extracts everything."""
    chunks = []
    files_parsed = 0

    for fname in file_list:
        fname_lower = fname.lower()
        try:
            if fname.endswith('.json'):
                data = json.loads(_safe_decode(z, fname))

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
                content = _safe_decode(z, fname)
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
                content = _safe_decode(z, fname)
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
                data = json.loads(_safe_decode(z, fname))
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
                content = _safe_decode(z, fname)
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
                data = json.loads(_safe_decode(z, fname))

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
                content = _safe_decode(z, fname)
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
                data = json.loads(_safe_decode(z, fname))
                text = _extract_text_from_json(data)
                if text and len(text) > 30:
                    chunks.extend(chunk_by_topic(text, "data_export", fname))
            elif fname.endswith('.txt') or fname.endswith('.csv'):
                content = _safe_decode(z, fname)
                if content and len(content) > 30:
                    chunks.extend(chunk_by_topic(content[:5000], "data_export", fname))
            elif fname.endswith('.html'):
                content = _safe_decode(z, fname)
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


# ── OSINT HELPERS ──────────────────────────────────────────────────

def _osint_email(email: str, session_id: str = None) -> List[Dict]:
    """Check where an email is registered using holehe."""
    if not email: return []
    _emit(session_id, f"🔎 Running OSINT scan on email: {email}...")
    try:
        # Run holehe via subprocess to avoid asyncio conflicts
        result = subprocess.run(["holehe", email, "--only-used", "--no-color"], capture_output=True, text=True, timeout=45)
        found_sites = []
        for line in result.stdout.splitlines():
            if "[+]" in line:
                site = line.split("[+]")[1].strip()
                if site:
                    found_sites.append(site)
        if found_sites:
            _emit(session_id, f"  ✅ Found {len(found_sites)} accounts linked to email: {', '.join(found_sites[:5])}...")
            text = f"Email {email} is registered on the following platforms: {', '.join(found_sites)}"
            return chunk_by_topic(text, "osint", "holehe")
        else:
            _emit(session_id, f"  ⚠️ No linked accounts found for email.")
    except Exception as e:
        logger.warning(f"Email OSINT failed: {e}")
    return []

def _osint_phone(phone: str, session_id: str = None) -> List[Dict]:
    """Extract carrier and region info from phone using phonenumbers."""
    if not phone: return []
    _emit(session_id, f"🔎 Running OSINT scan on phone: {phone}...")
    try:
        import phonenumbers
        from phonenumbers import geocoder, carrier, timezone
        
        formatted_phone = phone
        # Ensure country code is present (default +91 for 10-digit Indian numbers based on user's sample)
        if len(phone) == 10 and phone.isdigit():
            formatted_phone = "+91" + phone
        elif not phone.startswith("+"):
            formatted_phone = "+" + phone

        parsed = phonenumbers.parse(formatted_phone)
        if phonenumbers.is_valid_number(parsed):
            region = geocoder.description_for_number(parsed, "en")
            network = carrier.name_for_number(parsed, "en")
            tz = timezone.time_zones_for_number(parsed)
            
            details = []
            if region: details.append(f"Region: {region}")
            if network: details.append(f"Carrier: {network}")
            if tz: details.append(f"Timezones: {', '.join(tz)}")
            
            if details:
                text = f"Phone number {phone} details: " + ", ".join(details)
                _emit(session_id, f"  ✅ Phone OSINT: {', '.join(details)}")
                return chunk_by_topic(text, "osint", "phonenumbers")
        else:
            _emit(session_id, f"  ⚠️ Phone OSINT: Invalid phone number format.")
    except Exception as e:
        logger.warning(f"Phone OSINT failed: {e}")
    return []
