// Profile data model. Loaded as a classic script by the options page, popup
// and content scripts; exposes JF.schema.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  if (JF.schema) return;

  const SCHEMA_VERSION = 1;
  const DECLINE = 'Prefer not to say';

  const CHOICES = {
    yesNo: ['Yes', 'No'],
    yesNoDecline: ['Yes', 'No', DECLINE],
    gender: ['Male', 'Female', 'Non-binary', DECLINE],
    ethnicity: [
      'American Indian or Alaska Native',
      'Asian',
      'Black or African American',
      'Hispanic or Latino',
      'Native Hawaiian or Other Pacific Islander',
      'White',
      'Two or More Races',
      DECLINE,
    ],
    veteran: ['I am not a protected veteran', 'I identify as one or more of the classifications of protected veteran', DECLINE],
    disability: ['No, I do not have a disability', 'Yes, I have a disability (or previously had a disability)', DECLINE],
    degree: ['High School', 'Associate', "Bachelor's", "Master's", 'MBA', 'PhD', 'JD', 'MD', 'Other'],
    remote: ['Remote', 'Hybrid', 'On-site', 'Any'],
    salaryPeriod: ['Yearly', 'Monthly', 'Hourly'],
  };

  // Field definitions for the flat sections. `type` drives the editor UI;
  // `choices` names a CHOICES list. Keys double as profile paths.
  const SECTIONS = [
    {
      id: 'personal',
      title: 'Personal info',
      fields: [
        { key: 'firstName', label: 'First name', autocomplete: 'given-name' },
        { key: 'middleName', label: 'Middle name', autocomplete: 'additional-name' },
        { key: 'lastName', label: 'Last name', autocomplete: 'family-name' },
        { key: 'preferredName', label: 'Preferred name' },
        { key: 'pronouns', label: 'Pronouns' },
        { key: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
        { key: 'phone', label: 'Phone', type: 'tel', autocomplete: 'tel' },
        { key: 'address1', label: 'Street address', autocomplete: 'address-line1' },
        { key: 'address2', label: 'Address line 2', autocomplete: 'address-line2' },
        { key: 'city', label: 'City', autocomplete: 'address-level2' },
        { key: 'state', label: 'State / province', autocomplete: 'address-level1' },
        { key: 'postalCode', label: 'ZIP / postal code', autocomplete: 'postal-code' },
        { key: 'country', label: 'Country', autocomplete: 'country-name' },
        { key: 'linkedin', label: 'LinkedIn URL', type: 'url' },
        { key: 'github', label: 'GitHub URL', type: 'url' },
        { key: 'portfolio', label: 'Portfolio / website URL', type: 'url' },
        { key: 'twitter', label: 'X / Twitter URL', type: 'url' },
      ],
    },
    {
      id: 'authorization',
      title: 'Work authorization',
      fields: [
        { key: 'authorizedToWork', label: 'Legally authorized to work in your country of residence?', type: 'select', choices: 'yesNo' },
        { key: 'requireSponsorship', label: 'Will you now or in the future require visa sponsorship?', type: 'select', choices: 'yesNo' },
        { key: 'workAuthStatus', label: 'Citizenship / visa status (e.g. US Citizen, Green Card, H-1B)' },
        { key: 'over18', label: 'Are you 18 or older?', type: 'select', choices: 'yesNo' },
        { key: 'securityClearance', label: 'Security clearance (if any)' },
      ],
    },
    {
      id: 'preferences',
      title: 'Job preferences',
      fields: [
        { key: 'desiredTitle', label: 'Desired job title' },
        { key: 'willingToRelocate', label: 'Willing to relocate?', type: 'select', choices: 'yesNo' },
        { key: 'remotePreference', label: 'Work arrangement preference', type: 'select', choices: 'remote' },
        { key: 'salaryExpectation', label: 'Salary expectation (number or range)' },
        { key: 'salaryCurrency', label: 'Salary currency', placeholder: 'USD' },
        { key: 'salaryPeriod', label: 'Salary period', type: 'select', choices: 'salaryPeriod' },
        { key: 'startDate', label: 'Earliest start date', type: 'date' },
        { key: 'noticePeriod', label: 'Notice period (e.g. 2 weeks)' },
        { key: 'howDidYouHear', label: 'How did you hear about us? (default answer)', placeholder: 'LinkedIn' },
        { key: 'yearsExperience', label: 'Total years of professional experience', type: 'number' },
        { key: 'previouslyEmployed', label: 'Have you previously worked for the companies you usually apply to?', type: 'select', choices: 'yesNo' },
      ],
    },
    {
      id: 'eeo',
      title: 'Voluntary self-identification (EEO)',
      note: 'Optional. These answers are only used for the voluntary demographic questions many US employers ask.',
      fields: [
        { key: 'gender', label: 'Gender', type: 'select', choices: 'gender' },
        { key: 'transgender', label: 'Do you identify as transgender?', type: 'select', choices: 'yesNoDecline' },
        { key: 'sexualOrientation', label: 'Sexual orientation', placeholder: DECLINE },
        { key: 'hispanicLatino', label: 'Are you Hispanic or Latino?', type: 'select', choices: 'yesNoDecline' },
        { key: 'ethnicity', label: 'Race / ethnicity', type: 'select', choices: 'ethnicity' },
        { key: 'veteranStatus', label: 'Veteran status', type: 'select', choices: 'veteran' },
        { key: 'disabilityStatus', label: 'Disability status', type: 'select', choices: 'disability' },
      ],
    },
  ];

  // Repeating sections.
  const LISTS = {
    work: {
      title: 'Work history',
      itemLabel: 'Position',
      fields: [
        { key: 'company', label: 'Company' },
        { key: 'title', label: 'Job title' },
        { key: 'location', label: 'Location' },
        { key: 'startDate', label: 'Start (YYYY-MM)', type: 'month' },
        { key: 'endDate', label: 'End (YYYY-MM)', type: 'month' },
        { key: 'current', label: 'I currently work here', type: 'checkbox' },
        { key: 'description', label: 'Description', type: 'textarea' },
      ],
    },
    education: {
      title: 'Education',
      itemLabel: 'School',
      fields: [
        { key: 'school', label: 'School' },
        { key: 'degree', label: 'Degree', type: 'select', choices: 'degree' },
        { key: 'field', label: 'Field of study' },
        { key: 'startDate', label: 'Start (YYYY-MM)', type: 'month' },
        { key: 'endDate', label: 'End / expected (YYYY-MM)', type: 'month' },
        { key: 'gpa', label: 'GPA' },
      ],
    },
  };

  function emptyItem(listName) {
    const item = {};
    for (const f of LISTS[listName].fields) item[f.key] = f.type === 'checkbox' ? false : '';
    return item;
  }

  function defaultProfile() {
    const p = { version: SCHEMA_VERSION };
    for (const s of SECTIONS) {
      p[s.id] = {};
      for (const f of s.fields) p[s.id][f.key] = '';
    }
    for (const k of Object.keys(p.eeo)) p.eeo[k] = DECLINE;
    p.work = [];
    p.education = [];
    p.skills = [];
    p.summary = '';
    p.coverLetter = '';
    // Custom Q&A: { id, question, answer, updatedAt }
    p.custom = [];
    return p;
  }

  // Merge stored data onto the defaults so new schema fields always exist and
  // unknown junk from an import is dropped.
  function normalize(input) {
    const base = defaultProfile();
    if (!input || typeof input !== 'object') return base;
    for (const s of SECTIONS) {
      const src = input[s.id];
      if (src && typeof src === 'object') {
        for (const f of s.fields) {
          if (src[f.key] != null) base[s.id][f.key] = String(src[f.key]);
        }
      }
    }
    for (const listName of Object.keys(LISTS)) {
      if (Array.isArray(input[listName])) {
        base[listName] = input[listName]
          .filter((x) => x && typeof x === 'object')
          .map((x) => {
            const item = emptyItem(listName);
            for (const f of LISTS[listName].fields) {
              if (x[f.key] == null) continue;
              item[f.key] = f.type === 'checkbox' ? !!x[f.key] : String(x[f.key]);
            }
            return item;
          });
      }
    }
    if (Array.isArray(input.skills)) {
      base.skills = input.skills.map((s) => String(s).trim()).filter(Boolean);
    } else if (typeof input.skills === 'string') {
      base.skills = input.skills.split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (typeof input.summary === 'string') base.summary = input.summary;
    if (typeof input.coverLetter === 'string') base.coverLetter = input.coverLetter;
    if (Array.isArray(input.custom)) {
      base.custom = input.custom
        .filter((q) => q && q.question)
        .map((q) => ({
          id: String(q.id || makeId()),
          question: String(q.question),
          answer: q.answer == null ? '' : String(q.answer),
          updatedAt: Number(q.updatedAt) || Date.now(),
        }));
    }
    return base;
  }

  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  JF.schema = { SCHEMA_VERSION, DECLINE, CHOICES, SECTIONS, LISTS, defaultProfile, normalize, emptyItem, makeId };
})();
