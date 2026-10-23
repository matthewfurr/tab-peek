// Tab Peek content script. Watches for a held ⌘ and tells the background
// script; while a peek is on, it prefixes this tab's title with its ⌘-number
// (and, if the setting is on, swaps in a badged favicon), then puts the page's
// own title and icons back when the peek ends.
(() => {
  // On install/update the background re-injects this file into open tabs, so
  // shut down any copy already running here first.
  window.__tabPeekTeardown?.();

  const SEPARATOR = ' · ';
  // Same default as DEFAULTS.holdDelay in settings.js (content scripts can't import).
  let holdDelay = 200;
  // Every frame watches ⌘ (focus may be inside an iframe), but only the top
  // frame owns the tab's title and favicon.
  const isTop = window === window.top;

  let holdTimer = null;
  let peeking = false;
  // While numbers are showing: { label, title, applied, icons, link }.
  //   title   the page's own title (kept current if the page changes it mid-peek)
  //   applied the prefixed title we set
  //   icons   the page's <link rel=icon> elements we pulled out, with where they were
  //   link    our badged <link rel=icon>, if any
  let saved = null;
  let observer = null;

  function send(type) {
    try {
      chrome.runtime.sendMessage({ type }).catch(() => {});
    } catch {
      teardown(); // the extension was reloaded or removed; this copy is orphaned
    }
  }

  function cancelHold() {
    clearTimeout(holdTimer);
    holdTimer = null;
  }

  function endPeek() {
    cancelHold();
    if (!peeking) return;
    peeking = false;
    send('peek:end');
  }

  function onKeyDown(e) {
    if (e.key === 'Meta') {
      if (!peeking && !holdTimer) {
        holdTimer = setTimeout(() => {
          holdTimer = null;
          peeking = true;
          send('peek:start');
        }, holdDelay);
      }
    } else {
      // Another key before the delay (⌘C, ⌘T…) means a shortcut, not a peek.
      cancelHold();
    }
  }

  function onKeyUp(e) {
    if (e.key === 'Meta') endPeek();
  }

  function onVisibilityChange() {
    if (document.hidden) endPeek();
  }

  // --- Showing and restoring ---------------------------------------------

  function isPageIcon(node) {
    return node.nodeName === 'LINK' && node.relList.contains('icon') && node !== saved.link;
  }

  function stashIcon(link) {
    saved.icons.push({ link, parent: link.parentNode, next: link.nextSibling });
    link.remove();
  }

  function applyTitle() {
    saved.applied = saved.label + SEPARATOR + saved.title;
    document.title = saved.applied;
  }

  function onMutations(records) {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (isPageIcon(node)) stashIcon(node); // keep ours in charge until the peek ends
      }
    }
    if (document.title !== saved.applied) {
      saved.title = document.title; // the page changed its own title mid-peek
      applyTitle();
    }
  }

  function show({ label, icon }) {
    saved ??= { title: document.title, icons: [], link: null };
    saved.label = label;
    applyTitle();

    if (icon) {
      if (!saved.link) {
        document.querySelectorAll('link[rel~="icon" i]').forEach(stashIcon);
        saved.link = document.createElement('link');
        saved.link.rel = 'icon';
        (document.head ?? document.documentElement).append(saved.link);
      }
      saved.link.href = icon;
    }

    if (!observer) {
      observer = new MutationObserver(onMutations);
      observer.observe(document.head ?? document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
  }

  function hide() {
    if (!saved) return;
    observer?.disconnect();
    observer = null;

    document.title = saved.title;
    saved.link?.remove();
    // Reverse order so each icon's saved nextSibling is back in place before it's used.
    for (const { link, parent, next } of saved.icons.reverse()) {
      const home = parent?.isConnected ? parent : document.head ?? document.documentElement;
      home.insertBefore(link, next?.parentNode === home ? next : null);
    }
    saved = null;
  }

  function onStorageChanged(changes) {
    if (changes.holdDelay) holdDelay = changes.holdDelay.newValue ?? 200;
  }

  function onMessage(msg) {
    if (!isTop) return;
    if (msg.type === 'peek:show') show(msg);
    else if (msg.type === 'peek:hide') hide();
  }

  // --- Wiring --------------------------------------------------------------

  function teardown() {
    cancelHold();
    hide();
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('blur', endPeek);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.storage.onChanged.removeListener(onStorageChanged);
    } catch {}
    if (window.__tabPeekTeardown === teardown) delete window.__tabPeekTeardown;
  }

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', endPeek);
  document.addEventListener('visibilitychange', onVisibilityChange);
  chrome.runtime.onMessage.addListener(onMessage);
  chrome.storage.onChanged.addListener(onStorageChanged);
  chrome.storage.sync.get({ holdDelay }).then((settings) => {
    holdDelay = settings.holdDelay;
  });
  window.__tabPeekTeardown = teardown;
})();
