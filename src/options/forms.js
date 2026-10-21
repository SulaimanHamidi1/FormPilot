// Small DOM helpers and schema-driven form renderers shared by the
// onboarding wizard, the resume review and the profile editor.
// Exposes JF.forms. Requires JF.schema.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  if (JF.forms) return;

  // h('div.card', {onclick}, child, ...) -> element
  function h(tag, attrs, ...children) {
    const [name, ...classes] = tag.split('.');
    const el = document.createElement(name || 'div');
    if (classes.length) el.className = classes.join(' ');
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && k !== 'list' && k !== 'form') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  let uid = 0;
  const nextId = () => 'f' + ++uid;

  // One labelled control for a field definition.
  function control(def, value, onChange) {
    const id = nextId();
    const type = def.type || 'text';
    let input;
    if (type === 'select') {
      const choices = JF.schema.CHOICES[def.choices] || [];
      const opts = [h('option', { value: '' }, '—')];
      for (const c of choices) opts.push(h('option', { value: c, selected: c === value }, c));
      if (value && !choices.includes(value)) opts.push(h('option', { value, selected: true }, value));
      input = h('select', { id }, opts);
    } else if (type === 'textarea') {
      input = h('textarea', { id, rows: def.rows || 4, value: value || '', placeholder: def.placeholder || '' });
    } else if (type === 'checkbox') {
      input = h('input', { id, type: 'checkbox', checked: !!value });
      const wrap = h('label.check', { for: id }, input, ' ', def.label);
      input.addEventListener('change', () => onChange(input.checked));
      return h('div.field.field-check', {}, wrap);
    } else {
      input = h('input', { id, type, value: value || '', placeholder: def.placeholder || '', autocomplete: 'off' });
    }
    input.addEventListener(type === 'select' ? 'change' : 'input', () => onChange(input.value));
    return h('div.field' + (type === 'textarea' ? '.field-wide' : ''), {}, h('label', { for: id }, def.label), input);
  }

  // Flat section editor. `values` is mutated in place; onChange fires after.
  function sectionForm(section, values, onChange = () => {}) {
    const grid = h('div.grid');
    for (const def of section.fields) {
      grid.append(control(def, values[def.key], (v) => {
        values[def.key] = v;
        onChange(def.key, v);
      }));
    }
    return h('div.section-form', {}, section.note ? h('p.muted', {}, section.note) : null, grid);
  }

  // Editable list of work/education entries. `items` is mutated in place.
  function listForm(listName, items, onChange = () => {}) {
    const def = JF.schema.LISTS[listName];
    const root = h('div.list-form');
    const render = () => {
      root.replaceChildren();
      items.forEach((item, i) => {
        const grid = h('div.grid');
        for (const f of def.fields) {
          grid.append(control(f, item[f.key], (v) => {
            item[f.key] = v;
            onChange();
          }));
        }
        const title = [item.title || item.degree, item.company || item.school].filter(Boolean).join(' · ');
        root.append(
          h('div.card.list-item', {},
            h('div.list-item-head', {},
              h('strong', {}, `${def.itemLabel} ${i + 1}`, title ? h('span.muted', {}, ' — ' + title) : null),
              h('span.spacer'),
              i > 0 ? h('button.link', { type: 'button', title: 'Move up', onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; render(); onChange(); } }, '↑') : null,
              h('button.link.danger', { type: 'button', onclick: () => { items.splice(i, 1); render(); onChange(); } }, 'Remove')
            ),
            grid
          )
        );
      });
      root.append(h('button.secondary', { type: 'button', onclick: () => { items.push(JF.schema.emptyItem(listName)); render(); onChange(); } }, `+ Add ${def.itemLabel.toLowerCase()}`));
    };
    render();
    return root;
  }

  // Comma-separated skills editor bound to profile.skills.
  function skillsForm(profile, onChange = () => {}) {
    const id = nextId();
    const input = h('textarea', { id, rows: 3, value: profile.skills.join(', '), placeholder: 'JavaScript, SQL, Project management' });
    input.addEventListener('input', () => {
      profile.skills = input.value.split(',').map((s) => s.trim()).filter(Boolean);
      onChange();
    });
    return h('div.field.field-wide', {}, h('label', { for: id }, 'Skills (comma separated)'), input);
  }

  function textForm(label, obj, key, onChange = () => {}, rows = 5) {
    const id = nextId();
    const input = h('textarea', { id, rows, value: obj[key] || '' });
    input.addEventListener('input', () => {
      obj[key] = input.value;
      onChange();
    });
    return h('div.field.field-wide', {}, h('label', { for: id }, label), input);
  }

  function toast(message, kind = 'ok') {
    let host = document.getElementById('toasts');
    if (!host) document.body.append((host = h('div', { id: 'toasts' })));
    const t = h('div.toast.' + kind, { role: 'status' }, message);
    host.append(t);
    setTimeout(() => t.remove(), 3500);
  }

  const sectionById = (id) => JF.schema.SECTIONS.find((s) => s.id === id);

  JF.forms = { h, control, sectionForm, listForm, skillsForm, textForm, toast, sectionById };
})();
