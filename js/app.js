/* ============================================================
   AluBhaiOS — App shell
   State, hash router, data loading, theme, search, error handling.
   ============================================================ */
'use strict';

const PAGES = {
  dashboard: { title: 'Dashboard', render: c => Dashboard.render(c) },
  today:     { title: 'Today',     render: c => Dashboard.renderToday(c) },
  tasks:     { title: 'Tasks',     render: c => Tasks.page(c) },
  goals:     { title: 'Goals',     render: c => Goals.page(c) },
  routines:  { title: 'Routines',  render: c => Routines.page(c) },
  habits:    { title: 'Habits',    render: c => Habits.page(c) },
  salah:     { title: 'Salah',     render: c => Salah.page(c) },
  badges:    { title: 'Badges',    render: c => Badges.page(c) },
  focus:     { title: 'Focus',     render: c => Focus.page(c) },
  study:     { title: 'Study',     render: c => Study.page(c) },
  analytics: { title: 'Analytics', render: c => AnalyticsPage.page(c) },
  fishbone:  { title: 'Fishbone',  render: c => Fishbone.page(c) },
  reviews:   { title: 'Reviews',   render: c => Reviews.page(c) },
  settings:  { title: 'Settings',  render: c => Settings.page(c) }
};

const App = {
  state: { tasks: [], goals: [], routines: [], habits: [], habitLogs: [], focusSessions: [], dailyReviews: [], weeklyReviews: [], studyModules: [], challenges: [] , salah: [] },
  settings: {},
  current: 'dashboard',
  theme: 'dark',
  online: false,
  _loadingCount: 0,

  /* ---------------- boot ---------------- */
  async init() {
    this.theme = Utils.pref('theme') || 'dark';
    this.applyTheme(this.theme);
    Focus.init();

    qs('#nav-list').addEventListener('click', e => {
      const a = e.target.closest('[data-page]');
      if (a) this.closeSidebar();
    });
    qs('#btn-sidebar-toggle').addEventListener('click', () => this.toggleSidebar());
    qs('#sidebar-overlay').addEventListener('click', () => this.closeSidebar());
    qs('#btn-more').addEventListener('click', () => this.toggleSidebar());

    qs('#btn-theme').addEventListener('click', () => this.setTheme(this.theme === 'dark' ? 'light' : 'dark'));
    qs('#btn-refresh').addEventListener('click', () => { toast('Syncing…', 'info'); this.reload(); });
    qs('#btn-search').addEventListener('click', () => openSearch());
    qs('#topbar-timer').addEventListener('click', () => { location.hash = '#/focus'; });
    qs('#error-retry').addEventListener('click', () => { this.hideError(); this.reload(); });
    qs('#upgrade-dismiss').addEventListener('click', () => {
      Utils.pref('upgradeDismissed', true);
      qs('#upgrade-banner').hidden = true;
    });

    document.addEventListener('keydown', e => this.handleKeys(e));
    window.addEventListener('online', () => { this.online = true; this.updateConnUI(); });
    window.addEventListener('offline', () => { this.online = false; this.updateConnUI(); });
    window.addEventListener('hashchange', () => this.route());

    // PWA service worker (skipped on file://)
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      try { navigator.serviceWorker.register('sw.js').catch(() => { /* ignore */ }); } catch (e) { /* ignore */ }
    }

    // routine + salah reminders (browser notifications, fire while the app is open)
    setInterval(() => { this.checkRoutineReminders(); if (window.Salah) Salah.checkReminders(); }, 60000);

    this.online = navigator.onLine;
    await this.reload();
  },

  /** Keyboard shortcuts — ignored while typing in a field or holding modifiers. */
  handleKeys(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); return; }
    const t = document.activeElement;
    if (t && (/input|textarea|select/i.test(t.tagName) || t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (qs('#modal-root .modal-overlay')) return;
    switch (e.key.toLowerCase()) {
      case '/': e.preventDefault(); openSearch(); break;
      case 'n': e.preventDefault(); Tasks.openForm(); break;
      case 'f': location.hash = '#/focus'; break;
      case 't': location.hash = '#/today'; break;
      case 'd': location.hash = '#/dashboard'; break;
      case 'a': location.hash = '#/analytics'; break;
      case 'g': location.hash = '#/goals'; break;
      case 'b': location.hash = '#/badges'; break;
      case '?': e.preventDefault(); this.showShortcutsHelp(); break;
    }
  },

  showShortcutsHelp() {
    const rows = [
      ['N', 'New task'], ['F', 'Focus timer'], ['T', 'Today'], ['D', 'Dashboard'],
      ['A', 'Analytics'], ['G', 'Goals'], ['B', 'Badges'], ['/', 'Search everything'],
      ['Ctrl + K', 'Search'], ['?', 'This help']
    ];
    openModal({
      title: icon('keyboard') + ' Keyboard shortcuts',
      body: `<div class="shortcut-grid">${rows.map(r =>
        `<div><kbd>${r[0]}</kbd><span>${r[1]}</span></div>`).join('')}</div>`
    });
  },

  /** Notify today's routines whose start time just arrived (0–10 min window). */
  checkRoutineReminders() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const today = Utils.today();
    const wd = Utils.weekdayShort(today);
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    (App.state.routines || []).forEach(r => {
      if (r.enabled === false) return;
      const days = String(r.days || '').trim();
      if (days !== 'Every day' && !days.split(',').map(s => s.trim()).includes(wd)) return;
      if (!/^\d{1,2}:\d{2}/.test(String(r.target_time || ''))) return;
      const parts = r.target_time.split(':');
      const diff = nowMin - (Number(parts[0]) * 60 + Number(parts[1]));
      if (diff < 0 || diff > 10) return;
      const key = 'notified.' + today + '.' + r.id;
      if (Utils.pref(key)) return;
      Utils.pref(key, true);
      notify('⏰ ' + r.target_time + ' — ' + r.title,
        (r.duration_minutes ? Utils.fmtMinutes(r.duration_minutes) + ' — ' : '') + 'Time to start!');
    });
  },

  /* ---------------- data ---------------- */
  async reload() {
    this.setLoading(true, 'Loading dashboard…');
    try {
      if (!API.configured()) {
        this.state = { tasks: [], goals: [], routines: [], habits: [], habitLogs: [], focusSessions: [], dailyReviews: [], weeklyReviews: [], studyModules: [], challenges: [], salah: [] };
        this.settings = Object.assign({}, CONFIG.DEFAULTS);
        this.backendCurrent = false;
        this.online = false;
        this.showSetupBanner();
      } else {
        const data = await API.getAll();
        const archived = (data.archivedTasks || []).map(t => Object.assign({}, t, { _archived: true }));
        this.state.tasks = (data.tasks || []).concat(archived);
        ['goals', 'routines', 'habits', 'habitLogs', 'focusSessions', 'dailyReviews', 'weeklyReviews', 'studyModules', 'challenges', 'salah']
          .forEach(k => { this.state[k] = data[k] || []; });
        this.settings = Object.assign({}, CONFIG.DEFAULTS, data.settings || {});
        this.backendCurrent = Array.isArray(data.studyModules); // older deploys lack v1.3 sheets
        this.online = true;
        this.hideError();
        this.hideSetupBanner();
        this.updateUpgradeBanner();
        this.notifyMissed();
        // auto day tasks from routines (idempotent — once per routine per date)
        if (typeof Routines !== 'undefined' && Routines.ensureTodayTasks) Routines.ensureTodayTasks().catch(() => {});
      }
    } catch (e) {
      this.online = false;
      this.showError(e.message);
    }
    this.setLoading(false);
    this.updateConnUI();
    this.route();
    this.checkLevelUp();
  },

  /** 🎉 level-up celebration — fires once per new level (pref-tracked). */
  checkLevelUp() {
    try {
      if (typeof Gamify === 'undefined' || !App.online) return;
      const lv = Gamify.level(Gamify.xp()).level;
      const last = Utils.pref('lastLevel') || 0; // single-arg READ — two-arg would write 0 (pref bug pattern)
      if (lv > last && last > 0) this.celebrate(lv);
      if (lv !== last) Utils.pref('lastLevel', lv);
    } catch (e) { /* never block boot */ }
  },

  celebrate(lv) {
    const ov = document.createElement('div');
    ov.className = 'levelup-overlay';
    const colors = ['#f5c518', '#10b981', '#6366f1', '#ef4444', '#a78bfa', '#f97316'];
    const confetti = Array.from({ length: 44 }, (_, i) =>
      `<span class="confetti" style="left:${(Math.random() * 100).toFixed(1)}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * 0.9).toFixed(2)}s;animation-duration:${(2 + Math.random() * 1.6).toFixed(2)}s"></span>`).join('');
    // Arena's AluBhai joins the party in his victory pose (arms-up bounce)
    const alu = (typeof Arena !== 'undefined' && Arena.aluSvg)
      ? `<div class="levelup-alu f-win">${Arena.aluSvg()}</div>` : '';
    ov.innerHTML = `
      <div class="confetti-wrap">${confetti}</div>
      <div class="levelup-card">
        ${alu}
        <div class="levelup-big">🎉</div>
        <h2>LEVEL ${lv} UNLOCKED!</h2>
        <p class="muted">AluBhai is proud of you — keep climbing.</p>
        <button class="btn btn-primary" id="levelup-close">${icon('rocket')} Keep going</button>
      </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', close);
    setTimeout(close, 7000);
  },

  container() { return qs('#page-' + this.current); },

  route() {
    let page = (location.hash || '#/dashboard').replace(/^#\//, '');
    if (!PAGES[page]) page = 'dashboard';
    this.current = page;
    Charts.destroyAll();
    qsa('.page').forEach(p => { p.hidden = p.id !== 'page-' + page; });
    const section = qs('#page-' + page);
    try {
      PAGES[page].render(section);
    } catch (e) {
      console.error('Render failed on page "' + page + '"', e);
      section.innerHTML = emptyState('bug', 'This view failed to render', String(e.message || e),
        `<button class="btn btn-primary" onclick="App.reload()">Reload</button>`);
    }
    qs('#page-title').textContent = PAGES[page].title;
    document.title = PAGES[page].title + ' — ' + CONFIG.APP_NAME;
    qsa('#nav-list a, #bottom-nav a').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  },

  refreshCurrent() {
    Charts.destroyAll();
    this.checkLevelUp();
    const section = this.container();
    if (!section) return;
    try { PAGES[this.current].render(section); }
    catch (e) {
      console.error('Render failed', e);
      toast('Could not refresh this view: ' + (e.message || e), 'error');
    }
  },

  /* optimistic-safe local mutation used by all CRUD modules */
  replaceRecord(listName, rec) {
    if (!rec || !rec.id) return;
    const list = this.state[listName] || [];
    const i = list.findIndex(x => x.id === rec.id);
    if (i > -1) list[i] = rec; else list.push(rec);
  },

  /* ---------------- UI states ---------------- */
  setLoading(on, msg) {
    this._loadingCount = Math.max(0, this._loadingCount + (on ? 1 : -1));
    const ov = qs('#loading-overlay');
    if (!ov) return;
    ov.hidden = this._loadingCount === 0;
    if (msg) qs('#loading-msg', ov).textContent = msg;
  },

  showError(message) {
    const b = qs('#global-error');
    b.hidden = false;
    qs('#error-msg', b).textContent = message || 'Something went wrong.';
  },
  hideError() { const b = qs('#global-error'); if (b) b.hidden = true; },

  showSetupBanner() {
    const b = qs('#setup-banner');
    if (Utils.pref('setupDismissed')) { b.hidden = true; return; }
    b.hidden = false;
  },
  hideSetupBanner() { qs('#setup-banner').hidden = true; },

  /** Once per day: notify about tasks missed from earlier days. */
  notifyMissed() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const missed = (this.state.tasks || []).filter(t =>
      !t._archived && t.status !== 'completed' && t.scheduled_date && t.scheduled_date < Utils.today());
    if (!missed.length) return;
    const key = 'notified.missed.' + Utils.today();
    if (Utils.pref(key)) return;
    Utils.pref(key, true);
    notify('⚠️ ' + missed.length + ' task' + (missed.length > 1 ? 's' : '') + ' missed!',
      missed.slice(0, 3).map(t => t.title).join(' · ') + (missed.length > 3 ? ' …' : '') + ' — plan them today.');
  },

  updateUpgradeBanner() {
    const b = qs('#upgrade-banner');
    if (!b) return;
    b.hidden = this.backendCurrent !== false || !!Utils.pref('upgradeDismissed');
  },

  updateConnUI() {
    const dot = qs('#conn-dot');
    const label = qs('#conn-label');
    let cls = 'off', text = 'Not configured';
    if (API.configured()) {
      cls = this.online ? 'online' : 'offline';
      text = this.online ? 'Connected' : 'Offline';
    }
    if (dot) { dot.className = 'conn-dot ' + cls; dot.title = text; }
    if (label) label.textContent = text;
  },

  /* ---------------- theme ---------------- */
  applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    const btn = qs('#btn-theme');
    if (btn) btn.innerHTML = icon(t === 'dark' ? 'sun' : 'moon');
  },
  setTheme(t) {
    this.theme = t;
    Utils.pref('theme', t);
    this.applyTheme(t);
    this.refreshCurrent();
  },

  /* ---------------- mobile sidebar ---------------- */
  toggleSidebar() { document.body.classList.toggle('sidebar-open'); },
  closeSidebar() { document.body.classList.remove('sidebar-open'); },

  handleError(e) {
    console.error(e);
    const msg = String((e && e.message) || '');
    // "Unknown action" = the deployed backend predates a feature (Study/CTF/Salah/Archive)
    if (msg.includes('Unknown action')) {
      Utils.pref('upgradeDismissed', false);
      this.backendCurrent = false;
      this.updateUpgradeBanner();
      toast('This feature needs the backend update — see the yellow banner at the top for the 3 steps.', 'warn');
      return;
    }
    toast(msg || 'Something went wrong.', 'error');
    if (e.code === 'NETWORK') this.showError(msg);
  }
};
window.App = App;

/* ============================================================
   Global search (Ctrl+K or /)
   ============================================================ */
function openSearch() {
  const m = openModal({
    title: icon('magnifying-glass') + ' Search everything',
    wide: true,
    body: `
      <input type="search" id="global-search" placeholder="Search tasks, goals, routines, habits, projects…" autocomplete="off">
      <div id="search-results" class="search-results"></div>`
  });
  const input = qs('#global-search', m.overlay);
  const results = qs('#search-results', m.overlay);

  const run = Utils.debounce(() => {
    const q = input.value.trim().toLowerCase();
    if (!q) { results.innerHTML = `<p class="muted small">Type to search across all your data.</p>`; return; }
    const s = App.state;
    const match = (o, fields) => fields.some(f => String(o[f] || '').toLowerCase().includes(q));

    const groups = [
      { name: 'Tasks', icon: 'list-check', items: s.tasks.filter(t => match(t, ['title', 'description', 'category', 'project_id'])), page: 'tasks', sub: t => `${t.status} · ${t.priority}${t.project_id ? ' · ' + t.project_id : ''}` },
      { name: 'Goals', icon: 'bullseye', items: s.goals.filter(g => match(g, ['title', 'description', 'category'])), page: 'goals', sub: g => `${g.status || 'active'} · ${GoalProgress.auto(g).pct}%` },
      { name: 'Routines', icon: 'clock', items: s.routines.filter(r => match(r, ['title', 'description', 'category'])), page: 'routines', sub: r => `${r.target_time || ''} · ${r.days || ''}` },
      { name: 'Habits', icon: 'fire', items: s.habits.filter(h => match(h, ['title'])), page: 'habits', sub: h => `${h.frequency || 'daily'} · 🔥${Analytics.habitStreaks(h.id).current}` },
      { name: 'Projects', icon: 'folder', items: [], page: 'tasks', sub: () => '' }
    ];
    // projects = distinct task project ids
    const projects = {};
    s.tasks.forEach(t => { if (t.project_id) projects[t.project_id] = (projects[t.project_id] || 0) + 1; });
    groups[4].items = Object.keys(projects).filter(p => p.toLowerCase().includes(q)).map(p => ({ title: p, _sub: projects[p] + ' tasks' }));
    groups[4].sub = p => p._sub;

    let html = '';
    groups.forEach(g => {
      if (!g.items.length) return;
      html += `<div class="search-group"><div class="search-group-name">${icon(g.icon)} ${g.name}</div>` +
        g.items.slice(0, 8).map(o => `
          <button class="search-item" data-page="${g.page}" data-q="${Utils.esc(q)}">
            <span class="si-title">${Utils.esc(o.title)}</span>
            <span class="muted small">${Utils.esc(g.sub(o))}</span>
          </button>`).join('') + `</div>`;
    });
    results.innerHTML = html || `<p class="muted">No results for "${Utils.esc(q)}".</p>`;
    qsa('.search-item', results).forEach(b => b.addEventListener('click', () => {
      m.close();
      if (b.dataset.page === 'tasks') { Tasks.filter.search = b.dataset.q; Tasks.filter.status = ''; }
      location.hash = '#/' + b.dataset.page;
      App.route();
    }));
  }, 150);

  input.addEventListener('input', run);
  run();
  setTimeout(() => input.focus(), 100);
}

/* ---------------- go ---------------- */
document.addEventListener('DOMContentLoaded', () => App.init());
