import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Ollama — 100% Free, 100% Local
    OLLAMA_MODEL: str = "llama3.1:8b"
    EMBEDDING_MODEL: str = "nomic-embed-text"
    
    # Voice Pipeline
    WHISPER_MODEL: str = "small"
    USE_COQUI: bool = True
    EDGE_TTS_VOICE: str = "en-US-GuyNeural"
    
    # Gemini API (for avatar generation)
    GEMINI_API_KEY: str = ""
    USE_GEMINI_AVATAR: bool = True
    
    # App Settings
    USE_LOCAL_DB: bool = True
    USE_BEAUTIFULSOUP: bool = True
    CORS_ORIGINS: str = "http://localhost:3000"
    
    # Paths
    STORAGE_DIR: str = "storage"
    DB_PATH: str = "ego_database.db"
    VECTOR_STORE_PATH: str = "storage/vector_store.json"
    UPLOADS_DIR: str = "storage/uploads"
    AVATARS_DIR: str = "storage/avatars"
    VOICES_DIR: str = "storage/voices"
    AUDIO_DIR: str = "storage/audio"
    
    # Security
    ENCRYPTION_KEY: str = ""
    
    class Config:
        env_file = ".env"

settings = Settings()

