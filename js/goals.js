/* ============================================================
   PersonalOS — Goals (hierarchy: long-term → 90-day → monthly → …)
   progress can be set manually or synced from linked tasks
   ============================================================ */
'use strict';

const GoalProgress = {
  /** Path B: the manual progress field ALWAYS wins on display. Task stats
      are still computed (shown under the bar); ↻ sync copies them into the
      manual field. */
  auto(goal) {
    const tasks = (App.state.tasks || []).filter(t => t.goal_id === goal.id);
    const done = tasks.filter(t => t.status === 'completed').length;
    const pct = Utils.clamp(Utils.num(goal.progress), 0, 100);
    return {
      pct: pct,
      from: 'manual',
      hasTasks: tasks.length > 0,
      completed: done,
      remaining: tasks.length - done
    };
  }
};

const GoalPace = {
  /** Milestone pace math for an active goal with a target date.
      expected% = share of the goal's lifetime elapsed by today;
      needPerMonth = how many progress-points/month finish on time.
      Pure function (testable) — todayStr injectable. */
  pace(g, todayStr) {
    const today = todayStr || Utils.today();
    if (!g.target_date || g.status === 'completed') return null;
    const start = String(g.created_at || '').slice(0, 10) || today;
    const total = Math.round((Utils.parseDate(g.target_date) - Utils.parseDate(start)) / 86400000);
    if (!isFinite(total) || total <= 0) return null;
    const elapsed = Utils.clamp(Math.round((Utils.parseDate(today) - Utils.parseDate(start)) / 86400000), 0, total);
    const expected = Math.round(elapsed / total * 100);
    const actual = Utils.clamp(Utils.num(g.progress), 0, 100);
    const daysLeft = total - elapsed;
    const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30));
    const needPerMonth = Math.ceil((100 - actual) / monthsLeft);
    let state = 'ontrack';
    if (actual < expected - 10) state = 'behind';
    else if (actual < expected) state = 'slightly';
    return { start, total, elapsed, expected, actual, daysLeft, monthsLeft, needPerMonth, state };
  }
};

