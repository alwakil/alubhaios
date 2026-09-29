/* ============================================================
   PersonalOS — Focus timer
   Start / pause / resume / stop. The timer survives page reloads
   (state is persisted in localStorage with real timestamps, so a
   refresh never loses your running session).
   ============================================================ */
'use strict';

const Focus = {
  presetTask: null,   // set by Tasks when clicking "play" on a task
  timer: null,        // {running, startedAt, accumulatedMs, firstStart, mode, category, taskId}
  _interval: null,

  init() {
    this.timer = Utils.pref('focusTimer', null);
    this._interval = setInterval(() => this.tick(), 1000);
  },

  save() { Utils.pref('focusTimer', this.timer); },

  isActive() { return !!this.timer && (this.timer.running || this.timer.accumulatedMs > 0); },

  elapsedSec() {
    if (!this.timer) return 0;
    const t = this.timer;
    const ms = t.accumulatedMs + (t.running && t.startedAt ? Date.now() - t.startedAt : 0);
    return Math.floor(ms / 1000);
  },

  epochISO(ms) {
    const d = new Date(ms);
    return `${Utils.dateStr(d)}T${Utils.pad(d.getHours())}:${Utils.pad(d.getMinutes())}:${Utils.pad(d.getSeconds())}`;
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

  tick() {
    // topbar chip (always)
    const chipEl = qs('#topbar-timer');
    if (chipEl) {
      if (this.isActive()) {
        chipEl.hidden = false;
        const t = this.timer;
        chipEl.innerHTML = `${icon(t.running ? 'circle-play' : 'circle-pause')} ${Utils.fmtClock(this.elapsedSec())}`;
        chipEl.classList.toggle('running', !!t.running);
      } else {
        chipEl.hidden = true;
      }
    }
    // focus page display
    if (App.current === 'focus' && this.isActive()) {
      const timeEl = qs('#focus-time');
      if (timeEl) {
        timeEl.textContent = Utils.fmtClock(this.elapsedSec());
        const mode = (CONFIG.FOCUS_MODES || []).find(m => m.name === this.timer.mode);
        const suggested = (mode && mode.suggested_minutes) || 45;
        const pctDone = Utils.clamp(this.elapsedSec() / (suggested * 60) * 100, 0, 100);
        const ring = qs('#focus-ring');
        if (ring) ring.style.background =
          `conic-gradient(var(--c-primary) ${pctDone}%, var(--chart-grid) 0)`;
      }
      const hint = qs('#focus-state-hint');
      if (hint) hint.textContent = this.timer.running ? 'Session running — stay with it.' : 'Paused.';
    }
  },

  /* ---------------- Page ---------------- */
  page(container) {
    const tasks = App.state.tasks || [];
    const today = Utils.today();
    const active = this.isActive();

    const modeOptions = (CONFIG.FOCUS_MODES || []).map(m =>
      `<option value="${Utils.esc(m.name)}">${Utils.esc(m.name)} · ~${m.suggested_minutes} min</option>`).join('');
    const categoryOptions = CONFIG.CATEGORIES.map(c => `<option>${c}</option>`).join('');
    const taskOptions = '<option value="">— no specific task —</option>' + tasks.map(t =>
      `<option value="${t.id}" ${today === t.scheduled_date ? 'data-today="1"' : ''}>${Utils.esc(t.title)}</option>`).join('');

    container.innerHTML = `
      <div class="page-head"><h2>Focus</h2></div>

      <div class="card focus-panel">
        ${active ? `
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
        `}
      </div>

      <div class="section-head"><h3>Today's sessions</h3></div>
      <div id="focus-sessions" class="stack"></div>
    `;

    if (active) {
      // draw the ring immediately
      const mode = (CONFIG.FOCUS_MODES || []).find(m => m.name === this.timer.mode);
      const suggested = (mode && mode.suggested_minutes) || 45;
      const pctDone = Utils.clamp(this.elapsedSec() / (suggested * 60) * 100, 0, 100);
      const ring = qs('#focus-ring', container);
      if (ring) ring.style.background = `conic-gradient(var(--c-primary) ${pctDone}%, var(--chart-grid) 0)`;
    } else {
      const sel = qs('#focus-task', container);
      if (sel) {
        if (this.presetTask) sel.value = this.presetTask;
        else {
          const firstToday = qsa('option[data-today]', sel)[0];
          if (firstToday) sel.value = firstToday.value;
        }
      }
      this.presetTask = null;
    }

    container.onclick = e => {
      const btn = e.target.closest('[data-focus]');
      if (!btn) return this.handleSessionAction(e);
      const act = btn.dataset.focus;
      if (act === 'start') this.start(qs('#focus-mode', container).value, qs('#focus-category', container).value, qs('#focus-task', container).value);
      if (act === 'pause') this.pause();
      if (act === 'resume') this.resume();
      if (act === 'stop') this.stop();
      if (act === 'discard') this.discard();
    };

    this.renderSessions();
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
            <div class="task-title">${Utils.esc(task ? task.title : 'Unassigned session')}</div>
            <div class="task-meta">
              ${chip(String(s.start_time).slice(11, 16) + ' – ' + String(s.end_time).slice(11, 16), '#64748b')}
              ${chip(Utils.fmtMinutes(s.duration_minutes), '#6366f1')}
              ${chip(s.category || 'Other', Utils.categoryColor(s.category))}
              <span class="stars">${Utils.stars(s.focus_rating)}</span>
              ${Utils.num(s.interruptions) ? chip(s.interruptions + ' interruptions', '#ef4444') : ''}
            </div>
            ${s.notes ? `<div class="muted small">${Utils.esc(s.notes)}</div>` : ''}
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

  /* ---------------- Save dialog ---------------- */
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
