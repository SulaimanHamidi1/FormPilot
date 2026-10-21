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
  const s = res.summary;
  let text = `Filled ${s.filled} field${s.filled === 1 ? '' : 's'}`;
  if (s.unknown.length) text += `, ${s.unknown.length} need${s.unknown.length === 1 ? 's' : ''} your answer (see the page)`;
  showResult(text + '.', s.filled && !s.unknown.length ? 'ok' : 'warn');
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
