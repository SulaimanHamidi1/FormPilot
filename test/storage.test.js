const test = require('node:test');
const assert = require('node:assert');
const { createChromeMock } = require('./helpers/chrome-mock');

globalThis.chrome = createChromeMock();
require('../src/shared/schema.js');
require('../src/shared/storage.js');
const { schema, storage } = globalThis.JF;

test('default profile has every section and EEO defaults to decline', () => {
  const p = schema.defaultProfile();
  for (const s of schema.SECTIONS) assert.ok(p[s.id], s.id);
  assert.deepStrictEqual(p.work, []);
  assert.strictEqual(p.eeo.gender, schema.DECLINE);
  assert.strictEqual(p.eeo.veteranStatus, schema.DECLINE);
});

test('normalize drops unknown keys and fills missing ones', () => {
  const p = schema.normalize({
    personal: { firstName: 'Ada', bogus: 'x' },
    work: [{ company: 'Acme', current: 1, junk: true }, null],
    skills: 'JS, Go , ',
    custom: [{ question: 'Favorite color?', answer: 'Blue' }, { answer: 'orphan' }],
  });
  assert.strictEqual(p.personal.firstName, 'Ada');
  assert.strictEqual(p.personal.bogus, undefined);
  assert.strictEqual(p.personal.email, '');
  assert.strictEqual(p.work.length, 1);
  assert.strictEqual(p.work[0].current, true);
  assert.strictEqual(p.work[0].junk, undefined);
  assert.deepStrictEqual(p.skills, ['JS', 'Go']);
  assert.strictEqual(p.custom.length, 1);
  assert.ok(p.custom[0].id);
});

test('save, update and read profile', async () => {
  await storage.saveProfile({ personal: { email: 'a@b.co' } });
  await storage.updateProfile((p) => { p.personal.city = 'Paris'; });
  const p = await storage.getProfile();
  assert.strictEqual(p.personal.email, 'a@b.co');
  assert.strictEqual(p.personal.city, 'Paris');
});

test('custom answers upsert by question text', async () => {
  await storage.addCustomAnswer('Why us?', 'Mission');
  await storage.addCustomAnswer('  why US? ', 'Team');
  const p = await storage.getProfile();
  assert.strictEqual(p.custom.length, 1);
  assert.strictEqual(p.custom[0].answer, 'Team');
});

test('export / clear / import round trip', async () => {
  await storage.saveSettings({ onboarded: true });
  const backup = await storage.exportData();
  assert.strictEqual(backup.format, 'job_filler-backup');
  await storage.clearAll();
  assert.strictEqual((await storage.getProfile()).personal.email, '');
  await storage.importData(JSON.stringify(backup));
  assert.strictEqual((await storage.getProfile()).personal.email, 'a@b.co');
  assert.strictEqual((await storage.getSettings()).onboarded, true);
});

test('import accepts a bare profile and rejects garbage', async () => {
  await storage.importData({ personal: { firstName: 'Grace' } });
  assert.strictEqual((await storage.getProfile()).personal.firstName, 'Grace');
  await assert.rejects(() => storage.importData('null'));
});
