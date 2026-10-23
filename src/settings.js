// Settings stored in chrome.storage.sync, with their defaults.

// Badge colors offered on the options page. White text stays readable on all of them.
export const ACCENTS = [
  { name: 'Indigo', value: '#4f46e5' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Teal', value: '#0d9488' },
  { name: 'Green', value: '#16a34a' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Pink', value: '#db2777' },
  { name: 'Graphite', value: '#52525b' },
];

// How long ⌘ has to be held, on its own, before numbers appear.
export const HOLD_DELAYS = [
  { name: 'Fast', value: 120 },
  { name: 'Normal', value: 200 },
  { name: 'Relaxed', value: 350 },
];

export const DEFAULTS = {
  // Also draw the tab's number over its favicon (helps when tabs are too narrow to show titles).
  faviconBadge: false,
  accent: ACCENTS[0].value,
  // content.js keeps its own copy of this default, since content scripts can't import.
  holdDelay: 200,
};
