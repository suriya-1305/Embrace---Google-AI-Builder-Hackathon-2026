from __future__ import annotations


class FirestoreStore:
    """Cloud Firestore implementation (DATA_STORE=firestore).

    Uses Application Default Credentials: on Cloud Run attach a service account
    with roles/datastore.user; locally run `gcloud auth application-default login`
    or point FIRESTORE_EMULATOR_HOST at the emulator.
    """

    def __init__(self) -> None:
        from google.cloud import firestore  # imported lazily so mock mode needs no Google libs

        self._db = firestore.Client()

    def get(self, path: str) -> dict | None:
        snap = self._db.document(path).get()
        if not snap.exists:
            return None
        return {**snap.to_dict(), "id": snap.id}

    def set(self, path: str, data: dict) -> None:
        doc = dict(data)
        doc["id"] = path.rsplit("/", 1)[-1]
        self._db.document(path).set(doc)

    def delete(self, path: str) -> None:
        ref = self._db.document(path)
        for sub in ref.collections():
            self.delete_collection(f"{path}/{sub.id}")
        ref.delete()

    def list(self, collection: str) -> list[dict]:
        docs = [{**d.to_dict(), "id": d.id} for d in self._db.collection(collection).stream()]
        return sorted(docs, key=lambda d: d["id"])

    def delete_collection(self, collection: str) -> int:
        count = 0
        for doc in self._db.collection(collection).stream():
            self.delete(f"{collection}/{doc.id}")
            count += 1
        return count

    def consume_limits(self, limits: dict[str, int]) -> bool:
        from google.cloud import firestore

        @firestore.transactional
        def consume(transaction):
            refs = [self._db.document(path) for path in limits]
            snapshots = [ref.get(transaction=transaction) for ref in refs]
            counts = [(snapshot.to_dict() or {}).get("count", 0) for snapshot in snapshots]
            if any(count >= limit for count, limit in zip(counts, limits.values())):
                return False
            for ref, count in zip(refs, counts):
                transaction.set(ref, {"id": ref.id, "count": count + 1})
            return True

        return consume(self._db.transaction())
