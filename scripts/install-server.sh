#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# VORTEX v3 — Ubuntu/Debian VPS Setup Script
# Run this ONCE on a fresh server after SSH-ing in.
# Tested on Ubuntu 22.04 LTS (the free tier on most providers).
#
# Usage:
#   chmod +x install-server.sh
#   sudo bash install-server.sh
# ──────────────────────────────────────────────────────────────────

set -e
GREEN='\033[0;32m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
ok()  { echo -e "${GREEN}✓ $1${NC}"; }
log() { echo -e "${CYAN}→ $1${NC}"; }
err() { echo -e "${RED}✗ $1${NC}"; exit 1; }

[[ $EUID -ne 0 ]] && err "Run as root: sudo bash install-server.sh"

log "Updating package lists…"
apt-get update -qq

log "Installing system packages…"
apt-get install -y -qq \
  curl wget git unzip \
  python3 python3-pip \
  ffmpeg \
  nginx \
  certbot python3-certbot-nginx

ok "System packages installed"

log "Installing Node.js 20 LTS…"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null
apt-get install -y -qq nodejs
ok "Node.js $(node -v) installed"

log "Installing yt-dlp…"
pip3 install -q yt-dlp
ok "yt-dlp $(yt-dlp --version) installed"

log "Installing PM2 (process manager)…"
npm install -g pm2 -q
ok "PM2 installed"

echo ""
ok "All dependencies installed!"
echo ""
echo "Next steps:"
echo "  1. Upload your project to the server (see README)"
echo "  2. cd vortex-v3/backend && npm install"
echo "  3. Copy .env.example to .env and fill in your token"
echo "  4. pm2 start server.js --name vortex"
echo "  5. Configure Nginx (see nginx.conf in scripts/)"
echo "  6. Run certbot for HTTPS (see README)"
