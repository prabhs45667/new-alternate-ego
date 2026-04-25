"""WebSocket endpoint for real-time scraping/processing logs."""
import asyncio
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory log store per session
_log_stores: Dict[str, List[str]] = {}
_log_events: Dict[str, asyncio.Event] = {}


def emit_log(session_id: str, message: str):
    """Emit a log message for a session. Called from scrape_processor."""
    if session_id not in _log_stores:
        _log_stores[session_id] = []
    _log_stores[session_id].append(message)
    
    # Signal any waiting WebSocket
    if session_id in _log_events:
        _log_events[session_id].set()
    
    logger.info(f"[LOG:{session_id[:8]}] {message}")


def get_logs(session_id: str) -> List[str]:
    """Get all logs for a session."""
    return _log_stores.get(session_id, [])


def clear_logs(session_id: str):
    """Clear logs for a session."""
    _log_stores.pop(session_id, None)
    _log_events.pop(session_id, None)


@router.websocket("/logs/{session_id}")
async def websocket_logs(websocket: WebSocket, session_id: str):
    """Stream real-time logs to the frontend during scraping/onboarding."""
    await websocket.accept()
    
    # Initialize log tracking
    if session_id not in _log_stores:
        _log_stores[session_id] = []
    _log_events[session_id] = asyncio.Event()
    
    last_idx = 0
    
    try:
        while True:
            # Send any new logs
            logs = _log_stores.get(session_id, [])
            if len(logs) > last_idx:
                for log in logs[last_idx:]:
                    await websocket.send_json({"type": "log", "message": log})
                last_idx = len(logs)
            
            # Wait for new logs or timeout
            _log_events[session_id].clear()
            try:
                await asyncio.wait_for(_log_events[session_id].wait(), timeout=2.0)
            except asyncio.TimeoutError:
                # Send heartbeat
                await websocket.send_json({"type": "heartbeat"})
                
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        clear_logs(session_id)
