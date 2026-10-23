import { SIZE, drawOverlay } from '../src/badge.js';
import { ACCENTS, DEFAULTS, HOLD_DELAYS } from '../src/settings.js';

const faviconBadge = document.getElementById('faviconBadge');
const accentRow = document.getElementById('accentRow');
const accentGroup = document.getElementById('accent');
const holdGroup = document.getElementById('holdDelay');
const preview = document.getElementById('preview');

let settings = { ...DEFAULTS };

// Stand-in favicons for the preview strip.
function sampleIcon(draw) {
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  draw(canvas.getContext('2d'));
  return canvas;
}

const SAMPLE_TABS = [
  {
    title: 'Inbox',
    icon: sampleIcon((ctx) => {
      ctx.fillStyle = '#ea4335';
      ctx.beginPath();
      ctx.roundRect(2, 6, 28, 20, 4);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(6, 10);
      ctx.lineTo(16, 18);
      ctx.lineTo(26, 10);
      ctx.stroke();
    }),
  },
  {
    title: 'GitHub',
    icon: sampleIcon((ctx) => {
      ctx.fillStyle = '#24292f';
      ctx.beginPath();
      ctx.arc(16, 16, 15, 0, Math.PI * 2);
      ctx.fill();
    }),
  },
  {
    title: 'Project board',
    icon: sampleIcon((ctx) => {
      ctx.fillStyle = '#2684ff';
      ctx.beginPath();
      ctx.moveTo(16, 1);
      ctx.lineTo(31, 16);
      ctx.lineTo(16, 31);
      ctx.lineTo(1, 16);
      ctx.fill();
    }),
  },
];

async function iconUrl(icon, label) {
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  if (settings.faviconBadge) drawOverlay(ctx, icon, label, settings.accent);
  else ctx.drawImage(icon, 0, 0);
  return URL.createObjectURL(await canvas.convertToBlob());
}

async function renderPreview() {
  const urls = await Promise.all(SAMPLE_TABS.map((tab, i) => iconUrl(tab.icon, i + 1)));
  preview.replaceChildren(
    ...SAMPLE_TABS.map((tab, i) => {
      const el = document.createElement('div');
      el.className = i === 0 ? 'tab active' : 'tab';
      const img = document.createElement('img');
      img.src = urls[i];
      const title = document.createElement('span');
      title.textContent = `${i + 1} · ${tab.title}`;
      el.append(img, title);
      return el;
    }),
  );
}

// Builds a radio group from [{ name, value }] options.
function radios(group, name, options, render) {
  group.replaceChildren(
    ...options.map((option) => {
      const label = document.createElement('label');
      label.title = option.name;
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = name;
      input.value = option.value;
      input.addEventListener('change', () => save({ [name]: option.value }));
      label.append(input, render(option));
      return label;
    }),
  );
}

function save(changes) {
  settings = { ...settings, ...changes };
  chrome.storage.sync.set(changes);
  update();
}

function update() {
  faviconBadge.checked = settings.faviconBadge;
  accentRow.classList.toggle('disabled', !settings.faviconBadge);
  for (const input of accentGroup.querySelectorAll('input')) {
    input.checked = input.value === settings.accent;
    input.disabled = !settings.faviconBadge;
  }
  for (const input of holdGroup.querySelectorAll('input')) {
    input.checked = Number(input.value) === settings.holdDelay;
  }
  renderPreview();
}

radios(accentGroup, 'accent', ACCENTS, (option) => {
  const dot = document.createElement('span');
  dot.className = 'swatch';
  dot.style.setProperty('--swatch', option.value);
  return dot;
});

radios(holdGroup, 'holdDelay', HOLD_DELAYS, (option) => {
  const text = document.createElement('span');
  text.textContent = option.name;
  return text;
});
faviconBadge.addEventListener('change', () => save({ faviconBadge: faviconBadge.checked }));

document.getElementById('shortcuts').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

chrome.commands.getAll().then((commands) => {
  const shortcut = commands.find((command) => command.name === 'show-numbers')?.shortcut;
  document.getElementById('shortcut').textContent = shortcut || 'not set';
});

chrome.storage.sync.get(DEFAULTS).then((stored) => {
  settings = stored;
  update();
});
