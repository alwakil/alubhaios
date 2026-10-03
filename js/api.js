/* ============================================================
   AluBhaiOS — API layer (Supabase REST edition)
   Same call surface as the old Apps Script client, so every
   page module keeps working unchanged:
     API.getAll(), API.createTask(data), API.updateTask(id, patch),
     API.setHabitLog(...), API.setSalah(...), API.saveSettings(...),
     API.archiveOldData(days), API.reset(type) — identical names.
   Supabase is PostgREST over HTTPS; booleans/numbers are stored
   as TEXT (same schema as the Sheets backend) so record shapes
   are byte-identical to what the UI expects.
   ============================================================ */
'use strict';

/* table name map: state key -> supabase table */
const SB_TABLES = {
  tasks: 'tasks',
  archivedTasks: 'archive',
  goals: 'goals',
  routines: 'routines',
  habits: 'habits',
  habitLogs: 'habit_logs',
  focusSessions: 'focus_sessions',
  dailyReviews: 'daily_reviews',
  weeklyReviews: 'weekly_reviews',
  studyModules: 'study_modules',
  challenges: 'challenges',
  salah: 'salah'
};

/* natural-key upsert targets: table -> conflict column set */
const SB_CONFLICT = {
  habit_logs: ['habit_id', 'date'],
  salah: ['date'],
  daily_reviews: ['date'],
  weekly_reviews: ['week_start']
};

