// chrome.storage.local helpers. Exposes JF.storage. Requires JF.schema.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  if (JF.storage) return;

  const KEYS = { profile: 'profile', resume: 'resume', settings: 'settings' };
  const DEFAULT_SETTINGS = {
    onboarded: false,
    highlight: true,
    askUnknown: true,
    overwrite: false,
    ignored: [],
    watchMultiStep: true,
  };
  const EXPORT_FORMAT = 'job_filler-backup';
  const MAX_RESUME_BYTES = 5 * 1024 * 1024;

  const area = () => chrome.storage.local;

  async function getProfile() {
    const data = await area().get(KEYS.profile);
    return JF.schema.normalize(data[KEYS.profile]);
  }

  async function saveProfile(profile) {
    const clean = JF.schema.normalize(profile);
    await area().set({ [KEYS.profile]: clean });
    return clean;
  }

  // Apply a mutation to the stored profile and save it.
  async function updateProfile(fn) {
    const p = await getProfile();
    const next = (await fn(p)) || p;
    return saveProfile(next);
  }

  async function getSettings() {
    const data = await area().get(KEYS.settings);
    return { ...DEFAULT_SETTINGS, ...(data[KEYS.settings] || {}) };
  }

  async function saveSettings(patch) {
    const next = { ...(await getSettings()), ...patch };
    await area().set({ [KEYS.settings]: next });
    return next;
  }

  // Resume is stored as a data URL so it can be rebuilt into a File later.
  async function getResume() {
    const data = await area().get(KEYS.resume);
    return data[KEYS.resume] || null;
  }

  async function saveResume(file, text) {
    if (file.size > MAX_RESUME_BYTES) throw new Error('Resume is larger than 5 MB.');
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    const resume = {
      name: file.name,
      type: file.type || guessMime(file.name),
      size: file.size,
      dataUrl,
      text: text || '',
      updatedAt: Date.now(),
    };
    await area().set({ [KEYS.resume]: resume });
    return resume;
  }

  async function removeResume() {
    await area().remove(KEYS.resume);
  }

  function guessMime(name) {
    const ext = String(name).toLowerCase().split('.').pop();
    return {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain',
    }[ext] || 'application/octet-stream';
  }

  async function addCustomAnswer(question, answer) {
    const q = String(question).trim();
    if (!q) return null;
    let saved;
    await updateProfile((p) => {
      const existing = p.custom.find((c) => c.question.trim().toLowerCase() === q.toLowerCase());
      if (existing) {
        existing.answer = String(answer);
        existing.updatedAt = Date.now();
        saved = existing;
      } else {
        saved = { id: JF.schema.makeId(), question: q, answer: String(answer), updatedAt: Date.now() };
        p.custom.push(saved);
      }
    });
    return saved;
  }

  async function exportData({ includeResume = true } = {}) {
    const [profile, settings, resume] = await Promise.all([getProfile(), getSettings(), getResume()]);
    return {
      format: EXPORT_FORMAT,
      schemaVersion: JF.schema.SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      profile,
      settings,
      resume: includeResume ? resume : null,
    };
  }

  async function importData(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || typeof data !== 'object') throw new Error('Not a valid backup file.');
    // Accept a full backup or a bare profile object.
    const isBackup = data.format === EXPORT_FORMAT;
    const profile = JF.schema.normalize(isBackup ? data.profile : data);
    const items = { [KEYS.profile]: profile };
    if (isBackup && data.settings) items[KEYS.settings] = { ...DEFAULT_SETTINGS, ...data.settings };
    if (isBackup && data.resume && typeof data.resume.dataUrl === 'string' && data.resume.dataUrl.startsWith('data:')) {
      items[KEYS.resume] = data.resume;
    }
    await area().set(items);
    return profile;
  }

  async function clearAll() {
    await area().clear();
  }

  function onChange(fn) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') fn(changes);
    });
  }

  JF.storage = {
    KEYS,
    DEFAULT_SETTINGS,
    getProfile,
    saveProfile,
    updateProfile,
    getSettings,
    saveSettings,
    getResume,
    saveResume,
    removeResume,
    addCustomAnswer,
    exportData,
    importData,
    clearAll,
    onChange,
  };
})();