const Goals = {
  range: 7, // focus-time chart window in days (7 | 30 | 90)

  page(container) {
    const goals = App.state.goals || [];
    container.innerHTML = `
      <div class="page-head">
        <div>
          <h2>Goals</h2>
          <button class="btn btn-sm plan-btn" data-act="plan-week" title="Auto-schedule goal tasks across the next 7 days">${icon('wand-magic-sparkles')} Plan my week</button>
        </div>
        <div class="range-switch">
          ${[7, 30, 90].map(n => `<button class="tab ${this.range === n ? 'active' : ''}" data-goal-range="${n}" title="Focus-time window">${n}D</button>`).join('')}
          <button class="btn btn-primary" data-act="new">${icon('plus')} New goal</button>
        </div>
      </div>
      <div class="card chart-card">
        <h3 class="card-title">${icon('stopwatch')} Focus time by goal — last ${this.range} days</h3>
        <div class="chart-box"><canvas id="goal-focus-chart"></canvas></div>
      </div>
      <div class="card" id="money-card"></div>
      <div id="goal-list" class="stack"></div>
    `;
    container.onclick = e => {
      const rb = e.target.closest('[data-goal-range]');
      if (rb) { this.range = Number(rb.dataset.goalRange); return this.page(container); }
      if (e.target.closest('[data-act="new"]')) return this.openForm();
      if (e.target.closest('[data-act="plan-week"]')) return this.planWeek();
      const btn = e.target.closest('[data-goal-action]');
      if (!btn) return;
      const id = btn.closest('[data-id]').dataset.id;
      const goal = goals.find(g => g.id === id);
      if (!goal) return;
      const act = btn.dataset.goalAction;
      if (act === 'edit') this.openForm(goal);
      if (act === 'delete') this.remove(goal);
      if (act === 'add-sub') this.openForm(null, goal.id);
      if (act === 'add-task') Tasks.openForm({ goal_id: goal.id, scheduled_date: Utils.today() });
      if (act === 'sync') this.syncProgress(goal);
      if (act === 'focus') {
        Focus.presetGoal = goal.id;
        location.hash = '#/focus';
        toast('Focus page ready — goal preselected.', 'info');
      }
    };
    this.renderFocusChart();
    this.renderMoney();
    this.renderList();
  },

  /* ================= 💰 money log =================
     Entries live in the `money_log` settings key (JSON array of
     {id, date, type:'in'|'out', amt, note}) — no extra table needed.
     Net = income − expense. Paired with a matching goal it becomes
     a daily habit toward that number. */
  renderMoney() {
    const card = qs('#money-card', App.container());
    if (!card) return;
    const sum = Analytics.moneySummary();
    const moneyGoal = (App.state.goals || []).find(g => g.status !== 'completed' && /50\s*k|money|savings/i.test(String(g.title || '')));
    const target = 50000; // ৳50K by default; progress shows when a money-goal exists
    card.innerHTML = `
      <h3 class="card-title">${icon('sack-dollar')} Money log ${moneyGoal ? `— <span class="muted">${Utils.esc(moneyGoal.title)}</span>` : ''}</h3>
      <div class="money-stats">
        <div><b>৳${sum.totalNet.toLocaleString('en-IN')}</b><span>total saved</span></div>
        <div><b>৳${sum.monthNet.toLocaleString('en-IN')}</b><span>this month</span></div>
        <div><b>৳${sum.todayNet.toLocaleString('en-IN')}</b><span>today</span></div>
        <div><b>${sum.streakDays}d</b><span>logging streak</span></div>
        ${moneyGoal ? `<div><b>${Utils.clamp(Math.round(sum.totalNet / target * 100), -99, 100)}%</b><span>of ৳50,000</span></div>` : ''}
      </div>
      ${sum.count && sum.staleDays >= 3 ? `<p class="muted small money-nag" style="margin:6px 0 0">😈 Phonu notices the silence — ${sum.staleDays} days without a money entry…</p>` : ''}
      <div class="money-add">
        <input type="number" id="money-amt" min="1" placeholder="Amount ৳" style="max-width:120px">
        <select id="money-type"><option value="in">＋ saved / income</option><option value="out">− spent</option></select>
        <input id="money-note" placeholder="Note (optional)" maxlength="60">
        <button class="btn btn-primary btn-sm" id="money-add-btn">${icon('plus')} Add</button>
      </div>
      <div class="money-list">
        ${sum.entries.slice(0, 10).map(e => `
          <div class="money-row" data-id="${Utils.esc(e.id)}">
            <span class="money-date muted small">${Utils.fmtDate(String(e.date).slice(0, 10))}</span>
            <span class="money-note-txt">${Utils.esc(e.note || (e.type === 'in' ? 'Saved' : 'Spent'))}</span>
            <b class="${e.type === 'out' ? 'money-out' : 'money-in'}">${e.type === 'out' ? '−' : '+'}৳${Utils.num(e.amt).toLocaleString('en-IN')}</b>
            <button class="btn btn-icon btn-ghost danger" data-money-del="${Utils.esc(e.id)}" title="Delete entry">${icon('xmark')}</button>
          </div>`).join('')}
        ${sum.count ? '' : '<p class="muted small">No entries yet — add today\'s first one, it takes 10 seconds.</p>'}
      </div>`;

    /* wiring inside the (per-visit) card — no container-level stacking */
    const saveLog = async arr => {
      const val = JSON.stringify(arr);
      await API.saveSettings({ money_log: val });
      App.settings.money_log = val;
      this.renderMoney();
    };
    qs('#money-add-btn', card).addEventListener('click', async () => {
      const amt = Utils.num(qs('#money-amt', card).value);
      const type = qs('#money-type', card).value;
      const note = qs('#money-note', card).value.trim().slice(0, 60);
      if (amt <= 0) return toast('Enter an amount first.', 'warn');
      const arr = (() => { try { const a = JSON.parse(App.settings.money_log || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } })();
      arr.push({ id: Utils.uid(), date: Utils.today(), type: type, amt: amt, note: note });
      try {
        await saveLog(arr);
        toast(type === 'in' ? `💰 ৳${amt} saved — keep stacking!` : `🧾 ৳${amt} logged as spent.`, 'success');
      } catch (e) { App.handleError(e); }
    });
    card.addEventListener('click', e => {
      const del = e.target.closest('[data-money-del]');
      if (!del) return;
      const id = del.dataset.moneyDel;
      const arr = (() => { try { const a = JSON.parse(App.settings.money_log || '[]'); return Array.isArray(a) ? a : []; } catch (err) { return []; } })()
        .filter(x => x.id !== id);
      API.saveSettings({ money_log: JSON.stringify(arr) })
        .then(() => { App.settings.money_log = JSON.stringify(arr); this.renderMoney(); toast('Entry removed.', 'info'); })
        .catch(err => App.handleError(err));
    });
  },

  /** 📊 horizontal bars: focus minutes per goal for the selected window. */
  renderFocusChart() {
    if (typeof Chart === 'undefined') return;
    const rows = Analytics.goalFocusBreakdown(this.range).rows
      .map(r => ({ ...r, title: ((App.state.goals || []).find(g => g.id === r.goalId) || {}).title || '(deleted goal)' }));
    const hasAny = rows.length || Analytics.goalFocusBreakdown(this.range).unassigned > 0;
    const canvas = qs('#goal-focus-chart', App.container());
    if (!canvas) return;
    if (!hasAny) {
      canvas.parentElement.appendChild(el(`<div class="chart-empty">${icon('stopwatch')}<span>No focus time tagged to goals yet — pick a goal when starting the timer and your hours land here.</span></div>`));
      canvas.remove();
      return;
    }
    const labels = rows.map(r => r.title).concat(['Unassigned']);
    const data = rows.map(r => r.minutes).concat([Analytics.goalFocusBreakdown(this.range).unassigned]);
    const colors = rows.map(() => Charts.theme().primary).concat(['#64748b']);
    Charts.make('goal-focus-chart', {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 4 }] },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => Utils.fmtMinutes(ctx.raw) } } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } }
      }
    });
  },

  /** ⏱ Focus minutes logged toward this goal in the last `days` days
      (via Analytics.sessionGoalId — explicit goal tag beats task's goal). */
  goalFocusMinutes(goalId, days) {
    if (typeof Analytics === 'undefined' || !Analytics.goalFocusBreakdown) return 0;
    const row = Analytics.goalFocusBreakdown(days || 7).rows.find(r => r.goalId === goalId);
    return row ? row.minutes : 0;
  },

  renderList() {
    const list = qs('#goal-list', App.container());
    if (!list) return;
    const goals = App.state.goals || [];
    if (!goals.length) {
      list.innerHTML = '';
      list.appendChild(el(emptyState('bullseye', 'No goals yet',
        'Create your first goal to start tracking progress.',
        `<button class="btn btn-primary" data-act="new">${icon('plus')} Create goal</button>`)));
      return;
    }
    const roots = goals.filter(g => !g.parent_goal_id || !goals.some(x => x.id === g.parent_goal_id));
    list.innerHTML = roots.map(g => this.goalCard(g, 0)).join('');
  },

  goalCard(g, depth) {
    const goals = App.state.goals || [];
    const children = goals.filter(x => x.parent_goal_id === g.id)
      .sort((a, b) => String(a.target_date).localeCompare(String(b.target_date)));
    const prog = GoalProgress.auto(g);
    const daysLeft = g.target_date ? Utils.addDays(g.target_date, 1) && Math.round((Utils.parseDate(g.target_date) - Utils.parseDate(Utils.today())) / 86400000) : null;
    return `
      <div class="goal-block" data-id="${g.id}" style="margin-left:${depth * 18}px">
        <div class="card goal-card ${g.status === 'completed' ? 'is-done' : ''}">
          <div class="goal-head">
            <div>
              <div class="goal-title">${depth ? icon('corner-down-right', 'fa-xs muted') : icon('bullseye', 'fa-xs')} ${Utils.esc(g.title)}</div>
              <div class="task-meta">
                ${g.category ? chip(g.category, Utils.categoryColor(g.category)) : ''}
                ${chip(g.status || 'active', g.status === 'completed' ? '#10b981' : g.status === 'paused' ? '#64748b' : 'var(--c-primary)')}
                ${g.target_date ? chip(daysLeft !== null && daysLeft < 0 ? 'target passed' : daysLeft + ' days left', daysLeft !== null && daysLeft < 0 ? '#ef4444' : '#64748b') : ''}
              </div>
            </div>
            <div class="task-actions">
              <button class="btn btn-icon btn-ghost" data-goal-action="focus" title="Start a focus session for this goal">${icon('stopwatch')}</button>
              <button class="btn btn-icon btn-ghost" data-goal-action="add-task" title="Add linked task">${icon('plus')}</button>
              <button class="btn btn-icon btn-ghost" data-goal-action="add-sub" title="Add sub-goal">${icon('diagram-project')}</button>
              <button class="btn btn-icon btn-ghost" data-goal-action="sync" title="Sync progress from tasks">${icon('rotate')}</button>
              <button class="btn btn-icon btn-ghost" data-goal-action="edit" title="Edit">${icon('pencil')}</button>
              <button class="btn btn-icon btn-ghost danger" data-goal-action="delete" title="Delete">${icon('trash')}</button>
            </div>
          </div>
          ${g.description ? `<p class="muted goal-desc">${Utils.esc(g.description)}</p>` : ''}
          <div class="goal-progress-row">
            <div class="progress-bar big"><div class="progress-fill" style="width:${prog.pct}%"></div></div>
            <b class="goal-pct">${prog.pct}%</b>
          </div>
          <div class="muted goal-stats">
            ${(() => {
              const fm = this.goalFocusMinutes(g.id, this.range);
              return fm > 0
                ? `<span class="goal-focus-min">${icon('stopwatch', 'fa-xs')} <b>${Utils.fmtMinutes(fm)}</b> focus in last ${this.range}d</span> · `
                : '';
            })()}
            ${prog.hasTasks
              ? `Tasks: ${prog.completed} completed · ${prog.remaining} remaining · ${icon('rotate', 'fa-xs')} sync sets % from tasks`
              : `Manual progress — set it with ${icon('pencil', 'fa-xs')} edit`}
          </div>
          ${(() => {
            const p = GoalPace.pace(g);
            if (!p) return '';
            const verdict = p.state === 'ontrack'
              ? '<span style="color:var(--c-success,#10b981)">🎯 on track</span>'
              : p.state === 'slightly'
                ? '<span style="color:var(--c-warn,#f5c518)">⚠ slightly behind</span>'
                : '<span style="color:var(--c-danger)">⚠ behind pace</span>';
            return `<div class="muted small goal-pace">${icon('gauge-high')} Pace: expected ~${p.expected}% by now · you're at ${p.actual}% ${verdict} · need ~${p.needPerMonth}%/mo for ${p.monthsLeft} mo left</div>`;
          })()}
          ${(() => {
            const v = (typeof Analytics !== 'undefined' && Analytics.goalVelocity) ? Analytics.goalVelocity(g) : null;
            if (!v) return '';
            const basis = v.basis === 'minutes' ? `at your ${Utils.fmtMinutes(v.weeklyMinutes)}/wk pace` : v.basis === 'pace' ? 'at your target-date pace' : 'rough estimate';
            const eta = `${Utils.fmtDay(v.etaDate)} (~${v.weeksLeft} wk${v.weeksLeft > 1 ? 's' : ''} left ${basis})`;
            return v.late
              ? `<div class="muted small goal-velocity vel-late">${icon('rocket')} Velocity: at this pace you'd finish ~${eta} — ${v.daysLate}d past your target date.</div>`
              : `<div class="muted small goal-velocity">${icon('rocket')} Velocity: projected finish ~${eta}${g.target_date ? ' — before your target ✅' : ''}.</div>`;
          })()}
        </div>
        ${children.map(c => this.goalCard(c, depth + 1)).join('')}
      </div>`;
  },

  /** Smart planner: re-schedule pending goal-linked tasks across the next 7 days. */
  planWeek() {
    const goals = App.state.goals || [];
    const active = goals.filter(g => g.status === 'active');
    const byId = {};
    active.forEach(g => { byId[g.id] = g; });
    const rank = { high: 0, medium: 1, low: 2 };
    const candidates = (App.state.tasks || []).filter(t =>
      t.status !== 'completed' && t.goal_id && byId[t.goal_id] &&
      (!t.scheduled_date || t.scheduled_date < Utils.today()));

    if (!candidates.length) {
      return toast('Nothing to re-plan — create pending tasks linked to your active goals first.', 'info');
    }
    candidates.sort((a, b) => {
      const da = String((byId[a.goal_id] || {}).target_date || '9999');
      const db_ = String((byId[b.goal_id] || {}).target_date || '9999');
      return da.localeCompare(db_) || (rank[a.priority || 'medium'] - rank[b.priority || 'medium']);
    });
    const picked = candidates.slice(0, 10);

    // spread across the next 7 days, max 2 tasks per day
    const load = {};
    const plan = picked.map(t => {
      let date = null;
      for (let i = 1; i <= 7 && !date; i++) {
        const d = Utils.addDays(Utils.today(), i);
        if ((load[d] || 0) < 2) { date = d; load[d] = (load[d] || 0) + 1; }
      }
      return { task: t, date: date };
    });

    const m = openModal({
      title: icon('wand-magic-sparkles') + ' Plan my week',
      wide: true,
      body: `
        <p class="muted small">${plan.length} pending goal task(s) sorted by goal deadline and priority — scheduled over the next 7 days (max 2/day). Overdue and unscheduled tasks only; nothing else is touched.</p>
        <div class="plan-list">
          ${plan.map(p => `
            <div class="plan-row">
              <span class="plan-date">${Utils.fmtDay(p.date).slice(0, 3)} ${Utils.fmtDate(p.date).slice(0, 6)}</span>
              <span class="plan-title">${Utils.esc(p.task.title)}</span>
              <span class="muted small">🎯 ${Utils.esc((byId[p.task.goal_id] || {}).title || '')}</span>
            </div>`).join('')}
        </div>`,
      footer: `
        <button class="btn btn-ghost" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-apply>${icon('calendar-check')} Schedule ${plan.length} tasks</button>`
    });

    qs('[data-cancel]', m.overlay).addEventListener('click', m.close);
    qs('[data-apply]', m.overlay).addEventListener('click', async btn => {
      const applyBtn = qs('[data-apply]', m.overlay);
      applyBtn.disabled = true;
      let done = 0;
      for (const p of plan) {
        applyBtn.innerHTML = `${icon('spinner', 'fa-spin')} Scheduling ${done + 1}/${plan.length}…`;
        try {
          const rec = await API.updateTask(p.task.id, { scheduled_date: p.date });
          App.replaceRecord('tasks', rec);
          done++;
        } catch (e) { App.handleError(e); break; }
      }
      m.close();
      App.refreshCurrent();
      toast(done === plan.length ? `✅ ${done} tasks scheduled across your week!` : `Scheduled ${done}/${plan.length} — some failed, try again.`, done ? 'success' : 'error');
    });
  },

  async syncProgress(goal) {
    const tasks = (App.state.tasks || []).filter(t => t.goal_id === goal.id);
    if (!tasks.length) return toast('No tasks linked to this goal yet.', 'warn');
    const pct = Utils.pct(tasks.filter(t => t.status === 'completed').length, tasks.length);
    try {
      const rec = await API.updateGoal(goal.id, { progress: pct });
      App.replaceRecord('goals', rec);
      App.refreshCurrent();
      toast(`Progress set to ${pct}% (from linked tasks)`, 'success');
    } catch (e) { App.handleError(e); }
  },

  async remove(goal) {
    const children = (App.state.goals || []).filter(g => g.parent_goal_id === goal.id);
    const ok = await confirmDialog({
      title: 'Delete goal?',
      message: `Are you sure you want to delete "<b>${Utils.esc(goal.title)}</b>"?` +
        (children.length ? ` Its ${children.length} sub-goal(s) will become top-level goals.` : '') +
        ' Linked tasks stay but lose their goal connection.'
    });
    if (!ok) return;
    try {
      await API.deleteGoal(goal.id);
      App.state.goals = App.state.goals.filter(x => x.id !== goal.id);
      App.state.goals.forEach(g => { if (g.parent_goal_id === goal.id) g.parent_goal_id = ''; });
      (App.state.tasks || []).forEach(t => { if (t.goal_id === goal.id) t.goal_id = ''; });
      App.refreshCurrent();
      toast('Goal deleted', 'success');
    } catch (e) { App.handleError(e); }
  },

  openForm(existing, parentId) {
    const g = existing || {};
    const goals = (App.state.goals || []).filter(x => !existing || x.id !== existing.id);
    const m = openModal({
      title: existing ? 'Edit goal' : 'New goal',
      body: `
        <form id="goal-form">
          <label class="field"><span>Title *</span>
            <input name="title" required maxlength="200" value="${Utils.esc(g.title || '')}" placeholder="e.g. Web Security Mastery"></label>
          <label class="field"><span>Description</span>
            <textarea name="description" rows="2">${Utils.esc(g.description || '')}</textarea></label>
          <div class="field-row">
            <label class="field"><span>Category</span>
              <select name="category">${Options.get('taskCategories').map(c => `<option ${g.category === c ? 'selected' : ''}>${Utils.esc(c)}</option>`).join('')}</select></label>
            <label class="field"><span>Target date</span>
              <input type="date" name="target_date" value="${Utils.esc(g.target_date || '')}"></label>
          </div>
          <div class="field-row">
            <label class="field"><span>Progress ${existing ? '%' : '% (optional)'}</span>
              <input type="number" min="0" max="100" name="progress" value="${Utils.esc(g.progress != null ? g.progress : 0)}"></label>
            <label class="field"><span>Status</span>
              <select name="status">${CONFIG.GOAL_STATUSES.map(s => `<option value="${s}" ${(g.status || 'active') === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
          </div>
          <label class="field"><span>Parent goal (builds the hierarchy)</span>
            <select name="parent_goal_id"><option value="">— none (top level) —</option>
              ${goals.map(x => `<option value="${x.id}" ${g.parent_goal_id === x.id || (!existing && parentId === x.id) ? 'selected' : ''}>${Utils.esc(x.title)}</option>`).join('')}
            </select></label>
        </form>`,
      footer: `
        <button class="btn btn-ghost" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-save>${existing ? 'Save changes' : 'Create goal'}</button>`
    });
    qs('[data-cancel]', m.overlay).addEventListener('click', m.close);
    qs('[data-save]', m.overlay).addEventListener('click', () => {
      const form = qs('#goal-form', m.overlay);
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const data = {
        title: fd.get('title').trim(),
        description: fd.get('description'),
        category: fd.get('category'),
        target_date: fd.get('target_date') || '',
        progress: Utils.clamp(Utils.num(fd.get('progress')), 0, 100),
        status: fd.get('status'),
        parent_goal_id: fd.get('parent_goal_id')
      };
      const save = existing ? API.updateGoal(g.id, data) : API.createGoal(data);
      save.then(rec => {
        App.replaceRecord('goals', rec);
        m.close();
        App.refreshCurrent();
        toast(existing ? 'Goal updated' : 'Goal created', 'success');
      }).catch(e => App.handleError(e));
    });
  }
};
