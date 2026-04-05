FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# System packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget python3 python3-pip ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Node.js 20 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp WITH the default dependency group
# "yt-dlp[default]" installs yt-dlp-ejs which is REQUIRED for YouTube
# since yt-dlp v2025.11.12 — without it, signature solving always fails
RUN pip3 install --break-system-packages -U "yt-dlp[default]"

# Verify installations
RUN yt-dlp --version && node --version && ffmpeg -version | head -1

# Configure yt-dlp:
# - Use Node.js as JS runtime (it's already installed above)
# - Download EJS challenge solver scripts from GitHub at runtime
# These two lines are the PERMANENT fix for signature solving failures
RUN mkdir -p /root/.config/yt-dlp && printf \
    '--js-runtimes node\n--remote-components ejs:github\n' \
    > /root/.config/yt-dlp/config

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm install --production --silent

COPY backend/  ./backend/
COPY frontend/ ./frontend/

RUN if [ -f ./backend/cookies.txt ]; then \
      echo "cookies.txt found"; \
    else \
      echo "No cookies.txt — anonymous mode"; \
    fi

ENV NODE_ENV=production \
    VORTEX_PUBLIC=true \
    TRUST_PROXY=1 \
    LOG_LEVEL=info

EXPOSE 3001

CMD ["node", "backend/server.js"]
