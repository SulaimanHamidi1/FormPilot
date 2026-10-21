// Background service worker: injects the content scripts on demand (popup
// button or keyboard shortcut). Nothing runs on pages until the user asks.

const CONTENT_FILES = ['src/content/main.js'];

async function ensureInjected(tabId) {
  const probes = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => !!(globalThis.JF && globalThis.JF.ready),
  }).catch(() => []);
  const missing = probes.filter((p) => !p.result).map((p) => p.frameId);
  if (!probes.length) missing.push(0);
  if (missing.length) {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: missing },
      files: CONTENT_FILES,
    });
  }
}

async function fillTab(tabId) {
  await ensureInjected(tabId);
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => (globalThis.JF && globalThis.JF.run ? globalThis.JF.run() : null),
  });
  return results.map((r) => r.result).filter(Boolean);
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'fill-form' && tab && tab.id != null) {
    await fillTab(tab.id).catch((e) => console.warn('job_filler:', e));
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'fill') {
    fillTab(msg.tabId)
      .then((frames) => sendResponse({ ok: true, frames }))
      .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});
