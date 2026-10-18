# One image, two Cloud Run services: set SERVICE=baby or SERVICE=mother.
# Build from the repository root so /shared (reviewed rules) is included:
#   docker build -f backend/Dockerfile -t crysense-api .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    SERVICE=baby \
    SHARED_DIR=/app/shared

WORKDIR /app
COPY backend/requirements.txt backend/requirements-google.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-google.txt

COPY backend/crysense ./crysense
COPY backend/baby_api ./baby_api
COPY backend/mother_api ./mother_api
COPY shared ./shared

RUN useradd --create-home appuser
USER appuser

CMD exec uvicorn ${SERVICE}_api.main:app --host 0.0.0.0 --port ${PORT}
