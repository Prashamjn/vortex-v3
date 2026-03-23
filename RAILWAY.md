# 🚂 Deploy VORTEX on Railway — Complete Step-by-Step Guide

Railway is the easiest way to deploy VORTEX so your friends can use it.
Free tier gives $5 credit/month which covers ~500 hours of runtime.

---

## What goes in the GitHub repo?

**Push the ENTIRE project folder.** Railway reads the `Dockerfile`
at the root and builds everything automatically.

```
your-repo/                  ← root of GitHub repo
├── Dockerfile              ← Railway reads this first
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   └── utils/
├── frontend/
│   ├── index.html
│   ├── css/
│   └── js/
├── .gitignore              ← keeps secrets out of repo
├── README.md
└── RAILWAY.md              ← this file
```

**DO NOT push:**
- `node_modules/` (in .gitignore — Railway installs them inside Docker)
- `.env` (in .gitignore — set secrets in Railway dashboard instead)
- Any downloaded mp4/mp3 files

---

## Step 1 — Create your GitHub repository

### On GitHub.com:
1. Go to https://github.com/new
2. Repository name: `vortex` (or any name)
3. Visibility: **Private** ← important, keeps your code private
4. Click **Create repository**

### On your Windows PC (PowerShell):

```powershell
# Navigate to your project folder
cd "C:\Users\VICTUS\Downloads\vortex-v3 (1)\Youtube Downloader"

# Initialize git
git init

# Stage all files
git add .

# First commit
git commit -m "initial commit"

# Connect to GitHub (replace YOUR_USERNAME and YOUR_REPO_NAME)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Push
git branch -M main
git push -u origin main
```

> If git asks for your GitHub password, use a **Personal Access Token** instead:
> GitHub → Settings → Developer Settings → Personal Access Tokens → Tokens (classic) → Generate new token
> Check the `repo` scope → Generate → copy the token → paste it as your password

---

## Step 2 — Create Railway account

1. Go to https://railway.app
2. Click **Login** → **Login with GitHub**
3. Authorize Railway to access your GitHub
4. You're in — Railway dashboard opens

---

## Step 3 — Create a new project on Railway

1. Click **New Project** (top right)
2. Select **Deploy from GitHub repo**
3. If asked, click **Configure GitHub App** and give Railway access to your repo
4. Select your `vortex` repository from the list
5. Click **Deploy Now**

Railway will:
- Clone your repo
- Find the `Dockerfile` at the root
- Build the Docker image (takes 3–5 minutes first time)
- Start the container

You'll see build logs streaming in real time.

---

## Step 4 — Set environment variables (CRITICAL)

While the build runs, set your secrets:

1. In Railway, click on your **service** (the vortex box)
2. Click the **Variables** tab
3. Add these variables one by one:

| Variable | Value | Notes |
|----------|-------|-------|
| `VORTEX_PUBLIC` | `true` | Enables internet access mode |
| `VORTEX_TOKEN` | `your_secret_here` | The password your friends will enter |
| `TRUST_PROXY` | `1` | Makes rate limiting work correctly |
| `LOG_LEVEL` | `info` | Logging verbosity |

**To generate a strong token**, run this in PowerShell:
```powershell
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```
Copy the output and use it as `VORTEX_TOKEN`.

> ⚠ Railway automatically injects the `PORT` variable — do NOT add it yourself.

4. After adding all variables, Railway **automatically redeploys**.

---

## Step 5 — Get your public URL

1. Click the **Settings** tab on your service
2. Scroll to **Networking** section
3. Click **Generate Domain**
4. Railway gives you a URL like: `vortex-production-xxxx.up.railway.app`

Visit that URL — VORTEX should load and ask for the token!

---

## Step 6 — Test it yourself

1. Open your Railway URL in browser
2. A token modal will appear — enter your `VORTEX_TOKEN`
3. Paste a YouTube URL
4. Click Fetch → pick format → Download
5. File should download directly to your device ✅

---

## Step 7 — Share with friends

Send them this message:
```
🎬 Hey! Use this to download YouTube videos:

Link:  https://your-railway-url.up.railway.app
Token: paste-your-VORTEX_TOKEN-here

Steps:
1. Open the link
2. Enter the token when asked
3. Paste any YouTube URL
4. Choose MP4 (video) or MP3 (audio)
5. Click Download — file saves to your device!
```

---

## Updating the app later

Whenever you make changes to the code:

```powershell
# In your project folder
git add .
git commit -m "update: describe what you changed"
git push
```

Railway **automatically detects the push and redeploys**. Takes ~3 minutes.

---

## Monitoring & Logs

- **Railway Dashboard** → your service → **Logs** tab
- See every request, download, error in real time
- Useful for debugging if something goes wrong

---

## Free tier limits

Railway's free tier ($5/month credit):

| Resource | Free amount |
|----------|-------------|
| Runtime | ~500 hours/month |
| RAM | 512 MB |
| CPU | Shared |
| Bandwidth | 100 GB/month |
| Sleep | Does NOT sleep (unlike Render) |

Tips to stay within limits:
- VORTEX uses ~50–100 MB RAM at rest
- Each download briefly spikes CPU while yt-dlp runs
- 100 GB bandwidth = thousands of video downloads per month

---

## Troubleshooting

### Build fails with "pip" error
The Dockerfile uses the yt-dlp binary directly (not pip) — this is already fixed.
Make sure you're pushing the latest `Dockerfile` from this project.

### "Cannot find module" error
Railway didn't install dependencies. Check that `backend/package.json` exists
in your repo. Never commit `node_modules/`.

### Token modal doesn't appear / 401 error
Check that `VORTEX_TOKEN` is set in Railway Variables tab.
If you just added it, wait for the automatic redeploy to finish.

### Download fails / yt-dlp error
yt-dlp needs updates frequently. SSH isn't available on Railway free tier,
but you can trigger a fresh build:
- Go to your service → **Deployments** tab → **Redeploy**
- This rebuilds the Docker image and installs the latest yt-dlp binary

Or add this to your Dockerfile to always get latest:
```dockerfile
RUN wget -q "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
    -O /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp
```
(Already included in the current Dockerfile.)

### Service went to sleep / cold start
Railway free tier does NOT sleep (unlike Render). If it's slow, it's the
yt-dlp download taking time — that's normal for longer videos.

### Out of free credits
Railway sends email warnings. If you run out:
- Upgrade to $5/month (Hobby plan) — gets you $5 credit on top of usage
- Or switch to Oracle Cloud Free Tier (genuinely free forever)

---

## Custom Domain (Optional, Free)

1. Get a free subdomain from https://freedns.afraid.org or https://duckdns.org
2. In Railway → Settings → Networking → **Custom Domain**
3. Enter your domain (e.g. `vortex.duckdns.org`)
4. Railway shows you a CNAME record to add at your DNS provider
5. Add it → wait 10 min → done, HTTPS works automatically

---

## Quick Reference

| Action | How |
|--------|-----|
| View logs | Railway dashboard → service → Logs |
| Change token | Variables tab → edit VORTEX_TOKEN → auto-redeploys |
| Redeploy manually | Deployments tab → Redeploy |
| Update code | `git push` → Railway auto-detects |
| Get URL | Settings → Networking → Domain |
