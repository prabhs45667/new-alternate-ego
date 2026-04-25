"""SQLite database initialization and helper functions."""
import sqlite3
import os
from config import settings

DB_PATH = settings.DB_PATH


def get_connection():
    """Get a new SQLite connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Initialize the database with all required tables."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            social_urls TEXT DEFAULT '{}',
            email TEXT DEFAULT '',
            phone TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS twins (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            voice_model_path TEXT,
            photo_neutral TEXT,
            photo_happy TEXT,
            photo_sad TEXT,
            photo_angry TEXT,
            avatar_path TEXT,
            personality_profile TEXT DEFAULT '{}',
            system_prompt TEXT DEFAULT '',
            scraped_data TEXT DEFAULT '{}',
            status TEXT DEFAULT 'creating',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            twin_id TEXT NOT NULL REFERENCES twins(id) ON DELETE CASCADE,
            title TEXT DEFAULT 'New Chat',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
            content TEXT NOT NULL,
            sources TEXT DEFAULT '[]',
            mood TEXT DEFAULT 'neutral',
            audio_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS onboarding_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            twin_id TEXT REFERENCES twins(id),
            scraping_status TEXT DEFAULT 'pending',
            photos_captured INTEGER DEFAULT 0,
            questions_answered INTEGER DEFAULT 0,
            avatar_status TEXT DEFAULT 'pending',
            voice_clone_status TEXT DEFAULT 'pending',
            status TEXT DEFAULT 'in_progress',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_twins_user ON twins(user_id);
        CREATE INDEX IF NOT EXISTS idx_conversations_twin ON conversations(twin_id);
        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
        CREATE INDEX IF NOT EXISTS idx_onboarding_user ON onboarding_sessions(user_id);
    """)
    conn.commit()
    conn.close()
    print(f"Database initialized at {DB_PATH}")


# --- Helper Functions ---

def create_user(user_id: str, name: str, social_urls: str = "{}", email: str = "", phone: str = ""):
    conn = get_connection()
    conn.execute("INSERT INTO users (id, name, social_urls, email, phone) VALUES (?, ?, ?, ?, ?)",
                 (user_id, name, social_urls, email, phone))
    conn.commit()
    conn.close()


def create_twin(twin_id: str, user_id: str):
    conn = get_connection()
    conn.execute("INSERT INTO twins (id, user_id) VALUES (?, ?)", (twin_id, user_id))
    conn.commit()
    conn.close()


def update_twin(twin_id: str, **kwargs):
    conn = get_connection()
    set_clause = ", ".join(f"{k} = ?" for k in kwargs.keys())
    values = list(kwargs.values()) + [twin_id]
    conn.execute(f"UPDATE twins SET {set_clause} WHERE id = ?", values)
    conn.commit()
    conn.close()


def get_twin(twin_id: str):
    conn = get_connection()
    row = conn.execute("SELECT * FROM twins WHERE id = ?", (twin_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def create_conversation(conv_id: str, twin_id: str):
    conn = get_connection()
    conn.execute("INSERT INTO conversations (id, twin_id) VALUES (?, ?)", (conv_id, twin_id))
    conn.commit()
    conn.close()


def add_message(msg_id: str, conversation_id: str, role: str, content: str,
                sources: str = "[]", mood: str = "neutral", audio_path: str = None):
    conn = get_connection()
    conn.execute(
        "INSERT INTO messages (id, conversation_id, role, content, sources, mood, audio_path) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (msg_id, conversation_id, role, content, sources, mood, audio_path)
    )
    conn.commit()
    conn.close()


def get_messages(conversation_id: str, limit: int = 50):
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?",
        (conversation_id, limit)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_conversations_for_twin(twin_id: str):
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM conversations WHERE twin_id = ? ORDER BY created_at DESC",
        (twin_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_onboarding_session(session_id: str, user_id: str, twin_id: str):
    conn = get_connection()
    conn.execute(
        "INSERT INTO onboarding_sessions (id, user_id, twin_id) VALUES (?, ?, ?)",
        (session_id, user_id, twin_id)
    )
    conn.commit()
    conn.close()


def update_onboarding(session_id: str, **kwargs):
    conn = get_connection()
    set_clause = ", ".join(f"{k} = ?" for k in kwargs.keys())
    values = list(kwargs.values()) + [session_id]
    conn.execute(f"UPDATE onboarding_sessions SET {set_clause} WHERE id = ?", values)
    conn.commit()
    conn.close()


def get_onboarding(session_id: str):
    conn = get_connection()
    row = conn.execute("SELECT * FROM onboarding_sessions WHERE id = ?", (session_id,)).fetchone()
    conn.close()
    return dict(row) if row else None
