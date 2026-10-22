// Background service worker: injects the content scripts on demand (popup,
// keyboard shortcut or the on-page button). The only script that runs on its
// own is the small launcher button, and only if the user turns it on.

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
    // Answer once injection works so the popup can close and hand focus
    // back to the page (dropdown widgets only open in a focused page).
    const tabId = msg.tabId != null ? msg.tabId : sender.tab && sender.tab.id;
    if (tabId == null) return false;
    ensureInjected(tabId)
      .then(() => {
        sendResponse({ ok: true });
        return fillTab(tabId);
      })
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

// ---- On-page launcher button ----

const LAUNCHER_ID = 'jf-launcher';
// The ATS domains listed as optional host permissions in the manifest.
const JOB_SITES = chrome.runtime.getManifest().optional_host_permissions.filter((o) => o !== '<all_urls>');

// Register the launcher for the sites the user chose, if Chrome allows it.
async function syncLauncher() {
  const { settings } = await chrome.storage.local.get('settings');
  const mode = (settings && settings.launcher) || 'off';
  const matches = mode === 'all' ? ['<all_urls>'] : mode === 'jobsites' ? JOB_SITES : [];
  const allowed = matches.length && (await chrome.permissions.contains({ origins: matches }));
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [LAUNCHER_ID] });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [LAUNCHER_ID] });
  if (!allowed) return;
  await chrome.scripting.registerContentScripts([{
    id: LAUNCHER_ID,
    matches,
    js: ['src/content/launcher.js'],
    runAt: 'document_idle',
    allFrames: false,
  }]);
}

let syncing = Promise.resolve();
const resync = () => {
  syncing = syncing.then(syncLauncher).catch((e) => console.warn('job_filler launcher:', e));
};

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'settings' in changes) resync();
});
chrome.permissions.onAdded.addListener(resync);
chrome.permissions.onRemoved.addListener(resync);

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
  resync();
});
