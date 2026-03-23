# ──────────────────────────────────────────────────────────────────
# VORTEX v3 — Dockerfile
# Use this for Railway, Render, or any Docker-based deployment.
# Build: docker build -t vortex .
# Run:   docker run -p 3001:3001 -e VORTEX_TOKEN=secret -e VORTEX_PUBLIC=true vortex
# ──────────────────────────────────────────────────────────────────

FROM ubuntu:22.04

# Avoid interactive prompts during apt installs
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget python3 python3-pip ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install -q yt-dlp

# App directory
WORKDIR /app

# Copy and install Node dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# Copy the rest of the project
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Expose port
EXPOSE 3001

# Environment defaults (override at runtime)
ENV PORT=3001 \
    NODE_ENV=production \
    VORTEX_PUBLIC=true \
    TRUST_PROXY=1 \
    LOG_LEVEL=info

# Start
CMD ["node", "backend/server.js"]
