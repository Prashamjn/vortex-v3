'use strict';

const { exec, spawn } = require('child_process');
const fs        = require('fs');
const path      = require('path');
const os        = require('os');
const { v4: uuid } = require('uuid');
const infoCache = require('../services/infoCache');
const logger    = require('../utils/logger');

// ── Cookies (optional — fixes 429 on cloud IPs) ───────────────────
const COOKIES_FILE = path.join(__dirname, '..', 'cookies.txt');
const COOKIES_ARGS = fs.existsSync(COOKIES_FILE)
  ? ['--cookies', COOKIES_FILE]
  : [];

if (COOKIES_ARGS.length) {
  logger.info('[ytdlp] cookies.txt found — using browser cookies');
} else {
  logger.info('[ytdlp] no cookies.txt — anonymous mode');
}

// ── Helpers ───────────────────────────────────────────────────────

function execAsync(cmd) {
  return new Promise((resolve, reject) =>
    exec(cmd, { maxBuffer: 1024 * 1024 * 25 }, (err, stdout, stderr) =>
      err ? reject(new Error(stderr || err.message)) : resolve(stdout.trim())
    )
  );
}

function isValidYouTubeUrl(url) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/|playlist\?list=)|youtu\.be\/)/.test(url);
}

function fmtDuration(secs) {
  if (!secs) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${m}:${String(s).padStart(2,'0')}`;
}

function sanitizeTitle(title) {
  if (!title) return 'download';
  return (
    title
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 180)
  ) || 'download';
}

function contentDisposition(filename) {
  const ascii   = filename.replace(/[^\x20-\x7e]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function unlink(filePath) {
  try { fs.unlinkSync(filePath); } catch {}
}

const MIME = {
  mp4:  'video/mp4',
  mp3:  'audio/mpeg',
  m4a:  'audio/mp4',
  webm: 'video/webm',
};

// ── Controllers ───────────────────────────────────────────────────

/** GET /api/health */
async function health(req, res) {
  let ytdlp = false, ffmpeg = false, ytdlpVersion = null;
  try { ytdlpVersion = await execAsync('yt-dlp --version'); ytdlp = true; } catch {}
  try { await execAsync('ffmpeg -version'); ffmpeg = true; } catch {}
  res.json({
    status:  'ok',
    version: '3.0.0',
    uptime:  Math.round(process.uptime()),
    dependencies: { ytdlp, ffmpeg, ytdlpVersion },
    mode:  'stream',
    cache: infoCache.stats(),
  });
}

/** POST /api/info  { url } */
async function getInfo(req, res) {
  const { url } = req.body;

  if (!isValidYouTubeUrl(url))
    return res.status(400).json({ error: 'Invalid or missing YouTube URL.' });

  const cached = infoCache.get(url);
  if (cached) return res.json({ ...cached, fromCache: true });

  try {
    // Build args as array (safe — no shell injection from cookies path)
    const args = [
      ...COOKIES_ARGS,
      '--dump-json',
      '--no-playlist',
      url,
    ];

    // Use spawn instead of exec for safety, collect stdout
    const raw = await new Promise((resolve, reject) => {
      const proc = spawn('yt-dlp', args);
      let out = '';
      let err = '';
      proc.stdout.on('data', d => { out += d.toString(); });
      proc.stderr.on('data', d => { err += d.toString(); });
      proc.on('close', code => {
        if (code !== 0) return reject(new Error(err || 'yt-dlp failed'));
        resolve(out.trim());
      });
      proc.on('error', reject);
    });

    const info = JSON.parse(raw);

    // Collect available qualities
    const fmts = info.formats || [];
    const heights = new Set();
    for (const f of fmts) {
      if (f.height && f.vcodec !== 'none') {
        [360, 720, 1080].forEach(h => { if (f.height <= h) heights.add(`${h}p`); });
      }
    }
    const availableQualities = heights.size
      ? [...heights].sort((a, b) => parseInt(a) - parseInt(b))
      : ['360p', '720p', '1080p'];

    const payload = {
      title:     info.title,
      thumbnail: info.thumbnail,
      duration:  fmtDuration(info.duration),
      channel:   info.uploader || info.channel || 'Unknown',
      viewCount: info.view_count
        ? new Intl.NumberFormat().format(info.view_count)
        : 'N/A',
      availableQualities,
      fromCache: false,
    };

    infoCache.set(url, payload);
    res.json(payload);

  } catch (err) {
    const msg = err.message || '';
    logger.error(`[getInfo] ${msg.slice(0, 200)}`);

    if (msg.includes('429') || msg.includes('Too Many Requests')) {
      return res.status(500).json({
        error: 'YouTube is rate-limiting this server (429). Add cookies.txt and redeploy.',
      });
    }

    res.status(500).json({
      error: 'Failed to fetch video info. Ensure yt-dlp is installed and the URL is public.',
    });
  }
}

/** GET /api/stream?url=...&format=mp4|mp3&quality=720p&title=... */
async function stream(req, res) {
  const { url, format = 'mp4', quality = '720p', title = 'download' } = req.query;

  if (!isValidYouTubeUrl(url))
    return res.status(400).json({ error: 'Invalid YouTube URL.' });

  const safeTitle = sanitizeTitle(title);
  const ext       = format === 'mp3' ? 'mp3' : 'mp4';
  const filename  = `${safeTitle}.${ext}`;

  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Content-Disposition', contentDisposition(filename));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Encoding', 'identity');

  logger.info(`[stream] start format=${format} q=${quality} "${safeTitle}"`);

  // ── MP3: pipe directly (sequential format, pipe-safe) ────────────
  if (format === 'mp3') {
    const args = [
      url,
      ...COOKIES_ARGS,
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '-o', '-',
      '--no-playlist',
    ];

    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stdout.pipe(res);

    proc.stderr.on('data', chunk => {
      logger.debug(`[yt-dlp mp3] ${chunk.toString().trim().slice(0, 120)}`);
    });

    proc.on('close', code => {
      logger.info(`[stream] mp3 done code=${code}`);
      if (!res.writableEnded) res.end();
    });

    proc.on('error', err => {
      logger.error(`[stream] mp3 error: ${err.message}`);
      if (!res.headersSent) res.status(500).json({ error: 'yt-dlp failed to start.' });
      else if (!res.writableEnded) res.end();
    });

    // Kill yt-dlp if client disconnects
    req.on('close', () => {
      if (proc.exitCode === null) proc.kill('SIGTERM');
    });

    return;
  }

  // ── MP4: write to temp file first, then stream ────────────────────
  // MP4 container requires moov atoms written at end of file.
  // ffmpeg cannot seek a pipe so we must use a temp file.
  const h       = { '360p': 360, '720p': 720, '1080p': 1080 }[quality] || 720;
  const tmpFile = path.join(os.tmpdir(), `vortex_${uuid()}.mp4`);

  const args = [
    url,
    ...COOKIES_ARGS,
    '-f',
    [
      `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]`,
      `bestvideo[height<=${h}]+bestaudio`,
      `best[height<=${h}][ext=mp4]`,
      `best[height<=${h}]`,
      'best',
    ].join('/'),
    '--merge-output-format', 'mp4',
    '-o', tmpFile,
    '--no-playlist',
  ];

  const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  // Drain stdout (not used for mp4 — writing to file)
  proc.stdout.resume();

  proc.stderr.on('data', chunk => {
    logger.debug(`[yt-dlp mp4] ${chunk.toString().trim().slice(0, 120)}`);
  });

  proc.on('error', err => {
    logger.error(`[stream] mp4 spawn error: ${err.message}`);
    unlink(tmpFile);
    if (!res.headersSent) res.status(500).json({ error: 'yt-dlp failed to start.' });
    else if (!res.writableEnded) res.end();
  });

  proc.on('close', code => {
    if (code !== 0) {
      logger.error(`[stream] mp4 yt-dlp exited code=${code}`);
      unlink(tmpFile);
      if (!res.headersSent) res.status(500).json({ error: 'Download failed. Check the URL and try again.' });
      else if (!res.writableEnded) res.end();
      return;
    }

    // Verify file exists and has content
    let stat;
    try { stat = fs.statSync(tmpFile); } catch {
      logger.error('[stream] mp4 temp file missing after download');
      if (!res.headersSent) res.status(500).json({ error: 'Output file not found after download.' });
      return;
    }

    logger.info(`[stream] mp4 ready ${(stat.size / 1048576).toFixed(1)} MB — streaming`);

    // Send Content-Length so browser shows real progress bar
    res.setHeader('Content-Length', stat.size);

    const fileStream = fs.createReadStream(tmpFile);
    fileStream.pipe(res);

    fileStream.on('error', err => {
      logger.error(`[stream] file read error: ${err.message}`);
      unlink(tmpFile);
      if (!res.writableEnded) res.end();
    });

    // Delete temp file after streaming completes
    res.on('finish', () => {
      logger.info('[stream] mp4 streaming complete — deleting temp file');
      unlink(tmpFile);
    });

    res.on('close', () => unlink(tmpFile));
  });

  // Kill yt-dlp and cleanup if client disconnects before download finishes
  req.on('close', () => {
    if (proc.exitCode === null) {
      logger.info('[stream] client disconnected — killing yt-dlp');
      proc.kill('SIGTERM');
      unlink(tmpFile);
    }
  });
}

module.exports = { health, getInfo, stream };
