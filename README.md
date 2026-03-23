# ⬡ VORTEX v3 — Production YouTube Download Dashboard

> **Phase 3 · Portfolio-Grade · Open Source · 100% Free**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## Table of Contents

1. [Product Requirements Document (PRD)](#-product-requirements-document)
2. [System Architecture](#-system-architecture)
3. [Feature List](#-feature-list)
4. [Tech Stack](#-tech-stack)
5. [Project Structure](#-project-structure)
6. [Quick Start](#-quick-start)
7. [Free Deployment Guide](#-free-deployment-guide-step-by-step)
8. [API Reference](#-api-reference)
9. [Configuration](#-configuration)
10. [Security](#-security)
11. [Keyboard Shortcuts](#-keyboard-shortcuts)
12. [Troubleshooting](#-troubleshooting)
13. [Roadmap](#-roadmap)
14. [License](#-license)

---

## 📋 Product Requirements Document

### Overview

**VORTEX v3** is a production-grade, open-source YouTube media downloader built as a
portfolio engineering project. It demonstrates real-time systems design, modular backend
architecture, LAN networking, and premium UI/UX design — all running 100% locally and
100% free.

### Problem Statement

Existing download tools are either: ugly CLI scripts, abandoned unmaintained apps, or
sketchy web services that harvest data. VORTEX is a demonstration that a download tool
can be *engineered properly* — with real-time feedback, proper concurrency, security
layers, and a UI that looks like a real SaaS product.

### Goals

| Goal | Metric |
|------|--------|
| Fast info fetching | < 3s with cache hit |
| Concurrent downloads | Up to 3 simultaneous |
| Real-time updates | < 200ms WebSocket latency |
| LAN multi-user | Unlimited devices on same WiFi |
| Security | LAN-only API guard, rate limiting |
| Installability | PWA, one-command startup |

### Non-Goals

- NOT a public web service
- NOT meant for commercial use
- NOT for downloading copyrighted content you don't have rights to

### User Personas

**Primary: Developer/Power User (Local)**
- Runs the server on their machine
- Uses full download + queue features
- May share with household devices

**Secondary: Visitor (Demo Mode)**
- Arrives at GitHub Pages / Vercel deployment
- Sees landing page with feature highlights
- Gets instructions to run locally

### Success Criteria

- [x] Downloads work reliably with retry on failure
- [x] UI updates in real-time without page refresh
- [x] Multiple people on LAN see the same queue
- [x] Looks professional enough to show in a portfolio
- [x] Zero paid services required

---

## 🏗 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     HYBRID SYSTEM                           │
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │   PUBLIC DEMO MODE   │  │     LOCAL FULL MODE          │ │
│  │                      │  │                              │ │
│  │  GitHub Pages /      │  │  localhost:3001              │ │
│  │  Vercel              │  │  192.168.x.x:3001            │ │
│  │                      │  │                              │ │
│  │  Landing page only   │  │  Full app + API + WS         │ │
│  │  No backend calls    │  │  LAN multi-user              │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
│                                                             │
│              Mode auto-detected by hostname                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    LOCAL BACKEND                            │
│                                                             │
│  server.js                                                  │
│  ├── Helmet (security headers)                              │
│  ├── Compression (gzip)                                     │
│  ├── Morgan (HTTP logging)                                  │
│  ├── LAN Guard (IP allowlist)                               │
│  ├── Rate Limiter (120 req/min global, 15/min downloads)    │
│  ├── Optional Token Auth                                    │
│  │                                                          │
│  ├── /api  → routes/api.js                                  │
│  │          ├── controllers/downloadController.js           │
│  │          ├── queue/queueManager.js                       │
│  │          ├── services/infoCache.js                       │
│  │          └── services/fileManager.js                     │
│  │                                                          │
│  ├── /downloads → static (downloads folder)                 │
│  └── Socket.io → real-time queue broadcasts                 │
└─────────────────────────────────────────────────────────────┘

Download Flow:
  User → POST /api/download → queueManager.add()
       → queueManager.processNext()
       → spawn yt-dlp (with args)
       → parse stdout progress lines
       → io.emit('queue:snapshot', ...)
       → all browsers update in real-time
```

### Data Flow Diagram

```
Browser A ──┐
Browser B ──┼──► Express Server
Browser C ──┘         │
                  Socket.io
                      │
            ┌─────────▼─────────┐
            │    Queue Manager   │
            │  (in-memory Map)   │
            │                   │
            │  pending → yt-dlp │
            │  downloading      │
            │  completed/failed │
            └─────────┬─────────┘
                      │ spawn
                  yt-dlp process
                      │ stdout
                  parse progress
                      │ emit
              io.emit('queue:snapshot')
                      │
            ┌─────────▼─────────┐
            │   All Browsers    │
            │  update together  │
            └───────────────────┘
```

---

## 🔥 Feature List

### Core Features

| Feature | Status | Details |
|---------|--------|---------|
| YouTube info fetch | ✅ | Title, thumbnail, duration, channel, views |
| MP4 download | ✅ | 360p / 720p / 1080p with format merge |
| MP3 extraction | ✅ | Best quality audio via ffmpeg |
| Multi-download queue | ✅ | 3 concurrent, configurable |
| Real-time progress | ✅ | Socket.io WebSocket, % + speed + ETA |
| Auto-retry | ✅ | Up to 2 retries on failure |
| Priority levels | ✅ | High / Normal / Low per item |
| LAN multi-user | ✅ | All users see shared queue live |
| Playlist support | ✅ | Batch queue from playlist URL |
| File manager | ✅ | List, delete, download, open folder |
| Subtitle download | ✅ | SRT format via yt-dlp flag |
| Thumbnail download | ✅ | JPG via yt-dlp + embed option |
| Info cache | ✅ | 30-min LRU, 50 entries max |
| Dark / Light theme | ✅ | Persisted to localStorage |
| PWA installable | ✅ | manifest.json + standalone display |
| Keyboard shortcuts | ✅ | Ctrl+K focus, Escape blur |
| Drag & drop URL | ✅ | Drop URL text onto input zone |
| Cancel download | ✅ | SIGTERM to yt-dlp process |

### Security Features

| Feature | Details |
|---------|---------|
| LAN IP guard | Blocks requests from non-RFC-1918 IPs |
| Rate limiting | 120 req/min general, 15/min download endpoint |
| Optional token auth | `VORTEX_TOKEN` env var |
| Helmet.js headers | XSS protection, HSTS, etc. |
| Path traversal protection | `path.basename()` on all filenames |

---

## 🧱 Tech Stack

### Backend
| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ | Runtime |
| Express | 4.18 | HTTP framework |
| Socket.io | 4.7 | WebSocket real-time |
| Helmet | 7.1 | Security headers |
| Compression | 1.7 | Gzip responses |
| express-rate-limit | 7.1 | Rate limiting |
| Morgan | 1.10 | HTTP logging |
| yt-dlp | latest | YouTube download engine |
| ffmpeg | latest | Audio/video conversion |

### Frontend
| Tool | Purpose |
|------|---------|
| Vanilla JS | No framework needed |
| CSS custom properties | Theming |
| Socket.io client | Real-time updates |
| Outfit (Google Fonts) | Display typography |
| Fira Code (Google Fonts) | Monospace data |

---

## 📂 Project Structure

```
vortex-v3/
├── backend/
│   ├── server.js                    ← Entry point: Express + Socket.io
│   ├── package.json
│   ├── routes/
│   │   └── api.js                   ← All REST route definitions
│   ├── controllers/
│   │   └── downloadController.js    ← Business logic for all endpoints
│   ├── queue/
│   │   └── queueManager.js          ← State machine + yt-dlp executor
│   ├── services/
│   │   ├── infoCache.js             ← LRU cache for video metadata
│   │   └── fileManager.js           ← Downloads folder management
│   ├── middleware/
│   │   ├── lanGuard.js              ← IP allowlist (LAN only)
│   │   └── rateLimiter.js           ← Rate limiting per IP
│   └── utils/
│       └── logger.js                ← Colored console logger
│
├── frontend/
│   ├── index.html                   ← Landing + App (mode-switched)
│   ├── manifest.json                ← PWA manifest
│   ├── css/
│   │   └── style.css                ← All styles (dark/light/animations)
│   └── js/
│       ├── mode.js                  ← Detects local vs demo mode
│       └── app.js                   ← Full application logic
│
├── downloads/                       ← Output folder (auto-created)
├── scripts/
│   └── start.sh                     ← One-click start script
├── .gitignore
├── package.json                     ← Root scripts
└── README.md                        ← This file
```

---

## ⚡ Quick Start

### Prerequisites

**1. Node.js v18+**
```
https://nodejs.org/en/download
```

**2. yt-dlp**
```bash
# macOS / Linux (recommended)
pip install yt-dlp

# macOS Homebrew
brew install yt-dlp

# Windows
winget install yt-dlp

# Keep it updated
yt-dlp -U
```

**3. ffmpeg**
```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian
sudo apt update && sudo apt install ffmpeg

# Windows (Chocolatey)
choco install ffmpeg

# Windows (manual)
# Download from https://ffmpeg.org/download.html
# Add to PATH
```

### Install and Run

```bash
# 1. Clone or download the project
git clone https://github.com/your-username/vortex.git
cd vortex/backend

# 2. Install Node dependencies
npm install

# 3. Start the server
node server.js
```

The server prints your LAN URL:
```
╔════════════════════════════════════════════════════════╗
║         VORTEX v3 — Production Downloader              ║
╠════════════════════════════════════════════════════════╣
║  Local   → http://localhost:3001                       ║
║  Network → http://192.168.1.42:3001                    ║
╚════════════════════════════════════════════════════════╝
```

Open `http://localhost:3001` in your browser. Done!

---

## 🌍 Free Deployment Guide (Step-by-Step)

### Strategy Overview

```
┌──────────────────────────────────────────────────────┐
│  WHAT GETS DEPLOYED PUBLICLY (safe, demo only)       │
│  → frontend/ folder (HTML + CSS + JS)                │
│  → Shows landing page to public visitors             │
│  → No download functionality when no backend         │
│                                                      │
│  WHAT STAYS LOCAL (never public)                     │
│  → backend/ (Node.js server)                         │
│  → yt-dlp process execution                          │
│  → downloads/ folder                                 │
└──────────────────────────────────────────────────────┘
```

---

### Option A: GitHub Pages (Completely Free)

GitHub Pages hosts static files for free. Perfect for the demo frontend.

#### Step 1 — Create GitHub Repository

1. Go to https://github.com/new
2. Name it `vortex` (or anything you like)
3. Make it **Public** (required for free GitHub Pages)
4. Click **Create repository**

#### Step 2 — Initialize Git

```bash
cd vortex-v3
git init
git add .
git commit -m "feat: initial VORTEX v3"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/vortex.git
git push -u origin main
```

#### Step 3 — Enable GitHub Pages

1. Go to your repo → **Settings** tab
2. Scroll to **Pages** in the left sidebar
3. Under **Source**, select **Deploy from a branch**
4. Select branch: `main`, folder: `/ (root)` — BUT we need to serve from `frontend/`

**Trick: Use a `gh-pages` branch with just the frontend:**

```bash
# Create an orphan branch with only the frontend
git checkout --orphan gh-pages
git reset --hard
cp -r frontend/* .
git add .
git commit -m "deploy: frontend for GitHub Pages"
git push origin gh-pages
```

Then in Settings → Pages → Branch: `gh-pages` / folder: `/ (root)`

5. Click **Save**
6. Wait ~2 minutes. Your site will be live at:
   ```
   https://YOUR-USERNAME.github.io/vortex/
   ```

#### Step 4 — Update links (optional)

Edit `frontend/index.html` — update the GitHub link:
```html
<a href="https://github.com/YOUR-USERNAME/vortex" ...>
```

---

### Option B: Vercel (Free Tier, Easier)

Vercel auto-detects and deploys static sites with zero config.

#### Step 1 — Push to GitHub (same as above)

#### Step 2 — Connect Vercel

1. Go to https://vercel.com
2. Sign up with GitHub (free)
3. Click **New Project**
4. Import your `vortex` repository
5. In **Configure Project**:
   - **Framework Preset**: Other
   - **Root Directory**: `frontend`  ← important!
   - **Build Command**: *(leave empty)*
   - **Output Directory**: `.`
6. Click **Deploy**

Your site will be live at:
```
https://vortex-YOUR-USERNAME.vercel.app
```

#### Custom Domain (Optional, Free)

Vercel gives you a free `*.vercel.app` subdomain. If you have your own domain, you can
add it in Project Settings → Domains (free SSL included).

---

### Option C: Netlify (Free Tier)

1. Go to https://netlify.com → Sign up free
2. Click **Add new site** → **Import an existing project**
3. Connect GitHub → select your repo
4. Build settings:
   - **Base directory**: `frontend`
   - **Build command**: *(leave empty)*
   - **Publish directory**: `frontend`
5. Click **Deploy site**

Live at: `https://random-name.netlify.app`

---

### Running Backend Locally with Public Frontend

When your public Vercel/GitHub Pages frontend loads, `mode.js` detects it's NOT on
localhost and shows the landing page — no backend calls are made.

When you run the server locally and visit `http://localhost:3001`, the locally-served
frontend detects localhost and activates full mode automatically.

**You don't need to change any code between modes.**

---

### Automating with GitHub Actions (Optional)

Create `.github/workflows/deploy.yml` to auto-deploy on push:

```yaml
name: Deploy Frontend

on:
  push:
    branches: [main]
    paths:
      - 'frontend/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./frontend
          publish_branch: gh-pages
```

Now every push that touches `frontend/` auto-deploys. Free CI/CD.

---

## 📡 API Reference

All endpoints require `x-vortex-token` header if `VORTEX_TOKEN` env is set.

### GET `/api/health`

Returns server status and dependency checks.

**Response:**
```json
{
  "status": "ok",
  "version": "3.0.0",
  "uptime": 3600,
  "dependencies": {
    "ytdlp": true,
    "ffmpeg": true,
    "ytdlpVersion": "2024.01.01"
  },
  "connectedUsers": 2,
  "cache": { "size": 5, "maxSize": 50, "ttlMin": 30 },
  "disk": { "count": 12, "totalHuman": "345.67 MB", "path": "/..." }
}
```

### POST `/api/info`

Fetch video metadata (with caching).

**Body:** `{ "url": "https://youtube.com/watch?v=..." }`

**Response:**
```json
{
  "title": "Video Title",
  "thumbnail": "https://...",
  "duration": "4:23",
  "channel": "Channel Name",
  "viewCount": "1,234,567",
  "availableQualities": ["360p", "720p", "1080p"],
  "fromCache": false
}
```

### POST `/api/download`

Add a download to the queue.

**Body:**
```json
{
  "url": "https://youtube.com/watch?v=...",
  "title": "Video Title",
  "thumbnail": "https://...",
  "duration": "4:23",
  "channel": "Channel Name",
  "format": "mp4",
  "quality": "720p",
  "priority": "normal",
  "withSubtitles": false,
  "withThumbnail": false
}
```

### POST `/api/download/batch`

Queue multiple downloads at once.

**Body:** `{ "items": [ {...}, {...} ] }` (max 50)

### GET `/api/queue`

Get full queue snapshot.

### DELETE `/api/queue/:id`

Remove item from queue (cancels if active).

### POST `/api/queue/:id/retry`

Retry a failed or cancelled item.

### POST `/api/queue/:id/cancel`

Cancel an active download.

### PATCH `/api/queue/:id/priority`

**Body:** `{ "priority": "high" | "normal" | "low" }`

### GET `/api/files`

List downloaded files.

### DELETE `/api/files/:filename`

Delete a downloaded file.

### POST `/api/files/open-folder`

Open downloads folder in OS file explorer.

### POST `/api/playlist`

Fetch playlist entries.

**Body:** `{ "url": "https://youtube.com/playlist?list=..." }`

---

## ⚙️ Configuration

Set environment variables before starting:

```bash
# Server port (default: 3001)
PORT=3001

# Optional access token (blank = no auth)
VORTEX_TOKEN=mysecrettoken123

# Max concurrent downloads (default: 3)
MAX_CONCURRENT=3

# Disable LAN guard for testing (default: false)
DISABLE_LAN_GUARD=false

# Log level: error | warn | info | http | debug (default: info)
LOG_LEVEL=info
```

**Example with custom config:**
```bash
PORT=8080 MAX_CONCURRENT=5 VORTEX_TOKEN=abc123 node server.js
```

**Or create a `.env` file** (add `dotenv` package if you want):
```
PORT=3001
MAX_CONCURRENT=3
VORTEX_TOKEN=
LOG_LEVEL=info
```

---

## 🔐 Security

### LAN Guard

By default, the `/api` endpoints are only accessible from private network IPs:
- `127.x.x.x` (localhost)
- `10.x.x.x`
- `172.16–31.x.x`
- `192.168.x.x`

Requests from public IPs get `403 Forbidden`.

To disable (not recommended): `DISABLE_LAN_GUARD=true`

### Rate Limiting

- **General API**: 120 requests/minute per IP
- **Download endpoint**: 15 requests/minute per IP

### Optional Token

Set `VORTEX_TOKEN=yoursecret` to require the `x-vortex-token` header on all API calls.
The frontend reads this from a prompt or localStorage (extend as needed).

### Path Traversal Prevention

All filenames from user input are sanitized with `path.basename()` before any file
operations.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` or `Cmd+K` | Focus URL input |
| `Escape` | Blur URL input |
| `Enter` (in URL field) | Fetch info |

---

## 🛠 Troubleshooting

### "yt-dlp: command not found"
```bash
pip install yt-dlp
# or
pip3 install yt-dlp
# Verify:
yt-dlp --version
```

### "ffmpeg: command not found"
```bash
# macOS:  brew install ffmpeg
# Ubuntu: sudo apt install ffmpeg
# Verify: ffmpeg -version
```

### "Cannot connect to backend" in browser
- Make sure `node server.js` is running in `/backend` directory
- Check the terminal for any startup errors
- Make sure no firewall is blocking port 3001

### Download fails immediately
1. Check that yt-dlp is up to date: `yt-dlp -U`
2. Try the URL directly in terminal: `yt-dlp "URL"`
3. Some videos require age verification or are region-locked

### LAN access not working
- Check that all devices are on the same WiFi network (not guest network)
- Check Windows Firewall → allow Node.js on private networks
- Try: `DISABLE_LAN_GUARD=true node server.js` to test

### Port already in use
```bash
PORT=3002 node server.js
```

---

## 🗺 Roadmap

### Phase 4 (Planned)

- [ ] Download speed graph (Chart.js)
- [ ] Persistent history (SQLite / JSON file)
- [ ] User-defined output filename template
- [ ] Scheduled downloads
- [ ] Browser extension for one-click add
- [ ] Docker image for easy deployment
- [ ] Support for other platforms (SoundCloud, Vimeo, etc.)
- [ ] Discord / Telegram notification on completion

---

## 📄 License

MIT License — free to use, modify, and distribute.

Download only content you have the right to download.
Respect YouTube's Terms of Service.
This project is for educational and portfolio purposes.

---

*Built with ♥ using Node.js, Socket.io, yt-dlp, ffmpeg, and a lot of CSS.*
