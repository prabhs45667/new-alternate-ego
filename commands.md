Terminal 1 — Ollama (LLM Engine)
powershell
ollama serve
Runs on http://localhost:11434. Make sure llama3.1:8b model is pulled: ollama pull llama3.1:8b

Terminal 2 — Backend (FastAPI)
powershell
cd c:\Users\hp\Downloads\Alternate-ego\alternate-ego\backend
python -m uvicorn main:app --reload --port 8000
Runs on http://localhost:8000 | API docs at http://localhost:8000/docs

Terminal 3 — Alternate Ego Frontend (Next.js)
powershell
cd c:\Users\hp\Downloads\Alternate-ego\alternate-ego\frontend
npm run dev
Runs on http://localhost:3000 — This is the main app (onboarding, chat, avatar)

Terminal 4 — Ego Echo Forge Landing Page (Vite)
powershell
cd C:\Users\hp\Downloads\Alternate-ego\life-mimic-ai-main
npm run dev
Runs on http://localhost:3001 — This is the landing page

Start Order
Ollama first (LLM needs to be ready)
Backend second (depends on Ollama)
Both frontends can start anytime after backend
Quick Health Check
After starting backend, visit: http://localhost:8000/health — should show all services green ✅

12:06 AM
pyhon main.py is for which command?

python main.py is also for the Backend (FastAPI). It does the same thing as uvicorn main:app --reload --port 8000.

Look at the bottom of main.py:

python
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
So both commands are equivalent for Terminal 2:

powershell
# Option A
cd c:\Users\hp\Downloads\Alternate-ego\alternate-ego\backend
python main.py
# Option B (same thing)
cd c:\Users\hp\Downloads\Alternate-ego\alternate-ego\backend
python -m uvicorn main:app --reload --port 8000
Use whichever you prefer — both start the backend on http://localhost:8000