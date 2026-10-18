"""Document store factory. Paths mirror the Firestore data model exactly,
so switching DATA_STORE from memory to firestore needs no code changes."""
from __future__ import annotations

from ..config import get_settings
from .base import DocumentStore

_STORE: DocumentStore | None = None


def get_store() -> DocumentStore:
    global _STORE
    if _STORE is None:
        settings = get_settings()
        if settings.data_store == "firestore":
            from .firestore_store import FirestoreStore

            _STORE = FirestoreStore()
        else:
            from .memory_store import MemoryStore
            from .seed import seed_store

            _STORE = MemoryStore()
            seed_store(_STORE)
    return _STORE


def reset_store() -> None:
    """Testing helper: rebuild the store (and re-seed the memory store)."""
    global _STORE
    _STORE = None
