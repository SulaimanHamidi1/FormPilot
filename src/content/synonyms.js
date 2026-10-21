// Keyword/synonym rules mapping form fields to profile keys. Exposes
// JF.synonyms. Phrases are matched as whole words against normalised label
// text; `attrs` are matched against normalised name/id/automation ids;
// `not` phrases veto the rule; `kinds` restricts the field types.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  if (JF.synonyms) return;

  const R = (key, phrases, extra = {}) => ({ key, phrases, ...extra });

  const RULES = [
    // ---- Name ----
    R('personal.firstName', ['first name', 'given name', 'forename', 'legal first name', 'first'], {
      attrs: ['first name', 'firstname', 'fname', 'given name', 'givenname', 'first'],
      autocomplete: ['given-name'],
      not: ['last', 'preferred', 'nickname', 'emergency', 'reference', 'referrer', 'referral'],
    }),
    R('personal.middleName', ['middle name', 'middle initial', 'middle'], {
      attrs: ['middle name', 'middlename', 'mname', 'middle initial'],
      autocomplete: ['additional-name'],
    }),
    R('personal.lastName', ['last name', 'surname', 'family name', 'legal last name', 'last'], {
      attrs: ['last name', 'lastname', 'lname', 'surname', 'family name', 'familyname'],
      autocomplete: ['family-name'],
      not: ['first', 'emergency', 'reference', 'referrer', 'referral'],
    }),
    R('personal.preferredName', ['preferred name', 'preferred first name', 'nickname', 'name you go by', 'goes by'], {
      attrs: ['preferred name', 'preferredname', 'nickname'],
      autocomplete: ['nickname'],
    }),
    R('personal.fullName', ['full name', 'name', 'legal name', 'your name', 'full legal name', 'candidate name', 'applicant name', 'signature'], {
      attrs: ['full name', 'fullname', 'name', 'candidate name', 'applicant name', 'systemfield name'],
      autocomplete: ['name'],
      not: ['first', 'last', 'middle', 'company', 'school', 'university', 'employer', 'user', 'username', 'file', 'reference', 'referrer', 'referral', 'emergency', 'manager', 'supervisor', 'recruiter', 'pronunciation', 'preferred', 'institution', 'organization', 'degree', 'job', 'position', 'domain', 'event'],
    }),
    R('personal.pronouns', ['pronouns', 'preferred pronouns', 'gender pronouns'], { attrs: ['pronouns', 'pronoun'] }),

    // ---- Contact ----
    R('personal.email', ['email', 'email address', 'e mail', 'confirm email', 're enter email'], {
      attrs: ['email', 'e mail', 'emailaddress', 'mail'],
      autocomplete: ['email'],
      not: ['reference', 'referrer', 'referral', 'manager', 'supervisor', 'emergency', 'opt in', 'subscribe', 'updates', 'newsletter'],
    }),
    R('personal.phone', ['phone', 'phone number', 'mobile', 'mobile phone', 'cell', 'cell phone', 'telephone', 'contact number', 'primary phone'], {
      attrs: ['phone', 'phonenumber', 'mobile', 'cell', 'tel', 'telephone', 'phone number'],
      autocomplete: ['tel', 'tel-national'],
      not: ['reference', 'referrer', 'emergency', 'country code', 'extension', 'type', 'device type', 'sms', 'text message'],
    }),
    R('personal.address1', ['address', 'street address', 'address line 1', 'street', 'mailing address', 'home address', 'address 1'], {
      attrs: ['address', 'address1', 'addressline1', 'address line1', 'street', 'street address'],
      autocomplete: ['street-address', 'address-line1'],
      not: ['email', 'line 2', 'address 2', 'ip', 'web', 'url'],
    }),
    R('personal.address2', ['address line 2', 'address 2', 'apartment', 'suite', 'apt', 'unit'], {
      attrs: ['address2', 'addressline2', 'address line2', 'apt', 'suite'],
      autocomplete: ['address-line2'],
    }),
    R('personal.city', ['city', 'town', 'city town', 'municipality'], {
      attrs: ['city', 'town', 'locality'],
      autocomplete: ['address-level2'],
      not: ['ethnicity', 'electricity'],
    }),
    R('personal.state', ['state', 'province', 'state province', 'region', 'county', 'state region'], {
      attrs: ['state', 'province', 'region'],
      autocomplete: ['address-level1'],
      not: ['statement', 'united states', 'status', 'state your', 'please state', 'salary'],
    }),
    R('personal.postalCode', ['zip', 'zip code', 'postal code', 'postcode', 'zip postal code'], {
      attrs: ['zip', 'zipcode', 'postal', 'postalcode', 'postcode'],
      autocomplete: ['postal-code'],
    }),
    R('personal.country', ['country', 'country of residence', 'country region', 'current country'], {
      attrs: ['country', 'countrydropdown', 'country region'],
      autocomplete: ['country', 'country-name'],
      not: ['phone', 'code', 'citizenship', 'authorized', 'calling', 'dial', 'countries'],
    }),
    R('personal.location', ['location', 'current location', 'where are you located', 'city and state', 'city state', 'based', 'where are you based', 'location city'], {
      attrs: ['location', 'current location', 'candidate location'],
      not: ['preferred', 'office', 'desired', 'willing', 'relocate', 'job location', 'work location'],
    }),

    // ---- Links ----
    R('personal.linkedin', ['linkedin', 'linkedin profile', 'linkedin url'], { attrs: ['linkedin'] }),
    R('personal.github', ['github', 'github profile', 'github url'], { attrs: ['github'] }),
    R('personal.twitter', ['twitter', 'x twitter', 'twitter url'], { attrs: ['twitter'] }),
    R('personal.portfolio', ['portfolio', 'website', 'personal website', 'portfolio url', 'personal site', 'blog', 'other website', 'web site', 'homepage'], {
      attrs: ['portfolio', 'website', 'web site', 'homepage', 'personal url', 'url'],
      autocomplete: ['url'],
      not: ['linkedin', 'github', 'twitter', 'company website', 'company url'],
    }),

    // ---- Current job / work history ----
    R('work.company', ['current company', 'current employer', 'company', 'employer', 'company name', 'employer name', 'organization', 'most recent employer', 'present employer'], {
      attrs: ['company', 'employer', 'org', 'organization', 'company name', 'current company'],
      autocomplete: ['organization'],
      not: ['website', 'url', 'size', 'previously worked', 'worked for', 'know anyone', 'referr', 'why', 'hear', 'address', 'phone', 'industry'],
    }),
    R('work.title', ['current title', 'job title', 'title', 'current job title', 'position', 'role', 'current role', 'current position', 'most recent title'], {
      attrs: ['title', 'job title', 'jobtitle', 'position', 'current title'],
      autocomplete: ['organization-title'],
      not: ['desired', 'applying', 'apply', 'interested', 'preferred', 'why', 'courtesy', 'mr', 'salutation', 'prefix', 'hear', 'refer', 'other position', 'position you'],
    }),
    R('work.location', ['work location', 'job location', 'company location', 'employer location'], { attrs: ['work location', 'job location'], listOnly: true }),
    R('work.startDate', ['start date', 'from', 'date started', 'employment start', 'start'], {
      attrs: ['start date', 'startdate', 'from', 'date from'],
      listOnly: true,
      not: ['earliest', 'available', 'availability', 'when can you', 'expected', 'school', 'education'],
    }),
    R('work.endDate', ['end date', 'to', 'date ended', 'employment end', 'end'], {
      attrs: ['end date', 'enddate', 'to', 'date to'],
      listOnly: true,
      not: ['school', 'education', 'graduation'],
    }),
    R('work.current', ['i currently work here', 'current job', 'currently work here', 'current position', 'present'], {
      attrs: ['current', 'currently work here', 'is current'],
      kinds: ['checkbox'],
      listOnly: true,
    }),
    R('work.description', ['description', 'role description', 'responsibilities', 'job description', 'duties'], {
      attrs: ['description', 'role description', 'responsibilities'],
      kinds: ['textarea'],
      listOnly: true,
    }),

    // ---- Education ----
    R('education.school', ['school', 'university', 'college', 'institution', 'school name', 'university name', 'school university', 'educational institution', 'name of school', 'most recent school'], {
      attrs: ['school', 'university', 'college', 'institution', 'school name'],
      not: ['high school diploma', 'graduated', 'currently enrolled', 'attend'],
    }),
    R('education.degree', ['degree', 'degree type', 'highest degree', 'level of education', 'highest level of education', 'education level', 'degree obtained', 'qualification'], {
      attrs: ['degree', 'degree type', 'education level'],
      not: ['field', 'major', 'discipline', 'do you have', 'bachelor s degree or', 'requirement'],
    }),
    R('education.field', ['field of study', 'major', 'discipline', 'area of study', 'concentration', 'specialization', 'program', 'course of study'], {
      attrs: ['field of study', 'major', 'discipline', 'field', 'study'],
    }),
    R('education.gpa', ['gpa', 'grade point average', 'grade', 'cumulative gpa', 'overall result'], { attrs: ['gpa', 'grade'] }),
    R('education.startDate', ['education start', 'school start', 'start date', 'from', 'start'], {
      attrs: ['start date', 'startdate', 'from'],
      listOnly: true,
      section: 'education',
    }),
    R('education.endDate', ['graduation date', 'graduation year', 'expected graduation', 'end date', 'year of graduation', 'to', 'end'], {
      attrs: ['graduation', 'end date', 'enddate', 'to', 'grad year'],
      section: 'education',
      listOnly: true,
    }),
    R('education.endDate', ['graduation date', 'graduation year', 'expected graduation date', 'year of graduation', 'when did you graduate', 'expected graduation'], {
      attrs: ['graduation', 'grad year', 'graduation date'],
    }),

    // ---- Skills / text ----
    R('skills', ['skills', 'technical skills', 'key skills', 'skill set', 'technologies', 'relevant skills'], { attrs: ['skills', 'skill'] }),
    R('summary', ['summary', 'professional summary', 'about you', 'tell us about yourself', 'bio', 'about me', 'introduce yourself'], {
      attrs: ['summary', 'bio', 'about'],
      kinds: ['textarea', 'text'],
    }),
    R('coverLetter', ['cover letter', 'covering letter', 'motivation letter', 'letter of motivation'], {
      attrs: ['cover letter', 'coverletter', 'cover'],
      kinds: ['textarea', 'file'],
    }),
    R('resume', ['resume', 'cv', 'resume cv', 'upload resume', 'attach resume', 'curriculum vitae', 'resume file'], {
      attrs: ['resume', 'cv', 'curriculum vitae', 'resume file'],
      kinds: ['file'],
      not: ['cover'],
    }),

    // ---- Work authorization ----
    R('authorization.requireSponsorship', ['sponsorship', 'require sponsorship', 'visa sponsorship', 'need sponsorship', 'sponsor', 'immigration sponsorship', 'employment visa', 'require a visa', 'h 1b'], {
      attrs: ['sponsorship', 'sponsor', 'visa sponsorship', 'require sponsorship'],
      not: ['without sponsorship', 'without the need', 'without requiring', 'without needing', 'without any'],
    }),
    R('authorization.authorizedToWork', ['authorized to work', 'legally authorized', 'eligible to work', 'right to work', 'work authorization', 'legally eligible', 'authorised to work', 'legal right to work', 'permitted to work', 'work permit'], {
      attrs: ['authorized', 'work authorization', 'eligible to work', 'right to work', 'legally authorized'],
    }),
    R('authorization.workAuthStatus', ['citizenship', 'visa status', 'work authorization status', 'immigration status', 'current visa', 'citizenship status', 'type of visa', 'work visa', 'residency status'], {
      attrs: ['citizenship', 'visa status', 'visa type', 'immigration status'],
      not: ['require', 'need', 'sponsor'],
    }),
    R('authorization.over18', ['18 years', 'at least 18', 'over 18', '18 or older', 'legal age', 'age of 18', 'eighteen'], { attrs: ['over18', 'age18', 'at least 18'] }),
    R('authorization.securityClearance', ['security clearance', 'clearance', 'active clearance'], { attrs: ['clearance', 'security clearance'] }),

    // ---- Preferences ----
    R('preferences.willingToRelocate', ['relocate', 'relocation', 'willing to relocate', 'open to relocation', 'open to relocating'], { attrs: ['relocate', 'relocation'] }),
    R('preferences.remotePreference', ['remote', 'work arrangement', 'remote or onsite', 'work model', 'workplace type', 'prefer to work remotely', 'hybrid'], {
      attrs: ['remote', 'work arrangement', 'workplace'],
      not: ['commute', 'on site', 'able to work in', 'office days'],
    }),
    R('preferences.salaryExpectation', ['salary', 'salary expectation', 'expected salary', 'desired salary', 'compensation expectation', 'desired compensation', 'expected compensation', 'salary requirements', 'pay expectation', 'base salary', 'salary range', 'compensation'], {
      attrs: ['salary', 'compensation', 'desired salary', 'expected salary', 'pay'],
      not: ['currency', 'current salary', 'current compensation', 'period', 'frequency'],
    }),
    R('preferences.salaryCurrency', ['currency', 'salary currency'], { attrs: ['currency'] }),
    R('preferences.startDate', ['start date', 'earliest start date', 'available start date', 'availability date', 'when can you start', 'date available', 'available to start', 'availability', 'earliest date', 'when would you be available'], {
      attrs: ['start date', 'startdate', 'available date', 'availability', 'earliest start'],
      not: ['end', 'school', 'employment start'],
    }),
    R('preferences.noticePeriod', ['notice period', 'notice', 'how much notice', 'current notice'], { attrs: ['notice', 'notice period'] }),
    R('preferences.howDidYouHear', ['how did you hear', 'hear about us', 'hear about this', 'source', 'how did you find', 'referral source', 'where did you hear', 'how did you learn', 'where did you find'], {
      attrs: ['source', 'how did you hear', 'referral source', 'hear about', 'sourcedropdown'],
      not: ['open source'],
    }),
    R('preferences.desiredTitle', ['desired title', 'desired position', 'position applying', 'role applying', 'desired job title'], { attrs: ['desired title', 'desired position'] }),
    R('preferences.yearsExperience', ['years of experience', 'years experience', 'how many years', 'total experience', 'years of professional experience', 'total years'], {
      attrs: ['years experience', 'years of experience', 'yoe', 'experience years'],
    }),

    // ---- EEO ----
    R('eeo.gender', ['gender', 'sex', 'gender identity', 'what is your gender'], {
      attrs: ['gender', 'sex'],
      not: ['pronoun', 'transgender', 'orientation'],
    }),
    R('eeo.transgender', ['transgender', 'trans'], { attrs: ['transgender'] }),
    R('eeo.sexualOrientation', ['sexual orientation', 'orientation', 'lgbtq'], { attrs: ['sexual orientation', 'orientation'] }),
    R('eeo.hispanicLatino', ['hispanic', 'latino', 'hispanic latino', 'hispanic or latino'], {
      attrs: ['hispanic', 'latino', 'hispanic ethnicity'],
      not: ['race'],
    }),
    R('eeo.ethnicity', ['race', 'ethnicity', 'race ethnicity', 'ethnic background', 'racial', 'ethnic origin'], {
      attrs: ['race', 'ethnicity', 'ethnic'],
    }),
    R('eeo.veteranStatus', ['veteran', 'veteran status', 'protected veteran', 'military service', 'military status'], {
      attrs: ['veteran', 'veteran status', 'military'],
    }),
    R('eeo.disabilityStatus', ['disability', 'disability status', 'disabled', 'have a disability'], {
      attrs: ['disability', 'disability status', 'disabled'],
      not: ['accommodation', 'insurance'],
    }),
  ];

  // Questions we never answer automatically (consents, legal attestations).
  const NEVER = /\b(i agree|agree to|terms|privacy|consent|certify|acknowledge|attest|signature date|captcha|password|i understand|subscribe|newsletter|marketing|opt in|security code|recaptcha|sms opt)\b/;

  JF.synonyms = { RULES, NEVER };
})();
