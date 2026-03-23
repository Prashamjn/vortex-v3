#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# VORTEX v3 — One-click start script
# Usage: ./scripts/start.sh
# ──────────────────────────────────────────────────────────────────

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  ⬡  VORTEX v3 — Starting up"
echo -e "${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}✗ Node.js not found. Install from https://nodejs.org${NC}"
  exit 1
fi
NODE_VER=$(node -v)
echo -e "${GREEN}✓ Node.js ${NODE_VER}${NC}"

# Check yt-dlp
if ! command -v yt-dlp &> /dev/null; then
  echo -e "${YELLOW}⚠ yt-dlp not found. Run: pip install yt-dlp${NC}"
else
  YTDLP_VER=$(yt-dlp --version)
  echo -e "${GREEN}✓ yt-dlp ${YTDLP_VER}${NC}"
fi

# Check ffmpeg
if ! command -v ffmpeg &> /dev/null; then
  echo -e "${YELLOW}⚠ ffmpeg not found. MP4 merging and MP3 conversion may fail.${NC}"
else
  echo -e "${GREEN}✓ ffmpeg found${NC}"
fi

# Install npm packages if needed
BACKEND_DIR="$(cd "$(dirname "$0")/../backend" && pwd)"
if [ ! -d "$BACKEND_DIR/node_modules" ]; then
  echo -e "\n${CYAN}Installing npm packages…${NC}"
  cd "$BACKEND_DIR" && npm install
fi

echo -e "\n${GREEN}Starting server…${NC}\n"
cd "$BACKEND_DIR"
node server.js
