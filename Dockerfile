FROM python:3.11-slim-bookworm

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PORT=8000

# Install ffmpeg and system dependencies including fonts for Arabic video text rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    fonts-hosny-amiri \
    fonts-dejavu-core \
    fonts-kacst \
    && rm -rf /var/lib/apt/lists/*

# Install python requirements
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Pre-cache and pre-compile the tiny whisper model during build so startup and transcription are instant (<2s)
RUN python -c "from faster_whisper import WhisperModel; m = WhisperModel('tiny', device='cpu', compute_type='int8'); import numpy as np; list(m.transcribe(np.zeros(8000, dtype=np.float32), language='ar', beam_size=1)[0])"

# Copy source code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Clean any invalid font artifacts and download official Cairo font for viral Reels/TikTok styling
RUN mkdir -p /app/backend/fonts && \
    rm -f /app/backend/fonts/Cairo-Bold.ttf && \
    curl -L -s -o /app/backend/fonts/Cairo.ttf https://raw.githubusercontent.com/google/fonts/main/ofl/cairo/Cairo%5Bslnt%2Cwght%5D.ttf || true

WORKDIR /app/backend

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
