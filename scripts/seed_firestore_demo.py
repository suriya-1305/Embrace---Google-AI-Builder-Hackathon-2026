"""Seed the fictional demo household for one Firebase-authenticated user."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from crysense.store.seed import (  # noqa: E402
    HOUSEHOLD_ID,
    INFANT_ID,
    MOTHER_ID,
    USERS,
    build_seed,
)


def firestore_value(value: object) -> dict:
    if value is None:
        return {"nullValue": None}
    if isinstance(value, bool):
        return {"booleanValue": value}
    if isinstance(value, int):
        return {"integerValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    if isinstance(value, str):
        return {"stringValue": value}
    if isinstance(value, list):
        return {"arrayValue": {"values": [firestore_value(item) for item in value]}}
    if isinstance(value, dict):
        return {"mapValue": {"fields": {key: firestore_value(item) for key, item in value.items()}}}
    raise TypeError(f"Unsupported Firestore seed value: {type(value).__name__}")


def firestore_fields(document: dict) -> dict:
    return {key: firestore_value(value) for key, value in document.items()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True, help="Google Cloud/Firebase project ID")
    parser.add_argument("--uid", required=True, help="Firebase UID that owns the demo profile")
    parser.add_argument("--dry-run", action="store_true", help="Validate the mapping without writing to Firestore")
    parser.add_argument("--confirm-demo-data", action="store_true", help="Required to write fictional demo records")
    args = parser.parse_args()

    token = os.environ.get("CRYSENSE_GCLOUD_ACCESS_TOKEN")
    if not args.dry_run and not token:
        parser.error("Set CRYSENSE_GCLOUD_ACCESS_TOKEN from gcloud auth print-access-token before writing.")
    if not args.dry_run and not args.confirm_demo_data:
        parser.error("Pass --confirm-demo-data to write the fictional demo household.")

    documents = build_seed()
    meera = documents.pop("users/u_meera")
    documents.pop("users/u_arjun", None)
    meera.update(role="mother", region="IN", householdId=HOUSEHOLD_ID)
    documents[f"users/{args.uid}"] = meera

    for path, document in documents.items():
        if path == f"households/{HOUSEHOLD_ID}":
            document["memberUids"] = [args.uid]
            document["sharingPermissions"] = {}
        elif path == f"infantRecords/{INFANT_ID}":
            document["caregiverUids"] = [args.uid]
        elif path == f"maternalRecords/{MOTHER_ID}":
            document["ownerUid"] = args.uid
        elif path.startswith("consentRecords/"):
            document.update(granted=False, grantedAt=None, revokedAt=None)

    def remap(value: object) -> object:
        if value in ("u_meera", "u_arjun") if isinstance(value, str) else False:
            return args.uid
        if isinstance(value, dict):
            return {key: remap(item) for key, item in value.items()}
        if isinstance(value, list):
            return [remap(item) for item in value]
        return value

    documents = {path: remap(document) for path, document in documents.items()}
    if any(path.startswith("users/u_") for path in documents):
        raise RuntimeError("A mock user ID remains in the Firestore seed.")

    if args.dry_run:
        print(f"Dry run OK: {len(documents)} fictional documents for the authenticated user.")
        print(f"Profile paths: users/{args.uid}, infantRecords/{INFANT_ID}, maternalRecords/{MOTHER_ID}")
        return 0

    project_number = os.environ.get("CRYSENSE_PROJECT_NUMBER")
    if not project_number:
        parser.error("Set CRYSENSE_PROJECT_NUMBER for Firestore API quota attribution.")
    writes = [
        {
            "update": {
                "name": f"projects/{args.project}/databases/(default)/documents/{path}",
                "fields": firestore_fields(document),
            }
        }
        for path, document in documents.items()
    ]
    body = json.dumps({"writes": writes}).encode("utf-8")
    request = Request(
        f"https://firestore.googleapis.com/v1/projects/{args.project}/databases/(default)/documents:commit",
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "X-Goog-User-Project": project_number,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=60) as response:
            result = json.load(response)
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Firestore commit failed (HTTP {exc.code}): {details}") from exc

    print(f"Seeded {len(result.get('writeResults', []))} fictional documents into Firestore.")
    print(f"Profiles: infantRecords/{INFANT_ID}, maternalRecords/{MOTHER_ID}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())