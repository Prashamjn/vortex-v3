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

# ── yt-dlp ───────────────────────────────────────────────────────
RUN pip3 install --break-system-packages -q yt-dlp \
    || pip3 install -q yt-dlp \
    || (wget -q "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
        -O /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp)

# Verify both tools are accessible
RUN which yt-dlp && yt-dlp --version
RUN which node && node --version

# ── CRITICAL: tell yt-dlp to use Node.js as its JavaScript runtime ─
# YouTube's player requires JS execution to decrypt video URLs.
# yt-dlp defaults to "deno" which is NOT installed — we must point
# it explicitly to Node.js so it can run YouTube's player scripts.
# YOUTUBE_DL_JSINTERP=nodejs overrides the runtime selection globally.
ENV YOUTUBE_DL_JSINTERP=nodejs
ENV YTDLP_JSINTERP=nodejs

# Also create a yt-dlp config file to enforce nodejs as the JS interpreter
RUN mkdir -p /root/.config/yt-dlp && \
    echo '--extractor-args "youtube:player_client=web,default"' \
    > /root/.config/yt-dlp/config

# ── App setup ────────────────────────────────────────────────────
WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm install --production --silent

COPY backend/  ./backend/
COPY frontend/ ./frontend/

# Check if cookies.txt was included
RUN if [ -f ./backend/cookies.txt ]; then \
      echo "cookies.txt found — yt-dlp will use browser cookies"; \
    else \
      echo "cookies.txt not found — requests are anonymous"; \
    fi

# ── Runtime env ──────────────────────────────────────────────────
ENV NODE_ENV=production \
    VORTEX_PUBLIC=true \
    TRUST_PROXY=1 \
    LOG_LEVEL=info

EXPOSE 3001

CMD ["node", "backend/server.js"]
