/* ============================================================
   PersonalOS — Settings
   Profile, appearance, backend connection and the DATA SAFETY /
   RESET system. Destructive actions are clearly separated and
   guarded (typed "RESET" confirmation where required).
   ============================================================ */
'use strict';

const Settings = {
  page(container) {
    const apiUrl = API.url();
    container.innerHTML = `
      <div class="page-head"><h2>Settings</h2></div>

      <div class="settings-grid">
        <!-- Profile -->
        <div class="card">
          <h3 class="card-title">${icon('user')} Profile</h3>
          <label class="field"><span>Your name</span>
            <input id="set-name" value="${Utils.esc(App.settings.user_name || '')}" placeholder="Shown on the dashboard"></label>
          <label class="field"><span>Daily focus goal (minutes)</span>
            <input id="set-focus-goal" type="number" min="15" step="15" value="${Utils.esc(App.settings.daily_focus_goal_minutes || CONFIG.DEFAULTS.daily_focus_goal_minutes)}">
            <span class="muted small">Used by the productivity score (30 pts at 100% of this goal).</span></label>
          <button class="btn btn-primary" id="set-profile-save">${icon('check')} Save profile</button>
        </div>

        <!-- Appearance -->
        <div class="card">
          <h3 class="card-title">${icon('palette')} Appearance</h3>
          <div class="theme-picker">
            <button class="theme-opt ${App.theme === 'dark' ? 'selected' : ''}" data-theme-opt="dark">
              ${icon('moon')} Dark
            </button>
            <button class="theme-opt ${App.theme === 'light' ? 'selected' : ''}" data-theme-opt="light">
              ${icon('sun')} Light
            </button>
          </div>
          <p class="muted small">Theme is a local UI preference and is never affected by data resets.</p>
        </div>

        <!-- Backend connection -->
        <div class="card">
          <h3 class="card-title">${icon('plug')} Backend connection</h3>
          <p class="conn-line">Status:
            <span class="conn-badge ${API.configured() ? (App.online ? 'conn-ok' : 'conn-bad') : 'conn-off'}" id="conn-badge">
              ${API.configured() ? (App.online ? 'Connected' : 'Not connected') : 'Not configured'}
            </span>
          </p>
          <label class="field"><span>Google Apps Script Web App URL</span>
            <input id="set-api-url" value="${Utils.esc(apiUrl === String(CONFIG.API_URL) ? '' : apiUrl)}" placeholder="Paste your /exec URL here (overrides js/config.js)"></label>
          <div class="form-actions">
            <button class="btn" id="set-api-save">${icon('floppy-disk')} Save URL</button>
            <button class="btn" id="set-api-test">${icon('satellite-dish')} Test connection</button>
            <button class="btn btn-ghost" id="set-api-clear">Clear override</button>
          </div>
          <p class="muted small">Full setup guide: see the repository README (Google Sheet → Apps Script → deploy Web App).</p>
        </div>

        <!-- About -->
        <div class="card">
          <h3 class="card-title">${icon('circle-info')} About</h3>
          <p class="small">${Utils.esc(CONFIG.APP_NAME)} v${Utils.esc(CONFIG.VERSION)} — a personal productivity operating system:
            Plan → Execute → Measure → Reflect → Improve.</p>
          <p class="muted small">Frontend: GitHub Pages · Backend: Google Apps Script · Database: Google Sheets · Charts: Chart.js</p>
        </div>
      </div>

      <!-- DATA MANAGEMENT -->
      <div class="section-head danger-zone-head"><h3>${icon('database')} Data management</h3></div>
      <div class="card danger-zone">
        <div class="danger-row">
          <div>
            <b>Reset Today's Progress</b>
            <p class="muted small">Un-completes tasks finished today, and deletes today's focus sessions, habit check-ins and daily review. Tasks themselves are kept.</p>
          </div>
          <button class="btn" id="reset-today">Reset today</button>
        </div>
        <div class="danger-row">
          <div>
            <b>Reset Weekly Progress</b>
            <p class="muted small">Applies the same reset to every day of the current week (Monday–Sunday) and deletes this week's weekly review.</p>
          </div>
          <button class="btn" id="reset-week">Reset week</button>
        </div>
        <div class="danger-row">
          <div>
            <b>Reset All Progress</b>
            <p class="muted small">Permanently deletes ALL productivity records: tasks, habit logs, focus sessions, daily & weekly reviews.
              Goals, routines, habits and settings are kept.</p>
          </div>
          <button class="btn btn-danger" id="reset-progress">Reset all progress</button>
        </div>
        <div class="danger-row last">
          <div>
            <b>Reset Everything</b>
            <p class="muted small">Wipes the complete database — every sheet including goals, routines, habits AND settings. Only use when you want a truly blank slate.</p>
          </div>
          <button class="btn btn-danger" id="reset-everything">Reset everything</button>
        </div>
      </div>
    `;

    /* --- profile --- */
    qs('#set-profile-save', container).addEventListener('click', () => {
      const settings = {
        user_name: qs('#set-name', container).value.trim(),
        daily_focus_goal_minutes: String(Utils.num(qs('#set-focus-goal', container).value) || CONFIG.DEFAULTS.daily_focus_goal_minutes)
      };
      API.saveSettings(settings)
        .then(res => {
          Object.assign(App.settings, settings);
          toast('Profile saved', 'success');
          App.refreshCurrent();
        })
        .catch(e => App.handleError(e));
    });

    /* --- appearance --- */
    qsa('[data-theme-opt]', container).forEach(b => b.addEventListener('click', () => App.setTheme(b.dataset.themeOpt)));

    /* --- backend --- */
    qs('#set-api-save', container).addEventListener('click', () => {
      const v = qs('#set-api-url', container).value.trim();
      if (v && !/^https?:\/\//.test(v)) {
        return toast('Please paste a full URL starting with http:// or https:// (the Apps Script /exec URL).', 'warn');
      }
      Utils.pref('apiUrl', v);
      toast(v ? 'API URL saved — testing…' : 'Override cleared.', 'info');
      App.reload();
    });
    qs('#set-api-clear', container).addEventListener('click', () => {
      Utils.pref('apiUrl', '');
      toast('Override cleared — using js/config.js value.', 'info');
      App.reload();
    });
    qs('#set-api-test', container).addEventListener('click', () => {
      const btn = qs('#set-api-test', container);
      btn.disabled = true;
      btn.innerHTML = `${icon('spinner', 'fa-spin')} Testing…`;
      API.ping()
        .then(res => toast(`Connected to "${(res && res.spreadsheet) || 'backend'}" ✓`, 'success'))
        .catch(e => toast(e.message, 'error'))
        .finally(() => {
          btn.disabled = false;
          btn.innerHTML = `${icon('satellite-dish')} Test connection`;
          App.refreshCurrent();
        });
    });

    /* --- resets --- */
    qs('#reset-today', container).addEventListener('click', () => this.doReset('today', {
      title: "Reset today's progress?",
      message: 'Tasks completed today become pending again, and today\'s focus sessions, habit check-ins and daily review are deleted. Tasks, habits and settings are kept.',
      confirmText: 'Reset today'
    }));
    qs('#reset-week', container).addEventListener('click', () => this.doReset('week', {
      title: 'Reset weekly progress?',
      message: 'The same reset is applied to every day of the current week, and this week\'s weekly review is deleted.',
      confirmText: 'Reset week'
    }));
    qs('#reset-progress', container).addEventListener('click', () => this.doReset('progress', {
      title: 'WARNING: This action will permanently reset your productivity progress.',
      warning: 'All productivity records will be deleted.',
      message: 'Deleted: <b>all tasks, habit logs, focus sessions, daily reviews and weekly reviews</b>.' +
               '<br>Kept: goals, routines, habits, settings and all application configuration.' +
               '<br><br>This cannot be undone.',
      confirmText: 'Reset all progress'
    }, true));
    qs('#reset-everything', container).addEventListener('click', () => this.doReset('everything', {
      title: 'WARNING: This action will permanently reset your productivity progress.',
      warning: 'The COMPLETE database will be wiped — including settings.',
      message: 'Deleted: <b>everything in every sheet</b> — tasks, goals, routines, habits, logs, sessions, reviews AND settings.' +
               '<br><br>This cannot be undone.',
      confirmText: 'Reset everything'
    }, true));
  },

  doReset(type, opts, needKeyword) {
    const ask = needKeyword ? typeConfirm(opts) : confirmDialog({ ...opts, danger: true, confirmText: opts.confirmText || 'Reset' });
    ask.then(ok => {
      if (!ok) return;
      toast('Resetting…', 'info');
      API.reset(type)
        .then(res => {
          const c = (res && res.counts) || {};
          const parts = Object.keys(c).filter(k => c[k]).map(k => `${c[k]} ${k}`);
          toast('Reset complete' + (parts.length ? ' — removed ' + parts.join(', ') : ' — nothing to remove.'), 'success');
          App.reload();
        })
        .catch(e => App.handleError(e));
    });
  }
};
