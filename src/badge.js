// Draws Tab Peek's icons:
//   - the "number on favicon" overlay: the tab's own favicon with a number pill
//     in its bottom-right corner, or a plain numbered tile when the tab has no
//     favicon we can load (runs in the service worker on an OffscreenCanvas);
//   - the extension's own icon (drawn by dev/make-icons.html).
import { DEFAULTS } from './settings.js';

// Chrome shows favicons at 16px, which is 32 device pixels on Retina.
export const SIZE = 32;
const FONT = 'system-ui, -apple-system, "Helvetica Neue", sans-serif';

const cache = new Map(); // `${favIconUrl}|${label}|${accent}` -> Promise<data: URL>

export function badgeIcon(tab, label, accent = DEFAULTS.accent) {
  const key = `${tab.favIconUrl ?? ''}|${label}|${accent}`;
  let icon = cache.get(key);
  if (!icon) {
    if (cache.size >= 200) cache.clear();
    icon = render(tab, label, accent);
    cache.set(key, icon);
    icon.catch(() => cache.delete(key));
  }
  return icon;
}

async function render(tab, label, accent) {
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  const favicon = tab.favIconUrl ? await loadFavicon(tab) : null;
  if (favicon) drawOverlay(ctx, favicon, label, accent);
  else drawTile(ctx, label, accent);

  const bytes = new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/png;base64,${btoa(binary)}`;
}

// Chrome's own favicon cache comes first: it's a same-origin PNG (so the
// canvas never gets tainted) and it covers SVG favicons, which
// createImageBitmap can't decode in a worker. The page's favicon URL is the
// fallback.
async function loadFavicon(tab) {
  const cached = new URL(chrome.runtime.getURL('/_favicon/'));
  cached.searchParams.set('pageUrl', tab.url);
  cached.searchParams.set('size', String(SIZE));

  for (const url of [cached.href, tab.favIconUrl]) {
    try {
      const res = await fetch(url);
      if (res.ok) return await createImageBitmap(await res.blob());
    } catch {}
  }
  return null;
}

// Mixes a #rrggbb color toward white (amount > 0) or black (amount < 0).
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  const [r, g, b] = [16, 8, 0].map((shift) => Math.round(((n >> shift) & 255) * (1 - t) + target * t));
  return `rgb(${r} ${g} ${b})`;
}

// A soft top-to-bottom gradient of the accent, a little lighter on top.
function fill(ctx, accent, y0, y1) {
  const gradient = ctx.createLinearGradient(0, y0, 0, y1);
  gradient.addColorStop(0, shade(accent, 0.16));
  gradient.addColorStop(1, shade(accent, -0.12));
  return gradient;
}

// Draws text centered on its actual glyph bounds, not the font's em box, so
// digits sit dead center.
function numeral(ctx, label, x, y, px, color = '#fff') {
  const text = String(label);
  ctx.font = `700 ${px}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(text);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
}

export function drawOverlay(ctx, image, label, accent = DEFAULTS.accent) {
  // Big enough that the digit reads at 16px; the site's icon still shows top-left.
  const r = 12;
  const cx = SIZE - r;
  const cy = SIZE - r;

  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.drawImage(image, 0, 0, SIZE, SIZE);

  // Knock a ring out of the favicon so the pill reads against any icon.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  ctx.fillStyle = fill(ctx, accent, cy - r, cy + r);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  numeral(ctx, label, cx, cy, 19);
}

export function drawTile(ctx, label, accent = DEFAULTS.accent) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = fill(ctx, accent, 0, SIZE);
  ctx.beginPath();
  ctx.roundRect(1, 1, SIZE - 2, SIZE - 2, 8);
  ctx.fill();

  numeral(ctx, label, SIZE / 2, SIZE / 2, 21);
}

// A tab outline: rounded top corners and the little outward flare at the
// bottom that Chrome's tabs have.
function tabPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x - r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w + r, y + h);
  ctx.closePath();
}

// The extension icon: an accent tile with a white tab rising from the bottom
// edge, its number in the accent color, between two faded neighbor tabs.
// Below 48px only the tile and a white numeral are legible, so it's simplified.
export function drawAppIcon(ctx, size, accent = DEFAULTS.accent) {
  ctx.clearRect(0, 0, size, size);
  // Chrome's guidelines leave transparent padding around larger icons.
  const pad = size >= 48 ? size / 8 : 0;
  const s = size - pad * 2;

  ctx.save();
  ctx.translate(pad, pad);
  ctx.beginPath();
  ctx.roundRect(0, 0, s, s, s * 0.24);
  ctx.fillStyle = fill(ctx, accent, 0, s);
  ctx.fill();

  if (size < 48) {
    numeral(ctx, 1, s / 2, s / 2, s * 0.68);
    ctx.restore();
    return;
  }

  ctx.clip();
  const tabW = s * 0.56;
  const tabH = s * 0.6;
  const top = s - tabH;
  const r = s * 0.1;

  // Neighbor tabs: only a sliver shows on each side.
  ctx.fillStyle = 'rgb(255 255 255 / 0.24)';
  tabPath(ctx, -tabW * 0.72, top + s * 0.1, tabW, tabH, r);
  ctx.fill();
  tabPath(ctx, s - tabW * 0.28, top + s * 0.1, tabW, tabH, r);
  ctx.fill();

  ctx.fillStyle = '#fff';
  tabPath(ctx, (s - tabW) / 2, top, tabW, tabH, r);
  ctx.fill();

  numeral(ctx, 1, s / 2, top + tabH * 0.44, s * 0.38, shade(accent, -0.08));
  ctx.restore();
}
