/* ============================================================
   AluBhaiOS — Routines (recurring schedules + auto day tasks)
   A routine with "auto day task" ON creates a real task on each
   scheduled day (once per routine per date — ledger in Settings).
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
  async setAuto(routineId, on) {
    const flags = this.autoFlags();
    if (on) flags[routineId] = true; else delete flags[routineId];
    App.settings.routine_auto_task = JSON.stringify(flags);
    try {
      await API.saveSettings({ routine_auto_task: App.settings.routine_auto_task });
      return true;
    } catch (e) { App.handleError(e); return false; }
  },

  /** boot job — create today's auto day tasks (idempotent, never backfills past days). */
  async ensureTodayTasks() {
    if (!App.online) return;
    const today = Utils.today();
    const wd = Utils.weekdayShort(today);
    const log = this.log();
    const created = [];
    let dirty = false;

    for (const r of (App.state.routines || [])) {
      if (r.enabled === false) continue;
      if (!this.isAuto(r)) continue;
      if (!this.coversDay(r, wd)) continue;

      log[r.id] = log[r.id] || {};
      if (log[r.id][today]) continue; // already handled this date — never duplicate
      log[r.id][today] = true;
      dirty = true;

      // skip if a task for it already exists (e.g. made manually earlier today)
      const exists = (App.state.tasks || []).some(t => !t._archived &&
        t.project_id === this.marker(r.id) && String(t.scheduled_date || '').slice(0, 10) === today);
      if (exists) continue;

      try {
        const rec = await API.createTask({
          title: r.title,
          description: '⏰ Auto from routine' + (r.target_time ? ' · ' + r.target_time : ''),
          category: r.category || 'Other',
          priority: 'medium',
          scheduled_date: today,
          estimated_minutes: Utils.num(r.duration_minutes) || '',
          project_id: this.marker(r.id),
          status: 'pending'
        });
        App.replaceRecord('tasks', rec);
        created.push(r.title);
      } catch (e) { console.warn('routine day-task creation failed for', r.title, e); }
    }

    if (dirty) {
      App.settings.routine_task_log = JSON.stringify(log);
      try { await API.saveSettings({ routine_task_log: App.settings.routine_task_log }); }
      catch (e) { console.warn('routine task log save failed', e); }
    }
    if (created.length) {
      toast(`🤖 ${created.length} routine task${created.length > 1 ? 's' : ''} created for today`, 'success');
      App.refreshCurrent();
    }
  },

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
    return `
      <div class="rt-week" title="This week — tap a day dot">
        <div class="rt-track-wrap"><div class="rt-track" style="width:${pct}%"></div></div>
        ${cells.join('')}
      </div>
      <div class="rt-week-meta muted small">${done}/${scheduled} scheduled days done this week${pct === 100 && scheduled ? ' — 🏆 perfect!' : ''}</div>`;
  },

  /** dot click: task exists → view in Tasks; scheduled day without task →
      create it now (today or explicit backfill of a miss). */
  async dayDotClick(r, date) {
    const today = Utils.today();
    const t = (App.state.tasks || []).find(x => !x._archived &&
      x.project_id === this.marker(r.id) && String(x.scheduled_date || '').slice(0, 10) === date);
    if (t) {
      Tasks.filter = { status: '', category: '', priority: '', goal: '', date: '', search: this.marker(r.id) };
      location.hash = '#/tasks';
      App.route();
      return;
    }
    if (!this.coversDay(r, Utils.weekdayShort(date))) return;
    if (date > today) { toast('This day hasn\'t arrived yet — its task will be created on the day.', 'info'); return; }
    try {
      const rec = await API.createTask({
        title: r.title,
        description: '⏰ Auto from routine' + (r.target_time ? ' · ' + r.target_time : ''),
        category: r.category || 'Other',
        priority: 'medium',
        scheduled_date: date,
        estimated_minutes: Utils.num(r.duration_minutes) || '',
        project_id: this.marker(r.id),
        status: 'pending'
      });
      App.replaceRecord('tasks', rec);
      const log = this.log();
      log[r.id] = log[r.id] || {};
      log[r.id][date] = true;
      App.settings.routine_task_log = JSON.stringify(log);
      await API.saveSettings({ routine_task_log: App.settings.routine_task_log });
      toast(`📅 Task created for ${Utils.fmtDay(date)}${date < today ? ' (backfill)' : ''}`, 'success');
      App.refreshCurrent();
    } catch (e) { App.handleError(e); }
  },

  page(container) {
    container.innerHTML = `
      <div class="page-head">
        <h2>Routines</h2>
        <button class="btn btn-primary" data-act="new">${icon('plus')} New routine</button>
      </div>
      <div class="tabs" id="routine-tabs">
        ${['All', 'Every day'].concat(WEEKDAYS).map(d =>
          `<button class="tab ${this.dayTab === d ? 'active' : ''}" data-day="${d}">${d}</button>`).join('')}
      </div>
      <div id="routine-list" class="stack"></div>
    `;
    container.onclick = e => {
      const tab = e.target.closest('.tab');
      if (tab) { this.dayTab = tab.dataset.day; return this.page(container); }
      if (e.target.closest('[data-act="new"]')) return this.openForm();
      const btn = e.target.closest('[data-routine-action]');
      if (!btn) return;
      const r = (App.state.routines || []).find(x => x.id === btn.closest('[data-id]').dataset.id);
      if (!r) return;
      const act = btn.dataset.routineAction;
      if (act === 'toggle') this.toggleEnabled(r);
      if (act === 'edit') this.openForm(r);
      if (act === 'delete') this.remove(r);
      if (act === 'tasks') {
        Tasks.filter = { status: '', category: '', priority: '', goal: '', date: '', search: this.marker(r.id) };
        location.hash = '#/tasks';
        App.route();
      }
      if (act === 'day') return this.dayDotClick(r, btn.dataset.rtDate);
    };
    this.renderList();
  },

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

  async toggleEnabled(r) {
    try {
      const rec = await API.updateRoutine(r.id, { enabled: r.enabled === false });
      App.replaceRecord('routines', rec);
      App.refreshCurrent();
    } catch (e) { App.handleError(e); }
  },

  async remove(r) {
    const ok = await confirmDialog({
      title: 'Delete routine?',
      message: `Are you sure you want to delete "<b>${Utils.esc(r.title)}</b>" (${Utils.esc(r.target_time || '')})?`
    });
    if (!ok) return;
    try {
      await API.deleteRoutine(r.id);
      App.state.routines = App.state.routines.filter(x => x.id !== r.id);
      App.refreshCurrent();
      toast('Routine deleted', 'success');
    } catch (e) { App.handleError(e); }
  },

  openForm(existing) {
    const r = existing || {};
    const days = String(r.days || 'Every day');
    const selected = days === 'Every day' ? WEEKDAYS.slice() : days.split(',').map(s => s.trim()).filter(Boolean);
    const every = days === 'Every day' || selected.length === 7;
    const m = openModal({
      title: existing ? 'Edit routine' : 'New routine',
      body: `
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
        </form>`,
      footer: `
        <button class="btn btn-ghost" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-save>${existing ? 'Save changes' : 'Create routine'}</button>`
    });

    const everyBox = qs('#day-every', m.overlay);
    const pills = qsa('#day-picker input', m.overlay);
    function syncEvery() {
      const allOn = pills.every(p => p.checked);
      everyBox.checked = allOn;
    }
    everyBox.addEventListener('change', () => pills.forEach(p => { p.checked = everyBox.checked; p.parentElement.classList.toggle('on', everyBox.checked); }));
    pills.forEach(p => p.addEventListener('change', () => { p.parentElement.classList.toggle('on', p.checked); syncEvery(); }));

    qs('[data-cancel]', m.overlay).addEventListener('click', m.close);
    qs('[data-save]', m.overlay).addEventListener('click', () => {
      const form = qs('#routine-form', m.overlay);
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const chosen = fd.getAll('days');
      const wantAuto = fd.get('auto_task') === 'on';
      const data = {
        title: fd.get('title').trim(),
        description: fd.get('description'),
        category: fd.get('category'),
        target_time: fd.get('target_time') || '',
        duration_minutes: fd.get('duration_minutes') === '' ? '' : Utils.num(fd.get('duration_minutes')),
        days: chosen.length === 7 ? 'Every day' : (chosen.length ? chosen.join(',') : 'Every day')
        // NOTE: auto-task flag is NOT sent to the routines table (no such
        // column → PGRST204) — it lives in Settings (Routines.setAuto).
      };
      const save = existing ? API.updateRoutine(r.id, data) : API.createRoutine(data);
      save.then(async rec => {
        App.replaceRecord('routines', rec);
        await this.setAuto(rec.id, wantAuto);
        if (wantAuto) { try { await this.ensureTodayTasks(); } catch (e) { /* today's task comes on next boot */ } }
        m.close();
        App.refreshCurrent();
        toast(existing ? 'Routine updated' : 'Routine created', 'success');
      }).catch(e => App.handleError(e));
    });
  }
};
