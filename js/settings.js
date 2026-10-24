/* ============================================================
   AluBhaiOS — Settings
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
          <label class="field"><span>Supabase Project URL</span>
            <input id="set-api-url" value="${Utils.esc(apiUrl === String(CONFIG.SUPABASE_URL) ? '' : apiUrl)}" placeholder="https://xxxx.supabase.co (overrides js/config.js)"></label>
          <label class="field"><span>Supabase anon key (public)</span>
            <input id="set-api-key" value="${Utils.esc(API.key() === String(CONFIG.SUPABASE_ANON_KEY) ? '' : API.key())}" placeholder="eyJhbGciOi… (anon public key only)"></label>
          <div class="form-actions">
            <button class="btn" id="set-api-save">${icon('floppy-disk')} Save connection</button>
            <button class="btn" id="set-api-test">${icon('satellite-dish')} Test connection</button>
            <button class="btn btn-ghost" id="set-api-clear">Clear override</button>
          </div>
          <p class="muted small">Supabase Dashboard → Settings → API → copy "Project URL" + "anon public" key. Full guide: repository README.</p>
        </div>

        <!-- Custom options -->
        <div class="card">
          <h3 class="card-title">${icon('sliders')} Custom options</h3>
          <p class="muted small">Add or remove the options that appear in dropdowns across the app (CTF forms, Study modules, Tasks, Goals, Focus). Removing a default only hides it — existing records keep their values.</p>
          <label class="field"><span>Option group</span>
            <select id="opt-group">
              ${Options.GROUP_KEYS.map(g => `<option value="${g}">${Utils.esc(Options.LABELS[g])}</option>`).join('')}
            </select></label>
          <div id="opt-chips" class="opt-chips"></div>
          <div class="opt-add">
            <input id="opt-new" placeholder="New option name…" maxlength="40">
            <button class="btn btn-primary" id="opt-add-btn">${icon('plus')} Add</button>
          </div>
        </div>

        <!-- Salah setup -->
        <div class="card">
          <h3 class="card-title">${icon('mosque')} Salah setup</h3>
          <p class="muted small">Edit the prayer names (any language) and set each prayer's time — the Salah page and its reminders use these.</p>
          <div id="salah-setup-rows"></div>
          <button class="btn btn-primary" id="salah-setup-save">${icon('check')} Save names & times</button>
        </div>

        <!-- Notifications -->
        <div class="card">
          <h3 class="card-title">${icon('bell')} Notifications</h3>
          <p class="muted small" id="notif-status">Status: <b>${('Notification' in window) ? Notification.permission : 'unsupported'}</b> — routine reminders + pomodoro alerts.</p>
          <p class="muted small">Reminders fire while the app is open (a pinned tab works great).</p>
          <button class="btn" id="notif-enable">${icon('bell')} Enable notifications</button>
        </div>

        <!-- Grace mode (exam mode) -->
        <div class="card">
          <h3 class="card-title">${icon('graduation-cap')} Grace mode</h3>
          <p class="muted small">Exam / travel / sick days where missed-work penalties make no sense. On grace days the −XP penalty is paused; history and the missed alert stay untouched.</p>
          <div id="grace-list"></div>
          <div class="grace-add">
            <input type="date" id="grace-from" title="From">
            <input type="date" id="grace-to" title="To">
            <input id="grace-reason" placeholder="Reason (e.g. Final exam)" maxlength="60">
            <button class="btn btn-primary" id="grace-add-btn">${icon('plus')} Add</button>
          </div>
        </div>

        <!-- Subscriptions (fixed-date countdown) -->
        <div class="card" id="subs-card"></div>

        <!-- Deadlines setup (only shown when the due_date column is missing) -->
        ${App.dueDateSupported === false ? `
        <div class="card">
          <h3 class="card-title">${icon('hourglass-half')} Enable deadlines</h3>
          <p class="muted small">One-time database step: add the <code>due_date</code> column to <code>tasks</code> + <code>archive</code>. Until then the Deadline field stays hidden and nothing breaks.</p>
          <pre class="sql-paste">ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date TEXT;
ALTER TABLE archive ADD COLUMN IF NOT EXISTS due_date TEXT;</pre>
          <p class="muted small">Paste into Supabase Dashboard → SQL Editor → Run, then reload this page.</p>
        </div>` : ''}

        <!-- About -->
        <div class="card">
          <h3 class="card-title">${icon('circle-info')} About</h3>
          <p class="small">${Utils.esc(CONFIG.APP_NAME)} v${Utils.esc(CONFIG.VERSION)} — a personal productivity operating system:
            Plan → Execute → Measure → Reflect → Improve.</p>
          <p class="muted small">Frontend: GitHub Pages · Backend: Supabase (Postgres REST) · Charts: Chart.js</p>
          <p class="muted small" id="pwa-hint"></p>
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
            <p class="muted small">Wipes the complete database — every sheet including settings. Only use when you want a truly blank slate.</p>
          </div>
          <button class="btn btn-danger" id="reset-everything">Reset everything</button>
        </div>
        <div class="danger-row last" style="border-top:1px solid var(--border)">
          <div>
            <b>${icon('box-archive')} Archive old tasks</b>
            <p class="muted small">Moves completed tasks older than the threshold into the "archive" table in your Supabase database. Nothing is deleted — history and stats stay intact.</p>
            <div class="field-row" style="max-width:260px;margin-top:8px">
              <label class="field"><span>Older than (days)</span>
                <input type="number" id="archive-days" min="30" step="10" value="120"></label>
            </div>
          </div>
          <button class="btn" id="archive-run">${icon('box-archive')} Archive now</button>
        </div>
        <div class="danger-row last" style="border-top:1px solid var(--border)">
          <div>
            <b>${icon('shield-halved')} Backup & restore</b>
            <p class="muted small">Download a JSON snapshot of every table (tasks, goals, sessions, logs, settings…). Keep it anywhere — restore it later to rebuild your database exactly.</p>
            <input type="file" id="restore-file" accept="application/json,.json" style="display:none">
          </div>
          <div class="form-actions" style="flex-direction:column;align-items:stretch;gap:8px">
            <button class="btn" id="backup-download">${icon('download')} Download backup</button>
            <button class="btn" id="restore-open">${icon('upload')} Restore from file</button>
          </div>
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
      const k = qs('#set-api-key', container).value.trim();
      if (v && !/^https:\/\/.+/.test(v)) {
        return toast('Please paste a full Supabase URL starting with https:// (example: https://xxxx.supabase.co).', 'warn');
      }
      Utils.pref('sbUrl', v);
      Utils.pref('sbKey', k);
      toast(v || k ? 'Connection saved — testing…' : 'Override cleared.', 'info');
      App.reload();
    });
    qs('#set-api-clear', container).addEventListener('click', () => {
      Utils.pref('sbUrl', '');
      Utils.pref('sbKey', '');
      toast('Override cleared — using js/config.js values.', 'info');
      App.reload();
    });
    qs('#set-api-test', container).addEventListener('click', () => {
      const btn = qs('#set-api-test', container);
      btn.disabled = true;
      btn.innerHTML = `${icon('spinner', 'fa-spin')} Testing…`;
      API.ping()
        .then(() => toast('Connected to Supabase ✓', 'success'))
        .catch(e => toast(e.message, 'error'))
        .finally(() => {
          btn.disabled = false;
          btn.innerHTML = `${icon('satellite-dish')} Test connection`;
          App.refreshCurrent();
        });
    });

    /* --- salah names + times --- */
    const renderSalahSetup = () => {
      const names = (() => { try { const n = JSON.parse(App.settings.salah_names || '[]'); if (Array.isArray(n) && n.length === 5) return n; } catch (e) {} return ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']; })();
      const times = (() => { try { const t = JSON.parse(App.settings.salah_times || '[]'); if (Array.isArray(t)) return t; } catch (e) {} return ['', '', '', '', '']; })();
      const wrap = qs('#salah-setup-rows', container);
      wrap.innerHTML = [0, 1, 2, 3, 4].map(i => `
        <div class="salah-setup-row">
          <input data-salah-name="${i}" value="${Utils.esc(names[i] || '')}" placeholder="Prayer name ${i + 1}" maxlength="30">
          <input data-salah-time="${i}" type="time" value="${Utils.esc(times[i] || '')}">
        </div>`).join('');
    };
    renderSalahSetup();
    qs('#salah-setup-save', container).addEventListener('click', async () => {
      const defaults = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
      const names = [0, 1, 2, 3, 4].map(i => qs(`[data-salah-name="${i}"]`, container).value.trim() || defaults[i]);
      const times = [0, 1, 2, 3, 4].map(i => qs(`[data-salah-time="${i}"]`, container).value || '');
      try {
        await API.saveSettings({ salah_names: JSON.stringify(names), salah_times: JSON.stringify(times) });
        App.settings.salah_names = JSON.stringify(names);
        App.settings.salah_times = JSON.stringify(times);
        toast('🕌 Salah names & times saved — reminders will use them.', 'success');
      } catch (e) { App.handleError(e); }
    });

    /* --- custom options manager --- */
    const renderOptChips = () => {
      const group = qs('#opt-group', container).value;
      const wrap = qs('#opt-chips', container);
      const opts = Options.get(group);
      wrap.innerHTML = opts.length
        ? opts.map(o => `
            <span class="opt-chip">
              ${Utils.esc(o)}
              <button class="opt-x" data-opt-remove="${Utils.esc(o)}" title="Remove">${icon('xmark')}</button>
            </span>`).join('')
        : '<span class="muted small">No options — add one below.</span>';
    };
    renderOptChips();
    qs('#opt-group', container).addEventListener('change', renderOptChips);
    const addOpt = async () => {
      const input = qs('#opt-new', container);
      const group = qs('#opt-group', container).value;
      if (!input.value.trim()) return;
      await Options.add(group, input.value);
      input.value = '';
      renderOptChips();
      toast('Option added ✓ — dropdowns updated.', 'success');
    };
    qs('#opt-add-btn', container).addEventListener('click', addOpt);
    qs('#opt-new', container).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addOpt(); } });
    container.addEventListener('click', e => {
      const x = e.target.closest('[data-opt-remove]');
      if (!x) return;
      const group = qs('#opt-group', container).value;
      Options.remove(group, x.dataset.optRemove)
        .then(() => { renderOptChips(); toast('Option removed — dropdowns updated.', 'info'); })
        .catch(e2 => App.handleError(e2));
    });

    /* --- notifications --- */
    qs('#notif-enable', container).addEventListener('click', async () => {
      const ok = await askNotifyPermission();
      if (ok) toast('Notifications enabled 🔔', 'success');
      const st = qs('#notif-status', container);
      if (st && 'Notification' in window) st.innerHTML = `Status: <b>${Notification.permission}</b> — routine reminders + pomodoro alerts.`;
    });

    /* --- grace mode (exam mode) --- */
    const renderGrace = () => {
      const ranges = (typeof Gamify !== 'undefined' && Gamify.graceRanges) ? Gamify.graceRanges() : [];
      const wrap = qs('#grace-list', container);
      wrap.innerHTML = ranges.length
        ? ranges.map((g, i) => `
            <div class="grace-row">
              <span>${icon('graduation-cap')} <b>${Utils.esc(g.reason)}</b>
                <span class="muted small">${Utils.fmtDate(g.from)} → ${Utils.fmtDate(g.to)}</span></span>
              <button class="btn btn-sm btn-ghost danger" data-grace-del="${i}" title="Remove">${icon('xmark')}</button>
            </div>`).join('')
        : '<p class="muted small">No grace days configured.</p>';
    };
    renderGrace();
    qs('#grace-add-btn', container).addEventListener('click', async () => {
      const from = qs('#grace-from', container).value;
      const to = qs('#grace-to', container).value;
      const reason = qs('#grace-reason', container).value.trim() || 'Grace';
      if (!from || !to || to < from) return toast('Pick a valid From → To date range.', 'warn');
      const arr = (typeof Gamify !== 'undefined' && Gamify.graceRanges) ? Gamify.graceRanges()
        .map(g => ({ from: g.from, to: g.to, reason: g.reason, added: g.added })) : [];
      arr.push({ from: from, to: to, reason: reason, added: Utils.nowISO() });
      try {
        await API.saveSettings({ grace_days: JSON.stringify(arr) });
        App.settings.grace_days = JSON.stringify(arr);
        qs('#grace-from', container).value = ''; qs('#grace-to', container).value = ''; qs('#grace-reason', container).value = '';
        renderGrace();
        toast('🎓 Grace mode saved — penalties paused for that range.', 'success');
        App.refreshCurrent();
      } catch (e) { App.handleError(e); }
    });
    // delete lives on the (per-visit) list wrapper, not on container — mounting
    // on container would stack a listener on every Settings visit and double-fire
    qs('#grace-list', container).addEventListener('click', e => {
      const del = e.target.closest('[data-grace-del]');
      if (!del) return;
      const idx = Number(del.dataset.graceDel);
      const arr = (typeof Gamify !== 'undefined' && Gamify.graceRanges) ? Gamify.graceRanges()
        .map(g => ({ from: g.from, to: g.to, reason: g.reason, added: g.added })) : [];
      arr.splice(idx, 1);
      API.saveSettings({ grace_days: JSON.stringify(arr) })
        .then(() => {
          App.settings.grace_days = JSON.stringify(arr);
          renderGrace();
          toast('Grace range removed.', 'info');
          App.refreshCurrent();
        })
        .catch(err => App.handleError(err));
    });
    container.addEventListener('click', e => {
      const del = e.target.closest('[data-grace-del]');
      if (!del) return;
      const idx = Number(del.dataset.graceDel);
      const arr = (typeof Gamify !== 'undefined' && Gamify.graceRanges) ? Gamify.graceRanges()
        .map(g => ({ from: g.from, to: g.to, reason: g.reason, added: g.added })) : [];
      arr.splice(idx, 1);
      API.saveSettings({ grace_days: JSON.stringify(arr) })
        .then(() => {
          App.settings.grace_days = JSON.stringify(arr);
          renderGrace();
          toast('Grace range removed.', 'info');
          App.refreshCurrent();
        })
        .catch(err => App.handleError(err));
    }, { once: false });

    /* --- subscriptions (fixed-date countdown) --- */
    if (typeof Subs !== 'undefined' && Subs.settingsCard) Subs.settingsCard(container);

    // PWA install hint
    const pwa = qs('#pwa-hint', container);
    if (pwa) {
      const standalone = window.matchMedia('(display-mode: standalone)').matches;
      pwa.innerHTML = standalone
        ? `${icon('mobile-screen')} Running as an installed app. Enjoy! 🎉`
        : `${icon('mobile-screen')} Install tip: browser menu → "Install AluBhaiOS" / "Add to Home screen" for the full-screen app experience.`;
    }

    /* --- archive --- */
    qs('#archive-run', container).addEventListener('click', async () => {
      const days = Utils.num(qs('#archive-days', container).value) || 120;
      const ok = await confirmDialog({
        title: 'Archive old tasks?',
        message: `Completed tasks finished more than <b>${days} days</b> ago will move to the "Archive" sheet in your spreadsheet. They stay available to stats and can be viewed under Tasks → Archived.`,
        confirmText: 'Archive now',
        danger: false
      });
      if (!ok) return;
      toast('Archiving…', 'info');
      API.archiveOldData(days)
        .then(res => {
          const n = (res && res.moved) || 0;
          toast(n ? `🗄 ${n} task(s) archived.` : 'Nothing to archive — everything is recent.', 'success');
          App.reload();
        })
        .catch(e => App.handleError(e));
    });

    /* --- backup & restore --- */
    qs('#backup-download', container).addEventListener('click', async () => {
      const btn = qs('#backup-download', container);
      btn.disabled = true;
      btn.innerHTML = `${icon('spinner', 'fa-spin')} Collecting…`;
      try {
        const data = await API.getAll();
        const backup = {
          app: 'AluBhaiOS',
          version: CONFIG.VERSION,
          exported_at: Utils.nowISO(),
          tables: data
        };
        delete backup.tables.settingsRows;
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'alubhaios-backup-' + Utils.today() + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        const n = Object.keys(SB_TABLES).reduce((acc, k) => acc + ((data[k] || []).length || 0), 0);
        toast(`💾 Backup downloaded — ${n} records across ${Object.keys(SB_TABLES).length} tables.`, 'success');
      } catch (e) { App.handleError(e); }
      btn.disabled = false;
      btn.innerHTML = `${icon('download')} Download backup`;
    });
    qs('#restore-open', container).addEventListener('click', () => qs('#restore-file', container).click());
    qs('#restore-file', container).addEventListener('change', e => this.restoreFromFile(e.target.files[0]));

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
  },

  /** 💾 Restore a backup JSON: upserts every record by id (existing rows
      update, new rows insert — nothing is deleted). Guarded by typed GO. */
  async restoreFromFile(file) {
    if (!file) return;
    let backup;
    try { backup = JSON.parse(await file.text()); }
    catch (e) { return toast('Not a valid JSON file — restore cancelled.', 'error'); }
    if (!backup || backup.app !== 'AluBhaiOS' || typeof backup.tables !== 'object') {
      return toast('This file is not an AluBhaiOS backup — restore cancelled.', 'error');
    }
    const counts = {};
    let total = 0;
    Object.keys(SB_TABLES).forEach(k => { counts[k] = (backup.tables[k] || []).length; total += counts[k]; });
    const ok = await typeConfirm({
      title: 'Restore backup?',
      warning: `Records will be written into your live database.`,
      message: `Backup from <b>${Utils.esc(String(backup.exported_at || 'unknown').slice(0, 10))}</b> contains <b>${total} records</b>: ` +
        Object.keys(counts).filter(k => counts[k]).map(k => `${counts[k]} ${k}`).join(', ') +
        '.<br><br>Existing rows with the same id are <b>overwritten</b>; nothing is deleted. App version: ' + Utils.esc(backup.version || '?'),
      confirmText: 'Restore now',
      keyword: 'RESTORE'
    });
    if (!ok) return;
    toast('Restoring… this can take a minute.', 'info');
    // one bulk upsert per table (was one request per row — a 2000-record
    // backup used to fire 2000 POSTs)
    let done = 0, failed = 0;
    for (const key of Object.keys(SB_TABLES)) {
      const rows = backup.tables[key] || [];
      if (!rows.length) continue;
      try {
        await API.upsertMany(SB_TABLES[key], rows.map(row => Object.assign({}, row)));
        done += rows.length;
      } catch (e) { failed += rows.length; }
    }
    if (failed) toast(`⚠ Restored ${done}/${total} — ${failed} failed (check connection).`, 'warn');
    else toast(`✅ Restore complete — ${done} records written. Reloading…`, 'success');
    setTimeout(() => App.reload(), 1200);
  }
};
