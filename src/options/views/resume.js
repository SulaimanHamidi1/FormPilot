// Resume view: upload, parse locally, review, apply to profile.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  JF.views = JF.views || {};
  const { h, toast, sectionForm, listForm, skillsForm, textForm, sectionById } = JF.forms;

  const fmtSize = (n) => (n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

  function storedCard(resume, onChange) {
    if (!resume) {
      return h('div.card', {}, h('h3', {}, 'No resume saved yet'),
        h('p.muted', {}, 'Upload one below. It will be attached automatically to resume upload fields on applications.'));
    }
    const download = () => {
      const a = h('a', { href: resume.dataUrl, download: resume.name });
      a.click();
    };
    const remove = async () => {
      await JF.storage.removeResume();
      toast('Resume removed.');
      onChange();
    };
    return h('div.card', {},
      h('h3', {}, 'Saved resume'),
      h('p', {}, h('strong', {}, resume.name), h('span.muted', {}, ` · ${fmtSize(resume.size)} · added ${new Date(resume.updatedAt).toLocaleDateString()}`)),
      h('p.muted', {}, 'This file is attached automatically to resume upload fields.'),
      h('div.actions', {},
        h('button.secondary', { type: 'button', onclick: download }, 'Download'),
        resume.text ? h('button.secondary', { type: 'button', onclick: () => onChange({ reparse: resume.text }) }, 'Re-read into profile') : null,
        h('button.secondary.danger', { type: 'button', onclick: remove }, 'Remove')
      )
    );
  }

  // Drop zone + file picker. Calls onParsed(parsed) after saving the file.
  function uploader(onParsed, { doneText = 'Done. Review what we found below.' } = {}) {
    const status = h('p.muted', { 'aria-live': 'polite' });
    const input = h('input', { type: 'file', accept: '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain', hidden: true });
    const handle = async (file) => {
      if (!file) return;
      if (!JF.resumeExtract.kindOf(file)) {
        status.textContent = 'Please choose a PDF, DOCX or TXT file.';
        return;
      }
      status.textContent = 'Reading ' + file.name + '…';
      try {
        const text = await JF.resumeExtract.extractText(file);
        await JF.storage.saveResume(file, text);
        const parsed = JF.resumeParse.parseText(text);
        status.textContent = text.trim() ? doneText : 'Saved, but no text could be read (scanned PDF?). Fill your profile manually.';
        onParsed(parsed, true);
      } catch (e) {
        status.textContent = 'Could not read that file: ' + e.message;
      }
    };
    input.addEventListener('change', () => handle(input.files[0]));
    const zone = h('div.dropzone', {
      tabIndex: 0,
      role: 'button',
      onclick: () => input.click(),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } },
      ondragover: (e) => { e.preventDefault(); zone.classList.add('over'); },
      ondragleave: () => zone.classList.remove('over'),
      ondrop: (e) => { e.preventDefault(); zone.classList.remove('over'); handle(e.dataTransfer.files[0]); },
    },
      h('strong', {}, 'Drop your resume here or click to choose'),
      h('span.muted', {}, 'PDF, DOCX or TXT, up to 5 MB. Parsed on this device only.')
    );
    return h('div', {}, zone, input, status);
  }

  // Editable review of parsed data merged onto the current profile.
  function reviewPanel(parsed, profile, onSaved) {
    const root = h('div.card.review');
    let overwrite = false;
    const render = () => {
      const draft = JF.resumeParse.mergeIntoProfile(profile, parsed, { overwrite });
      const found = [
        Object.values(parsed.personal || {}).filter(Boolean).length + ' contact fields',
        (parsed.work || []).length + ' positions',
        (parsed.education || []).length + ' schools',
        (parsed.skills || []).length + ' skills',
      ].join(', ');
      const save = async () => {
        await JF.storage.saveProfile(draft);
        toast('Profile updated from resume.');
        onSaved(draft);
      };
      root.replaceChildren(
        h('h3', {}, 'Review what we found'),
        h('p.muted', {}, `Found ${found}. Correct anything that looks off, then save.`),
        h('label.check', {}, h('input', { type: 'checkbox', checked: overwrite, onchange: (e) => { overwrite = e.target.checked; render(); } }), ' Replace information already in my profile'),
        h('h4', {}, 'Personal info'),
        sectionForm(sectionById('personal'), draft.personal),
        h('h4', {}, 'Work history'),
        listForm('work', draft.work),
        h('h4', {}, 'Education'),
        listForm('education', draft.education),
        h('h4', {}, 'Skills & summary'),
        skillsForm(draft),
        textForm('Summary', draft, 'summary', undefined, 3),
        h('div.actions.sticky', {}, h('button.primary', { type: 'button', onclick: save }, 'Save to profile'))
      );
    };
    render();
    return root;
  }

  async function render(container) {
    const [resume, profile] = await Promise.all([JF.storage.getResume(), JF.storage.getProfile()]);
    const reviewHost = h('div');
    const showReview = (parsed) => {
      reviewHost.replaceChildren(reviewPanel(parsed, profile, () => render(container)));
      reviewHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const onStoredChange = (opts) => {
      if (opts && opts.reparse) showReview(JF.resumeParse.parseText(opts.reparse));
      else render(container);
    };
    container.replaceChildren(
      h('h2', {}, 'Resume'),
      storedCard(resume, onStoredChange),
      h('div.card', {}, h('h3', {}, resume ? 'Replace resume' : 'Upload resume'), uploader((parsed) => {
        JF.storage.getResume().then((r) => {
          const stored = storedCard(r, onStoredChange);
          container.children[1].replaceWith(stored);
        });
        showReview(parsed);
      })),
      reviewHost
    );
  }

  JF.views.resume = { title: 'Resume', render, uploader, reviewPanel };
})();
