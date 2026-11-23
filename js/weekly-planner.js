/* ============================================================
   AluBhaiOS — Weekly Planner (Friday → Thursday)
   One settings record per task/week; concrete day sessions are
   independent of task completion. Legacy routines stay intact.
   ============================================================ */
'use strict';

const WeeklyPlanner = {
  prefix: 'weekly_plan.v1.',
  selectedWeek: null,
  dayTab: 'All',
  view: 'list',
  calY: null,
  calM: null,
  busy: new Set(),

  validDate(date) {
    return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      !!Utils.parseDate(date) && Utils.dateStr(Utils.parseDate(date)) === date;
  },
  validTime(time) {
    return typeof time === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(time) &&
      this.validDate(time.slice(0, 10)) && Number(time.slice(11, 13)) < 24 &&
      Number(time.slice(14, 16)) < 60 && Number(time.slice(17, 19)) < 60;
  },
  weekStart(date = Utils.today()) {
    if (!this.validDate(date)) throw new Error('Choose a valid date.');
    return Utils.addDays(date, -((Utils.parseDate(date).getDay() + 2) % 7));
  },
  week() { return this.selectedWeek || this.weekStart(); },
  dates(week = this.week()) { return Array.from({ length: 7 }, (_, i) => Utils.addDays(week, i)); },
  key(week, taskId) { return this.prefix + week + '.' + encodeURIComponent(taskId); },
  task(id) { return (App.state.tasks || []).find(t => t.id === id); },
  clone(value) { return JSON.parse(JSON.stringify(value)); },

  /** Validate before using a saved plan — malformed data is never overwritten. */
  decode(key, raw) {
    const a = JSON.parse(raw);
    if (!a || a.version !== 1 || !this.validDate(a.week_start) || this.weekStart(a.week_start) !== a.week_start ||
        typeof a.task_id !== 'string' || !a.task_id || key !== this.key(a.week_start, a.task_id) ||
        typeof a.title !== 'string' || !a.title.trim() || typeof a.category !== 'string' ||
        !this.validDate(a.effective_from) || !this.validTime(a.created_at) || !this.validTime(a.updated_at) ||
        a.effective_from !== a.created_at.slice(0, 10) || !Array.isArray(a.sessions)) {
      throw new Error('Unsupported or damaged weekly plan.');
    }
    const ids = new Set(), dates = new Set();
    for (const s of a.sessions) {
      if (!s || typeof s.id !== 'string' || !s.id || ids.has(s.id) ||
          !this.validDate(s.date) || this.weekStart(s.date) !== a.week_start || s.date < a.effective_from ||
          !this.validTime(s.added_at) || s.date < s.added_at.slice(0, 10) ||
          typeof s.done_at !== 'string' || (s.done_at && (!this.validTime(s.done_at) || s.done_at.slice(0, 10) < s.date)) ||
          typeof s.cancelled_at !== 'string' || (s.cancelled_at && !this.validTime(s.cancelled_at)) ||
          (s.cancelled_at && s.done_at) || !Array.isArray(s.moves)) {
        throw new Error('Unsupported or damaged weekly session.');
      }
      ids.add(s.id);
      if (!s.cancelled_at) {
        if (dates.has(s.date)) throw new Error('Duplicate weekly session.');
        dates.add(s.date);
      }
      for (const move of s.moves) {
        if (!move || !this.validDate(move.from) || !this.validDate(move.to) || !this.validTime(move.at) ||
            this.weekStart(move.from) !== a.week_start || this.weekStart(move.to) !== a.week_start ||
            move.to < move.at.slice(0, 10)) throw new Error('Damaged session move history.');
      }
    }
    return a;
  },
  read(key) {
    const raw = App.settings[key];
    return raw === undefined ? null : this.decode(key, raw);
  },
  records() {
    const plans = [], invalid = [];
    Object.keys(App.settings).filter(k => k.startsWith(this.prefix)).forEach(key => {
      try { plans.push({ key, ...this.decode(key, App.settings[key]) }); }
      catch (e) { invalid.push(key); }
    });
    return { plans, invalid };
  },
  assignments(week = this.week()) {
    return this.records().plans.filter(a => a.week_start === week)
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.title.localeCompare(b.title));
  },
  status(session, today = Utils.today()) {
    if (session.cancelled_at) return 'cancelled';
    if (session.done_at) return session.done_at.slice(0, 10) > session.date ? 'late' : 'done';
    return session.date < today ? 'missed' : session.date === today ? 'pending' : 'upcoming';
  },
  summary(assignments, today = Utils.today()) {
    const counts = { total: 0, done: 0, missed: 0, pending: 0, upcoming: 0, cancelled: 0 };
    assignments.forEach(a => a.sessions.forEach(s => {
      const status = this.status(s, today);
      if (status === 'cancelled') { counts.cancelled++; return; }
      counts.total++;
      counts[status === 'late' ? 'done' : status]++;
    }));
    return counts;
  },
  sessionsOn(date, today = Utils.today()) {
    return this.assignments(this.weekStart(date)).flatMap(assignment => assignment.sessions
      .filter(s => s.date === date && !s.cancelled_at)
      .map(session => ({ assignment, session, title: assignment.title, status: this.status(session, today) })));
  },

  /** Compare-and-set writes prevent another device's session update being lost. */
  async save(key, expectedRaw, assignment) {
    if (!App.online) throw new Error('Connect and sync before changing your weekly plan.');
    if (this.busy.has(key)) throw new Error('This plan is already saving. Please wait.');
    if (App.settings[key] !== expectedRaw) throw new Error('This plan changed. Reopen it and try again.');
    const next = this.clone(assignment);
    delete next.key;
    next.updated_at = Utils.nowISO();
    const raw = JSON.stringify(next);
    this.decode(key, raw);
    this.busy.add(key);
    try { await API.savePlannerRecord(key, expectedRaw, raw); }
    finally { this.busy.delete(key); }
    App.refreshCurrent();
    return next;
  },
  async add(taskId, week, chosenDates, expectedRaw) {
    if (arguments.length < 4) expectedRaw = App.settings[this.key(week, taskId)];
    const task = this.task(taskId), today = Utils.today();
    if (!task || task._archived || task.status === 'completed' || task.status === 'cancelled') {
      throw new Error('Choose an active, incomplete task from Tasks.');
    }
    if (!this.validDate(week) || this.weekStart(week) !== week) throw new Error('Choose a Friday-based week.');
    if (!chosenDates.length || new Set(chosenDates).size !== chosenDates.length || chosenDates.some(d =>
        !this.validDate(d) || this.weekStart(d) !== week || d < today)) {
      throw new Error('Select at least one available day from today onward in this week.');
    }
    const key = this.key(week, taskId), now = Utils.nowISO();
    const a = expectedRaw === undefined ? {
      version: 1, week_start: week, task_id: taskId, title: task.title, category: task.category || 'Other',
      effective_from: today, created_at: now, updated_at: now, sessions: []
    } : this.decode(key, expectedRaw);
    if (chosenDates.some(d => a.sessions.some(s => s.date === d && !s.cancelled_at))) {
      throw new Error('This task is already planned on one of those days.');
    }
    chosenDates.sort().forEach(date => a.sessions.push({
      id: Utils.uid(), date, added_at: now, done_at: '', cancelled_at: '', moves: []
    }));
    return this.save(key, expectedRaw, a);
  },
  async toggle(key, sessionId, expectedRaw = App.settings[key]) {
    const a = this.decode(key, expectedRaw), s = a.sessions.find(s => s.id === sessionId);
    if (!s || s.cancelled_at || s.date > Utils.today()) throw new Error('Only today or past sessions can be checked.');
    s.done_at = s.done_at ? '' : Utils.nowISO();
    return this.save(key, expectedRaw, a);
  },
  async move(key, sessionId, date, expectedRaw = App.settings[key]) {
    const a = this.decode(key, expectedRaw), s = a.sessions.find(s => s.id === sessionId);
    if (!s || s.done_at || s.cancelled_at || !this.validDate(date) || date < Utils.today() ||
        this.weekStart(date) !== a.week_start || date === s.date) {
      throw new Error('Move an unfinished session to today or a future day in the same week.');
    }
    if (a.sessions.some(x => x.id !== s.id && x.date === date && !x.cancelled_at)) {
      throw new Error('This task already has a session on that day.');
    }
    s.moves.push({ from: s.date, to: date, at: Utils.nowISO() });
    s.date = date;
    return this.save(key, expectedRaw, a);
  },
  async cancel(key, sessionId, expectedRaw = App.settings[key]) {
    const a = this.decode(key, expectedRaw), s = a.sessions.find(s => s.id === sessionId);
    if (!s || s.done_at || s.cancelled_at || s.date < Utils.today()) {
      throw new Error('Only an unfinished session today or in the future can be removed from the plan.');
    }
    s.cancelled_at = Utils.nowISO();
    return this.save(key, expectedRaw, a);
  },
  async resetProgress(type, today = Utils.today()) {
    const { plans, invalid } = this.records();
    if (invalid.length) throw new Error('A weekly plan is damaged. No weekly progress was reset; restore a valid backup first.');
    const from = type === 'today' ? today : Utils.addDays(today, -6);
    let count = 0;
    for (const a of plans) {
      const changed = a.sessions.filter(s => s.done_at && (type === 'progress' ||
        (s.done_at.slice(0, 10) >= from && s.done_at.slice(0, 10) <= today)));
      if (!changed.length) continue;
      const expected = App.settings[a.key];
      changed.forEach(s => { s.done_at = ''; });
      await this.save(a.key, expected, a);
      count += changed.length;
    }
    return count;
  },

  statusName(status) {
    return { done: 'Done', late: 'Done · late', missed: 'Missed', pending: 'Pending', upcoming: 'Upcoming', cancelled: 'Removed' }[status] || status;
  },
  statusColor(status) {
    return { done: '#10b981', late: '#10b981', missed: '#ef4444', pending: '#f59e0b', upcoming: '#64748b', cancelled: '#64748b' }[status] || '#64748b';
  },
  statusChip(status) { return chip(this.statusName(status), this.statusColor(status)); },
  button(action, key, sessionId, label, extra = '') {
    return `<button type="button" class="btn btn-sm ${extra}" data-wp-action="${action}" data-wp-key="${Utils.esc(key)}" data-wp-session="${Utils.esc(sessionId || '')}" ${this.busy.has(key) ? 'disabled' : ''}>${label}</button>`;
  },
  dayButtons(a) {
    return `<div class="wp-days">${this.dates(a.week_start).map(date => {
      const s = a.sessions.find(s => s.date === date && !s.cancelled_at), status = s ? this.status(s) : 'off';
      const name = Utils.weekdayShort(date), today = date === Utils.today();
      return `<button type="button" class="wp-day ${status}${today ? ' today' : ''}" ${s ? `data-wp-action="session" data-wp-key="${Utils.esc(a.key)}" data-wp-session="${Utils.esc(s.id)}"` : 'disabled'} aria-label="${Utils.esc(name + ' ' + date + ' — ' + (s ? status : 'not planned'))}">
        <span>${name}</span><b>${s ? (status === 'done' || status === 'late' ? '✓' : '●') : '—'}</b><small>${date.slice(8)}</small>
      </button>`;
    }).join('')}</div>`;
  },
  taskNote(a) {
    const task = this.task(a.task_id);
    if (!task) return 'Original task deleted · history kept';
    if (task._archived) return 'Original task archived · history kept';
    if (task.status === 'completed') return 'Original task completed · session checks stay separate';
    return task.title !== a.title ? 'Task renamed to: ' + task.title : 'Session Done ≠ original Task Done';
  },
  assignmentHtml(a) {
    const counts = this.summary([a]), task = this.task(a.task_id);
    const active = task && !task._archived && task.status !== 'completed' && task.status !== 'cancelled';
    const daysLeft = this.dates(a.week_start).some(d => d >= Utils.today());
    const moves = a.sessions.flatMap(s => s.moves.map(m => `<li>${Utils.esc(Utils.fmtDay(m.from))} → ${Utils.esc(Utils.fmtDay(m.to))} <span class="muted">(${Utils.fmtDate(m.at.slice(0, 10))})</span></li>`));
    const removed = a.sessions.filter(s => s.cancelled_at).map(s => `<li>${Utils.fmtDay(s.date)} — removed on ${Utils.fmtDate(s.cancelled_at.slice(0, 10))}</li>`);
    return `<article class="card wp-assignment">
      <div class="wp-card-head"><div class="wp-task-main"><h3>${Utils.esc(a.title)}</h3><div class="task-meta">${chip(a.category, Utils.categoryColor(a.category))}<span class="muted small">Added ${Utils.fmtDate(a.created_at.slice(0, 10))}</span></div></div>
        <b class="wp-progress">${counts.done}/${counts.total}<small>sessions done</small></b></div>
      <p class="muted small wp-task-note">${Utils.esc(this.taskNote(a))}</p>
      ${this.dayButtons(a)}
      <div class="wp-card-foot"><div class="task-meta">${counts.missed ? chip(counts.missed + ' missed', '#ef4444') : ''}${counts.pending ? chip(counts.pending + ' pending', '#f59e0b') : ''}${counts.upcoming ? chip(counts.upcoming + ' upcoming', '#64748b') : ''}</div>
        <div class="wp-actions">${task ? this.button('task', a.key, '', 'Open task') : ''}${active && daysLeft ? this.button('add', a.key, '', '+ Add days') : ''}${active ? this.button('next', a.key, '', 'Plan next week') : ''}</div></div>
      ${moves.length || removed.length ? `<details class="wp-history"><summary>Change history (${moves.length + removed.length})</summary><ul>${moves.concat(removed).join('')}</ul></details>` : ''}
    </article>`;
  },
  sessionRow(entry) {
    const { assignment: a, session: s, status } = entry;
    return `<div class="wp-session-row"><div class="wp-task-main"><b>${Utils.esc(a.title)}</b><div class="task-meta">${this.statusChip(status)}</div></div>
      <div class="wp-actions">${this.button('session', a.key, s.id, 'Details')}${s.date <= Utils.today() ? this.button('toggle', a.key, s.id, s.done_at ? 'Undo' : 'Done', s.done_at ? '' : 'btn-success') : ''}</div></div>`;
  },
  todayHtml(date = Utils.today()) {
    const entries = this.sessionsOn(date), { invalid } = this.records();
    return `<div class="wp-today"><p class="muted small">Day sessions are separate from your original Tasks. <a class="link" href="#/routines">Open weekly plan</a></p>
      ${invalid.length ? '<p class="banner banner-warn">Some weekly plans could not be read. Sync or restore a valid backup.</p>' : ''}
      ${entries.length ? entries.map(e => this.sessionRow(e)).join('') : `<p class="muted">No weekly sessions today. <a class="link" href="#/routines">Choose days for this week</a>.</p>`}</div>`;
  },
  /** Structured week data for the PNG export — pure (testable). */
  weekExportData(week = this.week(), today = Utils.today()) {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const counts = this.summary(this.assignments(week), today);
    return {
      filename: 'weekly-plan-' + week + '.png',
      rangeLabel: Utils.fmtDay(week) + ' – ' + Utils.fmtDay(Utils.addDays(week, 6)),
      done: counts.done, total: counts.total, missed: counts.missed,
      columns: this.dates(week).map(date => {
        const d = Utils.parseDate(date);
        return {
          date, day: Utils.weekdayShort(date),
          dateLabel: d.getDate() + ' ' + MONTHS[d.getMonth()],
          isToday: date === today,
          sessions: this.sessionsOn(date, today).map(e => ({
            title: e.title, status: e.status,
            statusLabel: this.statusName(e.status), color: this.statusColor(e.status)
          }))
        };
      })
    };
  },
  /** Draw the selected week on an offscreen canvas at 2× scale and download it. */
  async exportPng(week = this.week()) {
    const data = this.weekExportData(week);
    const S = 2, W = 1480, pad = 48, gap = 14, headH = 132, colHead = 64, card = 118, colPad = 14, foot = 64;
    const rows = Math.max(1, ...data.columns.map(c => c.sessions.length));
    const colW = (W - pad * 2 - gap * 6) / 7, colH = colHead + rows * card + colPad;
    const H = headH + colH + foot;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * S); canvas.height = Math.round(H * S);
    const ctx = canvas.getContext('2d');
    ctx.scale(S, S);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#0f172a'; ctx.font = '700 34px Inter, system-ui, sans-serif';
    ctx.fillText('Weekly Planner', pad, 60);
    ctx.fillStyle = '#64748b'; ctx.font = '500 19px Inter, system-ui, sans-serif';
    ctx.fillText(data.rangeLabel + ' · Friday → Thursday', pad, 90);
    ctx.textAlign = 'right';
    ctx.font = '700 22px Inter, system-ui, sans-serif'; ctx.fillStyle = '#0f172a';
    ctx.fillText(data.done + '/' + data.total + ' sessions done', W - pad, 60);
    ctx.font = '500 17px Inter, system-ui, sans-serif'; ctx.fillStyle = data.missed ? '#ef4444' : '#64748b';
    ctx.fillText(data.missed + ' missed', W - pad, 88);
    ctx.textAlign = 'left';
    data.columns.forEach((col, i) => {
      const x = pad + i * (colW + gap), y = headH;
      ctx.fillStyle = '#f1f5f9'; roundRectPath(ctx, x, y, colW, colH, 14); ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = col.isToday ? '#4f46e5' : '#0f172a';
      ctx.font = '700 20px Inter, system-ui, sans-serif';
      ctx.fillText(col.day, x + colW / 2, y + 30);
      ctx.fillStyle = '#64748b'; ctx.font = '500 15px Inter, system-ui, sans-serif';
      ctx.fillText(col.dateLabel, x + colW / 2, y + 52);
      if (!col.sessions.length) {
        ctx.fillStyle = '#94a3b8'; ctx.font = '500 15px Inter, system-ui, sans-serif';
        ctx.fillText('—', x + colW / 2, y + colHead + 26);
      }
      col.sessions.forEach((s, j) => {
        const cy = y + colHead + j * card;
        ctx.lineWidth = 2;
        ctx.strokeStyle = (s.status === 'done' || s.status === 'late') ? '#10b981' : s.status === 'missed' ? '#fca5a5' : '#e2e8f0';
        ctx.fillStyle = '#ffffff'; roundRectPath(ctx, x + 10, cy + 6, colW - 20, card - 18, 10); ctx.fill(); ctx.stroke();
        ctx.textAlign = 'left'; ctx.fillStyle = '#0f172a';
        ctx.font = '600 16px Inter, system-ui, sans-serif';
        wpWrap(ctx, s.title, x + 22, cy + 28, colW - 44, 20, 2);
        wpChip(ctx, s.statusLabel, s.color, x + 22, cy + card - 40);
        if (s.status === 'done' || s.status === 'late') {
          ctx.fillStyle = '#10b981'; ctx.font = '700 18px Inter, system-ui, sans-serif'; ctx.textAlign = 'right';
          ctx.fillText('✓', x + colW - 22, cy + card - 24); ctx.textAlign = 'left';
        }
      });
      ctx.textAlign = 'left';
    });
    ctx.fillStyle = '#94a3b8'; ctx.font = '500 14px Inter, system-ui, sans-serif';
    ctx.fillText('Session Done ≠ original Task Done · ' + CONFIG.APP_NAME, pad, H - 26);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not render the weekly plan image.');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = data.filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('📅 Weekly plan PNG downloaded.', 'success');
  },
  /** Month grid for the calendar view — Monday-based, same layout as the
      Tasks calendar. Pure (testable); dates are local naive strings. */
  monthDates(y, m) {
    const startDow = (new Date(y, m, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const out = [];
    for (let i = 0; i < startDow; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(`${y}-${Utils.pad(m + 1)}-${Utils.pad(d)}`);
    return out;
  },
  setView(view) {
    if (!['list', 'month', 'week'].includes(view)) return;
    this.view = view;
    if (view === 'month' && this.calY === null) {
      const d = Utils.parseDate(Utils.today());
      this.calY = d.getFullYear(); this.calM = d.getMonth();
    }
    App.refreshCurrent();
  },
  calNav(dir) {
    const d = Utils.parseDate(Utils.today());
    if (dir === 'today') { this.calY = d.getFullYear(); this.calM = d.getMonth(); }
    else if (dir === 'prev') { this.calM--; if (this.calM < 0) { this.calM = 11; this.calY--; } }
    else if (dir === 'next') { this.calM++; if (this.calM > 11) { this.calM = 0; this.calY++; } }
    App.refreshCurrent();
  },
  monthCalendarHtml(today = Utils.today()) {
    if (this.calY === null) { const d = Utils.parseDate(today); this.calY = d.getFullYear(); this.calM = d.getMonth(); }
    const first = new Date(this.calY, this.calM, 1);
    const monthName = first.toLocaleString('en-us', { month: 'long' });
    const colors = { done: '#10b981', late: '#10b981', missed: '#ef4444', pending: '#f59e0b', upcoming: '#64748b' };
    const cells = this.monthDates(this.calY, this.calM).map(date => {
      if (!date) return '<div class="wp-cal-cell blank"></div>';
      const entries = this.sessionsOn(date);
      const dots = entries.slice(0, 3).map(e => `<span class="wp-dot" style="background:${colors[e.status]}" title="${Utils.esc(e.title + ' — ' + e.status)}"></span>`).join('');
      const more = entries.length > 3 ? `<span class="wp-more">+${entries.length - 3}</span>` : '';
      return `<button type="button" class="wp-cal-cell${date === today ? ' today' : ''}${entries.length ? ' has-items' : ''}" data-wp-action="open-day" data-wp-date="${date}" aria-label="${Utils.esc(Utils.fmtDay(date) + (entries.length ? ' — ' + entries.length + ' session' + (entries.length > 1 ? 's' : '') : ''))}">
        <span class="wp-cal-num">${Number(date.slice(8))}</span>
        <span class="wp-cal-dots">${dots}${more}</span>
      </button>`;
    }).join('');
    return `<div class="card wp-cal">
      <div class="cal-head wp-cal-head">
        <button class="btn btn-icon btn-ghost" data-wp-action="cal-nav" data-wp-dir="prev" aria-label="Previous month">${icon('chevron-left')}</button>
        <b>${monthName} ${this.calY}</b>
        <button class="btn btn-icon btn-ghost" data-wp-action="cal-nav" data-wp-dir="next" aria-label="Next month">${icon('chevron-right')}</button>
        <button class="btn btn-ghost btn-sm" data-wp-action="cal-nav" data-wp-dir="today">Today</button>
      </div>
      <div class="wp-cal-weekdays" aria-hidden="true">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(w => `<span>${w}</span>`).join('')}</div>
      <div class="wp-cal-grid">${cells}</div>
      <p class="muted small">Tap a day to see its weekly sessions · green done · amber pending · red missed · grey upcoming.</p>
    </div>`;
  },
  weekGridHtml(today = Utils.today()) {
    const cols = this.dates().map(date => {
      const entries = this.sessionsOn(date);
      return `<div class="wp-week-col${date === today ? ' today' : ''}">
        <div class="wp-week-head"><b>${Utils.weekdayShort(date)}</b><span class="muted small">${date.slice(5)}</span>${date === today ? chip('Today', 'var(--c-primary)') : ''}</div>
        <div class="wp-week-body">${entries.length ? entries.map(e => this.sessionRow(e)).join('') : '<p class="muted small wp-empty">—</p>'}</div>
      </div>`;
    }).join('');
    return `<div class="wp-week-grid">${cols}</div>
      <p class="muted small">Seven days of the selected week · check a session from its day, never before.</p>`;
  },
  openDay(date) {
    const entries = this.sessionsOn(date);
    const m = openModal({
      title: icon('calendar-days') + ' ' + Utils.fmtDay(date),
      body: `<div class="stack">
          <div class="section-subhead">Weekly sessions (${entries.length})</div>
          ${entries.length ? entries.map(e => this.sessionRow(e)).join('') : `<p class="muted small">No sessions on this day.</p>`}
          <p class="muted small">Sessions do not complete Tasks.</p>
        </div>`,
      footer: `<button class="btn btn-ghost" data-close>Close</button><button class="btn btn-primary" data-week>${this.weekStart(date) === this.weekStart() ? 'Open planner view' : 'Open that week'}</button>`
    });
    qs('[data-close]', m.overlay).addEventListener('click', m.close);
    qs('[data-week]', m.overlay).addEventListener('click', () => { m.close(); this.view = 'week'; this.goWeek(this.weekStart(date)); });
    m.overlay.addEventListener('click', e => {
      const btn = e.target.closest('[data-wp-action]');
      if (!btn || btn.disabled) return;
      if (btn.dataset.wpAction === 'session') { m.close(); this.openSession(btn.dataset.wpKey, btn.dataset.wpSession); }
      else if (btn.dataset.wpAction === 'toggle') {
        btn.disabled = true;
        this.toggle(btn.dataset.wpKey, btn.dataset.wpSession)
          .then(() => { m.close(); toast('Weekly session saved — original Task unchanged.', 'success'); })
          .catch(err => { btn.disabled = false; App.handleError(err); });
      }
    });
  },
  legacyHtml() {
    const routines = App.state.routines || [];
    if (!routines.length) return '';
    return `<details class="card wp-legacy"><summary>Previous routines (${routines.length}) · read-only</summary>
      <p class="muted small">Saved for reference. Recurring task creation and reminders are retired; existing tasks and history are untouched. Add existing Tasks to your weekly plan instead.</p>
      ${routines.map(r => `<div class="wp-legacy-row"><b>${Utils.esc(r.title)}</b><span class="muted small">${Utils.esc(r.days || 'Every day')} · ${Utils.esc(r.target_time || 'No time')}${r.duration_minutes ? ' · ' + Utils.fmtMinutes(r.duration_minutes) : ''}</span>${r.description ? `<p class="muted small">${Utils.esc(r.description)}</p>` : ''}</div>`).join('')}
    </details>`;
  },
  page(container) {
    const week = this.week(), current = this.weekStart(), today = Utils.today();
    if (this.dayTab !== 'All' && !this.dates(week).includes(this.dayTab)) this.dayTab = 'All';
    const assignments = this.assignments(week), counts = this.summary(assignments), { invalid } = this.records();
    const label = week === current ? 'This week' : week < current ? 'Past week' : 'Future week';
    const filtered = this.dayTab === 'All' ? assignments : assignments.filter(a =>
      a.sessions.some(s => !s.cancelled_at && s.date === this.dayTab));
    container.innerHTML = `<div class="page-head"><div><h2>Weekly Planner</h2><p class="muted small">Friday → Thursday · your tasks, your days</p></div>
      <div class="wp-actions"><button class="btn" data-wp-action="new-task">${icon('plus')} New task</button><button class="btn" data-wp-action="png" title="Download this week as a high-quality PNG image">${icon('image')} PNG</button><button class="btn btn-primary" data-wp-action="add" ${Utils.addDays(week, 6) < today ? 'disabled' : ''}>${icon('calendar-plus')} Add to week</button></div></div>
      <div class="card wp-toolbar"><div class="wp-week-nav"><button class="btn btn-icon btn-ghost" data-wp-action="prev" aria-label="Previous week">${icon('chevron-left')}</button><div><b>${Utils.fmtDate(week)} – ${Utils.fmtDate(Utils.addDays(week, 6))}</b><span class="muted small">${label}</span></div><button class="btn btn-icon btn-ghost" data-wp-action="forward" aria-label="Next week">${icon('chevron-right')}</button></div></div>
      ${invalid.length ? `<div class="banner banner-warn" role="alert">${invalid.length} saved weekly plan(s) could not be read. They have NOT been deleted or replaced. Sync, or restore a valid backup in Settings.</div>` : ''}
      <div class="wp-summary"><div class="card"><b>${counts.done}/${counts.total}</b><span>sessions done</span></div><div class="card"><b>${counts.missed}</b><span>missed</span></div><div class="card"><b>${counts.pending}</b><span>pending today</span></div><div class="card"><b>${counts.upcoming}</b><span>upcoming</span></div></div>
      <div class="wp-view-seg" role="group" aria-label="Planner view"><button class="${this.view === 'list' ? 'on' : ''}" data-wp-action="view" data-wp-view="list">${icon('list')} List</button><button class="${this.view === 'month' ? 'on' : ''}" data-wp-action="view" data-wp-view="month">${icon('calendar-days')} Calendar</button><button class="${this.view === 'week' ? 'on' : ''}" data-wp-action="view" data-wp-view="week">${icon('table-columns')} Week</button></div>
      <p class="muted small wp-explainer">Only selected days count. A session check never completes the original Task. New Fridays do not copy unfinished sessions.</p>
      ${this.view === 'month' ? this.monthCalendarHtml() : this.view === 'week' ? this.weekGridHtml() : `
      <div class="wp-tabs" role="group" aria-label="Filter by day"><button class="tab ${this.dayTab === 'All' ? 'active' : ''}" data-wp-action="day" data-wp-date="All">All days</button>${this.dates(week).map(date => `<button class="tab ${this.dayTab === date ? 'active' : ''}${date === today ? ' wp-is-today' : ''}" data-wp-action="day" data-wp-date="${date}">${Utils.weekdayShort(date)} <span>${date.slice(8)}</span></button>`).join('')}</div>
      <div class="stack wp-list">${filtered.length ? (this.dayTab === 'All' ? filtered.map(a => this.assignmentHtml(a)).join('') : this.sessionsOn(this.dayTab).map(e => this.sessionRow(e)).join('')) : emptyState('calendar-days', assignments.length ? 'No sessions on this day' : 'No tasks planned for this week', week < current ? 'This week has no saved plan.' : 'Choose an existing task and the days you want to work on it. Nothing repeats automatically.', Utils.addDays(week, 6) >= today ? '<button class="btn btn-primary" data-wp-action="add">Add to week</button>' : '')}</div>`}
      ${this.legacyHtml()}`;
    container.onclick = e => this.handleClick(e);
  },
  goWeek(week) {
    this.selectedWeek = week === this.weekStart() ? null : week;
    this.dayTab = 'All';
    App.refreshCurrent();
  },
  handleClick(e) {
    const btn = e.target.closest('[data-wp-action]');
    if (!btn || btn.disabled) return false;
    const action = btn.dataset.wpAction, key = btn.dataset.wpKey, sessionId = btn.dataset.wpSession;
    if (action === 'prev') this.goWeek(Utils.addDays(this.week(), -7));
    else if (action === 'forward') this.goWeek(Utils.addDays(this.week(), 7));
    else if (action === 'day') { this.dayTab = btn.dataset.wpDate; App.refreshCurrent(); }
    else if (action === 'view') return this.setView(btn.dataset.wpView);
    else if (action === 'cal-nav') return this.calNav(btn.dataset.wpDir);
    else if (action === 'open-day') return this.openDay(btn.dataset.wpDate);
    else if (action === 'new-task') Tasks.openForm();
    else if (action === 'png') this.exportPng().catch(e => App.handleError(e));
    else if (action === 'add' || action === 'next') {
      try {
        const a = key ? this.read(key) : null;
        this.openForm(a ? a.task_id : '', action === 'next' ? Utils.addDays(a.week_start < this.weekStart() ? this.weekStart() : a.week_start, 7) : this.week());
      } catch (err) { App.handleError(err); }
    } else if (action === 'session') this.openSession(key, sessionId);
    else if (action === 'task') {
      try {
        const a = this.read(key), task = a && this.task(a.task_id);
        if (!task) return true;
        Tasks.showArchived = !!task._archived;
        Tasks.view = 'list';
        Tasks.filter = { status: '', category: '', priority: '', goal: '', date: '', search: task.title };
        location.hash = '#/tasks';
        App.route();
      } catch (err) { App.handleError(err); }
    } else if (action === 'toggle') {
      btn.disabled = true;
      this.toggle(key, sessionId).then(() => toast('Weekly session saved — original Task unchanged.', 'success'))
        .catch(err => App.handleError(err)).finally(() => { btn.disabled = false; });
    }
    return true;
  },

  openForm(taskId = '', week = this.week()) {
    const tasks = (App.state.tasks || []).filter(t => !t._archived && t.status !== 'completed' && t.status !== 'cancelled')
      .sort((a, b) => a.title.localeCompare(b.title));
    const baselines = {};
    tasks.forEach(t => { baselines[this.key(week, t.id)] = App.settings[this.key(week, t.id)]; });
    const m = openModal({
      title: 'Add task to week',
      body: `<p class="muted">${Utils.fmtDate(week)} – ${Utils.fmtDate(Utils.addDays(week, 6))} · Friday → Thursday</p>
        <p class="muted small">Select the days you will work on this task. Each day is a separate session, not a new Task.</p>
        <form id="wp-form"><label class="field"><span>Existing task *</span><select name="task_id" required aria-label="Existing task"><option value="">Choose a task…</option>${tasks.map(t => `<option value="${Utils.esc(t.id)}" ${t.id === taskId ? 'selected' : ''}>${Utils.esc(t.title)}</option>`).join('')}</select></label>
        <fieldset class="wp-fieldset"><legend>Days to work *</legend><div class="wp-pick-days">${this.dates(week).map(date => `<label class="wp-pick"><input type="checkbox" name="dates" value="${date}" ${date < Utils.today() ? 'disabled' : ''}><span>${Utils.weekdayShort(date)}</span><b>${date.slice(8)}</b><small class="wp-pick-note">${date < Utils.today() ? 'Past day' : 'Available'}</small></label>`).join('')}</div></fieldset>
        <p id="wp-form-error" class="wp-form-error" role="alert"></p><p class="muted small">Past days cannot be added. Nothing carries over automatically.</p></form>
        <button class="btn btn-ghost btn-sm" data-wp-new-task>Task not listed? Create a task first</button>`,
      footer: '<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Add selected days</button>'
    });
    const form = qs('#wp-form', m.overlay), select = qs('[name="task_id"]', m.overlay), error = qs('#wp-form-error', m.overlay);
    const update = () => {
      let a = null, damaged = false;
      try { a = select.value ? this.read(this.key(week, select.value)) : null; } catch (e) { damaged = true; }
      qsa('[name="dates"]', m.overlay).forEach(input => {
        const past = input.value < Utils.today(), used = a && a.sessions.some(s => s.date === input.value && !s.cancelled_at);
        input.disabled = past || !!used || damaged;
        if (input.disabled) input.checked = false;
        qs('.wp-pick-note', input.parentElement).textContent = damaged ? 'Unreadable plan' : past ? 'Past day' : used ? 'Already planned' : 'Available';
      });
      error.textContent = damaged ? 'This saved plan cannot be read. Sync or restore a valid backup; it will not be overwritten.' : '';
    };
    select.addEventListener('change', update);
    update();
    qs('[data-cancel]', m.overlay).addEventListener('click', m.close);
    qs('[data-wp-new-task]', m.overlay).addEventListener('click', () => { m.close(); Tasks.openForm(); });
    const save = qs('[data-save]', m.overlay);
    save.addEventListener('click', async () => {
      if (save.disabled || !form.reportValidity()) return;
      const id = select.value, chosen = qsa('[name="dates"]', m.overlay).filter(i => i.checked && !i.disabled).map(i => i.value);
      if (!chosen.length) { error.textContent = 'Select at least one available day.'; return; }
      save.disabled = true; select.disabled = true;
      try {
        await this.add(id, week, chosen, baselines[this.key(week, id)]);
        m.close(); this.goWeek(week);
        toast('Days added — original Task unchanged.', 'success');
      } catch (e) { error.textContent = e.message; }
      finally { save.disabled = false; select.disabled = false; }
    });
  },
  openSession(key, sessionId) {
    let a, s;
    const expected = App.settings[key];
    try { a = this.decode(key, expected); s = a.sessions.find(s => s.id === sessionId); }
    catch (e) { App.handleError(e); return; }
    if (!s || s.cancelled_at) return;
    const editable = !s.done_at, past = s.date < Utils.today();
    const alternatives = this.dates(a.week_start).filter(d => d >= Utils.today() && d !== s.date &&
      !a.sessions.some(x => x.id !== s.id && x.date === d && !x.cancelled_at));
    const m = openModal({
      title: Utils.esc(a.title) + ' · ' + Utils.fmtDay(s.date),
      body: `${this.statusChip(this.status(s))}<p class="muted small">${Utils.esc(this.taskNote(a))}</p>
        <p>${s.done_at ? 'Checked on ' + Utils.fmtDate(s.done_at.slice(0, 10)) : past ? 'This selected day has passed. Mark it Done if you completed the work, or explicitly plan another session.' : 'Check this session when you have worked on the task for this day.'}</p>
        ${editable && alternatives.length ? `<label class="field"><span>Reschedule within this week</span><select id="wp-move-date" aria-label="Reschedule day">${alternatives.map(d => `<option value="${d}">${Utils.fmtDay(d)}</option>`).join('')}</select></label><button class="btn btn-sm" data-move>Move session</button><p class="muted small">The old date stays in change history. Original Task dates do not change.</p>` : ''}
        ${s.moves.length ? `<details class="wp-history"><summary>Move history</summary><ul>${s.moves.map(move => `<li>${Utils.fmtDay(move.from)} → ${Utils.fmtDay(move.to)}</li>`).join('')}</ul></details>` : ''}
        <p class="wp-form-error" id="wp-session-error" role="alert"></p>`,
      footer: `<button class="btn btn-ghost" data-close>Close</button>${editable && !past ? '<button class="btn btn-ghost danger" data-remove>Remove session</button>' : ''}${s.date <= Utils.today() ? `<button class="btn btn-primary" data-toggle>${s.done_at ? 'Undo session Done' : 'Mark session Done'}</button>` : ''}`
    });
    qs('[data-close]', m.overlay).addEventListener('click', m.close);
    const run = async work => {
      const buttons = qsa('button:not(.modal-close)', m.overlay);
      buttons.forEach(b => { b.disabled = true; });
      try { await work(); m.close(); toast('Weekly session saved — original Task unchanged.', 'success'); }
      catch (e) { qs('#wp-session-error', m.overlay).textContent = e.message; }
      finally { buttons.forEach(b => { b.disabled = false; }); }
    };
    const toggle = qs('[data-toggle]', m.overlay), move = qs('[data-move]', m.overlay), remove = qs('[data-remove]', m.overlay);
    if (toggle) toggle.addEventListener('click', () => run(() => this.toggle(key, sessionId, expected)));
    if (move) move.addEventListener('click', () => run(() => this.move(key, sessionId, qs('#wp-move-date', m.overlay).value, expected)));
    if (remove) remove.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'Remove this session?', message: `Remove the ${Utils.fmtDay(s.date)} session from your plan? The original Task and a removal record will be kept.`, confirmText: 'Remove session' });
      if (ok) run(() => this.cancel(key, sessionId, expected));
    });
  }
};

/* Canvas helpers for the PNG export (browser only). */
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wpWrap(ctx, text, x, y, maxW, lineH, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = []; let line = '', truncated = false;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (line && ctx.measureText(test).width > maxW) {
      lines.push(line); line = w;
      if (lines.length === maxLines) { truncated = true; break; }
    } else line = test;
  }
  if (!truncated && line) lines.push(line);
  if (truncated && lines.length) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    lines[lines.length - 1] = last + '…';
  }
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
}
function wpChip(ctx, label, color, x, y) {
  ctx.font = '600 13px Inter, system-ui, sans-serif';
  const w = Math.ceil(ctx.measureText(label).width) + 20;
  ctx.fillStyle = color + '26'; roundRectPath(ctx, x, y, w, 22, 11); ctx.fill();
  ctx.fillStyle = color; ctx.fillText(label, x + 10, y + 15);
}
