const test = require('node:test');
const assert = require('node:assert');
const { loadPage } = require('./helpers/dom');
const rawProfile = require('./fixtures/profile.json');

function run(page) {
  const w = loadPage(page);
  const profile = w.JF.schema.normalize(rawProfile);
  const fields = w.JF.detect.scan(w.document);
  const matches = w.JF.match.matchAll(fields, profile);
  const find = (sel) => {
    const host = w.document.getElementById('shadow-host');
    return w.document.querySelector(sel) || (host && host.shadowRoot && host.shadowRoot.querySelector(sel));
  };
  const by = (sel) => {
    const el = find(sel);
    return matches.find((m) => m.field.el === el || (m.field.group && m.field.group.includes(el)));
  };
  return { w, fields, matches, by, profile };
}

// Asserts that each selector maps to [key, value].
function expectKeys(by, expect) {
  for (const [sel, [key, value]] of Object.entries(expect)) {
    const m = by(sel);
    assert.ok(m, 'no field for ' + sel);
    assert.strictEqual(m.key, key, `${sel} (label "${m.field.label || m.field.nearby || m.field.placeholder}")`);
    if (value !== undefined) assert.strictEqual(m.value, value, sel);
  }
}

test('generic form: text fields map to profile keys', () => {
  const { by } = run('test/pages/forms/generic.html');
  expectKeys(by, {
    '#fn': ['personal.firstName', 'Jane'],
    '#ln': ['personal.lastName', 'Doe'],
    'input[name=email]': ['personal.email', 'jane.doe@example.com'],
    'input[name=phone]': ['personal.phone', '(415) 555-0134'],
    'input[name=loc]': ['personal.location', 'San Francisco, CA'],
    'input[name="urls[LinkedIn]"]': ['personal.linkedin', 'https://linkedin.com/in/janedoe'],
    'input[name="urls[GitHub]"]': ['personal.github', 'https://github.com/janedoe'],
    'input[name="urls[Portfolio]"]': ['personal.portfolio', 'https://janedoe.dev'],
    '#org': ['work.company', 'Stripe'],
    '#ttl': ['work.title', 'Senior Software Engineer'],
    '#cntry': ['personal.country', 'United States'],
    '#st': ['personal.state', 'CA'],
    '#sal': ['preferences.salaryExpectation', '200000'],
    '#start': ['preferences.startDate', '2026-12-01'],
    '#hear': ['preferences.howDidYouHear', 'LinkedIn'],
    '#cover': ['coverLetter', 'Dear hiring team, ...'],
    '#resume': ['resume', 'resume'],
    '#edu0': ['education.school', 'University of California, Berkeley'],
    '#deg0': ['education.degree', "Bachelor's"],
    '#dis0': ['education.field', 'Computer Science'],
    '#gender': ['eeo.gender', 'Female'],
    '#race': ['eeo.ethnicity', 'Asian'],
    '#vet': ['eeo.veteranStatus', 'I am not a protected veteran'],
    '#cityx': ['personal.city', 'San Francisco'],
  });
});

test('generic form: radio groups and custom answers', () => {
  const { by } = run('test/pages/forms/generic.html');
  const auth = by('input[name=auth]');
  assert.strictEqual(auth.field.kind, 'radio');
  assert.match(auth.field.label, /legally authorized/);
  assert.strictEqual(auth.key, 'authorization.authorizedToWork');
  const sp = by('input[name=sponsor]');
  assert.match(sp.field.label, /sponsorship/);
  assert.strictEqual(sp.key, 'authorization.requireSponsorship');
  const fav = by('#fav');
  assert.strictEqual(fav.value, 'Hash map');
  assert.ok(fav.custom);
});

test('generic form: unknown and never-fill fields', () => {
  const { by } = run('test/pages/forms/generic.html');
  const why = by('#why');
  assert.ok(!why.key && !why.custom, 'why question should be unknown, got ' + why.key);
  assert.ok(by('input[name=privacy]').skip);
});

test('option picking', () => {
  const w = loadPage('test/pages/forms/generic.html');
  const { pickOption } = w.JF.match;
  const opts = (...t) => t.map((x) => ({ text: x, value: x }));
  const pick = (o, v) => (pickOption(o, v) || {}).text;
  assert.strictEqual(pick(opts('Canada', 'United States of America'), 'United States'), 'United States of America');
  assert.strictEqual(pick(opts('USA', 'Mexico'), 'United States'), 'USA');
  assert.strictEqual(pick(opts('Alabama', 'California'), 'CA'), 'California');
  assert.strictEqual(pick(opts('Yes, I am authorized', 'No, I am not authorized'), 'Yes'), 'Yes, I am authorized');
  assert.strictEqual(pick(opts('I am authorized', 'I am not authorized'), 'No'), 'I am not authorized');
  assert.strictEqual(pick(opts('Male', 'Female', 'Decline to self-identify'), 'Male'), 'Male');
  assert.strictEqual(pick(opts('Man', 'Woman', 'I prefer not to answer'), 'Female'), 'Woman');
  assert.strictEqual(pick(opts('Man', 'Woman', 'I prefer not to answer'), 'Prefer not to say'), 'I prefer not to answer');
  assert.strictEqual(pick(opts('Yes', 'No', "I don't wish to answer"), 'No, I do not have a disability'), 'No');
  assert.strictEqual(pick(opts("Associate's Degree", "Bachelor's Degree", "Master's Degree"), "Bachelor's"), "Bachelor's Degree");
  assert.strictEqual(pick(opts('BS', 'MS', 'PhD'), "Master's"), 'MS');
  assert.strictEqual(pick(opts('Asian', 'White'), 'Black or African American'), undefined);
});

test('custom answers match reworded questions but not unrelated ones', () => {
  const w = loadPage('test/pages/forms/generic.html');
  const { customScore } = w.JF.match;
  assert.ok(customScore('Why do you want to work at Globex?', 'Why do you want to work at Acme?') >= 0.72);
  assert.ok(customScore('What shift would you prefer?', 'Which shift do you prefer?') >= 0.72);
  assert.ok(customScore('Do you have a valid drivers license?', "Do you have a valid driver's license?") >= 0.9);
  assert.ok(customScore('What is your favorite color?', 'Why do you want to work at Acme?') < 0.5);
  assert.ok(customScore('Are you willing to travel?', 'Are you willing to relocate?') < 0.72);
});

test('projects fill from projects, not work history', () => {
  const { by } = run('test/pages/forms/projects.html');
  expectKeys(by, {
    '#w-title': ['work.title', 'Senior Software Engineer'],
    '#w-company': ['work.company', 'Stripe'],
    '#w-desc': ['work.description', 'Ledger services.'],
    '#p0-title': ['projects.name', 'FormPilot'],
    '#p0-role': ['projects.role', 'Creator'],
    '#p0-url': ['projects.url', 'https://github.com/janedoe/FormPilot'],
    '#p0-desc': ['projects.description', 'Chrome extension that fills job applications.'],
    '#p1-title': ['projects.name', 'Ledger Viz'],
    '#p1-desc': ['projects.description', 'Visualizes double-entry ledgers.'],
  });
  // Numbered project blocks (project-2) are projects too; work keys never apply there.
  assert.strictEqual(by('#p2-name').field.section, 'projects');
  assert.strictEqual(by('#p2-name').key, 'projects.name');
  assert.ok(!by('#p2-company').key, 'company in a project block should not fill from work');
});
