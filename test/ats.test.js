// Regression tests against fixtures that mirror real ATS markup.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadPage, CONTENT } = require('./helpers/dom');
const { createChromeMock } = require('./helpers/chrome-mock');
const rawProfile = require('./fixtures/profile.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(file) {
  const w = loadPage(file, { scripts: [] });
  w.chrome = createChromeMock();
  for (const s of [...CONTENT, 'src/shared/storage.js', 'src/content/main.js']) {
    w.eval(fs.readFileSync(path.join(__dirname, '..', s), 'utf8'));
  }
  await w.chrome.storage.local.set({ profile: rawProfile, settings: { highlight: false, watchMultiStep: false } });
  const profile = w.JF.schema.normalize(rawProfile);
  const keys = () => {
    const out = new Map();
    for (const m of w.JF.match.matchAll(w.JF.detect.scan(w.document), profile)) out.set(m.field, m);
    return out;
  };
  return { w, d: w.document, keys };
}

// Find the match for a control (searching open shadow roots too).
function matchFor(matches, pred) {
  for (const m of matches.values()) if (pred(m.field)) return m;
  return null;
}

test('Greenhouse: system fields, react-select questions, EEO', async () => {
  const { keys } = await page('test/pages/forms/greenhouse.html');
  const ms = keys();
  const byId = (id) => matchFor(ms, (f) => f.el.id === id);
  assert.strictEqual(byId('first_name').key, 'personal.firstName');
  assert.strictEqual(byId('country').field.kind, 'combobox');
  assert.strictEqual(byId('country').key, 'personal.country');
  assert.strictEqual(byId('resume').key, 'resume');
  assert.strictEqual(byId('cover_letter').key, 'coverLetter');
  assert.strictEqual(byId('question_1').key, 'personal.linkedin');
  assert.strictEqual(byId('question_2').key, 'personal.preferredName');
  assert.strictEqual(byId('question_4').key, 'authorization.requireSponsorship');
  assert.strictEqual(byId('question_5').key, 'preferences.previouslyEmployed');
  assert.ok(!byId('question_6').key, 'employment-agreement question stays unknown');
  assert.strictEqual(byId('hispanic_ethnicity').key, 'eeo.hispanicLatino');
  assert.strictEqual(byId('disability_status').key, 'eeo.disabilityStatus');
  // Hidden react-select proxy inputs are not fields.
  assert.ok(![...ms.keys()].some((f) => f.el.getAttribute('tabindex') === '-1' && f.kind === 'text'));
});

test('Lever: fills cards, radios, selects and picks the location suggestion', async () => {
  const { w, d } = await page('test/pages/forms/lever.html');
  const res = await w.JF.run();
  const $ = (s) => d.querySelector(s);
  assert.strictEqual($('input[name=name]').value, 'Jane Doe');
  assert.strictEqual($('input[name=org]').value, 'Stripe');
  assert.strictEqual($('#location-input').value, 'San Francisco, California, United States');
  assert.match($('#selected-location').value, /San Francisco/);
  assert.strictEqual($('input[name="cards[card-1][field1]"]').value, 'Janie');
  assert.strictEqual($('input[name="cards[card-2][field0]"][value=Yes]').checked, true);
  assert.strictEqual($('input[name="cards[card-2][field1]"][value=No]').checked, true);
  assert.strictEqual($('select[name="cards[card-3][field0]"]').value, 'University of California, Berkeley');
  assert.strictEqual($('select[name="cards[card-4][field0]"]').value, 'LinkedIn');
  assert.strictEqual($('select[name="eeo[race]"]').value, 'Asian (Not Hispanic or Latino)');
  assert.strictEqual($('select[name="eeo[veteran]"]').value, 'I am not a veteran');
  assert.strictEqual($('input[name="consent[marketing]"]').checked, false);
  assert.ok(!$('input[name="cards[card-6][field0]"]:checked'), 'never answers consent questions');
  const q = res.unknown.map((u) => u.question).join(' | ');
  assert.match(q, /Language Skill/);
  assert.match(q, /Why do you want to work at Acme/);
});

