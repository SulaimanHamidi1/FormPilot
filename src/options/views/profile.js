// Profile editor: every section on one page, saved automatically.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  JF.views = JF.views || {};
  const { h, sectionForm, listForm, skillsForm, textForm, sectionById } = JF.forms;

  async function render(container) {
    const profile = await JF.storage.getProfile();
    const status = h('span.muted.small', { 'aria-live': 'polite' }, 'All changes saved');
    let timer;
    const changed = () => {
      status.textContent = 'Saving…';
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await JF.storage.saveProfile(profile);
        status.textContent = 'All changes saved';
      }, 400);
    };
    const card = (title, ...body) => h('section.card', {}, h('h3', {}, title), ...body);
    const s = (id) => card(sectionById(id).title, sectionForm(sectionById(id), profile[id], changed));

    container.replaceChildren(
      h('div.view-head', {}, h('h2', {}, 'Profile'), status),
      s('personal'),
      card('Work history', listForm('work', profile.work, changed)),
      card('Education', listForm('education', profile.education, changed)),
      card('Skills & summary',
        skillsForm(profile, changed),
        textForm('Professional summary', profile, 'summary', changed, 4),
        textForm('Default cover letter', profile, 'coverLetter', changed, 8)
      ),
      s('authorization'),
      s('preferences'),
      s('eeo')
    );
  }

  JF.views.profile = { title: 'Profile', render };
})();
