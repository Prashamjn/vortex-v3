/**
 * VORTEX v3 — app.js
 * ──────────────────────────────────────────────────────────────────
 * Handles token auth transparently:
 *   - On first load, calls /api/health
 *   - If 401 → shows token input modal
 *   - Token saved in sessionStorage (cleared when tab closes)
 *   - All /api/info and /api/stream calls include the token
 * ──────────────────────────────────────────────────────────────────
 */

'use strict';

const API = `${window.location.protocol}//${window.location.host}/api`;

// ── State ──────────────────────────────────────────────────────────
const S = {
  format:     'mp4',
  quality:    '720p',
  videoData:  null,
  isFetching: false,
  token:      sessionStorage.getItem('vx-token') || '',
  theme:      localStorage.getItem('vx-theme')   || 'dark',
};

// ── DOM refs ───────────────────────────────────────────────────────
const $id = id => document.getElementById(id);

const urlInput     = $id('urlInput');
const fetchBtn     = $id('fetchBtn');
const fetchLabel   = $id('fetchLabel');
const fetchSpinner = $id('fetchSpinner');
const pasteBtn     = $id('pasteBtn');
const dropZone     = $id('dropZone');
const stepInput    = $id('stepInput');
const stepPreview  = $id('stepPreview');
const skeleton     = $id('skeleton');
const videoInfo    = $id('videoInfo');
const controls     = $id('controls');
const vThumb       = $id('vThumb');
const vDur         = $id('vDur');
const vTitle       = $id('vTitle');
const vChannel     = $id('vChannel');
const vViews       = $id('vViews');
const cacheChip    = $id('cacheChip');
const fmtSeg       = $id('fmtSeg');
const qualSeg      = $id('qualSeg');
const qualityRow   = $id('qualityRow');
const downloadBtn  = $id('downloadBtn');
const dlFeedback   = $id('dlFeedback');
const dlFbText     = $id('dlFeedbackText');
const resetBtn     = $id('resetBtn');
const sDot         = $id('sDot');
const sText        = $id('sText');
const themeBtn     = $id('themeBtn');
const toastStack   = $id('toastStack');
// Token modal
const tokenModal   = $id('tokenModal');
const tokenInput   = $id('tokenInput');
const tokenSubmit  = $id('tokenSubmit');
const tokenError   = $id('tokenError');

// ── Theme ──────────────────────────────────────────────────────────
function applyTheme(t) {
  document.documentElement.dataset.theme = t === 'light' ? 'light' : '';
  $id('iconMoon').classList.toggle('hidden', t === 'light');
  $id('iconSun').classList.toggle('hidden',  t !== 'light');
  localStorage.setItem('vx-theme', t);
  S.theme = t;
}
applyTheme(S.theme);
themeBtn.addEventListener('click', () => applyTheme(S.theme === 'dark' ? 'light' : 'dark'));

// ── Fetch helper — always injects token header ─────────────────────
function apiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (S.token) headers['x-vortex-token'] = S.token;
  return fetch(`${API}${path}`, { ...opts, headers });
}

// ── Token modal ────────────────────────────────────────────────────
function showTokenModal(errMsg = '') {
  tokenModal.classList.remove('hidden');
  tokenInput.focus();
  tokenError.textContent = errMsg;
}

function hideTokenModal() {
  tokenModal.classList.add('hidden');
  tokenError.textContent = '';
}

tokenSubmit.addEventListener('click', async () => {
  const t = tokenInput.value.trim();
  if (!t) { tokenError.textContent = 'Please enter the access token.'; return; }
  // Test the token against health endpoint
  const r = await fetch(`${API}/health`, { headers: { 'x-vortex-token': t } });
  if (r.status === 401) {
    tokenError.textContent = 'Wrong token. Try again.';
    return;
  }
  S.token = t;
  sessionStorage.setItem('vx-token', t);
  hideTokenModal();
  await checkHealth();
});

tokenInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') tokenSubmit.click();
});

// ── Health check ───────────────────────────────────────────────────
async function checkHealth() {
  try {
    const r = await apiFetch('/health');
    if (r.status === 401) { showTokenModal(); return; }
    const d = await r.json();
    if (d.dependencies?.ytdlp && d.dependencies?.ffmpeg) {
      setStatus('online', 'Ready');
    } else if (!d.dependencies?.ytdlp) {
      setStatus('error', 'yt-dlp missing');
      showToast('yt-dlp not installed on server. Run: pip install yt-dlp', 'error', 9000);
    } else {
      setStatus('warn', 'ffmpeg missing');
      showToast('ffmpeg missing on server. MP3 / 1080p merging may fail.', 'error', 7000);
    }
  } catch {
    setStatus('error', 'Offline');
    showToast('Cannot reach backend. Is the server running?', 'error');
  }
}

function setStatus(cls, txt) {
  sDot.className  = `s-dot ${cls}`;
  sText.textContent = txt;
}

// ── URL validation ─────────────────────────────────────────────────
function isYT(url) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)/.test(url);
}

// ── Paste ──────────────────────────────────────────────────────────
pasteBtn.addEventListener('click', async () => {
  try {
    const t = await navigator.clipboard.readText();
    urlInput.value = t.trim();
    pasteBtn.style.color = 'var(--blue)';
    setTimeout(() => (pasteBtn.style.color = ''), 600);
    if (isYT(urlInput.value)) fetchInfo();
  } catch { showToast('Clipboard denied — paste manually (Ctrl+V)', 'info'); }
});

// Drag and drop URL
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dz-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dz-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('dz-over');
  const t = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
  if (t) { urlInput.value = t.trim(); if (isYT(t)) fetchInfo(); }
});

