# ============================================================
# OSCA Backend - Production Dockerfile
# Multi-stage build: builder → runtime
# ============================================================

# --- Stage 1: Builder ---
FROM python:3.12-slim-bullseye AS builder

WORKDIR /build

# Install system deps for OpenCV, InsightFace, WeasyPrint
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libgomp1 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    libssl-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create venv to isolate dependencies
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# --- Stage 2: Runtime ---
FROM python:3.12-slim-bullseye AS runtime

WORKDIR /app

# Runtime-only system libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libgomp1 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy venv from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Non-root user for security
RUN useradd -m -u 1001 appuser && chown appuser:appuser /app
USER appuser

COPY --chown=appuser:appuser . .

EXPOSE 8000

# Production entrypoint is mode-aware:
#   SERVICE_MODE=celery  -> background worker (face enrollment, reports, housekeeping)
#   (default)            -> API server (single Uvicorn worker + threads; insightface is memory-heavy)
CMD ["sh", "-c", "if [ \"$SERVICE_MODE\" = \"celery\" ]; then exec celery -A app.workers.celery_app worker --loglevel=info --concurrency=1; else exec gunicorn app.main:app --worker-class uvicorn.workers.UvicornWorker --workers 1 --threads 4 --bind 0.0.0.0:8000 --timeout 180 --keep-alive 5 --access-logfile - --error-logfile -; fi"]
