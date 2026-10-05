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
  page(container) {
    const goals = App.state.goals || [];
    container.innerHTML = `
      <div class="page-head">
        <div>
          <h2>Goals</h2>
          <button class="btn btn-sm plan-btn" data-act="plan-week" title="Auto-schedule goal tasks across the next 7 days">${icon('wand-magic-sparkles')} Plan my week</button>
        </div>
        <button class="btn btn-primary" data-act="new">${icon('plus')} New goal</button>
      </div>
      <div id="goal-list" class="stack"></div>
    `;
    container.onclick = e => {
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
    };
    this.renderList();
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