// Auto-fetch on paste
urlInput.addEventListener('paste', () => {
  setTimeout(() => { if (isYT(urlInput.value.trim())) fetchInfo(); }, 80);
});
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') fetchInfo(); });
fetchBtn.addEventListener('click', fetchInfo);

// ── Fetch video info ───────────────────────────────────────────────
async function fetchInfo() {
  const url = urlInput.value.trim();
  if (!url)      { showToast('Paste a YouTube URL first.', 'info');            return; }
  if (!isYT(url)){ showToast("That doesn't look like a YouTube URL.", 'error'); return; }
  if (S.isFetching) return;

  S.isFetching = true;
  setFetchLoading(true);

  stepInput.classList.add('hidden');
  stepPreview.classList.remove('hidden');
  skeleton.style.display   = 'flex';
  videoInfo.classList.add('hidden');
  controls.classList.add('hidden');

  try {
    const res  = await apiFetch('/info', {
      method: 'POST',
      body:   JSON.stringify({ url }),
    });

    if (res.status === 401) {
      showTokenModal('Session expired. Enter token again.');
      goBackToInput(); return;
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch info.');

    S.videoData = data;

    vThumb.src         = data.thumbnail || '';
    vDur.textContent   = data.duration  || '—';
    vTitle.textContent = data.title     || '—';
    vChannel.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${esc(data.channel)}`;
    vViews.textContent = `👁 ${data.viewCount} views`;
    cacheChip.classList.toggle('hidden', !data.fromCache);

    updateQualityBtns(data.availableQualities || ['360p','720p','1080p']);
    updateDownloadHref();

    skeleton.style.display = 'none';
    videoInfo.classList.remove('hidden');
    controls.classList.remove('hidden');

  } catch (err) {
    showToast(err.message, 'error');
    goBackToInput();
  } finally {
    S.isFetching = false;
    setFetchLoading(false);
  }
}

function setFetchLoading(on) {
  fetchBtn.classList.toggle('loading', on);
  fetchBtn.disabled        = on;
  fetchLabel.style.opacity  = on ? '0' : '1';
  fetchSpinner.style.opacity = on ? '1' : '0';
}

function goBackToInput() {
  skeleton.style.display = 'none';
  stepPreview.classList.add('hidden');
  stepInput.classList.remove('hidden');
}

// ── Segment controls ───────────────────────────────────────────────
function bindSeg(el, key, onChange) {
  el.addEventListener('click', e => {
    const btn = e.target.closest('.seg-btn');
    if (!btn || btn.disabled) return;
    el.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    S[key] = btn.dataset.val;
    if (onChange) onChange(btn.dataset.val);
    updateDownloadHref();
  });
}

bindSeg(fmtSeg, 'format', val => {
  qualityRow.classList.toggle('hidden', val === 'mp3');
});
bindSeg(qualSeg, 'quality');

function updateQualityBtns(available) {
  qualSeg.querySelectorAll('.seg-btn').forEach(b => {
    b.disabled = !available.includes(b.dataset.val);
  });
  const cur = qualSeg.querySelector(`.seg-btn[data-val="${S.quality}"]`);
  if (cur?.disabled) {
    for (const q of ['720p','1080p','360p']) {
      const b = qualSeg.querySelector(`.seg-btn[data-val="${q}"]`);
      if (b && !b.disabled) {
        qualSeg.querySelectorAll('.seg-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        S.quality = q;
        break;
      }
    }
  }
}

/**
 * Build the stream URL and assign to the download anchor.
 * Token is included as a query param so it rides along with the
 * browser navigation (fetch headers can't be set on <a href> clicks).
 */
function updateDownloadHref() {
  if (!S.videoData) return;
  const params = new URLSearchParams({
    url:     urlInput.value.trim(),
    format:  S.format,
    quality: S.quality,
    title:   S.videoData.title || 'download',
  });
  // Include token in query string for the stream request
  if (S.token) params.set('token', S.token);
  downloadBtn.href = `${API}/stream?${params}`;
}

// Show feedback when download starts
downloadBtn.addEventListener('click', e => {
  if (!S.videoData) { e.preventDefault(); return; }
  dlFeedback.classList.remove('hidden');
  const fmt = S.format.toUpperCase();
  const q   = S.format === 'mp3' ? '' : ` · ${S.quality}`;
  dlFbText.textContent = `Preparing ${fmt}${q} — your browser will prompt you to save the file.`;
  setTimeout(() => dlFeedback.classList.add('hidden'), 15000);
});

// ── Reset ──────────────────────────────────────────────────────────
resetBtn.addEventListener('click', () => {
  urlInput.value = '';
  S.videoData    = null;
  dlFeedback.classList.add('hidden');
  controls.classList.add('hidden');
  videoInfo.classList.add('hidden');
  stepPreview.classList.add('hidden');
  stepInput.classList.remove('hidden');
  urlInput.focus();
});

// ── Keyboard shortcuts ─────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    urlInput.focus(); urlInput.select(); e.preventDefault();
  }
  if (e.key === 'Escape' && !tokenModal.classList.contains('hidden')) {
    // Don't close modal on Escape if no token set — user must authenticate
    if (S.token) hideTokenModal();
  }
});

// ── Toasts ─────────────────────────────────────────────────────────
const ICONS = {
  success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
};

function showToast(msg, type = 'info', ms = 4500) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${ICONS[type] || ICONS.info}<span>${esc(msg)}</span>`;
  toastStack.appendChild(el);
  el.addEventListener('click', () => dismissToast(el));
  setTimeout(() => dismissToast(el), ms);
}

function dismissToast(el) {
  if (!el.parentNode) return;
  el.classList.add('out');
  setTimeout(() => el.remove(), 300);
}

function esc(s) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(s || '')));
  return d.innerHTML;
}

// ── Init ───────────────────────────────────────────────────────────
checkHealth();
