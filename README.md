# job_filler

A lightweight Chrome extension (Manifest V3) that fills job applications from a
profile you set up once. Everything stays on your device in
`chrome.storage.local`. There are no servers, accounts or analytics.

- Imports your resume (PDF, DOCX or TXT), parsed locally, to pre-fill your profile
- Walks you through the questions applications ask: work history, education,
  work authorization, sponsorship, salary, notice period, relocation, EEO answers
- Fills text fields, dropdowns (native and custom, e.g. react-select and Workday),
  radios, checkboxes, Yes/No toggle buttons, dates and resume uploads, firing the
  events React, Vue and Angular forms need
- Asks you about questions it can't answer, then saves your answers and reuses
  them on other sites, even when the wording differs
- Never submits anything. You review and submit yourself.

## Install (load unpacked)

1. Clone this repo.
2. Open `chrome://extensions` in Chrome (or another Chromium browser).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the repo folder (the one containing
   `manifest.json`).
5. The settings page opens on first install. Pin the extension from the puzzle
   icon in the toolbar.

No build step is needed. After pulling changes, press the reload icon on the
extension's card in `chrome://extensions`.

## Use

1. **Set up your profile.** The **Get started** page takes about 5 minutes.
   Upload your resume first to pre-fill most of it.
2. **Open a job application** and press **Alt+Shift+J**, or click the toolbar
   icon and then **Fill this page**. You can change the shortcut at
   `chrome://extensions/shortcuts`.
3. Filled fields get a green outline. Questions job_filler couldn't answer get an
   amber outline and appear in a small panel in the corner. Answer them there and
   they're filled in and saved for next time. **Skip** ignores a question once;
   **Don't ask** ignores it for good.
4. Check everything, then submit yourself.

### On-page button

Turn on **Settings & backup → On-page button** to show the job_filler logo on the
right edge of pages that look like a job application. Click it to fill the
form; hover and click **×** to stop showing it on that site. Choose **On job
application sites** (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, iCIMS
and similar) or **On any site with an application form**; Chrome asks for access
to those sites when you turn it on. The button script is about 8 KB and only
looks for name, email, phone and resume fields; the filler still loads only when
you click.

On multi-step applications (Workday, iCIMS, Taleo, SuccessFactors, Jobvite),
each new step is filled automatically after your first fill. Turn this off in
**Settings & backup**.

### Managing your data

The settings page (right-click the toolbar icon, then **Options**) has:

- **Resume**: replace, download or remove your resume, or re-read it into
  your profile
- **Profile**: every saved field, saved as you type
- **Saved answers**: search, edit, add or delete answers to custom questions
- **Settings & backup**: highlighting, prompting, overwriting existing values,
  multi-step mode, embedded forms, JSON export/import, and deleting all data

## Supported sites

Any HTML form works. Matching uses labels, `aria-*`, `name`/`id`, placeholders,
`autocomplete` attributes and nearby text, plus a synonym list and fuzzy
matching. It has been tuned against:

| Platform | Notes |
| --- | --- |
| Greenhouse | Classic boards and the newer job-boards UI (react-select dropdowns, "Attach" resume buttons) |
| Lever | Card questions, checkbox groups, location autocomplete, EEO section |
| Ashby | Yes/No toggle buttons, location autocomplete; skips Ashby's own "autofill from resume" uploader |
| SmartRecruiters | Fields inside open shadow roots (`spl-*` web components) |
| Workday | Listbox buttons, search prompts, split Month/Year dates, numbered work/education blocks, step-by-step flow |
| iCIMS | Forms inside the same-origin `icims_content_iframe` |

Consent checkboxes, legal attestations, CAPTCHAs and passwords are never
touched. Sites that need an account first (often Workday and iCIMS) still need
you to sign in yourself.

## Permissions

- `storage`: saves your profile locally.
- `activeTab` + `scripting`: injects the filler into the current tab only when
  you press Fill or the shortcut. Nothing runs on pages otherwise.
- `<all_urls>` (optional, off by default): needed for application forms
  embedded in an iframe from another domain, or for the on-page button on all
  sites. Turn it on in **Settings & backup**.
- Job site domains (optional, off by default): only requested when you show the
  on-page button on job application sites.

## Performance

The content scripts (about 96 KB unminified, 21 KB gzipped) are injected only
when you trigger a fill. In Chrome on the 29-field test form:

- evaluating the scripts takes about 2 ms
- scanning and matching take about 20 ms
- a complete fill takes about 340 ms, most of it a 300 ms pause that lets
  follow-up fields appear before a second pass

A 281-field page fills in about 0.5 s. pdf.js (about 1.8 MB) loads only on the
options page, when you upload a PDF.

## Development

```
npm install        # dev dependencies: jsdom, pdf.js, esbuild
npm test           # unit + jsdom tests (parser, matching, filling, ATS fixtures)
npm run serve      # serves the repo at http://127.0.0.1:8787 for the test pages
npm run vendor     # re-copies pdf.js into lib/pdfjs after upgrading it
```

Test pages live in `test/pages/forms/`: a generic form, a React form, live
react-select, and fixtures that mirror Greenhouse, Lever, Ashby,
SmartRecruiters, Workday and iCIMS. To try the filler on one without loading the
extension, open it via `npm run serve` and run this in the console:

```js
await import('/test/pages/inject.js'); await jfInject({ seed: true }); await JF.run();
```

`test/pages/options.html` runs the real options page with a local stand-in for
`chrome.storage`. `tools/debug-match.js <page>` prints how each field on a page
is matched. `tools/probe.js` builds a read-only detection probe for checking
live sites from the devtools console.

## Project layout

```
manifest.json            MV3 manifest
src/background/sw.js     service worker: injects content scripts on demand, relays answers between frames
src/content/             content scripts (injected only when you fill)
  synonyms.js            keyword/synonym rules per profile field
  detect.js              single-pass field detection (labels, groups, shadow DOM, sections)
  match.js               scoring, saved-answer fuzzy matching, option picking
  fill.js                framework-safe value setting, dropdowns, uploads, highlighting
  ui.js, prompt.js       on-page toast and unknown-question panel (isolated shadow root)
  main.js                entry point, multi-step watcher
  launcher.js            optional on-page logo button (the only script that runs on its own)
src/options/             settings page: onboarding, resume import, profile, saved answers, backup
src/popup/               toolbar popup
src/shared/              profile schema, storage helpers, text utilities
lib/pdfjs/               vendored pdf.js (legacy build, Apache-2.0)
test/                    node:test suites, fixtures and test pages
tools/                   icon generator, fixture builder, dev server, debugging helpers
```

## Limitations

- Scanned (image-only) PDFs have no text to parse; fill the profile manually.
- Closed shadow roots and cross-origin iframes (without the optional
  permission) can't be read.
- Resume parsing is heuristic. Review what it found before saving.
