/* ============================================================
   PersonalOS — Focus timer
   Two modes:
   • Stopwatch — free-running session, start / pause / resume / stop
   • Pomodoro  — focus → break cycles with countdown, notifications,
                 sound, and auto-saved sessions ([pomo] tagged)
   Both survive page reloads (state is persisted with real timestamps).
   ============================================================ */
'use strict';

const Focus = {
  presetTask: null,   // set by Tasks when clicking "play" on a task
  view: 'stopwatch',  // 'stopwatch' | 'pomodoro'
  timer: null,        // stopwatch: {running, startedAt, accumulatedMs, firstStart, mode, category, taskId}
  pomo: null,         // pomodoro: {phase, running, endsAt, remainingMs, focusMin, breakMin, taskId, category}
  _interval: null,

  init() {
    this.timer = Utils.pref('focusTimer', null);
    this.pomo = Utils.pref('focusPomo', null);
    this.recoverPomo();
    this._interval = setInterval(() => this.tick(), 1000);
  },

  save() { Utils.pref('focusTimer', this.timer); },
  savePomo() { Utils.pref('focusPomo', this.pomo); },

  /* ================= shared helpers ================= */

  epochISO(ms) {
    const d = new Date(ms);
    return `${Utils.dateStr(d)}T${Utils.pad(d.getHours())}:${Utils.pad(d.getMinutes())}:${Utils.pad(d.getSeconds())}`;
  },

  isActive() {
    if (this.view === 'pomodoro') return !!this.pomo;
    return !!this.timer && (this.timer.running || this.timer.accumulatedMs > 0);
  },

  pomoRemainingMs() {
    if (!this.pomo) return 0;
    const t = this.pomo;
    return t.running ? Math.max(0, t.endsAt - Date.now()) : (t.remainingMs || 0);
  },

  pomoPhaseTotalMs() {
    const t = this.pomo;
    if (!t) return 1;
    return (t.phase === 'focus' ? t.focusMin : t.breakMin) * 60000;
  },

  /** If the app was closed while a pomodoro ran out, settle it once on load. */
  recoverPomo() {
    const t = this.pomo;
    if (!t || !t.running || t.endsAt > Date.now()) return;
    const over = Date.now() - t.endsAt;
    if (t.phase === 'focus') {
      this.logSession(t.focusMin, 'auto (while away)');
      this.advancePhase(true);
    }
    // if the break also expired long ago, restart a fresh focus block
    if (t.phase === 'break' && over > t.breakMin * 60000 * 2) {
      t.phase = 'focus';
      t.endsAt = Date.now() + t.focusMin * 60000;
      t.remainingMs = 0;
    }
    this.savePomo();
  },

  /* ================= stopwatch ================= */

  elapsedSec() {
    if (!this.timer) return 0;
    const t = this.timer;
    const ms = t.accumulatedMs + (t.running && t.startedAt ? Date.now() - t.startedAt : 0);
    return Math.floor(ms / 1000);
  },

  start(mode, category, taskId) {
    const now = Date.now();
    this.timer = {
      running: true, startedAt: now, accumulatedMs: 0, firstStart: now,
      mode: mode || 'Deep Work', category: category || 'Learning', taskId: taskId || ''
    };
    this.save();
    toast('Focus session started — good luck!', 'success');
    App.refreshCurrent();
  },

  pause() {
    const t = this.timer;
    if (!t || !t.running) return;
    t.accumulatedMs += Date.now() - t.startedAt;
    t.running = false; t.startedAt = null;
    this.save();
    App.refreshCurrent();
  },

  resume() {
    const t = this.timer;
    if (!t || t.running) return;
    t.startedAt = Date.now();
    t.running = true;
    this.save();
    App.refreshCurrent();
  },

  stop() { if (this.timer) this.openSaveModal(); },

  async discard() {
    const ok = await confirmDialog({
      title: 'Discard session?',
      message: 'The running focus session will be discarded. Nothing will be saved.',
      confirmText: 'Discard'
    });
    if (!ok) return;
    this.timer = null; this.save();
    App.refreshCurrent();
    toast('Session discarded', 'info');
  },

  /* ================= pomodoro ================= */

  startPomo(focusMin, breakMin, taskId, category) {
    const now = Date.now();
    this.pomo = {
      phase: 'focus', running: true,
      endsAt: now + focusMin * 60000, remainingMs: 0,
      focusMin: Utils.clamp(focusMin, 1, 180), breakMin: Utils.clamp(breakMin, 1, 60),
      taskId: taskId || '', category: category || 'Learning'
    };
    this.savePomo();
    askNotifyPermission(); // gentle: ask once when they start using pomodoros
    toast(`🍅 Pomodoro started — ${focusMin} min focus.`, 'success');
    App.refreshCurrent();
  },

  pomoPause() {
    const t = this.pomo;
    if (!t || !t.running) return;
    t.remainingMs = Math.max(0, t.endsAt - Date.now());
    t.running = false;
    this.savePomo();
    App.refreshCurrent();
  },

  pomoResume() {
    const t = this.pomo;
    if (!t || t.running) return;
    t.endsAt = Date.now() + (t.remainingMs || 0);
    t.running = true;
    this.savePomo();
    App.refreshCurrent();
  },

  advancePhase(silent) {
    const t = this.pomo;
    if (!t) return;
    if (t.phase === 'focus') {
      t.phase = 'break';
      t.endsAt = Date.now() + t.breakMin * 60000;
      t.remainingMs = 0;
      if (!silent) {
        beep(2);
        notify('🍅 Pomodoro done!', `Great work — take a ${t.breakMin} min break.`);
        toast('🍅 Pomodoro complete! Break time.', 'success');
      }
    } else {
      t.phase = 'focus';
      t.endsAt = Date.now() + t.focusMin * 60000;
      t.remainingMs = 0;
      if (!silent) {
        beep(1);
        notify('☕ Break over', `Next ${t.focusMin} min focus block starts now.`);
        toast('☕ Break finished — back to focus!', 'info');
      }
    }
    this.savePomo();
  },

  pomoStop() {
    const t = this.pomo;
    if (!t) return;
    if (t.phase === 'focus') {
      const min = Math.max(1, Math.round((this.pomoPhaseTotalMs() - this.pomoRemainingMs()) / 60000));
      this.logAndReset(min);
    } else {
      this.pomo = null; this.savePomo();
      App.refreshCurrent();
      toast('Pomodoro stopped.', 'info');
    }
  },

  /** Save a pomodoro focus block and clear the cycle. */
  logAndReset(minutes) {
    const t = this.pomo;
    const data = {
      task_id: t ? t.taskId : '',
      category: t ? t.category : 'Learning',
      start_time: this.epochISO(Date.now() - minutes * 60000),
      end_time: Utils.nowISO(),
      duration_minutes: minutes,
      focus_rating: '',
      interruptions: 0,
      notes: '[pomodoro]'
    };
    API.createFocusSession(data)
      .then(rec => {
        this.pomo = null; this.savePomo();
        App.replaceRecord('focusSessions', rec);
        App.refreshCurrent();
        toast(`🍅 Focus block saved (${Utils.fmtMinutes(minutes)}).`, 'success');
      })
      .catch(e => App.handleError(e));
  },

  /** Fire-and-forget session log used when phases roll over automatically. */
  logSession(minutes, noteSuffix) {
    const t = this.pomo;
    const data = {
      task_id: t ? t.taskId : '',
      category: t ? t.category : 'Learning',
      start_time: this.epochISO(Date.now() - minutes * 60000),
      end_time: Utils.nowISO(),
      duration_minutes: minutes,
      focus_rating: '',
      interruptions: 0,
      notes: '[pomodoro]' + (noteSuffix ? ' ' + noteSuffix : '')
    };
    API.createFocusSession(data)
      .then(rec => { App.replaceRecord('focusSessions', rec); toast(`🍅 ${Utils.fmtMinutes(minutes)} focus block saved.`, 'success'); })
      .catch(e => App.handleError(e));
  },

  /* ================= ticker ================= */

  tick() {
    // pomodoro phase rollover
    const p = this.pomo;
    if (p && p.running && p.endsAt <= Date.now()) {
      if (p.phase === 'focus') {
        this.logSession(p.focusMin, '');
        this.advancePhase(false);
      } else {
        this.advancePhase(false);
      }
    }

    // topbar chip (both modes)
    const chipEl = qs('#topbar-timer');
    if (chipEl) {
      if (this.view === 'pomodoro' && this.pomo) {
        const remain = Math.ceil(this.pomoRemainingMs() / 1000);
        chipEl.hidden = false;
        chipEl.innerHTML = `${icon(this.pomo.phase === 'focus' ? 'clock-rotate-left' : 'mug-hot')} ${Utils.fmtClock(remain)}`;
        chipEl.classList.toggle('running', !!this.pomo.running);
      } else if (this.timer && this.isActive()) {
        chipEl.hidden = false;
        chipEl.innerHTML = `${icon(this.timer.running ? 'circle-play' : 'circle-pause')} ${Utils.fmtClock(this.elapsedSec())}`;
        chipEl.classList.toggle('running', !!this.timer.running);
      } else {
        chipEl.hidden = true;
      }
    }

    // focus page live display
    if (App.current !== 'focus') return;
    if (this.view === 'pomodoro' && this.pomo) {
      const remain = this.pomoRemainingMs();
      const el = qs('#pomo-time');
      if (el) el.textContent = Utils.fmtClock(Math.ceil(remain / 1000));
      const ring = qs('#pomo-ring');
      if (ring) ring.style.background =
        `conic-gradient(${this.pomo.phase === 'focus' ? 'var(--c-primary)' : 'var(--c-success)'} ${(1 - remain / this.pomoPhaseTotalMs()) * 100}%, var(--chart-grid) 0)`;
      const hint = qs('#pomo-hint');
      if (hint) hint.textContent = this.pomo.running
        ? (this.pomo.phase === 'focus' ? 'Focus block running — stay with it. 🍅' : 'Break time — relax. ☕')
        : 'Paused.';
    } else if (this.timer && this.isActive()) {
      const timeEl = qs('#focus-time');
      if (timeEl) {
        timeEl.textContent = Utils.fmtClock(this.elapsedSec());
        const mode = (CONFIG.FOCUS_MODES || []).find(m => m.name === this.timer.mode);
        const suggested = (mode && mode.suggested_minutes) || 45;
        const pctDone = Utils.clamp(this.elapsedSec() / (suggested * 60) * 100, 0, 100);
        const ring = qs('#focus-ring');
        if (ring) ring.style.background = `conic-gradient(var(--c-primary) ${pctDone}%, var(--chart-grid) 0)`;
      }
      const hint = qs('#focus-state-hint');
      if (hint) hint.textContent = this.timer.running ? 'Session running — stay with it.' : 'Paused.';
    }
  },

  /* ================= page ================= */
  page(container) {
    const tasks = App.state.tasks || [];
    const today = Utils.today();

    const modeOptions = (CONFIG.FOCUS_MODES || []).map(m =>
      `<option value="${Utils.esc(m.name)}">${Utils.esc(m.name)} · ~${m.suggested_minutes} min</option>`).join('');
    const categoryOptions = CONFIG.CATEGORIES.map(c => `<option>${c}</option>`).join('');
    const taskOptions = '<option value="">— no specific task —</option>' + tasks.map(t =>
      `<option value="${t.id}" ${today === t.scheduled_date ? 'data-today="1"' : ''}>${Utils.esc(t.title)}</option>`).join('');

    container.innerHTML = `
      <div class="page-head"><h2>Focus</h2></div>

      <div class="tabs" id="focus-mode-tabs">
        <button class="tab ${this.view === 'stopwatch' ? 'active' : ''}" data-fmode="stopwatch">${icon('stopwatch')} Stopwatch</button>
        <button class="tab ${this.view === 'pomodoro' ? 'active' : ''}" data-fmode="pomodoro">${icon('clock-rotate-left')} Pomodoro</button>
      </div>

      <div class="card focus-panel" id="focus-panel"></div>

      <div class="section-head"><h3>Today's sessions</h3></div>
      <div id="focus-sessions" class="stack"></div>
    `;

    this.renderPanel();

    container.onclick = e => {
      const fmode = e.target.closest('[data-fmode]');
      if (fmode) { this.view = fmode.dataset.fmode; return this.page(container); }
      const pbtn = e.target.closest('[data-pomo]');
      if (pbtn) return this.pomoAction(pbtn.dataset.pomo, container);
      const btn = e.target.closest('[data-focus]');
      if (btn) {
        const act = btn.dataset.focus;
        if (act === 'start') this.start(qs('#focus-mode', container).value, qs('#focus-category', container).value, qs('#focus-task', container).value);
        if (act === 'pause') this.pause();
        if (act === 'resume') this.resume();
        if (act === 'stop') this.stop();
        if (act === 'discard') this.discard();
        return;
      }
      this.handleSessionAction(e);
    };

    this.renderSessions();
  },

  renderPanel() {
    const panel = qs('#focus-panel', App.container());
    if (!panel) return;
    const tasks = App.state.tasks || [];
    const today = Utils.today();
    const taskOptions = '<option value="">— no specific task —</option>' + tasks.map(t =>
      `<option value="${t.id}" ${today === t.scheduled_date ? 'data-today="1"' : ''}>${Utils.esc(t.title)}</option>`).join('');
    const categoryOptions = CONFIG.CATEGORIES.map(c => `<option>${c}</option>`).join('');
    const modeOptions = (CONFIG.FOCUS_MODES || []).map(m =>
      `<option value="${Utils.esc(m.name)}">${Utils.esc(m.name)} · ~${m.suggested_minutes} min</option>`).join('');

    if (this.view === 'pomodoro') {
      const t = this.pomo;
      const pomosToday = (App.state.focusSessions || [])
        .filter(s => String(s.start_time).slice(0, 10) === today && String(s.notes || "").includes("[pomodoro]")).length;

      if (t) {
        const remain = Math.ceil(this.pomoRemainingMs() / 1000);
        const total = this.pomoPhaseTotalMs();
        const pctDone = (1 - this.pomoRemainingMs() / total) * 100;
        panel.innerHTML = `
          <div class="pomo-phase ${t.phase}">
            ${t.phase === 'focus' ? icon('clock-rotate-left') + ' FOCUS' : icon('mug-hot') + ' BREAK'}
          </div>
          <div class="focus-ring-wrap">
            <div class="focus-ring" id="pomo-ring"><div class="focus-ring-inner">
              <div class="focus-time" id="pomo-time">${Utils.fmtClock(remain)}</div>
              <div class="muted small">${t.focusMin}m focus · ${t.breakMin}m break</div>
            </div></div>
          </div>
          <p class="muted" id="pomo-hint">${t.running ? (t.phase === 'focus' ? 'Focus block running — stay with it. 🍅' : 'Break time — relax. ☕') : 'Paused.'}</p>
          <div class="focus-controls">
            ${t.running
              ? `<button class="btn btn-lg" data-pomo="pause">${icon('pause')} Pause</button>`
              : `<button class="btn btn-primary btn-lg" data-pomo="resume">${icon('play')} Resume</button>`}
            <button class="btn btn-success btn-lg" data-pomo="stop">${icon('flag-checkered')} Stop</button>
          </div>
          <p class="muted small">${icon('fire')} ${pomosToday} pomodoro${pomosToday === 1 ? '' : 's'} completed today</p>
        `;
        const ring = qs('#pomo-ring', panel);
        if (ring) ring.style.background = `conic-gradient(${t.phase === 'focus' ? 'var(--c-primary)' : 'var(--c-success)'} ${pctDone}%, var(--chart-grid) 0)`;
      } else {
        panel.innerHTML = `
          <div class="focus-setup">
            <h3 class="card-title">${icon('clock-rotate-left')} Pomodoro cycles</h3>
            <div class="field-row">
              <label class="field"><span>Focus minutes</span>
                <input type="number" id="pomo-focus-min" min="5" max="180" step="5" value="${Utils.esc(Utils.pref('pomoFocusMin') || 25)}"></label>
              <label class="field"><span>Break minutes</span>
                <input type="number" id="pomo-break-min" min="1" max="60" step="1" value="${Utils.esc(Utils.pref('pomoBreakMin') || 5)}"></label>
            </div>
            <label class="field"><span>Category</span><select id="pomo-category">${categoryOptions}</select></label>
            <label class="field"><span>Task</span><select id="pomo-task">${taskOptions}</select></label>
            <div class="focus-controls">
              <button class="btn btn-primary btn-lg" data-pomo="start">${icon('play')} Start pomodoro</button>
            </div>
            <p class="muted small">🍅 25/5 is the classic rhythm. When a focus block ends you'll hear a beep,
            get a notification and the break starts automatically. Every block is saved as a focus session.</p>
          </div>
        `;
        const sel = qs('#pomo-task', panel);
        if (sel) {
          if (this.presetTask) sel.value = this.presetTask;
          else {
            const firstToday = qsa('option[data-today]', sel)[0];
            if (firstToday) sel.value = firstToday.value;
          }
        }
        this.presetTask = null;
      }
      return;
    }

    /* stopwatch panel */
    const active = this.isActive() && this.timer;
    panel.innerHTML = active ? `
      <div class="focus-ring-wrap">
        <div class="focus-ring" id="focus-ring"><div class="focus-ring-inner">
          <div class="focus-time" id="focus-time">${Utils.fmtClock(this.elapsedSec())}</div>
          <div class="muted small">${Utils.esc(this.timer.mode)} · ${Utils.esc(this.timer.category)}</div>
        </div></div>
      </div>
      <p class="muted" id="focus-state-hint">${this.timer.running ? 'Session running — stay with it.' : 'Paused.'}</p>
      <div class="focus-controls">
        ${this.timer.running
          ? `<button class="btn btn-lg" data-focus="pause">${icon('pause')} Pause</button>`
          : `<button class="btn btn-primary btn-lg" data-focus="resume">${icon('play')} Resume</button>`}
        <button class="btn btn-success btn-lg" data-focus="stop">${icon('flag-checkered')} Stop & save</button>
        <button class="btn btn-ghost" data-focus="discard">${icon('trash')} Discard</button>
      </div>
    ` : `
      <div class="focus-setup">
        <h3 class="card-title">${icon('stopwatch')} Start a focus session</h3>
        <div class="field-row">
          <label class="field"><span>Mode</span><select id="focus-mode">${modeOptions}</select></label>
          <label class="field"><span>Category</span><select id="focus-category">${categoryOptions}</select></label>
        </div>
        <label class="field"><span>Task</span><select id="focus-task">${taskOptions}</select></label>
        <div class="focus-controls">
          <button class="btn btn-primary btn-lg" data-focus="start">${icon('play')} Start</button>
        </div>
        <p class="muted small">Tip: sessions categorized as <b>Entertainment</b> or <b>Distraction</b> count as distraction time, not focus time.</p>
      </div>
    `;
    if (!active) {
      const sel = qs('#focus-task', panel);
      if (sel) {
        if (this.presetTask) sel.value = this.presetTask;
        else {
          const firstToday = qsa('option[data-today]', sel)[0];
          if (firstToday) sel.value = firstToday.value;
        }
      }
      this.presetTask = null;
    } else {
      const mode = (CONFIG.FOCUS_MODES || []).find(m => m.name === this.timer.mode);
      const suggested = (mode && mode.suggested_minutes) || 45;
      const pctDone = Utils.clamp(this.elapsedSec() / (suggested * 60) * 100, 0, 100);
      const ring = qs('#focus-ring', panel);
      if (ring) ring.style.background = `conic-gradient(var(--c-primary) ${pctDone}%, var(--chart-grid) 0)`;
    }
  },

  pomoAction(act, container) {
    if (act === 'start') {
      Utils.pref('pomoFocusMin', Utils.clamp(Utils.num(qs('#pomo-focus-min', container).value) || 25, 5, 180));
      Utils.pref('pomoBreakMin', Utils.clamp(Utils.num(qs('#pomo-break-min', container).value) || 5, 1, 60));
      this.startPomo(
        Utils.num(qs('#pomo-focus-min', container).value) || 25,
        Utils.num(qs('#pomo-break-min', container).value) || 5,
        qs('#pomo-task', container).value,
        qs('#pomo-category', container).value
      );
    }
    if (act === 'pause') this.pomoPause();
    if (act === 'resume') this.pomoResume();
    if (act === 'stop') this.pomoStop();
  },

  renderSessions() {
    const wrap = qs('#focus-sessions', App.container());
    if (!wrap) return;
    const today = Utils.today();
    const sessions = (App.state.focusSessions || [])
      .filter(s => String(s.start_time).slice(0, 10) === today)
      .sort((a, b) => String(b.start_time).localeCompare(String(a.start_time)));

    if (!sessions.length) {
      wrap.innerHTML = '';
      wrap.appendChild(el(emptyState('stopwatch', 'No sessions today',
        'Start the timer above — every logged session makes your analytics smarter.')));
      return;
    }
    const focusMin = sessions.filter(s => !Utils.isDistraction(s.category)).reduce((a, s) => a + Utils.num(s.duration_minutes), 0);
    const distrMin = sessions.filter(s => Utils.isDistraction(s.category)).reduce((a, s) => a + Utils.num(s.duration_minutes), 0);
    wrap.innerHTML = `
      <div class="card focus-totals">
        <span>${icon('stopwatch')} Focus: <b>${Utils.fmtMinutes(focusMin)}</b></span>
        <span>${icon('phone-flip')} Distraction: <b>${Utils.fmtMinutes(distrMin)}</b></span>
        <span>${icon('list')} Sessions: <b>${sessions.length}</b></span>
      </div>
      ${sessions.map(s => {
        const task = (App.state.tasks || []).find(t => t.id === s.task_id);
        return `
        <div class="card session-card" data-id="${s.id}">
          <div class="task-main">
            <div class="task-title">${Utils.esc(task ? task.title : 'Unassigned session')}${String(s.notes || "").includes("[pomodoro]") ? ' 🍅' : ''}</div>
            <div class="task-meta">
              ${chip(String(s.start_time).slice(11, 16) + ' – ' + String(s.end_time).slice(11, 16), '#64748b')}
              ${chip(Utils.fmtMinutes(s.duration_minutes), '#6366f1')}
              ${chip(s.category || 'Other', Utils.categoryColor(s.category))}
              <span class="stars">${Utils.stars(s.focus_rating)}</span>
              ${Utils.num(s.interruptions) ? chip(s.interruptions + ' interruptions', '#ef4444') : ''}
            </div>
            ${s.notes ? `<div class="muted small">${Utils.esc(String(s.notes).replace(/\[pomo\]/i, '').trim())}</div>` : ''}
          </div>
          <div class="task-actions">
            <button class="btn btn-icon btn-ghost danger" data-session-action="delete" title="Delete session">${icon('trash')}</button>
          </div>
        </div>`;
      }).join('')}`;
  },

  handleSessionAction(e) {
    const btn = e.target.closest('[data-session-action]');
    if (!btn || btn.dataset.sessionAction !== 'delete') return;
    const id = btn.closest('[data-id]').dataset.id;
    confirmDialog({ title: 'Delete focus session?', message: 'This session record will be permanently deleted.' })
      .then(ok => {
        if (!ok) return;
        API.deleteFocusSession(id)
          .then(() => {
            App.state.focusSessions = App.state.focusSessions.filter(x => x.id !== id);
            App.refreshCurrent();
            toast('Session deleted', 'success');
          })
          .catch(e2 => App.handleError(e2));
      });
  },

  /* ---------------- save dialog (stopwatch) ---------------- */
  openSaveModal() {
    const t = this.timer;
    const minutes = Math.max(1, Math.round(this.elapsedSec() / 60));
    const tasks = App.state.tasks || [];
    const m = openModal({
      title: 'Session finished — save it',
      sticky: true,
      body: `
        <form id="focus-save-form">
          <div class="rating-block">
            <span>How focused were you?</span>
            <div class="rating-row" id="focus-rating">
              ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="rate-btn" data-rate="${n}">${n}</button>`).join('')}
            </div>
          </div>
          <label class="field"><span>Task</span>
            <select name="task_id">
              <option value="">— no specific task —</option>
              ${tasks.map(x => `<option value="${x.id}" ${t.taskId === x.id ? 'selected' : ''}>${Utils.esc(x.title)}</option>`).join('')}
            </select></label>
          <div class="field-row">
            <label class="field"><span>Category</span>
              <select name="category">${CONFIG.CATEGORIES.map(c => `<option ${t.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
            <label class="field"><span>Duration (minutes)</span>
              <input type="number" min="1" name="duration_minutes" value="${minutes}"></label>
          </div>
          <div class="field-row">
            <label class="field"><span>Interruptions</span>
              <input type="number" min="0" name="interruptions" value="0"></label>
            <label class="field"><span>Mode</span>
              <input type="text" name="mode" value="${Utils.esc(t.mode)}" readonly></label>
          </div>
          <label class="field"><span>Notes</span>
            <textarea name="notes" rows="2" placeholder="What did you get done?"></textarea></label>
          <input type="hidden" name="focus_rating" id="focus-rating-value" value="0">
        </form>`,
      footer: `
        <button class="btn btn-ghost" data-cancel>Cancel</button>
        <button class="btn btn-ghost danger" data-discard>Discard session</button>
        <button class="btn btn-primary" data-save>${icon('check')} Save session</button>`
    });

    let rating = 0;
    qsa('.rate-btn', m.overlay).forEach(b => b.addEventListener('click', () => {
      rating = Number(b.dataset.rate);
      qs('#focus-rating-value', m.overlay).value = rating;
      qsa('.rate-btn', m.overlay).forEach(x => x.classList.toggle('selected', Number(x.dataset.rate) <= rating));
    }));

    qs('[data-cancel]', m.overlay).addEventListener('click', () => { m.close(); App.refreshCurrent(); });
    qs('[data-discard]', m.overlay).addEventListener('click', () => { m.close(); this.discard(); });
    qs('[data-save]', m.overlay).addEventListener('click', () => {
      const form = qs('#focus-save-form', m.overlay);
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const data = {
        task_id: fd.get('task_id'),
        category: fd.get('category'),
        start_time: this.epochISO(t.firstStart),
        end_time: Utils.nowISO(),
        duration_minutes: Utils.num(fd.get('duration_minutes')),
        focus_rating: rating || '',
        interruptions: Utils.num(fd.get('interruptions')),
        notes: fd.get('notes')
      };
      API.createFocusSession(data)
        .then(rec => {
          this.timer = null; this.save();
          App.replaceRecord('focusSessions', rec);
          m.close();
          App.refreshCurrent();
          toast('Focus session saved 💪', 'success');
        })
        .catch(e => App.handleError(e));
    });
  }
};
