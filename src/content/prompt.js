// Unknown-question prompt: lists fields we couldn't answer, lets the user
// answer them, saves the answers for future applications and fills them in.
// Replaces JF.showSummary. Requires JF.ui, JF.storage, JF.schema.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  if (JF.prompt) return;
  const { el } = JF.ui;
  const MAX_ITEMS = 25;

  JF.ui.extraStyle += `
    .panel { width: min(380px, calc(100vw - 32px)); max-height: min(70vh, 640px); display: flex; flex-direction: column; }
    .head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--border); }
    .head strong { flex: 1; font-size: 14px; }
    .sub { color: var(--muted); font-size: 12px; padding: 8px 14px 0; }
    .list { overflow: auto; padding: 4px 14px; }
    .item { padding: 10px 0; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px; }
    .item:last-child { border-bottom: 0; }
    .q { font-weight: 600; cursor: pointer; }
    .q .req { color: var(--warn); margin-left: 4px; }
    .q:hover { text-decoration: underline; }
    .item input[type=text], .item select, .item textarea {
      font: inherit; color: var(--fg); background: var(--bg); width: 100%; box-sizing: border-box;
      border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px;
    }
    .row { display: flex; gap: 10px; align-items: center; font-size: 12px; color: var(--muted); }
    .row label { display: inline-flex; gap: 4px; align-items: center; cursor: pointer; }
    .row .spacer { flex: 1; }
    .linkbtn { background: none; border: 0; padding: 0; color: var(--muted); text-decoration: underline; font-size: 12px; }
    .foot { display: flex; gap: 8px; justify-content: flex-end; padding: 10px 14px; border-top: 1px solid var(--border); }
    .pill { border-radius: 999px; padding: 8px 14px; display: flex; gap: 8px; align-items: center; }
  `;

  // Profile keys the prompt may write directly (everything else becomes a
  // custom Q&A entry).
  function isDirectKey(key) {
    if (!key) return false;
    const [section, field] = key.split('.');
    if (!field) return ['summary', 'coverLetter'].includes(section);
    return JF.schema.SECTIONS.some((s) => s.id === section && s.fields.some((f) => f.key === field));
  }

  function inputFor(item) {
    if (item.options && item.options.length) {
      const opts = item.options.filter((o) => !/^(select|choose|please select|--|—)/i.test(o.trim()));
      return el('select', {}, el('option', { value: '' }, 'Choose…'), opts.map((o) => el('option', { value: o }, o)));
    }
    if (item.kind === 'textarea') return el('textarea', { rows: 3 });
    if (item.kind === 'checkbox') {
      return el('select', {}, el('option', { value: '' }, 'Choose…'), el('option', { value: 'Yes' }, 'Yes (check it)'), el('option', { value: 'No' }, 'No (leave unchecked)'));
    }
    return el('input', { type: 'text' });
  }

  let current = null;

  function close() {
    if (current) current.remove();
    current = null;
  }

  function minimize(panel, count) {
    panel.hidden = true;
    const pill = el('div', { class: 'toast pill' },
      el('span', { class: 'dot warn' }),
      el('span', {}, `${count} question${count === 1 ? '' : 's'} to answer`),
      el('button', { class: 'ghost', onclick: () => { pill.remove(); panel.hidden = false; } }, 'Show')
    );
    panel.after(pill);
  }

  async function save(rows, status) {
    const answers = rows.filter((r) => r.input.value.trim() && !r.skipped);
    if (!answers.length) {
      status.textContent = 'Answer at least one question, or close this panel.';
      return false;
    }
    const toSave = answers.filter((r) => r.remember.checked);
    if (toSave.length) {
      const profile = await JF.storage.getProfile();
      for (const r of toSave) {
        const v = r.input.value.trim();
        if (isDirectKey(r.item.key)) {
          const [section, field] = r.item.key.split('.');
          if (field) profile[section][field] = v;
          else profile[section] = v;
        } else {
          const q = r.item.question.trim();
          const existing = profile.custom.find((c) => c.question.trim().toLowerCase() === q.toLowerCase());
          if (existing) {
            existing.answer = v;
            existing.updatedAt = Date.now();
          } else {
            profile.custom.push({ id: JF.schema.makeId(), question: q, answer: v, updatedAt: Date.now() });
          }
        }
      }
      await JF.storage.saveProfile(profile);
    }
    const res = await chrome.runtime.sendMessage({
      type: 'fillAnswers',
      answers: answers.map((r) => ({ frameId: r.item.frameId, id: r.item.id, value: r.input.value.trim() })),
    }).catch(() => null);
    const filled = res && res.ok ? res.filled : 0;
    close();
    JF.ui.toast(`Filled ${filled} of ${answers.length} answer${answers.length === 1 ? '' : 's'}` + (toSave.length ? `; saved ${toSave.length} for next time.` : '.'), { warn: filled < answers.length });
    return true;
  }

  async function ignore(item) {
    const settings = await JF.storage.getSettings();
    const ignored = new Set(settings.ignored || []);
    ignored.add(JF.text.normalize(item.question));
    await JF.storage.saveSettings({ ignored: [...ignored].slice(-500) });
  }

  function show(summary) {
    close();
    const items = summary.unknown
      .slice()
      .sort((a, b) => Number(b.required) - Number(a.required))
      .slice(0, MAX_ITEMS);
    const status = el('div', { class: 'sub', 'aria-live': 'polite' });
    const rows = items.map((item) => {
      const input = inputFor(item);
      const remember = el('input', { type: 'checkbox', checked: true });
      const row = { item, input, remember, skipped: false };
      const node = el('div', { class: 'item' },
        el('div', { class: 'q', title: 'Show this field on the page', onclick: () => JF.focusPending && JF.focusPending(item) }, item.question, item.required ? el('span', { class: 'req', title: 'Required' }, '*') : null),
        input,
        el('div', { class: 'row' },
          el('label', {}, remember, 'Save for future applications'),
          el('span', { class: 'spacer' }),
          el('button', { class: 'linkbtn', onclick: () => { row.skipped = true; node.remove(); } }, 'Skip'),
          el('button', { class: 'linkbtn', title: "Never ask about this question again", onclick: () => { row.skipped = true; node.remove(); ignore(item); } }, "Don't ask")
        )
      );
      row.node = node;
      return row;
    });
    const filledText = `Filled ${summary.filled} field${summary.filled === 1 ? '' : 's'}.`;
    const panel = el('div', { class: 'panel', role: 'dialog', 'aria-label': 'FormPilot questions' },
      el('div', { class: 'head' },
        el('span', { class: 'dot warn' }),
        el('strong', {}, `${items.length} question${items.length === 1 ? '' : 's'} need${items.length === 1 ? 's' : ''} your answer`),
        el('button', { class: 'x', title: 'Minimize', 'aria-label': 'Minimize', onclick: () => minimize(panel, items.length) }, '–'),
        el('button', { class: 'x', title: 'Close', 'aria-label': 'Close', onclick: close }, '×')
      ),
      el('div', { class: 'sub' }, filledText + ' Answer these once and FormPilot will reuse them on future applications.'),
      status,
      el('div', { class: 'list' }, rows.map((r) => r.node)),
      el('div', { class: 'foot' },
        el('button', { class: 'ghost', onclick: close }, 'Not now'),
        el('button', { class: 'primary', onclick: () => save(rows, status) }, 'Fill & save')
      )
    );
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') minimize(panel, items.length); });
    JF.ui.wrap().querySelectorAll('.toast').forEach((t) => t.remove());
    JF.ui.wrap().append(panel);
    current = panel;
    const first = panel.querySelector('.item input, .item select, .item textarea');
    if (first) first.focus({ preventScroll: true });
  }

  const baseSummary = JF.showSummary;
  JF.showSummary = async (s) => {
    JF.ui.hideStop();
    const settings = await JF.storage.getSettings();
    if (!s.stopped && s.unknown && s.unknown.length && settings.askUnknown) show(s);
    else if (baseSummary) baseSummary(s);
  };

  JF.prompt = { show, close, isDirectKey };
})();
