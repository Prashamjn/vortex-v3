FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# ─────────────────────────────────────────────
# System dependencies
# ─────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget python3 python3-pip ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ─────────────────────────────────────────────
# Node.js 20 LTS
# ─────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# ─────────────────────────────────────────────
# Fix pip + install yt-dlp properly
# ─────────────────────────────────────────────
RUN python3 -m pip install --upgrade pip \
    && python3 -m pip install "yt-dlp[default]"

# ─────────────────────────────────────────────
# Verify installations (helps debugging Railway builds)
# ─────────────────────────────────────────────
RUN yt-dlp --version && node --version && ffmpeg -version | head -1

# ─────────────────────────────────────────────
# yt-dlp global config (IMPORTANT 🔥)
# ─────────────────────────────────────────────
RUN mkdir -p /root/.config/yt-dlp && printf \
    '--js-runtimes node\n--remote-components ejs:github\n' \
    > /root/.config/yt-dlp/config

# ─────────────────────────────────────────────
# App setup
# ─────────────────────────────────────────────
WORKDIR /app

# Install backend deps (better caching)
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production --silent

# Copy rest of project
COPY backend/  ./backend/
COPY frontend/ ./frontend/

# Optional: cookies check
RUN if [ -f ./backend/cookies.txt ]; then \
      echo "cookies.txt found"; \
    else \
      echo "No cookies.txt — anonymous mode"; \
    fi

# ─────────────────────────────────────────────
# Environment
# ─────────────────────────────────────────────
ENV NODE_ENV=production \
    VORTEX_PUBLIC=true \
    TRUST_PROXY=1 \
    LOG_LEVEL=info

EXPOSE 3001

# ─────────────────────────────────────────────
# Start server
# ─────────────────────────────────────────────
CMD ["node", "backend/server.js"]
