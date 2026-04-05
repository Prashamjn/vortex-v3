'use strict';

const { exec, spawn } = require('child_process');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { v4: uuid } = require('uuid');
const infoCache = require('../services/infoCache');
const logger    = require('../utils/logger');

// ── Cookies file ──
const COOKIES_FILE = path.join(__dirname, '..', 'cookies.txt');
const COOKIES_ARGS = fs.existsSync(COOKIES_FILE)
  ? ['--cookies', COOKIES_FILE]
  : [];

if (COOKIES_ARGS.length) {
  logger.info('[ytdlp] cookies.txt found — using browser cookies');
} else {
  logger.info('[ytdlp] no cookies.txt — requests are anonymous (may hit 429)');
}

// ── Helpers ──
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
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  webm: 'video/webm',
};

// ── Controllers ──

async function health(req, res) {
  let ytdlp = false, ffmpeg = false;

  try { await execAsync('yt-dlp --version'); ytdlp = true; } catch {}
  try { await execAsync('ffmpeg -version'); ffmpeg = true; } catch {}

  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    dependencies: { ytdlp, ffmpeg },
  });
}

// ✅ FIXED getInfo (no nodeFlag)
async function getInfo(req, res) {
  const { url } = req.body;

  if (!isValidYouTubeUrl(url))
    return res.status(400).json({ error: 'Invalid YouTube URL.' });

  const cached = infoCache.get(url);
  if (cached) return res.json({ ...cached, fromCache: true });

  try {
    const cookieFlag = COOKIES_ARGS.length ? COOKIES_ARGS.join(' ') + ' ' : '';

    const raw = await execAsync(
      `yt-dlp ${cookieFlag}--dump-json --no-playlist "${url}"`
    );

    const info = JSON.parse(raw);

    const payload = {
      title: info.title,
      thumbnail: info.thumbnail,
      duration: fmtDuration(info.duration),
      channel: info.uploader || 'Unknown',
      viewCount: info.view_count || 0,
      fromCache: false,
    };

    infoCache.set(url, payload);
    res.json(payload);

  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: 'Failed to fetch info' });
  }
}

// ── STREAM ──
async function stream(req, res) {
  const { url, format = 'mp4', quality = '720p', title = 'download' } = req.query;

  if (!isValidYouTubeUrl(url))
    return res.status(400).json({ error: 'Invalid URL' });

  const safeTitle = sanitizeTitle(title);
  const ext = format === 'mp3' ? 'mp3' : 'mp4';
  const filename = `${safeTitle}.${ext}`;

  res.setHeader('Content-Type', MIME[ext]);
  res.setHeader('Content-Disposition', contentDisposition(filename));

  // ✅ MP3 (no NODEJS_ARGS)
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

    const proc = spawn('yt-dlp', args);

    proc.stdout.pipe(res);

    proc.on('close', () => {
      if (!res.writableEnded) res.end();
    });

    return;
  }

  // ✅ MP4 (no NODEJS_ARGS)
  const h = { '360p': 360, '720p': 720, '1080p': 1080 }[quality] || 720;
  const tmpFile = path.join(os.tmpdir(), `vortex_${uuid()}.mp4`);

  const args = [
    url,
    ...COOKIES_ARGS,
    '-f',
    `bestvideo[height<=${h}]+bestaudio/best`,
    '--merge-output-format', 'mp4',
    '-o', tmpFile,
    '--no-playlist',
  ];

  const proc = spawn('yt-dlp', args);

  proc.on('close', () => {
    const fileStream = fs.createReadStream(tmpFile);
    fileStream.pipe(res);

    fileStream.on('close', () => unlink(tmpFile));
  });
}

module.exports = { health, getInfo, stream };
