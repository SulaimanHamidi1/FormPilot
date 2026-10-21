// Field detection: one pass over the document (including open shadow roots)
// that turns form controls into field descriptors with their question text.
// Exposes JF.detect.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  if (JF.detect) return;

  const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'image', 'reset', 'password', 'search', 'color', 'range']);
  const TEXT_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SELECT', 'OPTION', 'TEXTAREA', 'INPUT', 'SVG', 'TEMPLATE']);
  const HOST_ATTR = 'data-jf-ui';
  const SECTION_RE = /(work|employment|experience|position|job|education|school)[a-z]*?[\W_]{0,3}(\d+)/i;
  const HEAD_SEL = ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > legend, :scope > div > h2, :scope > div > h3, :scope > div > h4';
  const SECTION_TEXT ={ work: /\b(work|employment|professional)\s+(experience|history)\b|^experience$|\bemployment\b/i, education: /\beducation\b/i };

  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  // Visible-ish text of a node, skipping form controls and anything in `skip`.
  function textOf(node, skip) {
    if (!node) return '';
    let out = '';
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) out += c.nodeValue + ' ';
        else if (c.nodeType === 1 && !TEXT_SKIP_TAGS.has(c.tagName) && !(skip && skip.has(c)) && !c.hasAttribute(HOST_ATTR)) {
          if (c.getAttribute('aria-hidden') === 'true' && !c.textContent.trim().match(/\w{3}/)) continue;
          walk(c);
        }
      }
    };
    walk(node);
    return clean(out).replace(/\s*\*\s*$/, '').replace(/^\*\s*/, '');
  }

  function byIdIn(root, id) {
    if (!id) return null;
    try {
      return (root.getElementById ? root.getElementById(id) : root.querySelector('#' + CSS.escape(id))) || document.getElementById(id);
    } catch {
      return null;
    }
  }

  function isVisible(el) {
    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none';
  }

  function labelElementFor(el) {
    const root = el.getRootNode();
    if (el.id) {
      try {
        const l = root.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (l) return l;
      } catch { /* invalid id */ }
    }
    return el.closest('label');
  }

  // Direct label: aria-labelledby, <label>, aria-label, title.
  function directLabel(el) {
    const root = el.getRootNode();
    const ids = el.getAttribute('aria-labelledby');
    if (ids) {
      const t = clean(ids.split(/\s+/).map((id) => textOf(byIdIn(root, id))).join(' '));
      if (t) return t;
    }
    const lab = labelElementFor(el);
    if (lab) {
      const t = textOf(lab, new Set([el]));
      if (t) return t;
    }
    return clean(el.getAttribute('aria-label') || el.getAttribute('title') || '');
  }

  // Text near a control when it has no proper label: previous siblings of the
  // control or its ancestors, or a wrapper that holds only this control.
  function nearbyText(el, groupEls) {
    const skip = new Set(groupEls || [el]);
    let node = el;
    for (let depth = 0; depth < 5 && node && node.parentElement; depth++) {
      let sib = node.previousElementSibling;
      for (let i = 0; sib && i < 3; i++, sib = sib.previousElementSibling) {
        if (sib.matches('input,select,textarea') || sib.querySelector('input:not([type=hidden]),select,textarea')) break;
        const t = textOf(sib, skip);
        if (t && t.length <= 300) return t;
      }
      node = node.parentElement;
      // Stop once the wrapper also holds other questions' controls.
      const controls = node.querySelectorAll('input:not([type=hidden]),select,textarea,button[aria-haspopup=listbox]');
      if ([...controls].some((c) => !skip.has(c) && ![...skip].some((s) => s.contains(c)))) break;
      const t = textOf(node, skip);
      if (t && t.length <= 300) return t;
    }
    return '';
  }

  function attrText(el) {
    return [el.name, el.id, el.getAttribute('data-automation-id'), el.getAttribute('data-qa'), el.getAttribute('data-testid'), el.getAttribute('formcontrolname')]
      .filter(Boolean)
      .join(' ');
  }

  // Which repeating block (work/education) a field sits in, and its index.
  function sectionOf(el) {
    let node = el;
    for (let depth = 0; depth < 8 && node && node.nodeType === 1; depth++) {
      const attrs = [node.getAttribute('name'), node.id, node.getAttribute('data-automation-id'), node.getAttribute('data-qa')].filter(Boolean).join(' ');
      const m = attrs.match(SECTION_RE);
      if (m) {
        const word = m[1].toLowerCase();
        return { section: word === 'education' || word === 'school' ? 'education' : 'work', index: Number(m[2]) };
      }
      // The closest heading before the field decides its section.
      const heads = node.querySelectorAll(HEAD_SEL);
      let head = null;
      for (const hd of heads) {
        if (!hd.contains(el) && hd.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) head = hd;
      }
      if (head) {
        const t = clean(head.textContent);
        if (t.length < 60 && SECTION_TEXT.education.test(t)) return { section: 'education', index: null };
        if (t.length < 60 && SECTION_TEXT.work.test(t)) return { section: 'work', index: null };
        return { section: null, index: null };
      }
      node = node.parentElement || (node.getRootNode() && node.getRootNode().host) || null;
    }
    return { section: null, index: null };
  }

  function kindOf(el) {
    const tag = el.tagName;
    if (tag === 'SELECT') return 'select';
    if (tag === 'TEXTAREA') return 'textarea';
    if (tag === 'BUTTON') return 'listbox';
    if (tag !== 'INPUT') return null;
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (SKIP_TYPES.has(type)) return null;
    if (type === 'radio' || type === 'checkbox' || type === 'file') return type;
    if (type === 'date' || type === 'month') return type;
    if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') === 'list') return 'combobox';
    return 'text';
  }

  const CONTROL_SEL = 'input, select, textarea, button[aria-haspopup="listbox"]';

  // Collect controls in document order, descending into open shadow roots
  // and same-origin iframes are handled by injecting into every frame.
  function collect(root, out) {
    const all = root.querySelectorAll('*');
    for (const el of all) {
      if (el.matches(CONTROL_SEL)) out.push(el);
      if (el.shadowRoot) collect(el.shadowRoot, out);
    }
    return out;
  }

  function usable(el, kind) {
    if (el.disabled || el.closest('[' + HOST_ATTR + ']')) return false;
    if (el.readOnly && kind !== 'combobox' && kind !== 'date') return false;
    if (kind === 'file' || kind === 'radio' || kind === 'checkbox') {
      return isVisible(el) || isVisible(labelElementFor(el)) || isVisible(el.parentElement);
    }
    if (el.getAttribute('aria-hidden') === 'true' || el.tabIndex < -1) return false;
    return isVisible(el);
  }

  function optionsOfSelect(el) {
    return [...el.options]
      .filter((o) => !o.disabled)
      .map((o) => ({ text: clean(o.textContent), value: o.value, el: o }))
      .filter((o) => o.text || o.value);
  }

  // Common ancestor of a set of elements.
  function commonAncestor(els) {
    let node = els[0].parentElement;
    while (node && !els.every((e) => node.contains(e))) node = node.parentElement;
    return node;
  }

  function groupQuestion(els) {
    const first = els[0];
    const group = first.closest('fieldset, [role=radiogroup], [role=group]');
    if (group) {
      const legend = group.querySelector(':scope > legend');
      if (legend) return textOf(legend);
      const t = directLabel(group);
      if (t) return t;
    }
    const container = commonAncestor(els);
    if (!container) return '';
    const optionLabels = new Set(els.map(labelElementFor).filter(Boolean));
    els.forEach((e) => optionLabels.add(e));
    // Text inside the group's container that isn't an option label.
    const inner = textOf(container, optionLabels);
    if (inner && inner.length <= 300) return inner;
    return nearbyText(container, [container]);
  }

  let seq = 0;

  function makeField(el, kind, extra = {}) {
    const label = extra.label != null ? extra.label : directLabel(el);
    const { section, index } = sectionOf(el);
    return {
      id: ++seq,
      el,
      kind,
      label,
      nearby: label ? '' : nearbyText(el),
      placeholder: clean(el.getAttribute('placeholder')),
      attrs: attrText(el),
      autocomplete: (el.getAttribute('autocomplete') || '').toLowerCase(),
      required: el.required || el.getAttribute('aria-required') === 'true',
      section,
      index,
      options: kind === 'select' ? optionsOfSelect(el) : [],
      ...extra,
    };
  }

  function scan(root = document) {
    const controls = collect(root, []);
    const fields = [];
    const groups = new Map(); // radio/checkbox name -> elements
    for (const el of controls) {
      const kind = kindOf(el);
      if (!kind || !usable(el, kind)) continue;
      if (kind === 'radio' || kind === 'checkbox') {
        const scope = el.form || el.getRootNode();
        const key = (el.name || '') && kind + ':' + el.name;
        if (key) {
          if (!groups.has(scope)) groups.set(scope, new Map());
          const byName = groups.get(scope);
          if (!byName.has(key)) {
            byName.set(key, []);
            fields.push({ placeholderFor: byName.get(key), kind });
          }
          byName.get(key).push(el);
          continue;
        }
      }
      fields.push(makeField(el, kind));
    }
    // Resolve grouped radios / checkboxes in place.
    return fields.map((f) => {
      if (!f.placeholderFor) return f;
      const els = f.placeholderFor;
      if (f.kind === 'checkbox' && els.length === 1) return makeField(els[0], 'checkbox');
      const options = els.map((e) => ({ text: directLabel(e) || clean(e.value), value: e.value, el: e }));
      const question = groupQuestion(els);
      return makeField(els[0], f.kind === 'radio' ? 'radio' : 'checkboxGroup', { label: question, options, group: els });
    });
  }

  JF.detect = { scan, textOf, directLabel, nearbyText, isVisible, HOST_ATTR };
})();
