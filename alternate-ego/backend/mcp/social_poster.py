"""Simulated social media poster + scheduled post queue + auto-reply system.

In Phase B, this would be replaced with actual OAuth + API integration.
For now, all posts are simulated but fully tracked.
"""
import logging
import uuid
from typing import Dict, List, Optional
from datetime import datetime, timedelta
import re

logger = logging.getLogger(__name__)

# In-memory stores (for demo — would be DB in production)
_scheduled_posts: List[Dict] = []
_auto_reply_enabled: Dict[str, bool] = {}  # twin_id -> enabled


# ── SOCIAL POSTING ──────────────────────────────────────────────

def post_to_platform(platform: str, action: str, content: str, twin_name: str = "") -> Dict:
    """Simulate posting to a social media platform.
    
    Returns:
        Result dict with success status and simulated URL
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    if platform == "linkedin":
        return {
            "success": True,
            "platform": "LinkedIn",
            "action": "post",
            "message": f"✅ Posted to LinkedIn as {twin_name}: \"{content[:100]}{'...' if len(content)>100 else ''}\"",
            "url": f"https://linkedin.com/feed/simulated-post-{hash(content) % 10000}",
            "timestamp": timestamp,
            "note": "Simulated post (real OAuth integration in Phase B)"
        }
    
    elif platform == "twitter":
        if len(content) > 280:
            content = content[:277] + "..."
        return {
            "success": True,
            "platform": "Twitter/X",
            "action": "tweet",
            "message": f"✅ Tweeted on X as {twin_name}: \"{content}\"",
            "url": f"https://x.com/simulated-tweet-{hash(content) % 10000}",
            "timestamp": timestamp,
            "note": "Simulated tweet (real OAuth integration in Phase B)"
        }
    
    elif platform == "instagram":
        return {
            "success": True,
            "platform": "Instagram",
            "action": "post",
            "message": f"✅ Posted to Instagram as {twin_name}: \"{content[:80]}...\"",
            "url": f"https://instagram.com/p/simulated-{hash(content) % 10000}",
            "timestamp": timestamp,
            "note": "Simulated post (real API integration in Phase B)"
        }
    
    else:
        return {
            "success": False,
            "platform": platform,
            "action": action,
            "message": f"❌ Platform '{platform}' is not supported yet. Supported: linkedin, twitter, instagram",
            "url": "",
            "timestamp": timestamp
        }


# ── SCHEDULED POSTS ─────────────────────────────────────────────

def _parse_delay(delay_str: str) -> timedelta:
    """Parse a delay string like '2h', '30m', '1d' into a timedelta."""
    match = re.match(r'^(\d+)([mhd])$', delay_str.lower())
    if not match:
        return timedelta(hours=1)  # Default 1 hour
    
    amount = int(match.group(1))
    unit = match.group(2)
    
    if unit == 'm':
        return timedelta(minutes=amount)
    elif unit == 'h':
        return timedelta(hours=amount)
    elif unit == 'd':
        return timedelta(days=amount)
    return timedelta(hours=1)


def schedule_post(platform: str, content: str, delay: str, twin_name: str = "") -> Dict:
    """Schedule a post for later. Returns confirmation."""
    delta = _parse_delay(delay)
    scheduled_time = datetime.now() + delta
    
    post = {
        "id": str(uuid.uuid4())[:8],
        "platform": platform,
        "content": content,
        "twin_name": twin_name,
        "created_at": datetime.now().isoformat(),
        "scheduled_for": scheduled_time.isoformat(),
        "scheduled_label": scheduled_time.strftime("%b %d at %I:%M %p"),
        "delay": delay,
        "status": "scheduled",
    }
    _scheduled_posts.append(post)
    
    logger.info(f"📅 Scheduled post: {platform} in {delay} — \"{content[:50]}...\"")
    
    return {
        "success": True,
        "type": "schedule",
        "message": f"📅 Scheduled {platform.title()} post for **{post['scheduled_label']}** ({delay} from now):\n\n\"{content[:200]}{'...' if len(content)>200 else ''}\"",
        "post": post,
    }


def get_scheduled_posts(twin_name: str = None) -> List[Dict]:
    """Get all scheduled posts (optionally filtered by twin)."""
    if twin_name:
        return [p for p in _scheduled_posts if p.get("twin_name") == twin_name]
    return _scheduled_posts


def cancel_scheduled_post(post_id: str) -> bool:
    """Cancel a scheduled post by ID."""
    global _scheduled_posts
    _scheduled_posts = [p for p in _scheduled_posts if p["id"] != post_id]
    return True


# ── AUTO-REPLY ──────────────────────────────────────────────────

def set_auto_reply(twin_id: str, enabled: bool) -> Dict:
    """Enable or disable auto-reply mode for a twin."""
    _auto_reply_enabled[twin_id] = enabled
    status = "enabled" if enabled else "disabled"
    logger.info(f"🤖 Auto-reply {status} for twin {twin_id}")
    
    msg_text = 'Your twin will now automatically respond to incoming messages across platforms.' if enabled else "Auto-reply deactivated. You're back in manual mode."
    return {
        "success": True,
        "type": "autoreply",
        "message": f"🤖 Auto-reply mode **{status}**.\n\n{msg_text}",
        "enabled": enabled,
    }


def is_auto_reply_enabled(twin_id: str) -> bool:
    """Check if auto-reply is enabled for a twin."""
    return _auto_reply_enabled.get(twin_id, False)


# ── HELP ────────────────────────────────────────────────────────

def get_help_message() -> Dict:
    """Return a help message with all available slash commands."""
    return {
        "success": True,
        "type": "help",
        "message": """🤖 **Slash Commands**

**Post to social media:**
`/linkedin post <content>` — Post to LinkedIn
`/twitter tweet <content>` — Tweet on X/Twitter

**Schedule posts:**
`/schedule linkedin 2h <content>` — Schedule a LinkedIn post in 2 hours
`/schedule twitter 30m <content>` — Schedule a tweet in 30 minutes

**Auto-reply:**
`/autoreply on` — Enable automatic replies to incoming messages
`/autoreply off` — Disable auto-reply

**Other:**
`/help` — Show this help message

*All social posts are currently simulated. Real OAuth integration coming in Phase B.*"""
    }
