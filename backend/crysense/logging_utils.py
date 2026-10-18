"""Redacted request logging: method, route template, status and latency only.
Never logs bodies, audio, transcripts or health fields."""
from __future__ import annotations

import logging
import time

from fastapi import FastAPI, Request

logger = logging.getLogger("crysense")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


def install_request_logging(app: FastAPI, service: str) -> None:
    @app.middleware("http")
    async def _log(request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        route = request.scope.get("route")
        template = getattr(route, "path", "unmatched")
        logger.info("%s %s %s %d %.0fms", service, request.method, template, response.status_code, (time.perf_counter() - start) * 1000)
        return response
