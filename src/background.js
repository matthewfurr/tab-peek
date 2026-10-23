// Tab Peek service worker. When a tab reports a held ⌘, it works out each
// tab's ⌘-number and tells those tabs to show it; when the peek ends, it tells
// them to put their titles and favicons back.
import { badgeIcon } from './badge.js';
import { DEFAULTS } from './settings.js';

// How long numbers stay up after the keyboard shortcut.
const SHORTCUT_PEEK_MS = 3000;

// windowId -> { gen, tabIds } for the peek showing in that window.
const peeks = new Map();
let nextGen = 0;

chrome.runtime.onMessage.addListener((msg, sender) => {
  const windowId = sender.tab?.windowId;
  if (windowId === undefined) return;
  if (msg.type === 'peek:start') startPeek(windowId);
  // If the worker restarted mid-peek we've lost track of which tabs are showing
  // numbers, so clear the whole window.
  else if (msg.type === 'peek:end' && !endPeek(windowId)) hideAll(windowId);
});

// Chrome handles the shortcut itself, so it works even on pages where content
// scripts can't run (chrome://, the Web Store…) and holding ⌘ goes unnoticed.
// It shows numbers for a few seconds; pressing it again hides them.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'show-numbers') return;
  const windowId = tab?.windowId ?? (await chrome.windows.getLastFocused()).id;
  if (endPeek(windowId)) return;

  startPeek(windowId);
  const { gen } = peeks.get(windowId);
  setTimeout(() => {
    if (peeks.get(windowId)?.gen === gen) endPeek(windowId);
  }, SHORTCUT_PEEK_MS);
});

// Clicking the toolbar icon opens the options.
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// ⌘N switched tabs, or focus left the window: numbers come off right away.
chrome.tabs.onActivated.addListener(({ windowId }) => endPeek(windowId));
chrome.windows.onFocusChanged.addListener(() => {
  for (const windowId of [...peeks.keys()]) endPeek(windowId);
});

// Content scripts only load into pages opened after install, so add them to
// the tabs that are already open.
chrome.runtime.onInstalled.addListener(async () => {
  for (const tab of await chrome.tabs.query({})) {
    if (tab.discarded || !tab.url) continue;
    chrome.scripting
      .executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['src/content.js'] })
      .catch(() => {}); // chrome:// pages, the Web Store and the like don't allow scripts
  }
});

async function startPeek(windowId) {
  const gen = ++nextGen;
  peeks.set(windowId, { gen, tabIds: [] });

  const [labels, { faviconBadge, accent }] = await Promise.all([
    labelTabs(windowId),
    chrome.storage.sync.get(DEFAULTS),
  ]);
  const icons = faviconBadge
    ? await Promise.all(labels.map(({ tab, label }) => badgeIcon(tab, label, accent).catch(() => null)))
    : [];

  const peek = peeks.get(windowId);
  if (peek?.gen !== gen) return; // released (or restarted) while we were working
  labels.forEach(({ tab, label }, i) => {
    peek.tabIds.push(tab.id);
    chrome.tabs.sendMessage(tab.id, { type: 'peek:show', label, icon: icons[i] ?? null }).catch(() => {});
  });
}

function endPeek(windowId) {
  const peek = peeks.get(windowId);
  if (!peek) return false;
  peeks.delete(windowId);
  for (const tabId of peek.tabIds) hide(tabId);
  return true;
}

async function hideAll(windowId) {
  for (const tab of await chrome.tabs.query({ windowId })) hide(tab.id);
}

function hide(tabId) {
  chrome.tabs.sendMessage(tabId, { type: 'peek:hide' }).catch(() => {});
}

// Mirrors Chrome's shortcuts: ⌘1–⌘8 pick the nth tab, skipping tabs hidden in
// collapsed groups, and ⌘9 always picks the very last tab.
async function labelTabs(windowId) {
  const [tabs, collapsed] = await Promise.all([
    chrome.tabs.query({ windowId }),
    chrome.tabGroups.query({ windowId, collapsed: true }),
  ]);
  tabs.sort((a, b) => a.index - b.index);
  const hidden = new Set(collapsed.map((group) => group.id));

  const labels = tabs
    .filter((tab) => !hidden.has(tab.groupId))
    .slice(0, 8)
    .map((tab, i) => ({ tab, label: i + 1 }));
  const last = tabs.at(-1);
  if (last && !labels.some(({ tab }) => tab.id === last.id)) labels.push({ tab: last, label: 9 });
  return labels;
}
