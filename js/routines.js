/* ============================================================
   AluBhaiOS — Legacy routines (read-only reference)
   Pure schedule/stat/form helpers are retained for archives/tests.
   WeeklyPlanner replaces the page; recurring writes are retired.
   ============================================================ */
'use strict';

const Routines = {
  dayTab: 'All',

  /** stable link between a routine and its generated tasks */
  marker(routineId) { return 'routine:' + routineId; },

  /** does this routine cover the given weekday short name (Mon…Sun)? */
  coversDay(r, wd) {
    const days = String(r.days || 'Every day');
    if (days === 'Every day') return true;
    return days.split(',').map(s => s.trim()).includes(wd);
  },

  /** creation ledger: { routineId: { 'YYYY-MM-DD': true } } (Settings JSON) */
  log() {
    try { return JSON.parse(App.settings.routine_task_log || '{}'); } catch (e) { return {}; }
  },

  /** per-routine "auto day task" flags live in Settings JSON (the routines
      table has no auto_task column — sending one → PGRST204). */
  autoFlags() {
    try { return JSON.parse(App.settings.routine_auto_task || '{}'); } catch (e) { return {}; }
  },
  isAuto(r) { return this.autoFlags()[r.id] === true; },
  legacyReadOnly() {
    toast('Previous routines are read-only. Use Weekly Planner instead.', 'info');
    return false;
  },
  async setAuto() { return this.legacyReadOnly(); },

  /** 📊 30-day consistency for an auto routine: completion % over its
      scheduled days + the most-missed weekday. Pure (testable). */
  routineStats(r, days = 30) {
    const marker = this.marker(r.id);
    let scheduled = 0, completed = 0;
    const missByWd = {};
    for (let i = 0; i < days; i++) {
      const date = Utils.addDays(Utils.today(), -i);
      if (!this.coversDay(r, Utils.weekdayShort(date))) continue;
      scheduled++;
      const t = (App.state.tasks || []).find(x => !x._archived && x.project_id === marker &&
        String(x.scheduled_date || '').slice(0, 10) === date);
      if (t && t.status === 'completed') completed++;
      else if (date < Utils.today()) {
        const wd = Utils.weekdayShort(date);
        missByWd[wd] = (missByWd[wd] || 0) + 1;
      }
    }
    const pct = scheduled ? Math.round(completed / scheduled * 100) : null;
    let mostMissed = null, mx = 0;
    Object.keys(missByWd).forEach(w => { if (missByWd[w] > mx) { mx = missByWd[w]; mostMissed = w; } });
    return { scheduled, completed, pct, mostMissed, missedCount: mx };
  },

  /** 🔥 current streak: consecutive completed scheduled days walking back
      from today. Today completed counts; today pending/missing = grace. */
  routineStreak(r) {
    const marker = this.marker(r.id);
    const doneOn = date => (App.state.tasks || []).some(x => !x._archived && x.project_id === marker &&
      String(x.scheduled_date || '').slice(0, 10) === date && x.status === 'completed');
    let streak = 0, cursor = Utils.today(), guard = 0;
    if (this.coversDay(r, Utils.weekdayShort(cursor)) && doneOn(cursor)) streak++;
    while (guard++ < 400) {
      cursor = Utils.addDays(cursor, -1);
      if (!this.coversDay(r, Utils.weekdayShort(cursor))) continue;
      if (doneOn(cursor)) { streak++; continue; }
      break;
    }
    return streak;
  },

  /** 🏆 best streak: longest run of consecutive completed scheduled days
      in the routine's whole history (from its marker tasks). */
  routineBestStreak(r) {
    const marker = this.marker(r.id);
    const done = new Set((App.state.tasks || []).filter(x => x.project_id === marker && x.status === 'completed')
      .map(x => String(x.scheduled_date || '').slice(0, 10)).filter(Boolean));
    if (!done.size) return 0;
    let best = 0, run = 0, cursor = [...done].sort()[0];
    const today = Utils.today();
    let guard = 0;
    while (cursor <= today && guard++ < 800) {
      if (this.coversDay(r, Utils.weekdayShort(cursor))) {
        if (done.has(cursor)) { run++; best = Math.max(best, run); }
        else run = 0;
      }
      cursor = Utils.addDays(cursor, 1);
    }
    return best;
  },

  /** Legacy entry point retained for compatibility; never creates tasks. */
  async ensureTodayTasks() {},

  /** this week's INTERACTIVE dot strip (Mon→Sun): progress trail behind,
      pulsing today, ✓ pops, and every scheduled dot is clickable —
      click a day without a task to create it (today or backfill a miss). */
  weekStrip(r) {
    const today = Utils.today();
    const ws = Utils.startOfWeek(today);
    const log = this.log()[r.id] || {};
    const cells = [];
    let scheduled = 0, done = 0;
    for (let i = 0; i < 7; i++) {
      const date = Utils.addDays(ws, i);
      const wd = Utils.weekdayShort(date);
      const isDay = this.coversDay(r, wd);
      const isToday = date === today;
      let cls = 'rt-dot' + (isToday ? ' today' : '');
      let tip = wd + ' ' + date.slice(5);
      let label = wd.slice(0, 2);
      if (!isDay) { cls += ' off'; tip += ' — not scheduled'; }
      else {
        const t = (App.state.tasks || []).find(x => !x._archived &&
          x.project_id === this.marker(r.id) && String(x.scheduled_date || '').slice(0, 10) === date);
        if (t && t.status === 'completed') { cls += ' done'; label = '✓'; tip += ' — done ✓ (tap to view)'; scheduled++; done++; }
        else if (t && date < today) { cls += ' miss'; tip += ' — missed (tap to backfill)'; scheduled++; }
        else if (t) { cls += ' pend'; tip += ' — task pending (tap to view)'; scheduled++; if (date <= today) done++; }
        else if (log[date]) { cls += ' off'; tip += ' — task removed'; }
        else if (date > today) { cls += ' future'; tip += ' — upcoming (task arrives on its day)'; }
        else { cls += ' open'; tip += ' — tap to create the task now'; scheduled++; }
      }
      cells.push(`<button type="button" class="${cls}" data-routine-action="day" data-rt-date="${date}" title="${Utils.esc(tip)}">${label}</button>`);
    }
    const pct = scheduled ? Math.round(done / scheduled * 100) : 0;
    const cur = this.routineStreak(r), best = this.routineBestStreak(r);
    const streakTxt = (cur > 0 || best > 0) ? ` · 🔥 ${cur}d streak (best ${best}d)` : '';
    const st30 = this.routineStats(r, 30);
    const statsTxt = st30.pct !== null ? ` · 📊 30d: ${st30.pct}% done${st30.mostMissed ? ` · most missed: ${st30.mostMissed}` : ''}` : '';
    return `
      <div class="rt-week" title="This week — tap a day dot">
        <div class="rt-track-wrap"><div class="rt-track" style="width:${pct}%"></div></div>
        ${cells.join('')}
      </div>
      <div class="rt-week-meta muted small">${done}/${scheduled} scheduled days done this week${pct === 100 && scheduled ? ' — 🏆 perfect!' : ''}${streakTxt}${statsTxt}</div>`;
  },

  /** Legacy day dots never create or backfill tasks. */
  async dayDotClick() { return this.legacyReadOnly(); },

  page(container) { return WeeklyPlanner.page(container); },

  renderList() {
    const list = qs('#routine-list', App.container());
    if (!list) return;
    let items = (App.state.routines || []).slice();
    if (this.dayTab === 'Every day') items = items.filter(r => String(r.days || '') === 'Every day');
    else if (this.dayTab !== 'All') items = items.filter(r => String(r.days || '').split(',').map(s => s.trim()).includes(this.dayTab));
    items.sort((a, b) => String(a.target_time || '99:99').localeCompare(String(b.target_time || '99:99')));

    if (!items.length) {
      list.innerHTML = '';
      const any = (App.state.routines || []).length > 0;
      list.appendChild(el(any
        ? emptyState('calendar-xmark', `Nothing scheduled for "${this.dayTab}"`, 'Try another day, or create a routine for it.')
        : emptyState('clock', 'No routines yet',
            'Build your ideal day: wake up, deep work, learning, review…',
            `<button class="btn btn-primary" data-act="new">${icon('plus')} Create routine</button>`)));
      return;
    }

    list.innerHTML = items.map((r, idx) => {
      const auto = this.isAuto(r);
      return `
      <div class="card routine-card ${r.enabled === false ? 'is-disabled' : ''}" data-id="${r.id}" style="--rt-i:${idx}">
        <div class="routine-time-big">${Utils.esc(r.target_time || '--:--')}</div>
        <div class="task-main">
          <div class="task-title">${Utils.esc(r.title)}</div>
          <div class="task-meta">
            ${r.category ? chip(r.category, Utils.categoryColor(r.category)) : ''}
            ${r.duration_minutes ? chip(Utils.fmtMinutes(r.duration_minutes), '#64748b') : ''}
            ${chip(String(r.days || 'Every day'), '#8b5cf6')}
            ${auto ? chip('🤖 Auto day task', '#10b981') : ''}
            ${(() => { const s = this.routineStreak(r); return s > 0 ? chip('🔥 ' + s + 'd streak', '#f97316') : ''; })()}
          </div>
          ${r.description ? `<div class="muted small">${Utils.esc(r.description)}</div>` : ''}
          ${auto ? this.weekStrip(r) : ''}
        </div>
        <div class="task-actions">
          <label class="switch" title="Enable / disable">
            <input type="checkbox" data-routine-action="toggle" ${r.enabled !== false ? 'checked' : ''}><span></span>
          </label>
          ${auto ? `<button class="btn btn-icon btn-ghost" data-routine-action="tasks" title="See this routine's auto tasks">${icon('calendar-check')}</button>` : ''}
          <button class="btn btn-icon btn-ghost" data-routine-action="edit" title="Edit">${icon('pencil')}</button>
          <button class="btn btn-icon btn-ghost danger" data-routine-action="delete" title="Delete">${icon('trash')}</button>
        </div>
      </div>`;
    }).join('');
  },

  async toggleEnabled() { return this.legacyReadOnly(); },
  async remove() { return this.legacyReadOnly(); },
  openForm() { return this.legacyReadOnly(); },

  /** Original form markup retained as a pure archival helper; no bindings. */
  formHtml(existing) {
    const r = existing || {};
    const days = String(r.days || 'Every day');
    const selected = days === 'Every day' ? WEEKDAYS.slice() : days.split(',').map(s => s.trim()).filter(Boolean);
    const every = days === 'Every day' || selected.length === 7;
    return `
        <form id="routine-form">
          <label class="field"><span>Title *</span>
            <input name="title" required maxlength="200" value="${Utils.esc(r.title || '')}" placeholder="e.g. Deep Work"></label>
          <div class="field-row">
            <label class="field"><span>Start time</span>
              <input type="time" name="target_time" value="${Utils.esc(r.target_time || '08:00')}"></label>
            <label class="field"><span>Duration (minutes)</span>
              <input type="number" min="0" step="5" name="duration_minutes" value="${Utils.esc(r.duration_minutes || '')}" placeholder="e.g. 90"></label>
          </div>
          <label class="field"><span>Category</span>
            <select name="category">${CONFIG.CATEGORIES.map(c => `<option ${r.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
          <label class="field"><span>Description</span>
            <textarea name="description" rows="2">${Utils.esc(r.description || '')}</textarea></label>
          <label class="check-inline" style="margin:4px 0 10px">
            <input type="checkbox" name="auto_task" ${this.isAuto(r) ? 'checked' : ''}>
            🤖 Auto day task — a task is created automatically on each scheduled day
          </label>
          <div class="field">
            <span>Days</span>
            <label class="check-inline"><input type="checkbox" id="day-every" ${every ? 'checked' : ''}> Every day</label>
            <div class="day-picker" id="day-picker">
              ${WEEKDAYS.map(d => `<label class="day-pill ${selected.includes(d) ? 'on' : ''}">
                <input type="checkbox" name="days" value="${d}" ${selected.includes(d) ? 'checked' : ''}>${d}</label>`).join('')}
            </div>
          </div>
        </form>`;
  }
};
