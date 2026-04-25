"""MCP Actions API — slash command routing."""
from fastapi import APIRouter
from db.models import SlashCommand, SlashCommandResult
from mcp.social_poster import post_to_platform

router = APIRouter()


@router.post("/execute", response_model=SlashCommandResult)
async def execute_action(cmd: SlashCommand):
    """Execute a social media action."""
    result = post_to_platform(cmd.platform, cmd.action, cmd.content)

    return SlashCommandResult(
        success=result["success"],
        platform=result["platform"],
        action=result["action"],
        message=result["message"],
        url=result.get("url", "")
    )


@router.get("/supported")
async def list_supported_platforms():
    """List supported platforms and actions."""
    return {
        "platforms": [
            {
                "name": "LinkedIn",
                "slug": "linkedin",
                "actions": ["post"],
                "syntax": "/linkedin post <your content here>",
                "status": "simulated"
            },
            {
                "name": "Twitter/X",
                "slug": "twitter",
                "actions": ["post", "tweet"],
                "syntax": "/twitter tweet <your content here>",
                "status": "simulated"
            }
        ]
    }
