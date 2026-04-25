"""Fernet encryption + secure file deletion."""
import os
import shutil
import logging
from cryptography.fernet import Fernet
from config import settings

logger = logging.getLogger(__name__)

KEY_PATH = os.path.join(settings.STORAGE_DIR, ".encryption_key")


def _get_or_create_key() -> bytes:
    """Get existing encryption key or generate a new one."""
    if os.path.exists(KEY_PATH):
        with open(KEY_PATH, 'rb') as f:
            return f.read()
    
    key = Fernet.generate_key()
    os.makedirs(os.path.dirname(KEY_PATH), exist_ok=True)
    with open(KEY_PATH, 'wb') as f:
        f.write(key)
    
    logger.info("🔐 Generated new encryption key")
    return key


_fernet = Fernet(_get_or_create_key())


def encrypt_file(file_path: str) -> str:
    """Encrypt a file in place. Returns path to encrypted file."""
    try:
        with open(file_path, 'rb') as f:
            data = f.read()
        
        encrypted = _fernet.encrypt(data)
        enc_path = file_path + '.enc'
        
        with open(enc_path, 'wb') as f:
            f.write(encrypted)
        
        # Delete original
        os.remove(file_path)
        logger.info(f"🔐 Encrypted: {file_path} → {enc_path}")
        return enc_path
    except Exception as e:
        logger.error(f"❌ Encryption failed: {e}")
        return file_path


def decrypt_file(enc_path: str) -> bytes:
    """Decrypt a file and return the raw bytes."""
    try:
        with open(enc_path, 'rb') as f:
            encrypted = f.read()
        return _fernet.decrypt(encrypted)
    except Exception as e:
        logger.error(f"❌ Decryption failed: {e}")
        return b""


def delete_securely(twin_id: str) -> dict:
    """Wipe ALL data for a twin: photos, voice, vectors, uploads.
    
    Returns:
        Dict with counts of deleted items
    """
    deleted = {}
    
    for folder_name in ["avatars", "voices", "uploads", "audio"]:
        path = os.path.join(settings.STORAGE_DIR, folder_name, twin_id)
        if os.path.exists(path):
            file_count = sum(len(files) for _, _, files in os.walk(path))
            shutil.rmtree(path)
            deleted[folder_name] = file_count
            logger.info(f"🗑️ Deleted {folder_name}/{twin_id}: {file_count} files")
    
    # Also remove from vector store
    from rag.vector_store import delete_twin_data
    chunks_deleted = delete_twin_data(twin_id)
    deleted["rag_chunks"] = chunks_deleted
    
    logger.info(f"🗑️ Securely deleted all data for twin {twin_id}")
    return deleted
