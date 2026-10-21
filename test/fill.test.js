const test = require('node:test');
const assert = require('node:assert');
const { loadPage, CONTENT } = require('./helpers/dom');
const { createChromeMock } = require('./helpers/chrome-mock');
const rawProfile = require('./fixtures/profile.json');

async function filledPage(page) {
  const w = loadPage(page, { scripts: [] });
  w.chrome = createChromeMock();
  const fs = require('fs');
  const path = require('path');
  for (const s of [...CONTENT, 'src/shared/storage.js', 'src/content/main.js']) {
    w.eval(fs.readFileSync(path.join(__dirname, '..', s), 'utf8'));
  }
  await w.chrome.storage.local.set({ profile: rawProfile, settings: { highlight: true } });
  const result = await w.JF.run();
  return { w, result, $: (s) => w.document.querySelector(s) };
}

test('fills the generic form and leaves unknowns for the user', async () => {
  const { result, $, w } = await filledPage('test/pages/forms/generic.html');
  assert.strictEqual($('#fn').value, 'Jane');
  assert.strictEqual($('input[name=email]').value, 'jane.doe@example.com');
  assert.strictEqual($('input[name=loc]').value, 'San Francisco, CA');
  assert.strictEqual($('#cntry').value, 'US');
  assert.strictEqual($('#st').value, 'California');
  assert.strictEqual($('input[name=auth][value="1"]').checked, true);
  assert.strictEqual($('input[name=sponsor][value=n]').checked, true);
  assert.strictEqual($('#start').value, '2026-12-01');
  assert.strictEqual($('#hear').value, 'LinkedIn');
  assert.strictEqual($('#deg0').value, "Bachelor's Degree");
  assert.strictEqual($('#gender').value, 'Female');
  assert.strictEqual($('#vet').value, 'I am not a protected veteran');
  assert.strictEqual($('#fav').value, 'Hash map');
  assert.strictEqual($('input[name=privacy]').checked, false, 'never ticks consent boxes');
  assert.strictEqual(w.document.getElementById('shadow-host').shadowRoot.querySelector('#cityx').value, 'San Francisco');
  const questions = result.unknown.map((u) => u.question);
  assert.ok(questions.some((q) => /Why do you want to work at Acme/.test(q)), questions.join(' | '));
  assert.ok(result.filled >= 25, 'filled ' + result.filled);
});

test('does not overwrite values the user already typed', async () => {
  const w = loadPage('test/pages/forms/generic.html', { scripts: [] });
  w.document.querySelector('#fn').value = 'Janet';
  w.chrome = createChromeMock();
  const fs = require('fs');
  const path = require('path');
  for (const s of [...CONTENT, 'src/shared/storage.js', 'src/content/main.js']) w.eval(fs.readFileSync(path.join(__dirname, '..', s), 'utf8'));
  await w.chrome.storage.local.set({ profile: rawProfile });
  const res = await w.JF.run();
  assert.strictEqual(w.document.querySelector('#fn').value, 'Janet');
  assert.ok(res.kept >= 1);
});

test('date formatting follows the field', () => {
  const w = loadPage('test/pages/forms/generic.html');
  const { formatDate } = w.JF.fill;
  assert.strictEqual(formatDate('2026-12-01', { kind: 'date' }), '2026-12-01');
  assert.strictEqual(formatDate('2021-01', { kind: 'month' }), '2021-01');
  assert.strictEqual(formatDate('2026-12-01', { kind: 'text', placeholder: 'MM/DD/YYYY' }), '12/01/2026');
  assert.strictEqual(formatDate('2026-12-01', { kind: 'text', placeholder: 'DD.MM.YYYY' }), '01.12.2026');
  assert.strictEqual(formatDate('2021-01', { kind: 'text', placeholder: 'MM/YYYY' }), '01/2021');
});

test('numeric range options', () => {
  const w = loadPage('test/pages/forms/generic.html');
  const opts = ['Less than 1 year', '1-3 years', '4-6 years', '7-10 years', '10+ years'].map((t) => ({ text: t, value: t }));
  assert.strictEqual(w.JF.match.pickOption(opts, '9').text, '7-10 years');
  assert.strictEqual(w.JF.match.pickOption(opts, '12').text, '10+ years');
  assert.strictEqual(w.JF.match.pickOption(opts, '0').text, 'Less than 1 year');
});
