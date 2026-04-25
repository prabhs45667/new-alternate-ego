<![CDATA[<div align="center">

# 🧠 Alternate Ego

### *Your AI-Powered Digital Twin — Thinks, Speaks, and Responds Like You*

[![Status](https://img.shields.io/badge/Status-In%20Development-yellow?style=for-the-badge)]()
[![Cost](https://img.shields.io/badge/Cost-₹0%20(Fully%20Local)-brightgreen?style=for-the-badge)]()
[![Stack](https://img.shields.io/badge/Stack-FastAPI%20%2B%20Next.js-blue?style=for-the-badge)]()
[![License](https://img.shields.io/badge/License-Academic%20Project-purple?style=for-the-badge)]()

---

*A hyper-realistic digital twin platform that replicates your voice, personality, memories, and mannerisms using RAG, voice cloning, and computer vision — running 100% locally at zero cost.*

</div>

---

## 📋 Table of Contents

- [Situation](#-situation--the-problem)
- [Task](#-task--our-objective)
- [Action](#-action--what-we-built)
- [Result](#-result--current-state)
- [What's Left](#-whats-left--remaining-work)
- [Future Scope](#-future-scope)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
- [Team](#-team)

---

## 🔍 Situation — The Problem

**"What if you could talk to yourself — an AI that truly *knows* you?"**

The original **Ego** project won **3rd Place** at the **Cursor × Smithery Hackathon** in Singapore (built by Kwok Zheng Feng, Jasper Ang, Jeric Tan, Jake Kee). It was a groundbreaking concept: a digital consciousness replication system. However, the original implementation:

- ❌ **Cost ~$2–8 per user upload** using paid APIs (ElevenLabs, EXA AI, Banana.dev, OpenAI, Supabase)
- ❌ **Depended on external services** — ElevenLabs for voice, Nano Banana 2 for avatar, Supabase for DB
- ❌ **Required multiple API keys** and ongoing subscriptions
- ❌ **Sent user data to third-party servers** — privacy concerns

### Our Challenge

We set out to **rebuild Ego from scratch** as **"Alternate Ego"** — a fully local, zero-cost version that provides the same digital twin experience without paying a single rupee or sending any data to external servers.

---

## 🎯 Task — Our Objective

Build a complete digital twin platform (**Alternate Ego / Drishya AI**) that:

1. **Creates an AI clone** of any user from their name, social data, photos, and voice
2. **Runs ENTIRELY locally** — no cloud APIs, no paid services, no data leaves the machine
3. **Preserves all core features** — RAG-powered personality, voice cloning, emotion-based avatar, social media automation
4. **Achieves ₹0 total cost** by replacing every paid API with a free, local alternative
5. **Prioritizes privacy** — encryption at rest, auto-deletion of raw data, user-controlled data lifecycle

### Key Replacement Decisions

| Original (Paid) | Our Replacement (Free/Local) | Why |
|---|---|---|
| OpenAI Embeddings | `nomic-embed-text` via Ollama | Runs locally, 768-dim vectors, ₹0 |
| Claude / GPT-4 LLM | `llama3.1:8b` via Ollama | Local LLM, no API key needed |
| ElevenLabs Voice Clone | Coqui XTTS v2 (local) | Open-source voice cloning on CPU |
| Whisper Cloud API | `faster-whisper` (local CPU) | STT directly on machine |
| ChromaDB + hnswlib | Pure Python JSON Vector Store | ChromaDB crashed with DLL errors on Windows |
| Supabase PostgreSQL | SQLite (local) | Zero setup, file-based DB |
| EXA AI Scraping | BeautifulSoup + DuckDuckGo | Public profiles only, no API key |
| Nano Banana 2 Avatar | Gemini API (`gemini-2.0-flash-exp`) | High-quality mood-synced cartoon avatars |

---

## 🏗️ Action — What We Built

### Phase-by-Phase Development

#### ✅ Phase 1: Foundation + Server
- FastAPI backend with Uvicorn, CORS middleware, and automatic API documentation
- Clean project structure: `api/`, `rag/`, `voice/`, `avatar/`, `mcp/`, `db/`, `security/`
- Environment configuration via `pydantic-settings` and `.env` file
- Static file serving for avatars, voice files, and uploads

#### ✅ Phase 2: SQLite Database
- 5-table schema: `users`, `twins`, `conversations`, `messages`, `onboarding_sessions`
- Full relationship tracking: user → twin → conversation → messages
- Pydantic models for all request/response schemas
- Auto-initialization on server startup

#### ✅ Phase 3: RAG Brain — *The Core*
The most critical component — what makes the twin actually "know" the user.

```
User Data → Chunker → Embedder (Ollama) → JSON Vector DB → Cosine Search → LLM Response
```

- **`chunker.py`** — Splits text into topic-based chunks (not fixed-size) with source metadata
- **`embedder.py`** — Generates 768-dimensional vectors via Ollama `nomic-embed-text`
- **`vector_store.py`** — Pure Python JSON store with exact cosine similarity math (replaced ChromaDB)
- **`prompt_builder.py`** — Builds dynamic system prompts + RAG context for the LLM
- **`llm.py`** — Calls Ollama `llama3.1:8b` for response generation
- **`source_tracker.py`** — Formats source citations (📚) for each reply
- **`transcript_processor.py`** — Converts voice interview transcripts into RAG-ready chunks

#### ✅ Phase 4: Social Scraping + Data Upload
- **Public profile scraping** via BeautifulSoup + DuckDuckGo search
- **Smart text extraction** using `trafilatura` for clean content from web pages
- **Data export upload** — users can upload Instagram/LinkedIn `.zip`/`.json` exports
- **Privacy-first pipeline**: Upload → Encrypt → Parse → Feed to RAG → **DELETE raw file**
- Only vector embeddings remain (not human-readable)

#### ✅ Phase 5: Avatar + Computer Vision
- Webcam capture of 4 emotion photos: **neutral, happy, sad, angry**
- **face-api.js** runs in the browser for real-time expression validation
- TensorFlow.js models detect and classify facial expressions before allowing capture
- **Gemini API (`gemini-2.0-flash-exp`)** generates high-quality, mood-synced AI cartoon avatars from the webcam photos
- Photos stored locally at `storage/avatars/{twin_id}/`
- Neutral avatar used as default profile image

#### ✅ Phase 6: Voice Pipeline
- **STT (Speech-to-Text):** `faster-whisper` transcribes user's 9 voice interview answers locally on CPU
- **TTS (Text-to-Speech):** Coqui XTTS v2 clones user's voice from recorded samples
- **Fallback:** Microsoft Edge TTS (`edge-tts`) if XTTS fails or runs out of memory
- Lazy model loading to conserve RAM at startup
- 9 personality-probing interview questions covering background, values, stories, goals, and advice

#### ✅ Phase 7: Chat + Slash Commands
- RAG-powered chat endpoint: message → RAG retrieval → LLM generation → response + source citations
- **Mood detection** from reply text (keyword-based: happy, sad, angry, neutral)
- Avatar expression changes dynamically based on detected mood
- `/slash` command support for social media automation:
  - `/linkedin post <content>` — Simulated LinkedIn posting
  - `/twitter tweet <content>` — Simulated Twitter posting
- Chat history maintained in-memory per twin session

#### 🟡 Phase 8: Privacy & Security (Partially Complete)
- **`encryption.py`** — Fernet encryption/decryption for uploaded files
- **`privacy.py`** — API endpoints for data deletion and data summary
- Auto-generated encryption keys stored locally
- Secure deletion: wipes photos, voice, uploads, and vector store data
- **Remaining:** Full wiring of encryption into the upload pipeline

#### ✅ Phase 9: Next.js Frontend (Core Complete)
- **Landing Page** — Unified frontend flow featuring a full-screen cinematic Hero video experience with seamless navigation to onboarding
- **Upload Form** — Name, social URLs (LinkedIn/Instagram/Twitter), data export upload, privacy consent
- **Onboarding Page** — 4-emotion photo capture with webcam, 9-question voice interview with recording
- **Chat Page** — Split-screen layout: avatar (left) + chat window (right)
- **11 Reusable Components:**
  - `NameInput`, `PrivacyBanner`, `DataUpload`, `CameraCapture`, `VoiceInterview`
  - `GeneratingScreen`, `ScrapingScreen`, `AvatarView`, `ChatWindow`
  - `SourceCitations`, `AudioPlayer`
- Design: Glassmorphism, Playfair Display + Inter fonts, purple/indigo gradients, dark theme

---

## 📊 Result — Current State

### ✅ What Works End-to-End

| Feature | Status | Details |
|---|---|---|
| Backend API Server | ✅ Running | FastAPI at `localhost:8000` with Swagger docs |
| User Registration | ✅ Working | Name entry → user/twin/session created in SQLite |
| Social Scraping | ✅ Working | DuckDuckGo + BeautifulSoup, chunks indexed into RAG |
| Data Export Upload | ✅ Working | .zip/.json upload → parse → RAG → delete raw file |
| Photo Capture (4 Emotions) | ✅ Working | Webcam + face-api.js CV validation |
| Voice Recording (9 Questions) | ✅ Working | MediaRecorder → webm → saved to storage |
| Speech-to-Text | ✅ Working | faster-whisper transcribes locally on CPU |
| RAG Vector Store | ✅ Working | Pure Python JSON + cosine similarity |
| Embeddings | ✅ Working | Ollama `nomic-embed-text` (768-dim) |
| LLM Chat | ✅ Working | Ollama `llama3.1:8b` with RAG context |
| Mood Detection | ✅ Working | Keyword-based mood from reply text |
| Source Citations | ✅ Working | RAG sources returned with each reply |
| Slash Commands | ✅ Working | `/linkedin post`, `/twitter tweet` (simulated) |
| Voice Cloning (TTS) | ✅ Working | Coqui XTTS v2 with edge-tts fallback |
| Frontend UI | ✅ Working | Landing → Onboarding → Chat flow |
| Data Encryption | ✅ Working | Fernet encrypt/decrypt + secure delete |
| Privacy API | ✅ Working | `/delete-all/{twin_id}` endpoint |

### 📊 Codebase Metrics

| Component | Files | Lines of Code |
|---|---|---|
| Backend (Python) | 20+ modules | ~2,500+ LoC |
| Frontend (TypeScript/React) | 15+ components | ~3,000+ LoC |
| Configuration & Setup | 5 files | ~200 LoC |
| **Total** | **40+ files** | **~5,700+ LoC** |

---

## 🚧 What's Left — Remaining Work

### 🔴 Critical (Must-Have for Demo)

| # | Task | Effort | Priority |
|---|---|---|---|
| 1 | **End-to-end integration test** — Full flow from name entry to chat reply | 2-3 hrs | 🔴 P0 |
| 2 | **Encryption wiring** — Connect `encrypt_file()` into the onboarding upload pipeline | 1-2 hrs | 🔴 P0 |
| 3 | **Chat history persistence** — Move from in-memory to SQLite `messages` table | 2-3 hrs | 🔴 P0 |

### 🟡 Important (Should-Have)

| # | Task | Effort | Priority |
|---|---|---|---|
| 4 | **Personality extraction via LLM** — Use LLM to extract speech style, interests, tone from voice transcripts | 3-4 hrs | 🟡 P1 |
| 5 | **Avatar expression sync** — Show correct emotion photo based on mood detection result | 2 hrs | 🟡 P1 |
| 6 | **Voice playback in chat** — Play TTS audio when clicking the "🔊 Play" button on messages | 1-2 hrs | 🟡 P1 |
| 7 | **Loading/generating screen** — Show progress while scraping + indexing + twin generation | 1-2 hrs | 🟡 P1 |
| 8 | **Error handling & toasts** — Graceful error messages instead of `alert()` boxes | 2 hrs | 🟡 P1 |

### 🟢 Nice-to-Have

| # | Task | Effort | Priority |
|---|---|---|---|
| 9 | **Real OAuth for social posting** — Actual LinkedIn/Twitter API integration instead of simulated | 8+ hrs | 🟢 P2 |
| 10 | **Dashboard page** — View twin's knowledge base, manage data, voice settings | 6+ hrs | 🟢 P2 |
| 11 | **WebSocket real-time chat** — Replace polling with live streaming responses | 4+ hrs | 🟢 P2 |
| 12 | **Multi-user support** — Session management for multiple twins | 4+ hrs | 🟢 P2 |

---

## 🔮 Future Scope

### Short-Term Enhancements (1–2 Months)

- **🗣️ Real-Time Voice Chat** — Two-way voice conversation (STT → RAG → LLM → TTS) in real-time using WebSockets
- **🎭 3D Animated Avatar** — Replace static photos with a Three.js/Ready Player Me animated avatar that lip-syncs and changes expressions
- **📱 Mobile PWA** — Progressive Web App for mobile access with push notifications
- **🔄 Continuous Learning** — Twin learns from ongoing conversations, updating its RAG knowledge base

### Mid-Term Vision (3–6 Months)

- **🌐 Multi-Language Support** — Hindi, Hinglish, and regional language digital twins using multilingual XTTS
- **📊 Personality Analytics Dashboard** — Visualize the twin's personality traits, knowledge graph, and conversation patterns
- **🤝 Twin-to-Twin Chat** — Let two digital twins converse with each other
- **📧 Email/Calendar Integration** — Twin can read your calendar and compose emails in your style
- **🔗 Real MCP Server Integration** — Deploy actual LinkedIn/Twitter MCP servers for live social media automation

### Long-Term Research Directions

- **🧬 Emotional Intelligence** — Deep emotion understanding from voice tonality, facial micro-expressions, and conversation patterns
- **🎥 Video Avatar Generation** — Real-time deepfake-style video avatar that mirrors your expressions
- **💾 Federated Learning** — Multiple users can improve the underlying models without sharing personal data
- **🏢 Enterprise Digital Twin** — Company-wide knowledge workers that retain institutional knowledge when employees leave
- **🌍 Decentralized Identity** — Blockchain-based ownership of your digital twin's data and personality

---

## ⚙️ Tech Stack

### All Components — ₹0 Total Cost

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

| Component | Technology | Role |
|---|---|---|
| **Backend** | FastAPI + Uvicorn | REST API, routing, CORS |
| **Frontend** | Next.js 14 + TailwindCSS | SSR, components, webcam, audio |
| **Database** | SQLite | Users, twins, conversations |
| **Vector Store** | Pure Python JSON | Embeddings storage + cosine search |
| **Embeddings** | `nomic-embed-text` (Ollama) | 768-dim text vectors |
| **LLM** | `llama3.1:8b` (Ollama) | Personality-aware responses |
| **STT** | `faster-whisper` | Voice → text transcription |
| **TTS** | Coqui XTTS v2 / edge-tts | Text → cloned voice speech |
| **CV** | `face-api.js` (TF.js) | Browser-side expression detection |
| **Avatars** | Gemini API | High-quality mood-synced cartoon avatars |
| **Scraping** | BeautifulSoup + trafilatura | Public profile data extraction |
| **Encryption** | `cryptography.fernet` | Data-at-rest encryption |

---

## 🏛️ Architecture

### User Flow

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  1. IMPRINT  │───▶│  2. PERCEIVE │───▶│  3. EMBODY   │───▶│  4. CONVERGE │
│  Name + Data │    │  4 Emotions  │    │  Voice Clone │    │  Chat Twin!  │
│  Social URLs │    │  CV Validate │    │  9 Questions │    │  RAG + TTS   │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

### RAG Pipeline (The Brain)

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
cd ego

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
|---|---|
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
ego/
├── README.md                              # ← You are here
├── docs/                                  # Project documentation (gitignored to save space)
├── XTTS-v2/                               # Coqui voice cloning model (~2GB)
├── alternate-ego/
│   ├── backend/
│   │   ├── main.py                        # FastAPI entry point
│   │   ├── config.py                      # Environment settings
│   │   ├── requirements.txt               # Python dependencies
│   │   ├── .env                           # API keys & config
│   │   ├── ego_database.db                # SQLite database
│   │   ├── simple_vectors.json            # RAG vector store (~5.7MB)
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
│   │   │   ├── scrape_processor.py        # Web scraping + data export parsing
│   │   │   ├── transcript_processor.py    # Voice → RAG chunks
│   │   │   ├── source_tracker.py          # Citation formatting
│   │   │   └── image_analyzer.py          # Image content analysis
│   │   ├── voice/
│   │   │   ├── stt.py                     # faster-whisper STT
│   │   │   ├── tts.py                     # Coqui XTTS v2 + edge-tts fallback
│   │   │   └── voice_manager.py           # Voice reference management
│   │   ├── avatar/
│   │   │   └── avatar_generator.py        # Emotion photo processing
│   │   ├── mcp/
│   │   │   ├── slash_parser.py            # /slash command parser
│   │   │   └── social_poster.py           # Simulated social posting
│   │   ├── db/
│   │   │   ├── database.py                # SQLite init + schema
│   │   │   └── models.py                  # Pydantic data models
│   │   ├── security/
│   │   │   └── encryption.py              # Fernet encryption + secure delete
│   │   └── storage/                       # Local file storage
│   │       ├── avatars/{twin_id}/         # Emotion photos
│   │       ├── voices/{twin_id}/          # Voice references + TTS output
│   │       ├── audio/{twin_id}/           # Voice interview recordings
│   │       └── uploads/{twin_id}/         # Encrypted uploads (auto-deleted)
│   └── frontend/
│       ├── src/
│       │   ├── app/
│       │   │   ├── page.tsx               # Landing page (hero + upload form)
│       │   │   ├── layout.tsx             # Root layout (fonts, dark theme)
│       │   │   ├── globals.css            # Glassmorphism styles
│       │   │   ├── onboarding/page.tsx    # Photo capture + voice interview
│       │   │   └── chat/page.tsx          # Split-screen chat interface
│       │   ├── components/
│       │   │   ├── NameInput.tsx           # Name input field
│       │   │   ├── PrivacyBanner.tsx       # Privacy assurance banner
│       │   │   ├── DataUpload.tsx          # Drag-drop file upload
│       │   │   ├── CameraCapture.tsx       # Webcam + face-api.js
│       │   │   ├── VoiceInterview.tsx      # 9-question voice recorder
│       │   │   ├── GeneratingScreen.tsx    # Twin generation loading
│       │   │   ├── ScrapingScreen.tsx      # Social scraping progress
│       │   │   ├── AvatarView.tsx          # Avatar display panel
│       │   │   ├── ChatWindow.tsx          # Chat message list
│       │   │   ├── SourceCitations.tsx     # RAG source pills
│       │   │   └── AudioPlayer.tsx         # TTS voice playback
│       │   └── lib/
│       │       ├── api.ts                  # Backend API client
│       │       ├── camera.ts              # Webcam utilities
│       │       └── audio.ts               # Audio recording utilities
│       ├── public/
│       │   └── models/                    # face-api.js TensorFlow weights
│       └── package.json
└── searxng/                               # SearXNG search engine (optional)
```

---

## 🏗️ Phase Completion Summary

| Phase | Component | Status | Key Files |
|---|---|---|---|
| **Phase 1** | Foundation + Server | ✅ Complete | `main.py`, `config.py` |
| **Phase 2** | SQLite Database | ✅ Complete | `db/database.py`, `db/models.py` |
| **Phase 3** | RAG Brain | ✅ Complete | `rag/` (8 files) |
| **Phase 4** | Scraping + Upload | ✅ Complete | `rag/scrape_processor.py` |
| **Phase 5** | Avatar + CV | ✅ Complete | `avatar/`, `CameraCapture.tsx` |
| **Phase 6** | Voice Pipeline | ✅ Complete | `voice/stt.py`, `voice/tts.py` |
| **Phase 7** | Chat + Slash | ✅ Complete | `api/chat.py`, `mcp/` |
| **Phase 8** | Privacy/Security | 🟡 Partial | `security/encryption.py` |
| **Phase 9** | Frontend UI | ✅ Core Done | `frontend/src/` (15 files) |

---

## 💡 Technical Highlights

### Why Pure Python Vector Store Instead of ChromaDB?

ChromaDB's `hnswlib` C++ extension caused persistent `DLL load failed` crashes on Windows. Our pure Python replacement:
- ✅ **Zero DLL dependencies** — works on any OS
- ✅ **Exact same math** — cosine similarity with `math.sqrt()`
- ✅ **JSON-based storage** — human-inspectable, easy to debug
- ⚠️ **Trade-off:** O(n) search instead of O(log n), but perfectly fine for per-user data sizes (<1000 chunks)

### Why 9 Questions Instead of 4?

The original Ego used 4 questions. We expanded to 9 to capture:
1. Background & passions → *who you are*
2. Core values & beliefs → *what drives you*
3. How friends describe you → *external perception*
4. A defining story → *formative experiences*
5. Biggest achievement → *pride points*
6. Stress handling → *emotional patterns*
7. What brings joy → *positive triggers*
8. Future goals → *aspirations*
9. Advice to younger self → *wisdom & reflection*

This gives the RAG brain **2.25× more personality data** to work with.

---

## 👥 Team

**Project:** Alternate Ego / Drishya AI  
**Type:** Academic / Research Project  
**Inspired by:** [Ego](https://sg.linkedin.com/in/kwokzhengfeng) — 3rd Place, Cursor × Smithery Hackathon, Singapore

---

<div align="center">

### 🔒 Privacy Promise

*Your data is encrypted, processed locally on your device, and NEVER shared with anyone.*  
*You can delete ALL your data at any time. Only vector embeddings remain — not human-readable.*

---

**Total Cost: ₹0** · **Everything Runs Locally** · **Zero External API Dependencies**

</div>
]]>
