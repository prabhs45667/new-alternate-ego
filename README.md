<div align="center">

# 🧠 Alternate Ego

### *Your AI-Powered Digital Twin — Thinks, Speaks, and Responds Like You*

[![Status](https://img.shields.io/badge/Status-Active-brightgreen?style=for-the-badge)]()
[![Stack](https://img.shields.io/badge/Stack-FastAPI%20%2B%20Next.js-blue?style=for-the-badge)]()
[![Privacy](https://img.shields.io/badge/Privacy-Local%20First-blueviolet?style=for-the-badge)]()
[![License](https://img.shields.io/badge/License-Academic%20Project-purple?style=for-the-badge)]()

---

*A privacy-first digital twin platform that replicates your voice, personality, memories, and mannerisms using RAG, voice cloning, and computer vision — running entirely on your local machine.*

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [RAG Pipeline](#-rag-pipeline)
- [Getting Started](#-getting-started)
- [Project Structure](#-project-structure)
- [Technical Highlights](#-technical-highlights)
- [Future Scope](#-future-scope)

---

## 🔍 Overview

**"What if you could talk to yourself — an AI that truly *knows* you?"**

Alternate Ego is a **full-stack digital twin platform** that creates an AI version of you — one that speaks in your voice, remembers your stories, reflects your personality, and even posts on social media in your style.

### Core Design Principles

- **🔒 Privacy-First** — All data is encrypted, processed locally, and never leaves your device
- **🧠 RAG-Powered Intelligence** — Retrieval-Augmented Generation ensures the twin actually *knows* you
- **🗣️ Voice Cloning** — Your digital twin speaks in your own voice using local TTS models
- **🎭 Emotion-Aware Avatar** — Computer vision captures your expressions, avatar reacts to conversation mood
- **🏠 Fully Local Execution** — Ollama-powered LLM and embeddings, SQLite database, local file storage

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| **RAG-Powered Chat** | Personality-aware responses using retrieved personal context |
| **Voice Cloning** | Coqui XTTS v2 clones your voice from interview recordings |
| **Speech-to-Text** | faster-whisper transcribes voice locally on CPU |
| **Emotion Photos** | Webcam captures 4 expressions with face-api.js CV validation |
| **AI Avatar** | Mood-synced cartoon avatars generated from your photos |
| **Social Data Ingestion** | Upload Instagram/LinkedIn/Twitter data exports for personality extraction |
| **Web Profile Scraping** | Public profile data extracted via BeautifulSoup + DuckDuckGo |
| **Slash Commands** | `/linkedin post`, `/twitter tweet` for social media automation |
| **Mood Detection** | Real-time mood analysis from response text |
| **Source Citations** | Every response shows which memories were used |
| **Data Encryption** | Fernet encryption at rest + secure deletion of raw uploads |
| **Privacy Controls** | Full data deletion API — wipe everything with one click |

---

## 🏛️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND (Browser)                                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Next.js 14 + TypeScript + TailwindCSS                     │ │
│  │ face-api.js (CV)  |  Framer Motion  |  react-webcam       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              ↕ HTTP REST API                    │
│  BACKEND (Local Python Server)                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ FastAPI + Uvicorn                                         │ │
│  │ ┌──────────────────────────────────────────────────────┐  │ │
│  │ │  RAG Engine          │  Voice Pipeline               │  │ │
│  │ │  • nomic-embed-text  │  • faster-whisper (STT)       │  │ │
│  │ │  • JSON Vector Store │  • Coqui XTTS v2 (TTS)       │  │ │
│  │ │  • Cosine Similarity │  • edge-tts fallback          │  │ │
│  │ │  • llama3.1:8b LLM   │                               │  │ │
│  │ └──────────────────────────────────────────────────────┘  │ │
│  │ ┌──────────────────────────────────────────────────────┐  │ │
│  │ │  Data Layer          │  Security                     │  │ │
│  │ │  • SQLite            │  • Fernet Encryption          │  │ │
│  │ │  • JSON Vector DB    │  • Secure File Deletion       │  │ │
│  │ │  • BeautifulSoup     │  • Privacy-first Pipeline     │  │ │
│  │ └──────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              ↕                                  │
│  OLLAMA (Local AI Runtime)                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ llama3.1:8b (LLM)  |  nomic-embed-text (Embeddings)      │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### User Flow

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  1. IMPRINT  │───▶│  2. PERCEIVE │───▶│  3. EMBODY   │───▶│  4. CONVERGE │
│  Name + Data │    │  4 Emotions  │    │  Voice Clone │    │  Chat Twin!  │
│  Social URLs │    │  CV Validate │    │  9 Questions │    │  RAG + TTS   │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

### Privacy Data Lifecycle

```
User Upload (.zip/.json)
        │
        ▼
  [Encrypted on Disk]
        │
        ▼
  [Parsed & Fed to RAG]  →  Only embeddings stored (not human-readable)
        │
        ▼
  [Raw File DELETED] 🗑️
```

---

## ⚙️ Tech Stack

| Component | Technology | Role |
|-----------|------------|------|
| **Backend** | FastAPI + Uvicorn | REST API, routing, CORS |
| **Frontend** | Next.js 14 + TailwindCSS | SSR, components, webcam, audio |
| **Database** | SQLite | Users, twins, conversations |
| **Vector Store** | Pure Python JSON | Embeddings storage + cosine search |
| **Embeddings** | `nomic-embed-text` (Ollama) | 768-dim text vectors |
| **LLM** | `llama3.1:8b` (Ollama) | Personality-aware responses |
| **STT** | `faster-whisper` | Voice → text transcription |
| **TTS** | Coqui XTTS v2 / edge-tts | Text → cloned voice speech |
| **CV** | `face-api.js` (TF.js) | Browser-side expression detection |
| **Avatars** | Gemini Flash | Mood-synced cartoon avatars |
| **Scraping** | BeautifulSoup + trafilatura | Public profile data extraction |
| **Encryption** | `cryptography.fernet` | Data-at-rest encryption |

---

## 🧠 RAG Pipeline

The RAG (Retrieval-Augmented Generation) pipeline is the core intelligence layer — it's what makes the twin actually *know* you.

```
                    ┌─────────────────────────┐
                    │     DATA SOURCES         │
                    │ • Social Media Scrapes   │
                    │ • Voice Transcripts (×9) │
                    │ • Data Export Uploads     │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    TOPIC CHUNKER        │
                    │ Split by meaning,       │
                    │ not fixed size          │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  OLLAMA EMBEDDER        │
                    │  nomic-embed-text       │
                    │  → 768-dim vectors      │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  JSON VECTOR STORE      │
                    │  Pure Python cosine     │
                    │  similarity search      │
                    └────────────┬────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
  ┌──────▼──────┐      ┌────────▼────────┐     ┌───────▼───────┐
  │  User Query  │      │  System Prompt   │     │  Chat History  │
  │  Embedded    │      │  + RAG Context   │     │  (In-Memory)   │
  └──────┬──────┘      └────────┬────────┘     └───────┬───────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   OLLAMA LLM            │
                    │   llama3.1:8b           │
                    │   → First-person reply  │
                    │   + Source citations     │
                    └─────────────────────────┘
```

### Pipeline Components

| Component | File | Purpose |
|-----------|------|---------|
| **Chunker** | `chunker.py` | Splits text into topic-based chunks (50–500 chars) |
| **Embedder** | `embedder.py` | Generates 768-dim vectors via Ollama nomic-embed-text |
| **Vector Store** | `vector_store.py` | Pure Python JSON store with cosine similarity search |
| **Prompt Builder** | `prompt_builder.py` | Builds system prompt + injects RAG context as "memories" |
| **LLM** | `llm.py` | Calls Ollama llama3.1:8b for response generation |
| **Source Tracker** | `source_tracker.py` | Formats source citations for each reply |

---

## 🚀 Getting Started

### Prerequisites

```bash
# 1. Python 3.10+
python --version

# 2. Node.js 18+
node --version

# 3. Ollama (download from https://ollama.ai)
ollama --version

# 4. Pull required AI models
ollama pull nomic-embed-text    # Embeddings (~270MB)
ollama pull llama3.1:8b          # LLM (~4.7GB)
```

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd Alternate-ego

# ── Backend Setup ──
cd alternate-ego/backend
python -m venv venv
venv\Scripts\activate            # Windows
pip install -r requirements.txt

# ── Frontend Setup ──
cd ../frontend
npm install
```

### Running the Project

Open **3 terminals:**

```bash
# Terminal 1: Ollama
ollama serve

# Terminal 2: Backend (port 8000)
cd alternate-ego/backend
venv\Scripts\activate
python -m uvicorn main:app --reload --port 8000

# Terminal 3: Frontend (port 3000)
cd alternate-ego/frontend
npm run dev
```

### Access

| Service | URL |
|---------|-----|
| 🖥️ Frontend UI | http://localhost:3000 |
| ⚙️ Backend API | http://localhost:8000 |
| 📄 API Documentation | http://localhost:8000/docs |

### Demo Flow

```
1. Open http://localhost:3000
2. Enter your name + social media URLs (optional)
3. Accept privacy consent checkbox
4. Upload social media data export (optional, .zip/.json)
5. Take 4 emotion-validated photos (neutral → happy → sad → angry)
6. Answer 9 voice interview questions
7. Wait for twin generation
8. Chat with your digital twin! 🎉
9. Try: /linkedin post "Hello from my AI twin!"
```

---

## 📁 Project Structure

```
Alternate-ego/
├── README.md
├── docs/                                  # Project documentation
├── XTTS-v2/                               # Coqui voice cloning model
├── alternate-ego/
│   ├── backend/
│   │   ├── main.py                        # FastAPI entry point
│   │   ├── config.py                      # Environment settings
│   │   ├── requirements.txt               # Python dependencies
│   │   ├── .env                           # Configuration
│   │   ├── api/
│   │   │   ├── onboarding.py              # /api/onboarding/* endpoints
│   │   │   ├── chat.py                    # /api/chat/message endpoint
│   │   │   ├── mcp_actions.py             # /api/mcp/* endpoints
│   │   │   └── privacy.py                 # /api/privacy/* endpoints
│   │   ├── rag/
│   │   │   ├── chunker.py                 # Topic-based text chunking
│   │   │   ├── embedder.py                # Ollama embedding generation
│   │   │   ├── vector_store.py            # Pure Python JSON vector DB
│   │   │   ├── prompt_builder.py          # System prompt + RAG context
│   │   │   ├── llm.py                     # Ollama LLM interface
│   │   │   ├── scrape_processor.py        # Web scraping + data parsing
│   │   │   ├── transcript_processor.py    # Voice → RAG chunks
│   │   │   └── source_tracker.py          # Citation formatting
│   │   ├── voice/
│   │   │   ├── stt.py                     # faster-whisper STT
│   │   │   ├── tts.py                     # Coqui XTTS v2 + edge-tts
│   │   │   └── voice_manager.py           # Voice reference management
│   │   ├── avatar/
│   │   │   └── avatar_generator.py        # Emotion photo processing
│   │   ├── mcp/
│   │   │   ├── slash_parser.py            # /slash command parser
│   │   │   └── social_poster.py           # Social media automation
│   │   ├── db/
│   │   │   ├── database.py                # SQLite init + schema
│   │   │   └── models.py                  # Pydantic data models
│   │   ├── security/
│   │   │   └── encryption.py              # Fernet encryption
│   │   └── storage/                       # Local file storage
│   └── frontend/
│       ├── src/
│       │   ├── app/
│       │   │   ├── page.tsx               # Landing page
│       │   │   ├── layout.tsx             # Root layout
│       │   │   ├── globals.css            # Glassmorphism styles
│       │   │   ├── onboarding/page.tsx    # Photo + voice capture
│       │   │   └── chat/page.tsx          # Chat interface
│       │   ├── components/                # 11 reusable components
│       │   └── lib/                       # API client + utilities
│       └── package.json
```

---

## 💡 Technical Highlights

### Pure Python Vector Store (vs ChromaDB)

ChromaDB's `hnswlib` C++ extension caused persistent `DLL load failed` crashes on Windows. Our pure Python replacement:
- ✅ **Zero native dependencies** — works on any OS without compilation
- ✅ **Exact cosine similarity** — mathematically identical results using `math.sqrt()`
- ✅ **JSON-based storage** — human-inspectable, easy to debug
- ⚠️ **Trade-off:** O(n) search instead of O(log n), but suitable for per-user data sizes (<1000 chunks)

### 9-Question Voice Interview

The voice interview captures 9 personality dimensions:
1. Background & passions → *who you are*
2. Core values & beliefs → *what drives you*
3. How friends describe you → *external perception*
4. A defining story → *formative experiences*
5. Biggest achievement → *pride points*
6. Stress handling → *emotional patterns*
7. What brings joy → *positive triggers*
8. Future goals → *aspirations*
9. Advice to younger self → *wisdom & reflection*

### Development Phases

| Phase | Component | Status |
|-------|-----------|--------|
| Phase 1 | Foundation + Server | ✅ Complete |
| Phase 2 | SQLite Database | ✅ Complete |
| Phase 3 | RAG Brain | ✅ Complete |
| Phase 4 | Scraping + Upload | ✅ Complete |
| Phase 5 | Avatar + CV | ✅ Complete |
| Phase 6 | Voice Pipeline | ✅ Complete |
| Phase 7 | Chat + Slash Commands | ✅ Complete |
| Phase 8 | Privacy/Security | ✅ Complete |
| Phase 9 | Frontend UI | ✅ Complete |

---

## 🔮 Future Scope

### Short-Term (1–2 Months)
- **🗣️ Real-Time Voice Chat** — Two-way voice conversation via WebSockets
- **🎭 3D Animated Avatar** — Three.js/Ready Player Me with lip-sync
- **📱 Mobile PWA** — Progressive Web App for mobile access
- **🔄 Continuous Learning** — Twin learns from ongoing conversations

### Mid-Term (3–6 Months)
- **🌐 Multi-Language Support** — Hindi, Hinglish, and regional language twins
- **📊 Personality Analytics** — Visualize personality traits and knowledge graph
- **🤝 Twin-to-Twin Chat** — Two digital twins converse with each other
- **📧 Email/Calendar Integration** — Twin reads your calendar and drafts emails
- **🔗 Live Social Media** — Real LinkedIn/Twitter API integration via MCP

### Long-Term Research
- **🧬 Emotional Intelligence** — Deep emotion from voice tonality and micro-expressions
- **🎥 Video Avatar** — Real-time video generation mirroring your expressions
- **💾 Federated Learning** — Improve models without sharing personal data
- **🏢 Enterprise Twin** — Institutional knowledge retention platform

---

<div align="center">

### 🔒 Privacy Promise

*Your data is encrypted, processed locally on your device, and never shared with anyone.*
*You can delete all your data at any time. Only vector embeddings remain — not human-readable.*

---

**Everything Runs Locally** · **Privacy-First Architecture** · **No External API Dependencies**

</div>
