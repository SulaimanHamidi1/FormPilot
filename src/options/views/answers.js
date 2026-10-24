// Saved answers: the custom Q&A list that answers questions the profile
// doesn't cover. Matched by fuzzy question text on every site.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  JF.views = JF.views || {};
  const { h, toast } = JF.forms;

  async function render(container) {
    const profile = await JF.storage.getProfile();
    const status = h('span.muted.small', { 'aria-live': 'polite' }, `${profile.custom.length} saved`);
    let timer;
    const save = () => {
      status.textContent = 'Saving…';
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await JF.storage.saveProfile(profile);
        status.textContent = `${profile.custom.length} saved`;
      }, 400);
    };
    const search = h('input', { type: 'search', placeholder: 'Search questions and answers', 'aria-label': 'Search saved answers' });
    const list = h('div');

    const row = (item) => {
      const q = h('input', { type: 'text', value: item.question, 'aria-label': 'Question' });
      const a = h('textarea', { rows: 2, value: item.answer, 'aria-label': 'Answer' });
      q.addEventListener('input', () => { item.question = q.value; item.updatedAt = Date.now(); save(); });
      a.addEventListener('input', () => { item.answer = a.value; item.updatedAt = Date.now(); save(); });
      const del = h('button.link.danger', {
        type: 'button',
        onclick: () => {
          profile.custom = profile.custom.filter((c) => c !== item);
          save();
          draw();
          toast('Answer deleted.');
        },
      }, 'Delete');
      return h('div.card.qa', { dataset: { id: item.id } },
        h('div.field', {}, h('label', {}, 'Question'), q),
        h('div.field', {}, h('label', {}, 'Answer'), a),
        h('div.qa-foot', {}, h('span.muted.small', {}, 'Updated ' + new Date(item.updatedAt).toLocaleDateString()), h('span.spacer'), del)
      );
    };

    const draw = () => {
      const term = search.value.trim().toLowerCase();
      const items = profile.custom
        .filter((c) => !term || c.question.toLowerCase().includes(term) || c.answer.toLowerCase().includes(term))
        .sort((x, y) => y.updatedAt - x.updatedAt);
      list.replaceChildren(
        ...(items.length ? items.map(row) : [h('p.muted', {}, term ? 'No saved answers match.' : 'No saved answers yet. When an application asks something new, FormPilot offers to save your answer here.')])
      );
    };
    search.addEventListener('input', draw);

    const add = () => {
      const item = { id: JF.schema.makeId(), question: '', answer: '', updatedAt: Date.now() };
      profile.custom.unshift(item);
      search.value = '';
      draw();
      const first = list.querySelector('input');
      if (first) first.focus();
    };

    container.replaceChildren(
      h('div.view-head', {}, h('h2', {}, 'Saved answers'), status),
      h('p.muted', {}, 'Answers to application questions that aren\'t part of your profile. Similar wording on other sites reuses the same answer.'),
      h('div.toolbar', {}, search, h('button.primary', { type: 'button', onclick: add }, '+ Add answer')),
      list
    );
    draw();
  }

  JF.views.answers = { title: 'Saved answers', render };
})();