const API = {
  url() {
    const stored = Utils.pref('sbUrl');
    if (stored && typeof stored === 'string' && stored.trim()) return stored.trim().replace(/\/+$/, '');
    return (typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_URL) ? String(CONFIG.SUPABASE_URL).trim().replace(/\/+$/, '') : '';
  },
  key() {
    const stored = Utils.pref('sbKey');
    if (stored && typeof stored === 'string' && stored.trim()) return stored.trim();
    return (typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_ANON_KEY) ? String(CONFIG.SUPABASE_ANON_KEY).trim() : '';
  },

  configured() {
    return /^https:\/\/.+/.test(this.url()) && this.key().length > 20;
  },

  /* kept so Settings' old "Backend connection" wording still works */
  isRead() { return true; },

  /** Low-level REST call. method: GET/POST/PATCH/DELETE. Returns parsed JSON rows (or null). */
  async rest(table, opts, _retries) {
    if (!this.configured()) {
      const err = new Error('Backend not configured. Add your Supabase URL + anon key in Settings → Backend connection.');
      err.code = 'NOT_CONFIGURED';
      throw err;
    }
    const maxTries = (opts.method === 'GET') ? 3 : 2; // Supabase writes are idempotent (client ids) — safe to retry
    let lastErr;
    for (let attempt = 1; attempt <= maxTries; attempt++) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 20000);
        const res = await fetch(this.url() + '/rest/v1/' + table + (opts.qs || ''), {
          method: opts.method || 'GET',
          headers: {
            apikey: this.key(),
            Authorization: 'Bearer ' + this.key(),
            'Content-Type': 'application/json',
            Prefer: opts.prefer || ''
          },
          body: opts.body ? JSON.stringify(opts.body) : undefined,
          signal: ctrl.signal
        });
        clearTimeout(timer);
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          const err = new Error('Supabase error (HTTP ' + res.status + '): ' + txt.slice(0, 200));
          err.code = res.status >= 500 || res.status === 429 ? 'NETWORK' : 'API';
          throw err;
        }
        const txt = await res.text();
        if (window.App && App.hideError) App.hideError(); // success clears an earlier hiccup banner
        return txt ? JSON.parse(txt) : null;
      } catch (e) {
        lastErr = e;
        const retryable = e.code === 'NETWORK' && attempt < maxTries;
        if (!retryable) throw e;
        await new Promise(r => setTimeout(r, 1200));
      }
    }
    throw lastErr;
  },

  /* ---------- generic CRUD over the table map ---------- */

  async listAll(table) {
    // paginated read (Supabase defaults to 1000 rows — page through all)
    // settings has no id column (PK is "key") — order by key there
    const orderCol = table === 'settings' ? 'key' : 'id';
    const all = [];
    let from = 0;
    for (;;) {
      const rows = await this.rest(table, {
        method: 'GET',
        qs: `?select=*&order=${orderCol}&limit=1000&offset=${from}`
      });
      if (!Array.isArray(rows) || !rows.length) break;
      all.push(...rows);
      if (rows.length < 1000) break;
      from += 1000;
    }
    return all;
  },

  /** insert one row; on unique conflict, update the existing row instead (upsert). */
  async upsert(table, rec) {
    const on = SB_CONFLICT[table];
    const qs = on ? `?on_conflict=${on.join(',')}` : '';
    return this.rest(table, {
      method: 'POST',
      qs,
      body: rec,
      headers: undefined,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
  },

  async patch(table, id, patchObj) {
    const rows = await this.rest(table, {
      method: 'PATCH',
      qs: '?id=eq.' + encodeURIComponent(id) + '&select=*',
      body: patchObj,
      prefer: 'return=representation'
    });
    if (!rows || !rows.length) throw new Error('Record not found in ' + table + ' (' + id + ')');
    return rows[0];
  },

  async remove(table, id) {
    await this.rest(table, { method: 'DELETE', qs: '?id=eq.' + encodeURIComponent(id) });
    return { id: id };
  },

  /* ---------- getAll (same shape the App shell expects) ---------- */

  async getAll() {
    // settings fetched alongside (SB_TABLES lacks it — key/value rows handled below)
    const jobs = Object.keys(SB_TABLES).map(async k => [k, await this.listAll(SB_TABLES[k])]);
    jobs.push((async () => ['settingsRows', await this.listAll('settings')])());
    const results = await Promise.all(jobs);
    const data = {};
    results.forEach(([k, rows]) => { data[k] = rows; });
    // settings: [{key,value}] -> object
    const settings = {};
    (data.settingsRows || []).forEach(r => { settings[r.key] = r.value; });
    delete data.settingsRows;
    data.settings = settings;
    data.serverTime = new Date().toISOString();
    return data;
  },

  /* -------- reads -------- */
  ping() {
    // lightweight connectivity check against a real table
    return this.rest('settings', { method: 'GET', qs: '?select=key&limit=1' })
      .then(() => ({ ok: true, serverTime: new Date().toISOString(), backend: 'Supabase' }));
  },
  getAnalytics(range) {
    // frontend computes analytics from App.state — return a bundle-shaped stub
    return Promise.resolve({ days: range || 90, generatedAt: new Date().toISOString() });
  },

  /* -------- tasks -------- */
  createTask(data) { return this.create('tasks', data); },
  updateTask(id, patch) { return this.patchT('tasks', id, patch); },
  deleteTask(id) { return this.deleteTaskFull(id); },

  /* -------- goals -------- */
  createGoal(data) { return this.create('goals', data); },
  updateGoal(id, patch) { return this.patchT('goals', id, patch); },
  deleteGoal(id) { return this.deleteLinkedGoal(id); },

  /* -------- routines -------- */
  createRoutine(data) { return this.create('routines', data); },
  updateRoutine(id, patch) { return this.patchT('routines', id, patch); },
  deleteRoutine(id) { return this.remove('routines', id); },

  /* -------- habits + logs -------- */
  createHabit(data) { return this.create('habits', data); },
  updateHabit(id, patch) { return this.patchT('habits', id, patch); },
  async deleteHabit(id) {
    await this.rest('habit_logs', { method: 'DELETE', qs: '?habit_id=eq.' + encodeURIComponent(id) });
    return this.remove('habits', id);
  },
  async setHabitLog(habitId, date, completed, note) {
    // find existing log for (habit_id, date) — mirrors GAS upsert behaviour
    const found = await this.rest('habit_logs', {
      method: 'GET',
      qs: '?habit_id=eq.' + encodeURIComponent(habitId) + '&date=eq.' + encodeURIComponent(date) + '&select=*'
    });
    const payload = {
      habit_id: habitId, date: date,
      completed: String(completed === true || String(completed).toLowerCase() === 'true'),
      note: note || ''
    };
    let log;
    if (Array.isArray(found) && found.length) {
      log = await this.patch('habit_logs', found[0].id, { completed: payload.completed, note: payload.note });
    } else {
      payload.id = payload.id || Utils.uid();
      payload.created_at = payload.created_at || Utils.nowISO();
      log = await this.upsert('habit_logs', payload);
      if (Array.isArray(log)) log = log[0];
    }
    const streaks = Analytics.habitStreaks(habitId);
    return { log: log, streaks: streaks };
  },

  /* -------- focus sessions -------- */
  createFocusSession(data) { return this.create('focus_sessions', data); },
  deleteFocusSession(id) { return this.remove('focus_sessions', id); },

  /* -------- reviews (upsert by natural key, like the GAS backend) -------- */
  async createDailyReview(data) {
    const existing = await this.rest('daily_reviews', { method: 'GET', qs: '?date=eq.' + encodeURIComponent(data.date) + '&select=*' });
    if (Array.isArray(existing) && existing.length) return this.patch('daily_reviews', existing[0].id, data);
    if (!data.id) data.id = Utils.uid();
    if (!data.created_at) data.created_at = Utils.nowISO();
    const rows = await this.upsert('daily_reviews', data);
    return Array.isArray(rows) ? rows[0] : rows;
  },
  deleteDailyReview(id) { return this.remove('daily_reviews', id); },
  async createWeeklyReview(data) {
    const rows = await this.rest('weekly_reviews', { method: 'GET', qs: '?week_start=eq.' + encodeURIComponent(data.week_start) + '&select=*' });
    if (Array.isArray(rows) && rows.length) return this.patch('weekly_reviews', rows[0].id, data);
    if (!data.id) data.id = Utils.uid();
    const out = await this.upsert('weekly_reviews', data);
    return Array.isArray(out) ? out[0] : out;
  },
  deleteWeeklyReview(id) { return this.remove('weekly_reviews', id); },

  /* -------- study modules / CTF challenges -------- */
  createStudyModule(data) { return this.create('study_modules', data); },
  updateStudyModule(id, patch) { return this.patchT('study_modules', id, patch); },
  deleteStudyModule(id) { return this.remove('study_modules', id); },
  createChallenge(data) { return this.create('challenges', data); },
  updateChallenge(id, patch) { return this.patchT('challenges', id, patch); },
  deleteChallenge(id) { return this.remove('challenges', id); },

  /* -------- salah (upsert on date; patch only sent keys) -------- */
  async setSalah(data) {
    const date = String(data.date || '').slice(0, 10);
    const rows = await this.rest('salah', { method: 'GET', qs: '?date=eq.' + encodeURIComponent(date) + '&select=*' });
    const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
    if (Array.isArray(rows) && rows.length) {
      const patch = {};
      prayers.forEach(k => { if (data[k] !== undefined) patch[k] = String(data[k] === true || String(data[k]).toLowerCase() === 'true'); });
      patch.updated_at = Utils.nowISO();
      const out = await this.patch('salah', rows[0].id, patch);
      return out;
    }
    const rec = { id: data.id || Utils.uid(), date: date, created_at: Utils.nowISO(), updated_at: Utils.nowISO() };
    prayers.forEach(k => { rec[k] = String(data[k] === true || String(data[k]).toLowerCase() === 'true'); });
    const out = await this.upsert('salah', rec);
    return Array.isArray(out) ? out[0] : out;
  },

  /* -------- settings / reset -------- */
  async saveSettings(settingsObj) {
    const keys = Object.keys(settingsObj || {});
    for (const k of keys) {
      await this.upsert('settings', { key: k, value: String(settingsObj[k]) });
    }
    if (window.App && App.settings) Object.assign(App.settings, settingsObj);
    return { settings: settingsObj };
  },

  async archiveOldData(days) {
    const cutoff = Utils.addDays(Utils.today(), -(Number(days) || 120));
    const old = (((window.App && App.state) && App.state.tasks) || []).filter(t => !t._archived && t.status === 'completed' &&
      String(t.completed_at || '').slice(0, 10) && String(t.completed_at).slice(0, 10) < cutoff);
    for (const t of old) {
      await this.upsert('archive', t);
      await this.rest('tasks', { method: 'DELETE', qs: '?id=eq.' + encodeURIComponent(t.id) });
    }
    return { moved: old.length, cutoff: cutoff };
  },

  async reset(type) {
    const today = Utils.today();
    const inRange = d => type === 'today' ? d === today
      : type === 'week' ? (d >= Utils.addDays(today, -6) && d <= today)
      : false;

    if (type === 'today' || type === 'week') {
      // un-complete tasks finished in range
      for (const t of (App.state.tasks || [])) {
        if (t.status === 'completed' && String(t.completed_at || '').slice(0, 10) && inRange(String(t.completed_at).slice(0, 10))) {
          await this.patchT('tasks', t.id, { status: 'pending', completed_at: '' });
        }
      }
      await this.rest('focus_sessions', { method: 'DELETE', qs: '?start_time=gte.' + (type === 'today' ? today : Utils.addDays(today, -6)) });
      await this.rest('habit_logs', { method: 'DELETE', qs: '?date=gte.' + (type === 'today' ? today : Utils.addDays(today, -6)) + '&date=lte.' + today });
      await this.rest('daily_reviews', { method: 'DELETE', qs: '?date=gte.' + (type === 'today' ? today : Utils.addDays(today, -6)) + '&date=lte.' + today });
    } else if (type === 'progress') {
      for (const tb of ['tasks', 'archive', 'focus_sessions', 'habit_logs', 'daily_reviews', 'weekly_reviews']) {
        await this.rest(SB_TABLES[tb] || tb, { method: 'DELETE', qs: '?id=neq.' }); // delete all
      }
      for (const h of ((window.App && App.state && App.state.habits) || [])) await this.patchT('habits', h.id, { current_streak: '0', best_streak: '0' });
    } else if (type === 'everything') {
      for (const t of Object.values(SB_TABLES).concat(['settings'])) {
        await this.rest(t, { method: 'DELETE', qs: '?id=neq.' });
      }
      await this.rest('settings', { method: 'DELETE', qs: '?key=neq.' });
    } else {
      throw new Error('Unknown reset type: ' + type + ' (use today | week | progress | everything)');
    }
    return { type: type };
  },

  /* ---------- helpers shared above ---------- */

  /** create* — record comes with app-side defaults already applied; just stamp timestamps. */
  async create(table, rec) {
    rec = Object.assign({}, rec);
    if (!rec.id) rec.id = Utils.uid();
    const now = Utils.nowISO();
    if (!rec.created_at) rec.created_at = now;
    if ('updated_at' in rec && !rec.updated_at) rec.updated_at = now;
    const rows = await this.upsert(table, rec);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row || rec;
  },

  /** update + updated_at stamp (tables that track it). */
  async patchT(table, id, patch) {
    const p = Object.assign({}, patch);
    // stamp updated_at only for tables that have the column
    const HAS_UPDATED = ['tasks', 'archive', 'goals', 'routines', 'habits', 'study_modules', 'challenges', 'salah'];
    if (HAS_UPDATED.includes(table)) p.updated_at = Utils.nowISO();
    return this.patch(table, id, p);
  },

  /** delete task + unlink its focus sessions (mirrors the GAS behaviour). */
  async deleteTaskFull(id) {
    for (const s of ((window.App && App.state && App.state.focusSessions) || [])) {
      if (String(s.task_id) === String(id)) await this.patch('focus_sessions', s.id, { task_id: '' });
    }
    await this.rest('archive', { method: 'DELETE', qs: '?id=eq.' + encodeURIComponent(id) });
    return this.remove('tasks', id);
  },

  /** delete goal + unlink tasks/sub-goals. */
  async deleteLinkedGoal(id) {
    for (const t of ((window.App && App.state && App.state.tasks) || [])) {
      if (String(t.goal_id) === String(id)) await this.patchT('tasks', t.id, { goal_id: '' });
    }
    for (const g of ((window.App && App.state && App.state.goals) || [])) {
      if (String(g.parent_goal_id) === String(id)) await this.patchT('goals', g.id, { parent_goal_id: '' });
    }
    return this.remove('goals', id);
  }
};
