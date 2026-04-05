FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget python3 python3-pip ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Always install the LATEST yt-dlp binary directly from GitHub
# This avoids getting an outdated version from pip
RUN wget -q "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
    -O /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

RUN which yt-dlp && yt-dlp --version
RUN which node && node --version

# Tell yt-dlp to use Node.js for JavaScript execution
ENV YOUTUBE_DL_JSINTERP=nodejs
ENV YTDLP_JSINTERP=nodejs

# yt-dlp config — use mweb client which works without signature solving
RUN mkdir -p /root/.config/yt-dlp && \
    printf '--extractor-args youtube:player_client=mweb,default\n' \
    > /root/.config/yt-dlp/config

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm install --production --silent

COPY backend/  ./backend/
COPY frontend/ ./frontend/

ENV NODE_ENV=production \
    VORTEX_PUBLIC=true \
    TRUST_PROXY=1 \
    LOG_LEVEL=info

EXPOSE 3001

CMD ["node", "backend/server.js"]
