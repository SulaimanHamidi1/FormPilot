const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

require('../src/shared/schema.js');
require('../src/options/resume-parse.js');
const { resumeParse, schema } = globalThis.JF;
const fixture = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');

test('resume A: contacts, name, location', () => {
  const r = resumeParse.parseText(fixture('resume-a.txt'));
  assert.strictEqual(r.personal.firstName, 'Jane');
  assert.strictEqual(r.personal.middleName, 'A.');
  assert.strictEqual(r.personal.lastName, 'Doe');
  assert.strictEqual(r.personal.email, 'jane.doe@example.com');
  assert.strictEqual(r.personal.phone, '(415) 555-0134');
  assert.strictEqual(r.personal.city, 'San Francisco');
  assert.strictEqual(r.personal.state, 'CA');
  assert.strictEqual(r.personal.postalCode, '94105');
  assert.strictEqual(r.personal.linkedin, 'https://linkedin.com/in/janedoe');
  assert.strictEqual(r.personal.github, 'https://github.com/janedoe');
  assert.strictEqual(r.personal.portfolio, 'https://janedoe.dev');
  assert.match(r.summary, /Backend engineer/);
});

test('resume A: work, education, skills', () => {
  const r = resumeParse.parseText(fixture('resume-a.txt'));
  assert.strictEqual(r.work.length, 2);
  assert.deepStrictEqual(
    { c: r.work[0].company, t: r.work[0].title, s: r.work[0].startDate, cur: r.work[0].current },
    { c: 'Stripe', t: 'Senior Software Engineer', s: '2021-01', cur: true }
  );
  assert.match(r.work[0].description, /ledger/);
  assert.strictEqual(r.work[1].company, 'Acme Corp');
  assert.strictEqual(r.work[1].title, 'Software Engineer');
  assert.strictEqual(r.work[1].location, 'New York, NY');
  assert.strictEqual(r.work[1].endDate, '2020-12');
  assert.strictEqual(r.education.length, 1);
  assert.strictEqual(r.education[0].school, 'University of California, Berkeley');
  assert.strictEqual(r.education[0].degree, "Bachelor's");
  assert.strictEqual(r.education[0].field, 'Computer Science');
  assert.strictEqual(r.education[0].gpa, '3.8');
  assert.strictEqual(r.education[0].endDate, '2017-12');
  assert.deepStrictEqual(r.skills, ['Go', 'Python', 'TypeScript', 'SQL', 'Kubernetes', 'Postgres', 'Kafka']);
  assert.ok(Number(r.preferences.yearsExperience) >= 8);
});

test('resume B: alternate layout', () => {
  const r = resumeParse.parseText(fixture('resume-b.txt'));
  assert.strictEqual(r.personal.firstName, 'John');
  assert.strictEqual(r.personal.lastName, 'Smith');
  assert.strictEqual(r.personal.phone, '+44 7700 900123');
  assert.strictEqual(r.personal.city, 'London');
  assert.strictEqual(r.personal.country, 'United Kingdom');
  assert.strictEqual(r.work.length, 2);
  assert.strictEqual(r.work[0].title, 'Product Designer');
  assert.strictEqual(r.work[0].company, 'Figma');
  assert.strictEqual(r.work[0].startDate, '2019-03');
  assert.strictEqual(r.work[1].title, 'Junior Designer');
  assert.strictEqual(r.work[1].company, 'Pixel Labs Ltd');
  assert.strictEqual(r.work[1].startDate, '2016-08');
  assert.strictEqual(r.education.length, 2);
  assert.strictEqual(r.education[0].degree, "Master's");
  assert.strictEqual(r.education[0].field, 'Interaction Design');
  assert.strictEqual(r.education[0].school, 'Royal College of Art');
  assert.strictEqual(r.education[1].school, 'University of the Arts London');
  assert.strictEqual(r.education[1].field, 'Graphic Design');
  assert.deepStrictEqual(r.skills, ['Figma', 'Sketch', 'Prototyping', 'User Research']);
});

test('normDate handles common formats', () => {
  assert.strictEqual(resumeParse.normDate('Sept. 2019'), '2019-09');
  assert.strictEqual(resumeParse.normDate('3/2020'), '2020-03');
  assert.strictEqual(resumeParse.normDate('2020-07'), '2020-07');
  assert.strictEqual(resumeParse.normDate('Present'), 'present');
});

test('merge fills only empty fields unless overwrite', () => {
  const base = schema.defaultProfile();
  base.personal.email = 'keep@me.com';
  const parsed = { personal: { email: 'new@x.com', firstName: 'Jane' }, work: [{ company: 'A' }], skills: ['Go'] };
  const m = resumeParse.mergeIntoProfile(base, parsed);
  assert.strictEqual(m.personal.email, 'keep@me.com');
  assert.strictEqual(m.personal.firstName, 'Jane');
  assert.strictEqual(m.work.length, 1);
  const o = resumeParse.mergeIntoProfile(base, parsed, { overwrite: true });
  assert.strictEqual(o.personal.email, 'new@x.com');
});
