from __future__ import annotations

import copy
import threading


class MemoryStore:
    """Thread-safe in-memory document store used for local development and demos."""

    def __init__(self) -> None:
        self._docs: dict[str, dict] = {}
        self._lock = threading.Lock()

    def get(self, path: str) -> dict | None:
        with self._lock:
            doc = self._docs.get(path)
            return copy.deepcopy(doc) if doc is not None else None

    def set(self, path: str, data: dict) -> None:
        doc = copy.deepcopy(data)
        doc["id"] = path.rsplit("/", 1)[-1]
        with self._lock:
            self._docs[path] = doc

    def delete(self, path: str) -> None:
        with self._lock:
            # Delete the document and anything nested under it.
            for key in [k for k in self._docs if k == path or k.startswith(path + "/")]:
                del self._docs[key]

    def list(self, collection: str) -> list[dict]:
        with self._lock:
            docs = [copy.deepcopy(v) for k, v in self._docs.items() if k.rsplit("/", 1)[0] == collection]
        return sorted(docs, key=lambda d: d["id"])  # deterministic order; callers re-sort by time + id

    def delete_collection(self, collection: str) -> int:
        with self._lock:
            keys = [k for k in self._docs if k.startswith(collection + "/")]
            for key in keys:
                del self._docs[key]
        return len(keys)

    def consume_limits(self, limits: dict[str, int]) -> bool:
        with self._lock:
            if any(self._docs.get(path, {}).get("count", 0) >= limit for path, limit in limits.items()):
                return False
            for path in limits:
                self._docs[path] = {"id": path.rsplit("/", 1)[-1], "count": self._docs.get(path, {}).get("count", 0) + 1}
            return True
