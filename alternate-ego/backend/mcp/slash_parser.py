"""Slash command parser — detects /platform action commands in chat messages.

Supports:
  /linkedin post <content>
  /twitter tweet <content>
  /schedule <platform> <time> <content>
  /autoreply on|off
"""
import re
from typing import Optional, Dict


def parse_slash_command(message: str) -> Optional[Dict]:
    """Parse a slash command from a chat message.
    
    Returns:
        Dict with parsed command info, or None if not a slash command.
    """
    message = message.strip()
    if not message.startswith("/"):
        return None

    parts = message.split(maxsplit=2)
    command = parts[0].lower().lstrip("/")

    # /linkedin post <content>
    if command == "linkedin":
        if len(parts) >= 3:
            return {
                "type": "social",
                "platform": "linkedin",
                "action": parts[1].lower(),
                "content": parts[2]
            }
        return {"type": "social", "platform": "linkedin", "action": "post", "content": ""}

    # /twitter tweet <content>
    elif command in ("twitter", "tweet", "x"):
        if len(parts) >= 3:
            return {
                "type": "social",
                "platform": "twitter",
                "action": parts[1].lower(),
                "content": parts[2]
            }
        elif len(parts) >= 2:
            return {"type": "social", "platform": "twitter", "action": "tweet", "content": parts[1]}
        return {"type": "social", "platform": "twitter", "action": "tweet", "content": ""}

    # /schedule <platform> <time> <content>
    # Example: /schedule linkedin 2h "My thoughts on AI..."
    elif command == "schedule":
        if len(parts) >= 3:
            sub_parts = parts[1:]
            # Try to extract: platform, delay, content
            platform = sub_parts[0].lower() if sub_parts else "linkedin"
            rest = parts[2] if len(parts) > 2 else ""
            
            # Try to extract time from rest
            time_match = re.match(r'^(\d+[mhd])\s+(.+)$', rest)
            if time_match:
                delay = time_match.group(1)
                content = time_match.group(2)
            else:
                delay = "1h"
                content = rest
            
            return {
                "type": "schedule",
                "platform": platform,
                "action": "schedule",
                "delay": delay,
                "content": content
            }
        return None

    # /autoreply on|off
    elif command == "autoreply":
        mode = parts[1].lower() if len(parts) >= 2 else "on"
        return {
            "type": "autoreply",
            "platform": "system",
            "action": "autoreply",
            "content": "",
            "mode": mode in ("on", "true", "enable", "1")
        }

    # /help
    elif command == "help":
        return {
            "type": "help",
            "platform": "system",
            "action": "help",
            "content": ""
        }

    return None
