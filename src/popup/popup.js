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
  if (!res || !res.ok) {
    $('fill').disabled = false;
    showResult('job_filler can\'t run on this page. ' + ((res && res.error) || ''), 'warn');
    return;
  }
  // Results appear on the page itself.
  window.close();
});

chrome.commands.getAll((cmds) => {
  const c = cmds.find((x) => x.name === 'fill-form');
  $('shortcut').textContent = (c && c.shortcut) || 'not set';
});

chrome.storage.local.get(['profile', 'resume']).then(({ profile, resume }) => {
  const p = profile && profile.personal;
  const name = p && [p.firstName, p.lastName].filter(Boolean).join(' ');
  const status = $('profile-status');
  if (!name && !(p && p.email)) {
    status.textContent = 'No profile yet. Set one up first.';
    $('fill').disabled = true;
    return;
  }
  status.textContent = `Filling as ${name || p.email}${resume ? ' · resume attached' : ' · no resume saved'}`;
});
