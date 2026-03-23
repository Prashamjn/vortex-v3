# 🚀 VORTEX v3 — Free Deployment Guide

Share VORTEX with your friends over the internet using a **free cloud VPS**.
Your friends visit a URL, enter a secret token, and download YouTube videos —
no installs needed on their end.

---

## Architecture Overview

```
Your Friends' Browsers
        │  HTTPS
        ▼
  [Your Domain]
  vortex.yourname.com
        │
   [Nginx on VPS]         ← Free Oracle / Render VPS
   Reverse proxy
   + SSL termination
        │  http://localhost:3001
        ▼
   [Node.js Server]
   VORTEX v3 backend
        │  spawn
        ▼
   [yt-dlp process]
   streams to stdout
        │  pipe
        ▼
   HTTP Response → Browser Save Dialog
```

---

## Step 0 — Prerequisites on your local machine

- Git installed
- A GitHub account (free)

---

## Option A — Oracle Cloud Free Tier ⭐ RECOMMENDED

Oracle gives you **2 VMs free forever** with 1 GB RAM each.
No credit card expiry, genuinely permanent free tier.

### A1. Create Oracle Cloud Account

1. Go to https://cloud.oracle.com/free
2. Sign up (requires credit card for verification — you won't be charged)
3. Choose your **Home Region** (pick closest to you/your friends)
4. Complete identity verification

### A2. Create a Free VM

1. In Oracle Cloud Console → **Compute** → **Instances** → **Create Instance**
2. Change the image to: **Ubuntu 22.04** (click "Change Image")
3. Shape: **VM.Standard.E2.1.Micro** (the free one — 1 OCPU, 1 GB RAM)
4. Under **Add SSH Keys**: upload your SSH public key
   - On Windows: use PuTTYgen or `ssh-keygen` in PowerShell
   - Key location: `C:\Users\YOU\.ssh\id_rsa.pub`
5. Click **Create**

### A3. Open Port 80 and 443 in Oracle Firewall

Oracle has TWO firewalls. You must open both:

**Cloud Security List (online console):**
1. Go to your instance → **Subnet** → **Default Security List**
2. Add Ingress Rules:
   - Port 80  (HTTP)  — Source: 0.0.0.0/0
   - Port 443 (HTTPS) — Source: 0.0.0.0/0

**OS-level firewall (on the server via SSH):**
```bash
sudo iptables -I INPUT -p tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### A4. SSH into your server

```bash
# Windows PowerShell / macOS Terminal
ssh ubuntu@YOUR_SERVER_IP
```

---

## Option B — Render.com (Zero Setup, But Limited)

Render offers a free web service tier. Limitation: **spins down after 15 min inactivity**
(first request after sleep takes ~30s). Good for testing, not ideal for regular use.

1. Go to https://render.com → Sign up with GitHub
2. New → **Web Service**
3. Connect your GitHub repo
4. Settings:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. Environment Variables (in Render dashboard):
   - `VORTEX_PUBLIC` = `true`
   - `VORTEX_TOKEN`  = `your_secret_here`
   - `PORT`          = `10000` (Render sets this automatically)
   - `TRUST_PROXY`   = `1`
6. Click **Deploy**

⚠ **Limitation**: yt-dlp and ffmpeg may not be available on Render's free containers.
You'd need to add them to a Dockerfile. Use Oracle for a simpler experience.

---

## Option C — Railway.app (Easiest, $5 free credits)

Railway gives $5 free monthly credits — enough for ~500 hours of a small container.

1. Go to https://railway.app → sign up with GitHub
2. New Project → **Deploy from GitHub Repo**
3. Select your repo
4. Add environment variables:
   - `VORTEX_PUBLIC=true`
   - `VORTEX_TOKEN=your_secret`
   - `TRUST_PROXY=1`
5. In service settings → **Root Directory**: `backend`
6. Railway auto-detects Node.js and runs `npm start`
7. Go to **Settings** → **Networking** → **Generate Domain**

⚠ yt-dlp and ffmpeg need to be installed. Add a `Dockerfile` (see below).

---

## Full Setup — Oracle VPS (The Recommended Path)

### Step 1 — SSH into your server

```bash
ssh ubuntu@YOUR_SERVER_IP
```

### Step 2 — Run the install script

```bash
# Download and run the installer
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/vortex/main/scripts/install-server.sh | sudo bash
```

Or manually:

```bash
sudo apt-get update
sudo apt-get install -y git python3-pip ffmpeg nginx certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs
sudo pip3 install yt-dlp
sudo npm install -g pm2
```

### Step 3 — Upload your project to the server

**Option A: via Git (recommended)**
```bash
# On your server:
cd /root
git clone https://github.com/YOUR_USERNAME/vortex.git vortex-v3
```

**Option B: via SCP from your Windows machine**
```powershell
# In PowerShell on your PC:
scp -r "C:\path\to\vortex-v3" ubuntu@YOUR_SERVER_IP:/root/
```

### Step 4 — Install Node.js dependencies

```bash
cd /root/vortex-v3/backend
npm install --production
```

### Step 5 — Configure environment variables

```bash
cp .env.example .env
nano .env
```

Edit the file:
```
PORT=3001
VORTEX_PUBLIC=true
VORTEX_TOKEN=generate_a_strong_secret_here
LOG_LEVEL=info
TRUST_PROXY=1
```

**Generate a strong token:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy the output — this is your VORTEX_TOKEN
# Share this string with your friends
```

### Step 6 — Test the server manually

```bash
cd /root/vortex-v3/backend
VORTEX_PUBLIC=true VORTEX_TOKEN=yourtoken PORT=3001 node server.js
```

Visit `http://YOUR_SERVER_IP:3001` in your browser.
Press Ctrl+C to stop.

### Step 7 — Start with PM2 (keeps it running forever)

```bash
cd /root/vortex-v3

# Edit pm2.config.js first — set your real token and path
nano scripts/pm2.config.js

# Start
pm2 start scripts/pm2.config.js

# Make it survive server reboots
pm2 save
pm2 startup
# ↑ This prints a command. Copy and run it.
```

**Useful PM2 commands:**
```bash
pm2 status          # see if it's running
pm2 logs vortex     # view live logs
pm2 restart vortex  # restart after code changes
pm2 stop vortex     # stop
```

### Step 8 — Configure Nginx

```bash
# Copy the config
sudo cp /root/vortex-v3/scripts/nginx.conf /etc/nginx/sites-available/vortex

# Edit it — replace YOUR_DOMAIN
sudo nano /etc/nginx/sites-available/vortex

# Enable it
sudo ln -s /etc/nginx/sites-available/vortex /etc/nginx/sites-enabled/

# Remove default nginx page
sudo rm -f /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t

# Apply
sudo systemctl reload nginx
```

Now visit `http://YOUR_SERVER_IP` — VORTEX should load!

### Step 9 — Get a Free Domain Name

A proper domain makes sharing easier. Free options:

**FreeDNS (afraid.org) — completely free:**
1. Go to https://freedns.afraid.org → Sign up free
2. Subdomains → Add → pick a subdomain (e.g. `vortex.mooo.com`)
3. Point it to your server IP
4. Wait 5–10 min for DNS propagation

**DuckDNS — very simple:**
1. Go to https://duckdns.org → sign in with Google
2. Add a subdomain (e.g. `myvortex.duckdns.org`)
3. Enter your server IP → Update IP

### Step 10 — Enable HTTPS (Free SSL via Let's Encrypt)

```bash
# Replace YOUR_DOMAIN with your actual domain (e.g. vortex.mooo.com)
sudo certbot --nginx -d YOUR_DOMAIN
```

Follow the prompts. Certbot will:
- Automatically verify you own the domain
- Issue a free SSL certificate
- Modify your Nginx config to use HTTPS
- Set up auto-renewal

After this, your friends access VORTEX at:
```
https://YOUR_DOMAIN
```

---

## Step 11 — Share with Friends

Send your friends:

```
🎬 VORTEX Download Tool

URL:   https://YOUR_DOMAIN
Token: paste-the-VORTEX_TOKEN-value-here

How to use:
1. Open the URL in your browser
2. Enter the token when prompted
3. Paste any YouTube URL
4. Pick MP4 or MP3 + quality
5. Click Download — file saves directly to your device!
```

---

## Updating yt-dlp (important — do this regularly)

YouTube frequently changes its format. Update yt-dlp on your server:

```bash
sudo pip3 install -U yt-dlp

# Restart VORTEX to pick up the new version
pm2 restart vortex
```

Set up a weekly auto-update:
```bash
crontab -e
# Add this line:
0 3 * * 0 pip3 install -U yt-dlp && pm2 restart vortex
```

---

## Troubleshooting

### "Cannot connect to backend"
```bash
pm2 status           # is vortex running?
pm2 logs vortex      # check for errors
sudo nginx -t        # nginx config OK?
sudo systemctl status nginx
```

### "yt-dlp error" on download
```bash
# Update yt-dlp
sudo pip3 install -U yt-dlp
# Test directly
yt-dlp "https://youtube.com/watch?v=dQw4w9WgXcQ"
```

### Port 80/443 not reachable
```bash
# Oracle Cloud: check Security List in console
# Also check OS firewall:
sudo iptables -L INPUT | grep -E "80|443"
sudo iptables -I INPUT -p tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### SSL certificate renewal
```bash
# Test renewal
sudo certbot renew --dry-run
# Certbot auto-renews via a cron job. Check with:
sudo systemctl status certbot.timer
```

### Server ran out of memory
```bash
free -h    # check RAM
pm2 monit  # check memory usage
# Add swap space:
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## Security Notes

- Your `VORTEX_TOKEN` is the only thing preventing public access.
  **Keep it secret. Don't post it publicly.**
- Change the token anytime by editing `.env` and running `pm2 restart vortex`.
- The LAN guard is OFF in public mode — Nginx + token is the security layer.
- Rate limits: 60 API requests/min and 5 stream requests/min per IP.
- Consider adding your server IP to Oracle's firewall **allowlist** if you want
  to restrict access to specific countries.

---

## Quick Reference Card

| Task | Command |
|------|---------|
| Start server | `pm2 start scripts/pm2.config.js` |
| Stop server | `pm2 stop vortex` |
| Restart | `pm2 restart vortex` |
| View logs | `pm2 logs vortex` |
| Update yt-dlp | `sudo pip3 install -U yt-dlp && pm2 restart vortex` |
| Renew SSL | `sudo certbot renew` |
| Edit config | `nano /root/vortex-v3/backend/.env` then restart |
| Nginx reload | `sudo systemctl reload nginx` |
