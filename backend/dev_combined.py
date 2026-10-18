"""Local development only: serve both APIs from ONE process so they share the
in-memory store, the way they share Firestore in production.

    uvicorn dev_combined:app --port 8081 --reload
Then point both VITE_BABY_API_URL and VITE_MOTHER_API_URL at http://localhost:8081.
In Cloud Run the two services stay separate, with separate service accounts.
"""
from baby_api.main import app as baby_app
from mother_api.main import app as mother_app

MOTHER_PREFIXES = ("/v1/mothers", "/v1/screening", "/v1/shared")


async def app(scope, receive, send):
    if scope["type"] in ("http", "websocket") and scope["path"].startswith(MOTHER_PREFIXES):
        await mother_app(scope, receive, send)
    else:
        await baby_app(scope, receive, send)
