/* ============================================================
   PersonalOS — API layer
   Action-based client for the Google Apps Script backend.
   All requests are POST with a plain-text JSON body (no custom
   headers) so the browser never sends a CORS preflight — Google
   Apps Script Web Apps do not answer OPTIONS requests.
   ============================================================ */
'use strict';

const API = {
  url() {
    const stored = Utils.pref('apiUrl');
    if (stored && typeof stored === 'string' && stored.trim()) return stored.trim();
    return (typeof CONFIG !== 'undefined' && CONFIG.API_URL) ? String(CONFIG.API_URL).trim() : '';
  },

  configured() {
    const u = this.url();
    // Accept the Google Apps Script host OR any http(s) URL (e.g. the local
    // dev mock server) — only the placeholder must be rejected.
    return !!u && u.indexOf('YOUR_GOOGLE_APPS_SCRIPT') === -1 && /^https?:\/\//.test(u);
  },

  /** Read actions are safe to retry automatically (writes are not — no silent duplicates). */
  isRead(action) {
    return action === 'ping' || action === 'getAll' || action === 'getAnalytics' || action.startsWith('get');
  },

  /** Every backend call goes through here. Resolves with response.data. */
  async call(action, data, _retries) {
    if (!this.configured()) {
      const err = new Error('Backend not configured. Add your Google Apps Script Web App URL in Settings.');
      err.code = 'NOT_CONFIGURED';
      throw err;
    }
    const maxTries = (_retries === undefined && this.isRead(action)) ? 2 : 1;
    data = Object.assign({}, data);
    // Client-side idempotency key: if Apps Script double-executes a POST,
    // the backend recognises the id and does not create a duplicate.
    if (/^create/.test(action) && data && !data.id) data.id = Utils.uid();
    let lastErr;
    for (let attempt = 1; attempt <= maxTries; attempt++) {
      try {
        return await this._once(action, data);
      } catch (e) {
        lastErr = e;
        if (e.code !== 'NETWORK' || attempt >= maxTries) throw e;
        await new Promise(r => setTimeout(r, 1500)); // brief pause, then retry
      }
    }
    throw lastErr;
  },

  async _once(action, data) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    let res;
    try {
      res = await fetch(this.url(), {
        method: 'POST',
        redirect: 'follow',
        body: JSON.stringify({ action: action, data: data || {} }),
        signal: ctrl.signal
      });
    } catch (e) {
      clearTimeout(timer);
      const err = new Error('Unable to connect to the backend. Please try again.');
      err.code = 'NETWORK';
      throw err;
    }
    clearTimeout(timer);

    let json;
    try {
      json = await res.json();
    } catch (e) {
      const err = new Error('Unexpected response from the backend (HTTP ' + res.status + '). Check the Apps Script deployment and try again.');
      err.code = 'BAD_RESPONSE';
      throw err;
    }
    if (!json || json.success !== true) {
      const err = new Error((json && json.message) || 'The backend reported an error.');
      err.code = 'API';
      throw err;
    }
    return json.data;
  },

  /* -------- reads -------- */
  getAll() { return this.call('getAll'); },
  ping() { return this.call('ping'); },
  getAnalytics(range) { return this.call('getAnalytics', { days: range || 90 }); },

  /* -------- tasks -------- */
  createTask(data) { return this.call('createTask', data); },
  updateTask(id, patch) { return this.call('updateTask', Object.assign({ id: id }, patch)); },
  deleteTask(id) { return this.call('deleteTask', { id: id }); },

  /* -------- goals -------- */
  createGoal(data) { return this.call('createGoal', data); },
  updateGoal(id, patch) { return this.call('updateGoal', Object.assign({ id: id }, patch)); },
  deleteGoal(id) { return this.call('deleteGoal', { id: id }); },

  /* -------- routines -------- */
  createRoutine(data) { return this.call('createRoutine', data); },
  updateRoutine(id, patch) { return this.call('updateRoutine', Object.assign({ id: id }, patch)); },
  deleteRoutine(id) { return this.call('deleteRoutine', { id: id }); },

  /* -------- habits + logs -------- */
  createHabit(data) { return this.call('createHabit', data); },
  updateHabit(id, patch) { return this.call('updateHabit', Object.assign({ id: id }, patch)); },
  deleteHabit(id) { return this.call('deleteHabit', { id: id }); },
  setHabitLog(habitId, date, completed, note) {
    return this.call('setHabitLog', { habit_id: habitId, date: date, completed: completed, note: note || '' });
  },

  /* -------- focus sessions -------- */
  createFocusSession(data) { return this.call('createFocusSession', data); },
  deleteFocusSession(id) { return this.call('deleteFocusSession', { id: id }); },

  /* -------- reviews -------- */
  createDailyReview(data) { return this.call('createDailyReview', data); },
  deleteDailyReview(id) { return this.call('deleteDailyReview', { id: id }); },
  createWeeklyReview(data) { return this.call('createWeeklyReview', data); },
  deleteWeeklyReview(id) { return this.call('deleteWeeklyReview', { id: id }); },

  /* -------- study modules / CTF challenges -------- */
  createStudyModule(data) { return this.call('createStudyModule', data); },
  updateStudyModule(id, patch) { return this.call('updateStudyModule', Object.assign({ id: id }, patch)); },
  deleteStudyModule(id) { return this.call('deleteStudyModule', { id: id }); },
  createChallenge(data) { return this.call('createChallenge', data); },
  updateChallenge(id, patch) { return this.call('updateChallenge', Object.assign({ id: id }, patch)); },
  deleteChallenge(id) { return this.call('deleteChallenge', { id: id }); },

  /* -------- settings / reset -------- */
  saveSettings(settingsObj) { return this.call('saveSettings', { settings: settingsObj }); },
  archiveOldData(days) { return this.call('archiveOldData', { days: days }); },
  reset(type) { return this.call('reset', { type: type }); }
};
