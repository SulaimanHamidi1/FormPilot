// Step-by-step onboarding questionnaire. Each step edits an in-memory draft
// that is saved whenever the user moves between steps.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  JF.views = JF.views || {};
  const { h, toast, sectionForm, listForm, skillsForm, textForm, sectionById } = JF.forms;

  // Questions many applications ask that don't fit the fixed schema. Answers
  // are stored in the custom Q&A list and matched by question text.
  const COMMON_QUESTIONS = [
    { question: 'Are you willing to undergo a background check?', type: 'yesNo' },
    { question: 'Are you willing to undergo a drug test?', type: 'yesNo' },
    { question: "Do you have a valid driver's license?", type: 'yesNo' },
    { question: 'Are you currently employed?', type: 'yesNo' },
    { question: 'Are you able to work on-site / commute to the office?', type: 'yesNo' },
    { question: 'Are you willing to travel for work?', type: 'yesNo' },
    { question: 'Can you work evenings or weekends if needed?', type: 'yesNo' },
    { question: 'What languages do you speak?' },
    { question: 'Why are you interested in this role?', type: 'textarea' },
    { question: 'Tell us about yourself.', type: 'textarea' },
  ];

  const sectionStep = (id, intro) => ({
    title: sectionById(id).title,
    render: (draft) => [intro ? h('p.muted', {}, intro) : null, sectionForm(sectionById(id), draft[id])],
  });

  const STEPS = [
    {
      title: 'Welcome',
      render: (draft, ctx) => {
        const note = h('p.muted', { 'aria-live': 'polite' });
        return [
          h('p', {}, 'FormPilot fills job applications from the answers you give here. It takes about 5 minutes, and you can change anything later.'),
          h('p', {}, 'Start by uploading your resume so we can pre-fill the next steps. You can also skip this.'),
          JF.views.resume.uploader((parsed) => {
            Object.assign(draft, JF.resumeParse.mergeIntoProfile(draft, parsed));
            const counts = `${(parsed.work || []).length} positions, ${(parsed.education || []).length} schools, ${(parsed.projects || []).length} projects, ${(parsed.skills || []).length} skills`;
            note.textContent = `Imported ${counts}. Review them in the next steps.`;
            ctx.save();
          }, { doneText: 'Resume saved.' }),
          note,
        ];
      },
    },
    sectionStep('personal', 'Used for name, contact and address fields. Links fill LinkedIn, GitHub and portfolio questions.'),
    {
      title: 'Work history',
      render: (draft) => [h('p.muted', {}, 'Most recent first. Your current or latest role answers "current company" and "current title" questions.'), listForm('work', draft.work)],
    },
    {
      title: 'Education',
      render: (draft) => [h('p.muted', {}, 'Highest or most recent first.'), listForm('education', draft.education)],
    },
    {
      title: 'Projects',
      render: (draft) => [h('p.muted', {}, 'Optional. Personal, school or open-source projects. These only fill project sections, never work history.'), listForm('projects', draft.projects)],
    },
    {
      title: 'Skills & summary',
      render: (draft) => [
        skillsForm(draft),
        textForm('Professional summary', draft, 'summary', undefined, 4),
        textForm('Default cover letter (optional)', draft, 'coverLetter', undefined, 8),
      ],
    },
    sectionStep('authorization', 'These answer the work authorization and sponsorship questions on almost every application.'),
    sectionStep('preferences', 'Used for salary, relocation, notice period, start date and "how did you hear about us" questions.'),
    sectionStep('eeo'),
    {
      title: 'Common questions',
      render: (draft) => {
        const rows = COMMON_QUESTIONS.map((q) => {
          let entry = draft.custom.find((c) => c.question.toLowerCase() === q.question.toLowerCase());
          const value = entry ? entry.answer : q.answer || '';
          const set = (v) => {
            entry = draft.custom.find((c) => c.question.toLowerCase() === q.question.toLowerCase());
            if (!v) {
              draft.custom = draft.custom.filter((c) => c !== entry);
            } else if (entry) {
              entry.answer = v;
              entry.updatedAt = Date.now();
            } else {
              draft.custom.push({ id: JF.schema.makeId(), question: q.question, answer: v, updatedAt: Date.now() });
            }
          };
          if (q.answer && !entry) set(q.answer);
          const def = { label: q.question, type: q.type === 'yesNo' ? 'select' : q.type, choices: 'yesNo', rows: 3 };
          return JF.forms.control(def, value, set);
        });
        return [h('p.muted', {}, 'Leave any blank to skip. When a site asks something new, FormPilot will offer to save your answer for next time.'), h('div.grid', {}, rows)];
      },
    },
    {
      title: 'Done',
      render: (draft) => [
        h('p', {}, `You're set, ${draft.personal.firstName || 'there'}.`),
        h('ol', {},
          h('li', {}, 'Open a job application.'),
          h('li', {}, 'Click the FormPilot toolbar icon and press Fill, or use the keyboard shortcut (Alt+Shift+J by default).'),
          h('li', {}, 'Check every field, answer anything highlighted as unknown, then submit yourself. FormPilot never submits for you.')
        ),
        h('p.muted', {}, 'You can edit everything from the Profile and Saved answers pages.'),
      ],
    },
  ];

  async function render(container) {
    const draft = await JF.storage.getProfile();
    let step = 0;
    const save = () => JF.storage.saveProfile(draft);

    const draw = () => {
      const s = STEPS[step];
      const last = step === STEPS.length - 1;
      const go = async (delta) => {
        await save();
        if (last && delta > 0) {
          await JF.storage.saveSettings({ onboarded: true });
          toast('Profile saved.');
          location.hash = '#profile';
          return;
        }
        step = Math.max(0, Math.min(STEPS.length - 1, step + delta));
        draw();
        window.scrollTo(0, 0);
      };
      container.replaceChildren(
        h('h2', {}, 'Get started'),
        h('div.steps', { 'aria-label': `Step ${step + 1} of ${STEPS.length}` },
          STEPS.map((x, i) => h('button.step' + (i === step ? '.current' : i < step ? '.done' : ''), {
            type: 'button',
            title: x.title,
            'aria-current': i === step ? 'step' : null,
            onclick: async () => { await save(); step = i; draw(); },
          }, String(i + 1)))
        ),
        h('div.card', {},
          h('h3', {}, `${step + 1}. ${s.title}`),
          s.render(draft, { save }),
          h('div.actions', {},
            step > 0 ? h('button.secondary', { type: 'button', onclick: () => go(-1) }, 'Back') : null,
            h('span.spacer'),
            !last && step > 0 ? h('button.link', { type: 'button', onclick: () => go(1) }, 'Skip') : null,
            h('button.primary', { type: 'button', onclick: () => go(1) }, last ? 'Finish' : step === 0 ? 'Continue' : 'Save & continue')
          )
        )
      );
    };
    draw();
  }

  JF.views.onboarding = { title: 'Get started', render, COMMON_QUESTIONS };
})();
