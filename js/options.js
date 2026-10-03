/* ============================================================
   AluBhaiOS — Custom options engine
   Every dropdown's options can be managed from Settings →
   "Custom options". Model per group:
     { added: [...user additions], hidden: [...removed defaults] }
   Effective list = (defaults + added) − hidden.
   Persisted in the Settings sheet under the key `custom_options`,
   so your options follow you to every device. Removing a record's
   old value never breaks anything — records keep what they have.
   ============================================================ */
'use strict';

const Options = {
  DEFAULTS: {
    platforms: ['HTB', 'THM', 'PortSwigger', 'CTFd', 'picoCTF', 'pwnable.kr'],
    ctfCategories: ['Web', 'Crypto', 'Pwn', 'Reverse', 'Forensics', 'OSINT', 'Misc'],
    difficulties: ['Easy', 'Medium', 'Hard', 'Insane'],
    studyTypes: ['Writeup', 'HTB Module', 'PortSwigger', 'Other'],
    taskCategories: ['Learning', 'Projects', 'Work', 'Personal', 'Entertainment', 'Other'],
    distractionCategories: ['Entertainment', 'Distraction'],
    salahNames: ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']
  },

  LABELS: {
    platforms: 'CTF Platforms',
    ctfCategories: 'CTF Categories',
    difficulties: 'Difficulty levels',
    studyTypes: 'Study module types',
    taskCategories: 'Task / Goal categories',
    distractionCategories: 'Distraction categories',
    salahNames: 'Salah prayer names'
  },

  GROUP_KEYS: ['platforms', 'ctfCategories', 'difficulties', 'studyTypes', 'taskCategories', 'distractionCategories', 'salahNames'],

  raw() {
    try { return JSON.parse(App.settings.custom_options || '{}') || {}; }
    catch (e) { return {}; }
  },

  /** Effective options for a group, in a stable order. */
  get(group) {
    const r = this.raw()[group] || {};
    const hidden = new Set(r.hidden || []);
    return [...new Set([...(this.DEFAULTS[group] || []), ...(r.added || [])])]
      .filter(x => !hidden.has(x))
      .sort((a, b) => {
        const ia = (this.DEFAULTS[group] || []).indexOf(a);
        const ib = (this.DEFAULTS[group] || []).indexOf(b);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b);
      });
  },

  isDefault(group, value) { return (this.DEFAULTS[group] || []).includes(value); },

  async add(group, value) {
    value = String(value || '').trim();
    if (!value) return false;
    const r = JSON.parse(JSON.stringify(this.raw()));
    const g = r[group] = r[group] || { added: [], hidden: [] };
    g.hidden = (g.hidden || []).filter(x => x.toLowerCase() !== value.toLowerCase());
    if (!g.added.some(x => x.toLowerCase() === value.toLowerCase())) g.added.push(value);
    await this.persist(r);
    return true;
  },

  /** Removes an option: user additions are deleted, defaults are hidden. */
  async remove(group, value) {
    const r = JSON.parse(JSON.stringify(this.raw()));
    const g = r[group] = r[group] || { added: [], hidden: [] };
    g.added = (g.added || []).filter(x => x !== value);
    if (this.isDefault(group, value)) g.hidden = [...new Set([...(g.hidden || []), value])];
    await this.persist(r);
    return true;
  },

  async persist(r) {
    const payload = JSON.stringify(r);
    await API.saveSettings({ custom_options: payload });
    App.settings.custom_options = payload;
  }
};
