/**
 * VORTEX v3 — app.js
 * ──────────────────────────────────────────────────────────────────
 * Auth flow:
 *  1. Page loads → checkHealth()
 *  2. If 401 → show token modal, block all other API calls
 *  3. User enters token → verified → saved → app unlocked
 *  4. All subsequent API calls include token header automatically
 * ──────────────────────────────────────────────────────────────────
 */

'use strict';

const API = `${window.location.protocol}//${window.location.host}/api`;

// ── State ──────────────────────────────────────────────────────────
const S = {
  format:      'mp4',
  quality:     '720p',
  videoData:   null,
  isFetching:  false,
  // Locked = waiting for token. Starts locked if no saved token.
  locked:      true,
  token:       sessionStorage.getItem('vx-token') || '',
  theme:       localStorage.getItem('vx-theme')   || 'dark',
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
themeBtn.addEventListener('click', () =>
  applyTheme(S.theme === 'dark' ? 'light' : 'dark')
);

// ── API fetch helper — injects token header on every call ──────────
function apiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (S.token) headers['x-vortex-token'] = S.token;
  return fetch(`${API}${path}`, { ...opts, headers });
}

// ── Token modal ────────────────────────────────────────────────────
function showTokenModal(errMsg = '') {
  S.locked = true;
  tokenModal.classList.remove('hidden');
  tokenError.textContent = errMsg;
  // Small delay so modal renders before focusing
  setTimeout(() => tokenInput.focus(), 50);
}

function hideTokenModal() {
  S.locked = false;
  tokenModal.classList.add('hidden');
  tokenError.textContent = '';
  tokenInput.value = '';
}

// Unlock button click
tokenSubmit.addEventListener('click', async () => {
  const t = tokenInput.value.trim();
  if (!t) {
    tokenError.textContent = 'Please enter the access token.';
    return;
  }

  tokenSubmit.disabled = true;
  tokenSubmit.textContent = 'Checking…';

  try {
    const r = await fetch(`${API}/health`, {
      headers: { 'x-vortex-token': t },
    });

    if (r.status === 401) {
      tokenError.textContent = 'Wrong token — try again.';
      tokenSubmit.disabled = false;
      tokenSubmit.textContent = 'Unlock →';
      tokenInput.select();
      return;
    }

    // Token accepted
    S.token = t;
    sessionStorage.setItem('vx-token', t);
    tokenSubmit.disabled = false;
    tokenSubmit.textContent = 'Unlock →';
    hideTokenModal();
    checkHealth();

  } catch {
    tokenError.textContent = 'Could not reach server. Is it running?';
    tokenSubmit.disabled = false;
    tokenSubmit.textContent = 'Unlock →';
  }
});

tokenInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') tokenSubmit.click();
});

// ── Health check ───────────────────────────────────────────────────
async function checkHealth() {
  try {
    const r = await apiFetch('/health');

    // Server requires a token and we don't have one (or it's wrong)
    if (r.status === 401) {
      showTokenModal();
      setStatus('error', 'Token required');
      return;
    }

    // Mark as unlocked — safe to make other API calls now
    S.locked = false;

    const d = await r.json();

    if (d.dependencies?.ytdlp && d.dependencies?.ffmpeg) {
      setStatus('online', 'Ready');
    } else if (!d.dependencies?.ytdlp) {
      setStatus('error', 'yt-dlp missing');
      showToast(
        'yt-dlp is not installed on the server. Redeploy to fix.',
        'error', 10000
      );
    } else {
      setStatus('warn', 'ffmpeg missing');
      showToast(
        'ffmpeg not found on server. MP3 conversion may fail.',
        'error', 8000
      );
    }
  } catch {
    setStatus('error', 'Offline');
    showToast('Cannot reach server. Is it running?', 'error');
  }
}

function setStatus(cls, txt) {
  sDot.className    = `s-dot ${cls}`;
  sText.textContent = txt;
}

// ── URL validation ─────────────────────────────────────────────────
function isYT(url) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)/.test(url);
}

