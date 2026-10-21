// Background service worker: injects the content scripts on demand (popup
// button or keyboard shortcut). Nothing runs on pages until the user asks.

const CONTENT_FILES = [
  'src/shared/schema.js',
  'src/shared/storage.js',
  'src/shared/text.js',
  'src/content/synonyms.js',
  'src/content/detect.js',
  'src/content/match.js',
  'src/content/fill.js',
  'src/content/ui.js',
  'src/content/main.js',
  'src/content/prompt.js',
];

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

// Run the filler in every reachable frame and combine the results.
async function fillTab(tabId) {
  await ensureInjected(tabId);
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => (globalThis.JF && globalThis.JF.run ? globalThis.JF.run() : null),
  });
  const summary = { filled: 0, kept: 0, failed: 0, unknown: [], frames: 0, ms: 0 };
  for (const r of results) {
    if (!r.result) continue;
    summary.frames++;
    summary.filled += r.result.filled;
    summary.kept += r.result.kept;
    summary.failed += r.result.failed;
    summary.ms = Math.max(summary.ms, r.result.ms);
    for (const u of r.result.unknown) summary.unknown.push({ ...u, frameId: r.frameId });
  }
  await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    func: (s) => globalThis.JF && globalThis.JF.showSummary && globalThis.JF.showSummary(s),
    args: [summary],
  }).catch(() => {});
  return summary;
}

// Fill answers the user typed into the on-page prompt, frame by frame.
async function fillAnswers(tabId, answers) {
  const byFrame = new Map();
  for (const a of answers) {
    if (!byFrame.has(a.frameId)) byFrame.set(a.frameId, []);
    byFrame.get(a.frameId).push({ id: a.id, value: a.value });
  }
  let filled = 0;
  for (const [frameId, list] of byFrame) {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      func: (l) => (globalThis.JF && globalThis.JF.fillAnswers ? globalThis.JF.fillAnswers(l) : 0),
      args: [list],
    }).catch(() => [{ result: 0 }]);
    filled += (r && r.result) || 0;
  }
  return filled;
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'fill-form' && tab && tab.id != null) {
    await fillTab(tab.id).catch((e) => console.warn('job_filler:', e));
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return false;
  if (msg.type === 'fill') {
    fillTab(msg.tabId)
      .then((summary) => sendResponse({ ok: true, summary }))
      .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  if (msg.type === 'fillAnswers' && sender.tab) {
    fillAnswers(sender.tab.id, msg.answers)
      .then((filled) => sendResponse({ ok: true, filled }))
      .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  if (msg.type === 'openOptions') {
    chrome.runtime.openOptionsPage();
    return false;
  }
  return false;
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});
