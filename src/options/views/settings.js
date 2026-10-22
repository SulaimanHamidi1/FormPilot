// Settings, permissions, backup and data removal.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  JF.views = JF.views || {};
  const { h, toast } = JF.forms;
  const ALL_SITES = { origins: ['<all_urls>'] };
  const JOB_SITES = { origins: chrome.runtime.getManifest().optional_host_permissions.filter((o) => o !== '<all_urls>') };
  const LAUNCHER_OPTIONS = [
    ['off', 'Off', 'Use the toolbar icon or the keyboard shortcut.'],
    ['jobsites', 'On job application sites', 'Greenhouse, Lever, Ashby, Workday, SmartRecruiters, iCIMS, Jobvite, Workable and similar. Chrome will ask to allow access to these sites.'],
    ['all', 'On any site with an application form', 'Also covers company careers pages. Chrome will ask to allow access to all sites.'],
  ];

  function toggle(label, hint, checked, onchange) {
    const input = h('input', { type: 'checkbox', checked, onchange: (e) => onchange(e.target.checked, e.target) });
    return h('div.setting', {}, h('label.check', {}, input, ' ', h('strong', {}, label)), hint ? h('p.muted.small', {}, hint) : null);
  }

  // Two-step button: first click arms it, second click runs the action.
  function confirmButton(label, armedLabel, action) {
    let armed = false;
    let timer;
    const btn = h('button.secondary.danger', {
      type: 'button',
      onclick: async () => {
        if (!armed) {
          armed = true;
          btn.textContent = armedLabel;
          timer = setTimeout(() => { armed = false; btn.textContent = label; }, 4000);
          return;
        }
        clearTimeout(timer);
        armed = false;
        btn.textContent = label;
        await action();
      },
    }, label);
    return btn;
  }

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function render(container) {
    const [settings, hasAllSites, hasJobSites, stored] = await Promise.all([
      JF.storage.getSettings(),
      chrome.permissions ? chrome.permissions.contains(ALL_SITES) : Promise.resolve(false),
      chrome.permissions ? chrome.permissions.contains(JOB_SITES) : Promise.resolve(false),
      chrome.storage.local.get('launcherHidden'),
    ]);
    const set = (key) => async (value) => {
      await JF.storage.saveSettings({ [key]: value });
      toast('Saved.');
    };

    // ---- Filling ----
    const filling = h('section.card', {},
      h('h3', {}, 'Filling'),
      toggle('Highlight filled fields', 'Green outline on fields job_filler filled, amber on questions that need you.', settings.highlight, set('highlight')),
      toggle('Ask about unknown questions', 'Show the on-page panel to answer and save questions job_filler couldn\'t answer.', settings.askUnknown, set('askUnknown')),
      toggle('Replace values already in the form', 'Off by default: anything you or the site already entered is left alone.', settings.overwrite, set('overwrite')),
      toggle('Continue through multi-step applications', 'On Workday, iCIMS, Taleo and similar sites, fill each new step automatically after you start.', settings.watchMultiStep, set('watchMultiStep')),
      toggle('Fill forms embedded from other sites', 'Some careers pages embed the application from another domain (e.g. a Greenhouse form on a company site). Chrome will ask you to allow access to all sites; job_filler still only runs when you press Fill.', hasAllSites, async (on, input) => {
        try {
          const ok = on ? await chrome.permissions.request(ALL_SITES) : await chrome.permissions.remove(ALL_SITES);
          if (!ok) input.checked = !on;
          toast(ok ? (on ? 'Embedded forms enabled.' : 'Embedded forms disabled.') : 'Permission not changed.', ok ? 'ok' : 'error');
          if (ok) render(container);
        } catch (e) {
          input.checked = !on;
          toast('Could not change permission: ' + e.message, 'error');
        }
      }),
      h('p', {}, h('a', { href: '#', onclick: (e) => { e.preventDefault(); chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); } }, 'Change the keyboard shortcut'))
    );

    // ---- On-page button ----
    // Shown as off when Chrome's permission for the chosen sites is missing.
    const granted = { off: true, jobsites: hasJobSites, all: hasAllSites };
    const launcher = granted[settings.launcher] ? settings.launcher : 'off';
    const hiddenSites = stored.launcherHidden || [];
    const chooseLauncher = async (mode) => {
      try {
        const perm = mode === 'all' ? ALL_SITES : mode === 'jobsites' ? JOB_SITES : null;
        if (perm && !(await chrome.permissions.request(perm))) {
          toast('Permission not granted; the button stays off.', 'error');
          return render(container);
        }
        // Turning it off drops the job-site access; all-sites access is kept
        // because embedded forms use it too.
        if (mode !== 'jobsites' && hasJobSites && !hasAllSites) await chrome.permissions.remove(JOB_SITES);
        await JF.storage.saveSettings({ launcher: mode });
        toast(mode === 'off' ? 'Button turned off.' : 'Button turned on. Reload open application pages to see it.');
      } catch (e) {
        toast('Could not change permission: ' + e.message, 'error');
      }
      render(container);
    };
    const launcherCard = h('section.card', {},
      h('h3', {}, 'On-page button'),
      h('p.muted', {}, 'Shows the job_filler logo on the right edge of pages that look like a job application. Click it to fill the form. It only looks for form fields; nothing is filled or sent until you click.'),
      LAUNCHER_OPTIONS.map(([value, label, hint]) => h('div.setting', {},
        h('label.check', {}, h('input', { type: 'radio', name: 'launcher', value, checked: launcher === value, onchange: () => chooseLauncher(value) }), ' ', h('strong', {}, label)),
        h('p.muted.small', {}, hint))),
      hiddenSites.length
        ? h('div.actions', {},
          h('span.muted.small', {}, `Hidden on ${hiddenSites.length} site${hiddenSites.length > 1 ? 's' : ''}: ${hiddenSites.slice(0, 5).join(', ')}${hiddenSites.length > 5 ? '…' : ''}`),
          h('button.secondary', { type: 'button', onclick: async () => { await chrome.storage.local.remove('launcherHidden'); toast('The button will show on those sites again.'); render(container); } }, 'Show on these sites again'))
        : null
    );

    // ---- Ignored questions ----
    const ignored = settings.ignored || [];
    const ignoredCard = h('section.card', {},
      h('h3', {}, 'Questions you chose not to be asked'),
      ignored.length
        ? [h('ul.ignored', {}, ignored.slice(0, 50).map((q) => h('li', {}, q))), ignored.length > 50 ? h('p.muted.small', {}, `and ${ignored.length - 50} more`) : null,
          h('div.actions', {}, h('button.secondary', { type: 'button', onclick: async () => { await JF.storage.saveSettings({ ignored: [] }); toast('Cleared.'); render(container); } }, 'Ask about these again'))]
        : h('p.muted', {}, 'None.')
    );

    // ---- Backup ----
    const includeResume = h('input', { type: 'checkbox', checked: true });
    const importInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    importInput.addEventListener('change', async () => {
      const file = importInput.files[0];
      if (!file) return;
      try {
        await JF.storage.importData(await file.text());
        toast('Backup imported.');
        render(container);
      } catch (e) {
        toast('Import failed: ' + e.message, 'error');
      }
      importInput.value = '';
    });
    const backup = h('section.card', {},
      h('h3', {}, 'Backup'),
      h('p.muted', {}, 'Export everything to a JSON file to move to another browser or keep a copy. The file contains your personal details; store it somewhere safe.'),
      h('label.check', {}, includeResume, ' Include resume file'),
      h('div.actions', {},
        h('button.primary', {
          type: 'button',
          onclick: async () => {
            const data = await JF.storage.exportData({ includeResume: includeResume.checked });
            download(`job_filler-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
          },
        }, 'Export backup'),
        h('button.secondary', { type: 'button', onclick: () => importInput.click() }, 'Import backup'),
        importInput
      )
    );

    // ---- Danger zone ----
    const danger = h('section.card.danger-zone', {},
      h('h3', {}, 'Delete data'),
      h('p.muted', {}, 'Removes your profile, saved answers, resume and settings from this browser. This can\'t be undone; export a backup first if you might need it.'),
      h('div.actions', {}, confirmButton('Delete all my data', 'Click again to delete everything', async () => {
        await JF.storage.clearAll();
        toast('All data deleted.');
        location.hash = '#onboarding';
      }))
    );

    container.replaceChildren(h('h2', {}, 'Settings & backup'), filling, launcherCard, ignoredCard, backup, danger);
  }

  JF.views.settings = { title: 'Settings & backup', render };
})();