test('Ashby: yes/no buttons, location combobox, ignores the autofill uploader', async () => {
  const { w, d, keys } = await page('test/pages/forms/ashby.html');
  const ms = keys();
  const autofill = matchFor(ms, (f) => f.kind === 'file' && !f.el.id);
  assert.ok(autofill && !autofill.key, 'autofill uploader is not treated as the resume field');
  assert.ok(!matchFor(ms, (f) => f.kind === 'checkbox' && f.el.name === 'yesno-1'), 'hidden yes/no checkbox skipped');
  const res = await w.JF.run();
  const $ = (s) => d.querySelector(s);
  assert.strictEqual($('#_systemfield_name').value, 'Jane Doe');
  assert.strictEqual($('[data-field-path=yesno-1] [data-option=yes]').getAttribute('aria-pressed'), 'true');
  assert.strictEqual($('[data-field-path=yesno-1] input[type=checkbox]').checked, true);
  assert.strictEqual($('[data-field-path=_systemfield_location] input').dataset.selected, 'San Francisco, California, United States');
  assert.ok($('input[name=_systemfield_eeoc_gender][value=Female]').checked);
  assert.ok(!$('input[name=communicationConsent]:checked'), 'never answers SMS consent');
  const q = res.unknown.map((u) => u.question).join(' | ');
  assert.match(q, /San Francisco Bay Area/);
  assert.ok(res.unknown.find((u) => /Bay Area/.test(u.question)).kind === 'buttonGroup');
});

test('SmartRecruiters: fields inside shadow roots, resume dropzone by context', async () => {
  const { keys } = await page('test/pages/forms/smartrecruiters.html');
  const ms = keys();
  const by = (id) => matchFor(ms, (f) => f.el.id === id);
  assert.strictEqual(by('first-name-input').key, 'personal.firstName');
  assert.strictEqual(by('confirm-email-input').key, 'personal.email');
  assert.strictEqual(by('spl-form-element_5').key, 'personal.phone');
  assert.strictEqual(by('twitter-input').key, 'personal.twitter');
  assert.strictEqual(by('website-input').key, 'personal.portfolio');
  const files = [...ms.values()].filter((m) => m.field.kind === 'file');
  assert.strictEqual(files.find((m) => m.field.el.dataset.kind === 'resume').key, 'resume');
  assert.ok(!files.find((m) => m.field.el.dataset.kind === 'autofill').key);
  assert.ok(!by('hiring-manager-message-input').key);
});

test('Workday: listbox buttons, search prompt, previous-worker radio, then step 2', async () => {
  const { w, d } = await page('test/pages/forms/workday.html');
  await w.JF.run();
  const $ = (s) => d.querySelector(s);
  assert.strictEqual($('[data-automation-id=legalNameSection_firstName]').value, 'Jane');
  assert.strictEqual($('[data-automation-id=countryDropdown]').textContent, 'United States of America');
  assert.strictEqual($('[data-automation-id=addressSection_countryRegion]').textContent, 'California');
  assert.strictEqual($('[data-automation-id=selectedItemList]').textContent, 'LinkedIn');
  assert.ok($('#prev-no').checked);
  assert.strictEqual($('[data-automation-id=phone-device-type]').textContent, 'Select One', 'device type left alone');
  assert.strictEqual($('[data-automation-id=phone-number]').value, '(415) 555-0134');

  $('#next').click();
  await sleep(10);
  await w.JF.run();
  const we1 = $('[data-automation-id=workExperience-1]');
  const we2 = $('[data-automation-id=workExperience-2]');
  assert.strictEqual(we1.querySelector('[data-automation-id=jobTitle]').value, 'Senior Software Engineer');
  assert.strictEqual(we1.querySelector('[data-automation-id=company]').value, 'Stripe');
  assert.strictEqual(we1.querySelector('[data-automation-id=currentlyWorkHere]').checked, true);
  assert.strictEqual(we1.querySelector('[data-automation-id=dateSectionMonth-input]').value, '01');
  assert.strictEqual(we1.querySelector('[data-automation-id=dateSectionYear-input]').value, '2021');
  assert.strictEqual(we1.querySelector('[data-automation-id=description]').value, 'Ledger services.');
  assert.strictEqual(we2.querySelector('[data-automation-id=company]').value, 'Acme Corp');
  const months = we2.querySelectorAll('[data-automation-id=dateSectionMonth-input]');
  const years = we2.querySelectorAll('[data-automation-id=dateSectionYear-input]');
  assert.deepStrictEqual([months[0].value, years[0].value, months[1].value, years[1].value], ['06', '2017', '12', '2020']);
  assert.strictEqual($('[data-automation-id=school]').value, 'University of California, Berkeley');
  assert.strictEqual($('[data-automation-id=degree]').textContent, "Bachelor's Degree");
  assert.strictEqual($('[data-automation-id=fieldOfStudy]').value, 'Computer Science');
  assert.strictEqual($('[data-automation-id=gpa]').value, '3.8');
  assert.strictEqual($('[data-automation-id=linkedinQuestion]').value, 'https://linkedin.com/in/janedoe');
});