// ── Paste button ───────────────────────────────────────────────────
pasteBtn.addEventListener('click', async () => {
  if (S.locked) return;
  try {
    const t = await navigator.clipboard.readText();
    urlInput.value = t.trim();
    pasteBtn.style.color = 'var(--blue)';
    setTimeout(() => (pasteBtn.style.color = ''), 600);
    if (isYT(urlInput.value)) fetchInfo();
  } catch {
    showToast('Clipboard denied — paste manually (Ctrl+V)', 'info');
  }
});

// Drag and drop
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  if (!S.locked) dropZone.classList.add('dz-over');
});
dropZone.addEventListener('dragleave', () =>
  dropZone.classList.remove('dz-over')
);
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dz-over');
  if (S.locked) return;
  const t =
    e.dataTransfer.getData('text/plain') ||
    e.dataTransfer.getData('text/uri-list');
  if (t) {
    urlInput.value = t.trim();
    if (isYT(t)) fetchInfo();
  }
});

// Auto-fetch on paste — ONLY if not locked
urlInput.addEventListener('paste', () => {
  setTimeout(() => {
    if (!S.locked && isYT(urlInput.value.trim())) fetchInfo();
  }, 80);
});

urlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !S.locked) fetchInfo();
});

fetchBtn.addEventListener('click', () => {
  if (!S.locked) fetchInfo();
});

// ── Fetch video info ───────────────────────────────────────────────
async function fetchInfo() {
  if (S.locked) {
    showToast('Enter the access token first.', 'info');
    showTokenModal();
    return;
  }

  const url = urlInput.value.trim();
  if (!url)       { showToast('Paste a YouTube URL first.', 'info');             return; }
  if (!isYT(url)) { showToast("That doesn't look like a YouTube URL.", 'error'); return; }
  if (S.isFetching) return;

  S.isFetching = true;
  setFetchLoading(true);

  stepInput.classList.add('hidden');
  stepPreview.classList.remove('hidden');
  skeleton.style.display   = 'flex';
  videoInfo.classList.add('hidden');
  controls.classList.add('hidden');

  try {
    const res = await apiFetch('/info', {
      method: 'POST',
      body:   JSON.stringify({ url }),
    });

    // Token expired mid-session
    if (res.status === 401) {
      showTokenModal('Session expired. Re-enter your token.');
      goBackToInput();
      return;
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch info.');

    S.videoData = data;

    vThumb.src         = data.thumbnail || '';
    vDur.textContent   = data.duration  || '—';
    vTitle.textContent = data.title     || '—';
    vChannel.innerHTML =
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">` +
      `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ` +
      esc(data.channel);
    vViews.textContent = `👁 ${data.viewCount} views`;
    cacheChip.classList.toggle('hidden', !data.fromCache);

    updateQualityBtns(data.availableQualities || ['360p', '720p', '1080p']);
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
  fetchBtn.disabled          = on;
  fetchLabel.style.opacity   = on ? '0' : '1';
  fetchSpinner.style.opacity = on ? '1' : '0';
}

function goBackToInput() {
  skeleton.style.display = 'none';
  stepPreview.classList.add('hidden');
  stepInput.classList.remove('hidden');
}

// ── Format / Quality selectors ─────────────────────────────────────
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
    for (const q of ['720p', '1080p', '360p']) {
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

// Build stream URL including token as query param
function updateDownloadHref() {
  if (!S.videoData) return;
  const params = new URLSearchParams({
    url:     urlInput.value.trim(),
    format:  S.format,
    quality: S.quality,
    title:   S.videoData.title || 'download',
  });
  if (S.token) params.set('token', S.token);
  downloadBtn.href = `${API}/stream?${params}`;
}

// Show feedback message when download link is clicked
downloadBtn.addEventListener('click', e => {
  if (!S.videoData) { e.preventDefault(); return; }
  dlFeedback.classList.remove('hidden');
  const fmt = S.format.toUpperCase();
  const q   = S.format === 'mp3' ? '' : ` · ${S.quality}`;
  dlFbText.textContent =
    `Preparing ${fmt}${q} — your browser will prompt you to save the file.`;
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
    if (!S.locked) { urlInput.focus(); urlInput.select(); }
    e.preventDefault();
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
// checkHealth() will either unlock the app (no token needed / token in storage)
// or show the token modal (401 response)
checkHealth();
