// Filling: writes matched values into the page and fires the events
// React/Vue/Angular listen for. Never submits anything. Exposes JF.fill.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  if (JF.fill) return;

  const FILLED_ATTR = 'data-jf-filled';
  const OK_COLOR = '#16a34a';
  const WARN_COLOR = '#d97706';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- Low-level setters ----

  function nativeSetter(el) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
    return Object.getOwnPropertyDescriptor(proto, 'value').set;
  }

  function fire(el, type, init = {}) {
    const Ctor = type === 'input' ? InputEvent : type.startsWith('key') ? KeyboardEvent : type.startsWith('focus') || type === 'blur' ? FocusEvent : type.startsWith('mouse') || type === 'click' ? MouseEvent : type.startsWith('pointer') ? (window.PointerEvent || MouseEvent) : Event;
    const bubbles = type !== 'focus' && type !== 'blur';
    el.dispatchEvent(new Ctor(type, { bubbles, cancelable: true, composed: true, ...init }));
  }

  // Set a value the way a user would: focus, input, change, blur.
  function setValue(el, value) {
    fire(el, 'focus');
    fire(el, 'focusin');
    // The prototype setter bypasses framework value trackers, so React sees
    // the change when the input event arrives.
    nativeSetter(el).call(el, value);
    fire(el, 'input', { inputType: 'insertText', data: String(value) });
    fire(el, 'change');
    fire(el, 'blur');
    fire(el, 'focusout');
  }

  function clickEl(el) {
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) fire(el, t, { button: 0 });
    el.click();
  }

  // ---- Highlighting ----

  const original = new WeakMap();

  function visibleTarget(el) {
    let n = el;
    for (let i = 0; i < 4 && n; i++) {
      if (JF.detect.isVisible(n) && n.offsetWidth > 4) return n;
      n = n.parentElement;
    }
    return el;
  }

  function highlight(el, color) {
    const t = visibleTarget(el);
    if (!original.has(t)) original.set(t, { outline: t.style.outline, outlineOffset: t.style.outlineOffset });
    t.style.outline = `2px ${color === WARN_COLOR ? 'dashed' : 'solid'} ${color}`;
    t.style.outlineOffset = '1px';
  }

  function clearHighlights(root = document) {
    for (const el of root.querySelectorAll('[' + FILLED_ATTR + ']')) {
      const t = visibleTarget(el);
      const o = original.get(t);
      if (o) {
        t.style.outline = o.outline;
        t.style.outlineOffset = o.outlineOffset;
      }
    }
  }

  // ---- Value formatting ----

  // ISO-ish profile date ("2026-12-01" or "2026-12") to an input's format.
  function formatDate(value, field) {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(value).trim());
    if (!m) return value;
    const [, y, mo, d = '01'] = m;
    if (field.kind === 'date') return `${y}-${mo}-${d}`;
    if (field.kind === 'month') return `${y}-${mo}`;
    const hint = (field.placeholder || field.label || '').toUpperCase();
    const fmt = hint.match(/(MM|DD|YYYY|YY)[\s./-]*(MM|DD|YYYY|YY)?[\s./-]*(MM|DD|YYYY|YY)?/);
    if (fmt && fmt[2]) {
      const sep = (hint.match(/(?:MM|DD|YY)([./-])/) || [, '/'])[1];
      const parts = fmt.slice(1).filter(Boolean).map((p) => ({ MM: mo, DD: d, YYYY: y, YY: y.slice(2) })[p]);
      return parts.join(sep);
    }
    return /^(\d{4})-(\d{2})$/.test(value) ? `${mo}/${y}` : `${mo}/${d}/${y}`;
  }

  function formatValue(value, field) {
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    let v = String(value);
    const el = field.el;
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (field.kind === 'date' || field.kind === 'month' || /date|month|year|from|to\b|start|end|graduat/i.test(field.label + ' ' + field.placeholder)) {
      v = formatDate(v, field);
    }
    if (type === 'number') {
      const n = v.replace(/,/g, '').match(/\d+(\.\d+)?/);
      v = n ? (/\d\s*k\b/i.test(v) ? String(Number(n[0]) * 1000) : n[0]) : '';
    }
    if (el.maxLength > 0 && v.length > el.maxLength) v = v.slice(0, el.maxLength);
    return v;
  }

  // ---- Per-kind fillers. Each returns true when the field was filled. ----

  function fillText(field, value) {
    const v = formatValue(value, field);
    if (!v) return false;
    setValue(field.el, v);
    return field.el.value === v || field.el.value !== '';
  }

  function fillSelect(field, value) {
    const opt = JF.match.pickOption(field.options, value);
    if (!opt) return false;
    const el = field.el;
    if (el.value !== opt.value) {
      opt.el.selected = true;
      nativeSetter(el).call(el, opt.value);
      fire(el, 'input');
      fire(el, 'change');
      fire(el, 'blur');
    }
    return true;
  }

  function fillRadio(field, value) {
    const opt = JF.match.pickOption(field.options, value);
    if (!opt) return false;
    if (!opt.el.checked) clickEl(opt.el);
    if (!opt.el.checked) {
      opt.el.checked = true;
      fire(opt.el, 'input');
      fire(opt.el, 'change');
    }
    return true;
  }

  function fillCheckbox(field, value) {
    const want = value === true || /^(yes|true|y|1)$/i.test(String(value).trim());
    if (field.el.checked !== want) clickEl(field.el);
    return field.el.checked === want;
  }

  function fillCheckboxGroup(field, value) {
    const values = Array.isArray(value) ? value : [value];
    let any = false;
    for (const v of values) {
      const opt = JF.match.pickOption(field.options, v);
      if (!opt) continue;
      if (!opt.el.checked) clickEl(opt.el);
      any = true;
    }
    return any;
  }

  async function fileFromResume(resume) {
    const blob = await (await fetch(resume.dataUrl)).blob();
    return new File([blob], resume.name, { type: resume.type || blob.type, lastModified: resume.updatedAt || Date.now() });
  }

  function acceptsFile(el, name, type) {
    const accept = (el.getAttribute('accept') || '').toLowerCase();
    if (!accept) return true;
    const ext = '.' + name.toLowerCase().split('.').pop();
    return accept.split(',').map((s) => s.trim()).some((a) => a === ext || a === type || (a.endsWith('/*') && type.startsWith(a.slice(0, -1))));
  }

  async function fillFile(field, key, ctx) {
    const el = field.el;
    if (el.files && el.files.length) return true;
    let file = null;
    if (key === 'resume') {
      const resume = await ctx.getResume();
      if (!resume) return false;
      file = await fileFromResume(resume);
    } else if (key === 'coverLetter' && ctx.profile.coverLetter) {
      file = new File([ctx.profile.coverLetter], 'Cover letter.txt', { type: 'text/plain' });
    }
    if (!file || !acceptsFile(el, file.name, file.type)) return false;
    const dt = new DataTransfer();
    dt.items.add(file);
    el.files = dt.files;
    fire(el, 'input');
    fire(el, 'change');
    // Some upload widgets only listen for drops on their drop zone.
    if (!el.files.length) {
      const zone = el.closest('[class*=drop], [class*=upload]') || el.parentElement;
      for (const t of ['dragenter', 'dragover', 'drop']) zone.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }));
    }
    return true;
  }

  // Options currently shown for a combobox/listbox trigger.
  function visibleOptions(trigger) {
    const root = trigger.getRootNode();
    const ids = [trigger.getAttribute('aria-controls'), trigger.getAttribute('aria-owns')].filter(Boolean).join(' ').split(/\s+/).filter(Boolean);
    let opts = [];
    for (const id of ids) {
      const list = (root.getElementById ? root.getElementById(id) : null) || document.getElementById(id);
      if (list) opts.push(...list.querySelectorAll('[role=option]'));
    }
    if (!opts.length) opts = [...document.querySelectorAll('[role=option]')];
    return opts
      .filter((o) => JF.detect.isVisible(o) && o.getAttribute('aria-disabled') !== 'true')
      .map((o) => ({ text: JF.detect.textOf(o) || o.getAttribute('aria-label') || '', value: o.getAttribute('data-value') || '', el: o }));
  }

  async function waitForOptions(trigger, timeout = 900) {
    const end = performance.now() + timeout;
    let last = [];
    while (performance.now() < end) {
      await sleep(60);
      last = visibleOptions(trigger);
      if (last.length) {
        // Let async option lists settle for a moment.
        await sleep(80);
        return visibleOptions(trigger);
      }
    }
    return last;
  }

  function closeMenu(el) {
    fire(el, 'keydown', { key: 'Escape', code: 'Escape', keyCode: 27 });
    fire(el, 'blur');
  }

  // Text input that opens a list of options (react-select, typeaheads).
  async function fillCombobox(field, value) {
    const el = field.el;
    const v = formatValue(value, field);
    if (!v) return false;
    el.focus({ preventScroll: true });
    clickEl(el);
    fire(el, 'keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 });
    let opts = await waitForOptions(el, 500);
    let opt = JF.match.pickOption(opts, value);
    if (!opt) {
      // Type to search; long canonical answers search better by first words.
      const query = /\s/.test(v) && v.length > 24 ? v.split(/\s+/).slice(0, 3).join(' ') : v;
      setValue(el, query);
      el.focus({ preventScroll: true });
      opts = await waitForOptions(el, 1200);
      opt = JF.match.pickOption(opts, value);
    }
    if (opt) {
      clickEl(opt.el);
      await sleep(50);
      return true;
    }
    if (!opts.length) {
      // A free-text input with suggestions we never saw: keep the text.
      setValue(el, v);
      return el.value !== '';
    }
    // Options exist but none fits: undo the typed search.
    setValue(el, '');
    closeMenu(el);
    return false;
  }

  // Button that opens a listbox (Workday-style dropdowns).
  async function fillListbox(field, value) {
    const el = field.el;
    const current = JF.detect.textOf(el);
    if (current && JF.match.pickOption([{ text: current, value: '' }], value)) return true;
    clickEl(el);
    const opts = await waitForOptions(el, 1200);
    const opt = JF.match.pickOption(opts, value);
    if (opt) {
      clickEl(opt.el);
      await sleep(80);
      return true;
    }
    closeMenu(el);
    if (document.activeElement && document.activeElement !== document.body) fire(document.activeElement, 'keydown', { key: 'Escape', keyCode: 27 });
    return false;
  }

  function hasValue(field) {
    const el = field.el;
    if (field.kind === 'radio' || field.kind === 'checkboxGroup') return field.options.some((o) => o.el.checked);
    if (field.kind === 'checkbox') return false;
    if (field.kind === 'file') return !!(el.files && el.files.length);
    if (field.kind === 'select') return el.selectedIndex > 0 && el.value !== '';
    if (field.kind === 'listbox') {
      const t = JF.detect.textOf(el).toLowerCase();
      return !!t && !/^(select|choose|--|please)/.test(t);
    }
    return el.value.trim() !== '';
  }

  // Fill one match. Returns 'filled' | 'kept' | 'failed' | 'empty'.
  async function fillOne(m, ctx) {
    const { field } = m;
    const value = m.value;
    const key = m.key || '';
    const ours = field.el.getAttribute(FILLED_ATTR) === '1';
    if (field.kind !== 'file' && (value === '' || value == null)) return 'empty';
    if (hasValue(field) && !ours && !ctx.settings.overwrite) return 'kept';
    let ok = false;
    try {
      switch (field.kind) {
        case 'text':
        case 'textarea':
        case 'date':
        case 'month':
          ok = fillText(field, value);
          break;
        case 'select':
          ok = fillSelect(field, value);
          break;
        case 'radio':
          ok = fillRadio(field, value);
          break;
        case 'checkbox':
          ok = fillCheckbox(field, value);
          break;
        case 'checkboxGroup':
          ok = fillCheckboxGroup(field, value);
          break;
        case 'file':
          ok = await fillFile(field, key, ctx);
          break;
        case 'combobox':
          ok = await fillCombobox(field, value);
          break;
        case 'listbox':
          ok = await fillListbox(field, value);
          break;
      }
    } catch (e) {
      console.debug('job_filler: could not fill', field.label, e);
      ok = false;
    }
    if (ok) {
      field.el.setAttribute(FILLED_ATTR, '1');
      if (ctx.settings.highlight) highlight(field.kind === 'radio' || field.kind === 'checkboxGroup' ? field.options[0].el.closest('fieldset, [role=radiogroup], div') || field.el : field.el, OK_COLOR);
    }
    return ok ? 'filled' : 'failed';
  }

  // Fill all matches in document order. Comboboxes are filled one at a time
  // because their menus share the page.
  async function fillAll(matches, ctx) {
    const result = { filled: [], kept: [], failed: [], empty: [] };
    for (const m of matches) {
      if (m.skip || (!m.key && !m.custom)) continue;
      const status = await fillOne(m, ctx);
      result[status].push(m);
    }
    return result;
  }

  JF.fill = { fillAll, fillOne, setValue, formatDate, formatValue, highlight, clearHighlights, hasValue, FILLED_ATTR, WARN_COLOR, OK_COLOR };
})();
