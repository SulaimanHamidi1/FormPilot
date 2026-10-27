// Field detection: one pass over the document (including open shadow roots)
// that turns form controls into field descriptors with their question text.
// Exposes JF.detect.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  if (JF.detect) return;

  const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'image', 'reset', 'password', 'search', 'color', 'range']);
  const TEXT_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SELECT', 'OPTION', 'TEXTAREA', 'INPUT', 'SVG', 'TEMPLATE']);
  const HOST_ATTR = 'data-jf-ui';
  const SECTION_RE = /(project|work|employment|experience|position|job|education|school)[a-z]*?[\W_]{0,3}(\d+)/i;
  const HEAD_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'LEGEND']);
  const SECTION_TEXT = {
    projects: /^((personal|academic|selected|relevant|key|side|technical|notable|research)\s+)?projects?(\s+(experience|history|portfolio))?$/i,
    education: /^education\b|\beducation(al)?\s+(history|background)\b/i,
    work: /\b(work|employment|professional|job)\s+(experience|history)\b|^(work\s+)?experience$|^employment$/i,
  };
  const SECTION_OF_WORD = { education: 'education', school: 'education', project: 'projects' };

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
          // Hidden status text ("Analyzing resume...", "No results") isn't the question.
          if (c.hidden || (c.getClientRects && !c.getClientRects().length && c.tagName !== 'BR')) continue;
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
  // Parent element, stepping out of shadow roots to their host.
  const parentOf = (n) => n.parentElement || (n.parentNode && n.parentNode.host) || null;

  function nearbyText(el, groupEls, depthLimit = 5) {
    const skip = new Set(groupEls || [el]);
    let node = el;
    for (let depth = 0; depth < depthLimit && node && parentOf(node); depth++) {
      let sib = node.previousElementSibling;
      for (let i = 0; sib && i < 3; i++, sib = sib.previousElementSibling) {
        if (sib.matches('input,select,textarea') || sib.querySelector('input:not([type=hidden]),select,textarea')) break;
        const t = textOf(sib, skip);
        if (t && t.length <= 300) return t;
      }
      node = parentOf(node);
      // Stop once the wrapper also holds other questions' controls.
      const controls = node.querySelectorAll('input:not([type=hidden]),select,textarea,button[aria-haspopup=listbox]');
      if ([...controls].some((c) => !skip.has(c) && ![...skip].some((s) => s.contains(c)))) break;
      const t = textOf(node, skip);
      if (t && t.length <= 300) return t;
    }
    return '';
  }

  function attrText(el) {
    const path = el.closest('[data-field-path]');
    return [el.name, el.id, el.getAttribute('data-automation-id'), el.getAttribute('data-qa'), el.getAttribute('data-testid'), el.getAttribute('formcontrolname'), path && path.getAttribute('data-field-path')]
      .filter(Boolean)
      .join(' ');
  }

  // Split date inputs: Workday's bare Month / Year spinbuttons, or
  // Greenhouse's "Start date month" dropdown beside a "Start date year" box.
  const DATE_PART = { month: 'month', mm: 'month', year: 'year', yyyy: 'year', yy: 'year', day: 'day', dd: 'day' };
  const NAMED_DATE_PART = /\b(?:date|start|end|from|to|graduation|grad|completion|expected)\W+(month|year|day)\W*$/i;
  const DATE_PART_ATTR = /(?:start|end|from|to|grad\w*)[-_]?(month|year|day)\b/i;
  const isBareDatePart = (label) => !!DATE_PART[label.toLowerCase().replace(/[^a-z]/g, '')];
  function datePartOf(el, label) {
    const l = label.toLowerCase().replace(/[^a-z]/g, '');
    if (DATE_PART[l]) return DATE_PART[l];
    const m =
      (el.getAttribute('data-automation-id') || '').match(/dateSection(Month|Year|Day)/i) ||
      label.match(NAMED_DATE_PART) ||
      [el.id, el.name].join(' ').match(DATE_PART_ATTR);
    return m ? m[1].toLowerCase() : null;
  }

  // Which repeating block (work/education/projects) a field sits in, and its index.
  function sectionOf(el) {
    let node = el;
    for (let depth = 0; depth < 12 && node && node.nodeType === 1; depth++) {
      const attrs = [node.getAttribute('name'), node.id, node.getAttribute('data-automation-id'), node.getAttribute('data-qa')].filter(Boolean).join(' ');
      const m = attrs.match(SECTION_RE);
      if (m) return { section: SECTION_OF_WORD[m[1].toLowerCase()] || 'work', index: Number(m[2]) };
      // The closest heading before the field decides its section. Only the
      // children (and div grandchildren) before the field's branch are
      // checked, so this stays cheap on large pages.
      let head = null;
      for (const c of node.children) {
        if (c.contains(el)) break;
        if (HEAD_TAGS.has(c.tagName)) head = c;
        else if (c.tagName === 'DIV') for (const g of c.children) if (HEAD_TAGS.has(g.tagName) && g.tagName !== 'H1' && g.tagName !== 'LEGEND') head = g;
      }
      if (head) {
        const t = clean(head.textContent);
        for (const [section, re] of Object.entries(SECTION_TEXT)) {
          if (t.length < 60 && re.test(t)) return { section, index: null };
        }
        return { section: null, index: null };
      }
      node = parentOf(node);
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
    if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') === 'list' || el.getAttribute('data-automation-id') === 'searchBox') return 'combobox';
    return 'text';
  }

  const CONTROL_SEL = 'input, select, textarea, button[aria-haspopup="listbox"], button[aria-pressed], [role=button][aria-pressed]';

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
    // Site chrome, e.g. Workday's language picker in the page header.
    if (el.closest('header, nav, footer, [role=banner], [role=navigation], [role=contentinfo]')) return false;
    if (el.readOnly && kind !== 'combobox' && kind !== 'date') return false;
    // Upload inputs hide inside drop zones; styled radios/checkboxes hide
    // behind their labels. A hidden checkbox with no visible label is
    // usually a widget's internal state (e.g. Ashby's Yes/No buttons).
    if (kind === 'file') return isVisible(el) || isVisible(labelElementFor(el)) || isVisible(el.parentElement);
    if (kind === 'radio' || kind === 'checkbox') return isVisible(el) || isVisible(labelElementFor(el));
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

  // Question for a split date input: climb to the wrapper holding all parts.
  function datePartQuestion(el) {
    let c = el.parentElement;
    for (let i = 0; i < 4 && c; i++, c = c.parentElement) {
      const legend = c.matches('fieldset') && c.querySelector(':scope > legend');
      if (legend) return textOf(legend);
      if (c.querySelectorAll('input').length >= 2) return nearbyText(c, [c]);
    }
    return '';
  }

  // Context for file inputs, whose own label is often just "Attach" or
  // "Choose a file": the nearest different text above them.
  const GENERIC_FILE_LABEL = /^(attach|upload|choose|browse|select|drop|add|or drag|drag)\b/i;
  function fileContext(el, label) {
    if (label && label.length > 3 && !GENERIC_FILE_LABEL.test(label)) return '';
    let node = el;
    for (let depth = 0; depth < 8 && node; depth++) {
      for (let sib = node.previousElementSibling, i = 0; sib && i < 3; i++, sib = sib.previousElementSibling) {
        if (sib.matches('input,select,textarea') || sib.querySelector('input:not([type=hidden]),select,textarea')) break;
        const t = textOf(sib, new Set([el]));
        if (t && t !== label && t.length <= 200) return t;
      }
      node = parentOf(node);
    }
    return '';
  }

  let seq = 0;

  function makeField(el, kind, extra = {}) {
    let label = extra.label != null ? extra.label : directLabel(el);
    const datePart = ['text', 'combobox', 'select', 'listbox'].includes(kind) ? datePartOf(el, label) : null;
    // A bare "Month" says nothing; "Start date month" already names the date.
    if (datePart && (!label || isBareDatePart(label))) label = datePartQuestion(el) || label;
    const { section, index } = sectionOf(el);
    return {
      id: ++seq,
      el,
      kind,
      label,
      datePart,
      nearby: kind === 'file' ? fileContext(el, label) : label ? '' : nearbyText(el),
      placeholder: clean(el.getAttribute('placeholder')),
      attrs: attrText(el),
      autocomplete: (el.getAttribute('autocomplete') || '').toLowerCase(),
      required: el.required || el.getAttribute('aria-required') === 'true' || /[*✱]/.test((labelElementFor(el) || {}).textContent || ''),
      section,
      index,
      options: kind === 'select' ? optionsOfSelect(el) : [],
      ...extra,
    };
  }

  // Toggle-button groups (Ashby's Yes/No buttons and similar).
  function buttonGroupField(container) {
    const buttons = [...container.querySelectorAll(':scope > button[aria-pressed], :scope > [role=button][aria-pressed]')];
    const entry = container.parentElement;
    let label = '';
    const lab = entry && entry.querySelector(':scope > label');
    if (lab) label = textOf(lab);
    if (!label) label = nearbyText(container, [container]);
    return makeField(container, 'buttonGroup', {
      label,
      options: buttons.map((b) => ({ text: textOf(b) || b.getAttribute('aria-label') || '', value: b.getAttribute('data-option') || '', el: b })),
      group: buttons,
      required: !!(lab && /[*✱]/.test(lab.textContent)),
    });
  }

  function scan(root = document) {
    const controls = collect(root, []);
    const fields = [];
    const groups = new Map(); // radio/checkbox name -> elements
    const buttonGroups = new Set();
    for (const el of controls) {
      if (el.hasAttribute('aria-pressed')) {
        const parent = el.parentElement;
        if (!parent || buttonGroups.has(parent) || !isVisible(el)) continue;
        const n = parent.querySelectorAll(':scope > button[aria-pressed], :scope > [role=button][aria-pressed]').length;
        if (n >= 2 && n <= 8) {
          buttonGroups.add(parent);
          fields.push(buttonGroupField(parent));
        }
        continue;
      }
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
