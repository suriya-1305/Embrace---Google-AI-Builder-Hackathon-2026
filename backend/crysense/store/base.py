from __future__ import annotations

from typing import Protocol


class DocumentStore(Protocol):
    """Minimal document API shared by the in-memory mock and Firestore.

    Paths are slash-separated, e.g. "infantRecords/inf_anya/events/evt_1".
    Every returned document includes its "id".
    """

    def get(self, path: str) -> dict | None: ...

    def set(self, path: str, data: dict) -> None: ...

    def delete(self, path: str) -> None: ...

    def list(self, collection: str) -> list[dict]: ...

    def delete_collection(self, collection: str) -> int: ...

    def consume_limits(self, limits: dict[str, int]) -> bool: ...
