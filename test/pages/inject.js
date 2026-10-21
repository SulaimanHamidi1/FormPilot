// Dev helper: loads the chrome shim + content scripts into the current page
// (served from tools/serve.js) and seeds the fixture profile if asked.
// Usage from the console: await jfInject({ seed: true }); await JF.run();
window.jfInject = async ({ seed = false } = {}) => {
  const load = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.append(s);
  });
  await load('/test/pages/chrome-shim.js');
  if (seed) {
    const profile = await (await fetch('/test/fixtures/profile.json')).json();
    await chrome.storage.local.set({ profile });
  }
  // Same order as CONTENT_FILES in src/background/sw.js.
  const sw = await (await fetch('/src/background/sw.js')).text();
  const files = JSON.parse(sw.match(/const CONTENT_FILES = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  for (const f of files) await load('/' + f);
  return files.length;
};
