"""Pydantic data models for request/response schemas."""
from pydantic import BaseModel
from typing import Optional, List, Dict, Any


# --- Onboarding ---

class StartRequest(BaseModel):
    name: str
    linkedin_url: str = ""
    instagram_url: str = ""
    twitter_url: str = ""
    facebook_url: str = ""
    email: str = ""
    phone: str = ""

class StartResponse(BaseModel):
    user_id: str
    twin_id: str
    session_id: str
    message: str

class OnboardingStatus(BaseModel):
    session_id: str
    scraping_status: str
    photos_captured: int
    questions_answered: int
    avatar_status: str
    voice_clone_status: str
    status: str


# --- Chat ---

class ChatRequest(BaseModel):
    twin_id: str
    message: str
    conversation_id: str = ""

class SourceInfo(BaseModel):
    text: str
    source_type: str  # "social_profile", "voice_transcript", "data_export", "web_search"
    source_url: str = ""
    relevance: float = 0.0

class ChatResponse(BaseModel):
    reply: str
    sources: List[Dict[str, Any]] = []
    mood: str = "neutral"
    emoji: str = "😐"
    conversation_id: str = ""
    is_action: bool = False
    action_result: Dict[str, Any] = {}
    audio_url: str = ""
    avatar_url: str = ""


# --- Twin ---

class TwinPersonality(BaseModel):
    name: str
    tone: str = "friendly, authentic, conversational"
    interests: str = ""
    background: str = ""
    speech_style: str = "casual and natural"
    values: str = ""
    stories: str = ""

class TwinInfo(BaseModel):
    id: str
    user_id: str
    name: str = ""
    status: str = "creating"
    avatar_url: str = ""
    personality: Dict[str, Any] = {}


# --- Privacy ---

class DataSummary(BaseModel):
    twin_id: str
    photos_stored: int = 0
    voice_samples: int = 0
    rag_chunks: int = 0
    conversations: int = 0
    messages: int = 0

class DeleteResponse(BaseModel):
    status: str
    twin_id: str
    items_deleted: Dict[str, int] = {}

class ConversationExport(BaseModel):
    twin_id: str
    twin_name: str = ""
    conversation_id: str
    messages: List[Dict[str, Any]] = []
    exported_at: str = ""


# --- MCP / Slash Commands ---

class SlashCommand(BaseModel):
    platform: str  # linkedin, twitter
    action: str    # post, tweet
    content: str

class SlashCommandResult(BaseModel):
    success: bool
    platform: str
    action: str
    message: str
    url: str = ""
