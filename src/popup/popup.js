const $ = (id) => document.getElementById(id);

function showResult(text, cls) {
  const el = $('result');
  el.textContent = text;
  el.className = 'result ' + (cls || '');
  el.hidden = false;
}

$('open-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

$('fill').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  $('fill').disabled = true;
  const res = await chrome.runtime.sendMessage({ type: 'fill', tabId: tab.id });
  $('fill').disabled = false;
  if (!res || !res.ok) {
    showResult('Could not access this page. ' + ((res && res.error) || ''), 'warn');
    return;
  }
  const filled = res.frames.reduce((n, f) => n + (f.filled || 0), 0);
  showResult(`Filled ${filled} field${filled === 1 ? '' : 's'}.`, filled ? 'ok' : 'warn');
});

chrome.commands.getAll((cmds) => {
  const c = cmds.find((x) => x.name === 'fill-form');
  $('shortcut').textContent = (c && c.shortcut) || 'not set';
});

$('profile-status').textContent = 'Ready.';