test('iCIMS frame: profile fields, eligibility selects, EEO', async () => {
  const { w, d } = await page('test/pages/forms/icims-frame.html');
  const res = await w.JF.run();
  const v = (id) => d.getElementById(id).value;
  assert.strictEqual(v('PersonProfileFields.FirstName'), 'Jane');
  assert.strictEqual(v('PersonProfileFields.MiddleName'), 'A.');
  assert.strictEqual(v('-1_PersonProfileFields.AddressState'), '5');
  assert.strictEqual(v('-1_PersonProfileFields.AddressCountry'), '227');
  assert.strictEqual(v('rcf3047'), 'Y');
  assert.strictEqual(v('rcf3048'), 'N');
  assert.strictEqual(v('rcf3050'), '200000');
  assert.strictEqual(v('rcf3051'), "Bachelor's Degree");
  assert.strictEqual(v('-1_PersonProfileFields.Gender'), 'Female');
  assert.strictEqual(v('-1_PersonProfileFields.Disability'), 'I do not wish to answer');
  assert.strictEqual(res.unknown.length, 1, res.unknown.map((u) => u.question).join(' | '));
});

test('Workday My Experience: clicks Add per job and school, picks each skill, skips header', async () => {
  const { w, d } = await page('test/pages/forms/workday-add.html');
  const res = await w.JF.run();
  const blocks = (kind) => [...d.querySelectorAll(`[data-automation-id^="${kind}-"]`)];
  const work = blocks('workExperience');
  assert.strictEqual(work.length, 2, 'one block per job');
  assert.strictEqual(work[0].querySelector('[data-automation-id=company]').value, 'Stripe');
  assert.strictEqual(work[0].querySelector('[data-automation-id=jobTitle]').value, 'Senior Software Engineer');
  assert.strictEqual(work[1].querySelector('[data-automation-id=company]').value, 'Acme Corp');
  const edu = blocks('education');
  assert.strictEqual(edu.length, 1, 'one block per school');
  assert.strictEqual(edu[0].querySelector('[data-automation-id=school]').value, 'University of California, Berkeley');
  assert.strictEqual(blocks('certification').length, 0, 'sections without profile data are left alone');
  assert.strictEqual(blocks('language').length, 0);
  const pills = [...d.querySelectorAll('.pill')].map((p) => p.textContent);
  assert.deepStrictEqual(pills, ['Go (Programming Language)', 'Python (Programming Language)', 'SQL']);
  assert.strictEqual(d.querySelector('[data-automation-id=utilityButtonLanguage]').textContent, 'English');
  assert.ok(!res.unknown.some((u) => /english/i.test(u.question)), 'header language picker is not a question');
  assert.strictEqual(d.body.dataset.submitted, undefined, 'never submits');
});
