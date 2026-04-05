FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget python3 python3-pip ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --upgrade pip && \
    pip3 install -U "yt-dlp[default]"

RUN yt-dlp --version && node --version && ffmpeg -version | head -1

RUN mkdir -p /root/.config/yt-dlp && \
    echo '--js-runtimes node' > /root/.config/yt-dlp/config && \
    echo '--remote-components ejs:github' >> /root/.config/yt-dlp/config

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
