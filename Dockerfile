# ──────────────────────────────────────────────────────────────────
# VORTEX v3 — Dockerfile  (Railway optimised)
# ──────────────────────────────────────────────────────────────────

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# ── System packages ───────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    python3 \
    python3-pip \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ── Node.js 20 LTS ───────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── yt-dlp — try pip first, fall back to direct binary download ───
# pip3 install with --break-system-packages works on Ubuntu 22.04+
# The || fallback downloads the binary directly from GitHub releases
RUN pip3 install --break-system-packages -q yt-dlp \
    || pip3 install -q yt-dlp \
    || (wget -q "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
        -O /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp)

# Make sure yt-dlp is on PATH and executable regardless of install method
RUN which yt-dlp && yt-dlp --version

# ── App setup ────────────────────────────────────────────────────
WORKDIR /app

# Install Node deps first (cached layer — only re-runs if package.json changes)
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production --silent

# Copy app code
COPY backend/  ./backend/
COPY frontend/ ./frontend/

# ── Runtime env ──────────────────────────────────────────────────
# Railway injects PORT automatically — do NOT hardcode it
ENV NODE_ENV=production \
    VORTEX_PUBLIC=true \
    TRUST_PROXY=1 \
    LOG_LEVEL=info

EXPOSE 3001

CMD ["node", "backend/server.js"]
