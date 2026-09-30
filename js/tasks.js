/* ============================================================
   PersonalOS — Tasks (full CRUD, filters, complete/undo)
   ============================================================ */
'use strict';

const Tasks = {
  filter: { status: '', category: '', priority: '', goal: '', date: '', search: '' },
  showArchived: false,
  view: 'list',

  page(container) {
    const f = this.filter;
    const goals = App.state.goals || [];
    const archivedCount = (App.state.tasks || []).filter(t => t._archived).length;
    container.innerHTML = `
      <div class="page-head">
        <h2>Tasks</h2>
        <div class="tasks-head-actions">
          ${archivedCount ? `<button class="btn btn-sm ${this.showArchived ? 'btn-primary' : ''}" data-act="toggle-archived" title="Show/hide archived tasks">${icon('box-archive')} Archived (${archivedCount})</button>` : ''}
          <div class="seg">
            <button class="${this.view === 'list' ? 'on' : ''}" data-act="view-list" title="List view">${icon('list')} List</button>
            <button class="${this.view === 'projects' ? 'on' : ''}" data-act="view-projects" title="Group by project">${icon('folder-tree')} Projects</button>
          </div>
          <button class="btn btn-primary" data-act="new">${icon('plus')} New task</button>
        </div>
      </div>

      <div class="card filter-bar">
        <input type="search" id="tf-search" placeholder="Search tasks…" value="${Utils.esc(f.search)}">
        <select id="tf-status">
          <option value="">All statuses</option>
          ${CONFIG.TASK_STATUSES.map(s => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <select id="tf-category">
          <option value="">All categories</option>
          ${Options.get('taskCategories').map(c => `<option value="${Utils.esc(c)}" ${f.category === Utils.esc(c) ? 'selected' : ''}>${Utils.esc(c)}</option>`).join('')}
        </select>
        <select id="tf-priority">
          <option value="">All priorities</option>
          ${CONFIG.PRIORITIES.map(p => `<option value="${p}" ${f.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
        <select id="tf-goal">
          <option value="">All goals</option>
          ${goals.map(g => `<option value="${g.id}" ${f.goal === g.id ? 'selected' : ''}>${Utils.esc(g.title)}</option>`).join('')}
        </select>
        <select id="tf-date">
          <option value="">Any date</option>
          <option value="today" ${f.date === 'today' ? 'selected' : ''}>Today</option>
          <option value="week" ${f.date === 'week' ? 'selected' : ''}>This week</option>
          <option value="overdue" ${f.date === 'overdue' ? 'selected' : ''}>Overdue</option>
          <option value="none" ${f.date === 'none' ? 'selected' : ''}>No date</option>
        </select>
        ${Object.values(f).some(Boolean) ? `<button class="btn btn-ghost btn-sm" data-act="clear-filters">Clear</button>` : ''}
      </div>

      <div id="task-list" class="stack"></div>
    `;

    const rerender = Utils.debounce(() => this.readFilters() || this.renderList(), 200);
    qs('#tf-search', container).addEventListener('input', rerender);
    ['tf-status', 'tf-category', 'tf-priority', 'tf-goal', 'tf-date'].forEach(id => {
      qs('#' + id, container).addEventListener('change', () => { this.readFilters(); this.renderList(); });
    });
    container.onclick = e => {
      if (e.target.closest('[data-act="new"]')) return this.openForm();
      if (e.target.closest('[data-act="toggle-archived"]')) { this.showArchived = !this.showArchived; return this.page(container); }
      if (e.target.closest('[data-act="view-list"]')) { this.view = 'list'; return this.page(container); }
      if (e.target.closest('[data-act="view-projects"]')) { this.view = 'projects'; return this.page(container); }
      if (e.target.closest('[data-act="clear-filters"]')) {
        this.filter = { status: '', category: '', priority: '', goal: '', date: '', search: '' };
        return this.page(container);
      }
      const btn = e.target.closest('[data-task-action]');
      if (btn) this.handleCardAction(btn.dataset.taskAction, btn.closest('[data-id]').dataset.id);
    };

    this.renderCurrentView();
  },

  readFilters() {
    const c = App.container();
    const f = this.filter;
    f.search = qs('#tf-search', c) ? qs('#tf-search', c).value : f.search;
    f.status = qs('#tf-status', c) ? qs('#tf-status', c).value : f.status;
    f.category = qs('#tf-category', c) ? qs('#tf-category', c).value : f.category;
    f.priority = qs('#tf-priority', c) ? qs('#tf-priority', c).value : f.priority;
    f.goal = qs('#tf-goal', c) ? qs('#tf-goal', c).value : f.goal;
    f.date = qs('#tf-date', c) ? qs('#tf-date', c).value : f.date;
  },

  renderCurrentView() {
    if (this.view === 'projects') return this.renderProjects();
    this.renderList();
  },

  /** Project view: group the filtered tasks by their project tag. */
  renderProjects() {
    const list = qs('#task-list', App.container());
    if (!list) return;
    const items = this.filtered();
    if (!items.length) return this.renderList();

    const groups = {};
    items.forEach(t => {
      const key = t.project_id ? t.project_id : 'No project';
      (groups[key] = groups[key] || []).push(t);
    });
    const keys = Object.keys(groups).sort((a, b) => {
      if (a === 'No project') return 1;
      if (b === 'No project') return -1;
      return a.localeCompare(b);
    });

    list.innerHTML = keys.map(key => {
      const g = groups[key];
      const done = g.filter(t => t.status === 'completed').length;
      const pct = Utils.pct(done, g.length);
      return `
      <div class="project-group">
        <div class="project-head">
          <span class="project-name">${key === 'No project' ? icon('inbox') : icon('folder-open')} ${Utils.esc(key)}</span>
          <span class="muted small">${done}/${g.length} done</span>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          <b class="small">${pct}%</b>
        </div>
        <div class="stack" style="margin-top:8px">${g.map(t => this.taskCard(t)).join('')}</div>
      </div>`;
    }).join('');
  },

  filtered() {
    const f = this.filter, today = Utils.today(), weekStart = Utils.startOfWeek(today);
    return (App.state.tasks || []).filter(t => {
      if (this.showArchived ? !t._archived : t._archived) return false;
      if (f.status && t.status !== f.status) return false;
      if (f.category && t.category !== f.category) return false;
      if (f.priority && t.priority !== f.priority) return false;
      if (f.goal && t.goal_id !== f.goal) return false;
      if (f.date === 'today' && t.scheduled_date !== today) return false;
      if (f.date === 'week' && !(t.scheduled_date >= weekStart && t.scheduled_date <= Utils.addDays(weekStart, 6))) return false;
      if (f.date === 'overdue' && !(t.scheduled_date && t.scheduled_date < today && t.status !== 'completed')) return false;
      if (f.date === 'none' && t.scheduled_date) return false;
      if (f.search) {
        const hay = `${t.title} ${t.description} ${t.category} ${t.project_id}`.toLowerCase();
        if (!hay.includes(f.search.toLowerCase())) return false;
      }
      return true;
    }).sort((a, b) => {
      const r = { high: 0, medium: 1, low: 2 };
      const s = { pending: 0, 'in-progress': 1, completed: 2 };
      return (s[a.status] - s[b.status]) || (r[a.priority] - r[b.priority]) ||
             String(a.scheduled_date || '9999').localeCompare(String(b.scheduled_date || '9999'));
    });
  },

  renderList() {
    const list = qs('#task-list', App.container());
    if (!list) return;
    const items = this.filtered();
    if (!items.length) {
      list.innerHTML = '';
      const anyTasks = (App.state.tasks || []).length > 0;
      list.appendChild(el(anyTasks
        ? emptyState('magnifying-glass', 'No matching tasks', 'Try changing or clearing the filters above.')
        : emptyState('list-check', 'No tasks yet', 'Create your first task to start tracking your work.',
            `<button class="btn btn-primary" data-act="new">${icon('plus')} Create task</button>`)));
      return;
    }
    list.innerHTML = items.map(t => this.taskCard(t)).join('');
  },

  taskCard(t, isPriority) {
    const goal = (App.state.goals || []).find(g => g.id === t.goal_id);
    const overdue = t.scheduled_date && t.scheduled_date < Utils.today() && t.status !== 'completed';
    const done = t.status === 'completed';
    if (t._archived) {
      return `
      <div class="task-card card is-done" data-id="${t.id}">
        <button class="task-check checked" disabled>${icon('check')}</button>
        <div class="task-main">
          <div class="task-title">${Utils.esc(t.title)}</div>
          <div class="task-meta">
            ${chip('🗄 archived', '#64748b')}
            ${t.category ? chip(t.category, Utils.categoryColor(t.category)) : ''}
            ${t.completed_at ? chip('done ' + Utils.fmtDate(String(t.completed_at).slice(0, 10)), '#10b981') : ''}
          </div>
        </div>
        <div class="task-actions">
          <button class="btn btn-icon btn-ghost danger" data-task-action="delete" title="Delete forever">${icon('trash')}</button>
        </div>
      </div>`;
    }
    return `
      <div class="task-card card ${done ? 'is-done' : ''}" data-id="${t.id}">
        <button class="task-check ${done ? 'checked' : ''}" data-task-action="toggle" title="${done ? 'Undo completion' : 'Mark complete'}">
          ${icon(done ? 'check' : '')}
        </button>
        <div class="task-main">
          <div class="task-title">${Utils.esc(t.title)} ${isPriority ? chip('top priority', 'var(--c-primary)') : ''}</div>
          <div class="task-meta">
            ${t.category ? chip(t.category, Utils.categoryColor(t.category)) : ''}
            ${chip(t.priority || 'medium', Utils.priorityColor(t.priority))}
            ${t.status !== 'pending' ? chip(t.status, t.status === 'completed' ? '#10b981' : '#f59e0b') : ''}
            ${t.scheduled_date ? chip(overdue ? 'overdue' : Utils.fmtDate(t.scheduled_date), overdue ? '#ef4444' : '#64748b') : ''}
            ${t.estimated_minutes ? chip('est ' + Utils.fmtMinutes(t.estimated_minutes), '#64748b') : ''}
            ${t.actual_minutes ? chip('actual ' + Utils.fmtMinutes(t.actual_minutes), '#10b981') : ''}
            ${t.project_id ? chip('📂 ' + t.project_id, '#8b5cf6') : ''}
            ${goal ? chip('🎯 ' + goal.title, 'var(--c-primary)') : ''}
          </div>
        </div>
        <div class="task-actions">
          <button class="btn btn-icon btn-ghost" data-task-action="focus" title="Start focus session">${icon('play')}</button>
          <button class="btn btn-icon btn-ghost" data-task-action="priority" title="Change priority">${icon('flag')}</button>
          <button class="btn btn-icon btn-ghost" data-task-action="edit" title="Edit">${icon('pencil')}</button>
          <button class="btn btn-icon btn-ghost danger" data-task-action="delete" title="Delete">${icon('trash')}</button>
        </div>
      </div>`;
  },

  handleCardAction(action, id) {
    const t = (App.state.tasks || []).find(x => x.id === id);
    if (!t) return;
    if (action === 'toggle') return this.toggleComplete(t);
    if (action === 'edit') return this.openForm(t);
    if (action === 'delete') return this.remove(t);
    if (action === 'priority') return this.cyclePriority(t);
    if (action === 'focus') {
      Focus.presetTask = t.id;
      location.hash = '#/focus';
      toast('Focus page ready — task preselected.', 'info');
    }
  },

  async toggleComplete(t) {
    const completing = t.status !== 'completed';
    const patch = completing
      ? { status: 'completed', completed_at: Utils.nowISO() }
      : { status: 'pending', completed_at: '' };
    try {
      const rec = completing ? await API.updateTask(t.id, patch) : await API.updateTask(t.id, patch);
      App.replaceRecord('tasks', rec);
      App.refreshCurrent();
      toast(completing ? 'Task completed 🎉' : 'Completion undone', 'success');
    } catch (e) { App.handleError(e); }
  },

  async cyclePriority(t) {
    const order = ['low', 'medium', 'high'];
    const next = order[(order.indexOf(t.priority || 'medium') + 1) % 3];
    try {
      const rec = await API.updateTask(t.id, { priority: next });
      App.replaceRecord('tasks', rec);
      App.refreshCurrent();
    } catch (e) { App.handleError(e); }
  },

  async remove(t) {
    const ok = await confirmDialog({
      title: 'Delete task?',
      message: `Are you sure you want to delete "<b>${Utils.esc(t.title)}</b>"? This cannot be undone.`
    });
    if (!ok) return;
    try {
      await API.deleteTask(t.id);
      App.state.tasks = App.state.tasks.filter(x => x.id !== t.id);
      App.refreshCurrent();
      toast('Task deleted', 'success');
    } catch (e) { App.handleError(e); }
  },

  openForm(existing) {
    const t = existing || {};
    const goals = App.state.goals || [];
    const m = openModal({
      title: existing ? 'Edit task' : 'New task',
      body: `
        <form id="task-form">
          <label class="field"><span>Title *</span>
            <input name="title" required maxlength="200" value="${Utils.esc(t.title || '')}" placeholder="e.g. Complete PortSwigger SQLi labs"></label>
          <label class="field"><span>Description</span>
            <textarea name="description" rows="2" placeholder="Optional details…">${Utils.esc(t.description || '')}</textarea></label>
          <div class="field-row">
            <label class="field"><span>Category</span>
              <select name="category">${Options.get('taskCategories').map(c => `<option ${t.category === c ? 'selected' : ''}>${Utils.esc(c)}</option>`).join('')}</select></label>
            <label class="field"><span>Priority</span>
              <select name="priority">${CONFIG.PRIORITIES.map(p => `<option value="${p}" ${(t.priority || 'medium') === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
          </div>
          <div class="field-row">
            <label class="field"><span>Status</span>
              <select name="status">${CONFIG.TASK_STATUSES.map(s => `<option value="${s}" ${(t.status || 'pending') === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
            <label class="field"><span>Scheduled date</span>
              <input type="date" name="scheduled_date" value="${Utils.esc(t.scheduled_date || Utils.today())}"></label>
          </div>
          <div class="field-row">
            <label class="field"><span>Estimated minutes</span>
              <input type="number" min="0" step="5" name="estimated_minutes" value="${Utils.esc(t.estimated_minutes || '')}" placeholder="e.g. 90"></label>
            <label class="field"><span>Actual minutes</span>
              <input type="number" min="0" step="5" name="actual_minutes" value="${Utils.esc(t.actual_minutes || '')}" placeholder="filled when done"></label>
          </div>
          <div class="field-row">
            <label class="field"><span>Linked goal</span>
              <select name="goal_id"><option value="">— none —</option>
                ${goals.map(g => `<option value="${g.id}" ${t.goal_id === g.id ? 'selected' : ''}>${Utils.esc(g.title)}</option>`).join('')}
              </select></label>
            <label class="field"><span>Project (free text)</span>
              <input name="project_id" value="${Utils.esc(t.project_id || '')}" placeholder="e.g. pentest-report"></label>
          </div>
        </form>`,
      footer: `
        <button class="btn btn-ghost" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-save>${existing ? 'Save changes' : 'Create task'}</button>`
    });

    qs('[data-cancel]', m.overlay).addEventListener('click', m.close);
    qs('[data-save]', m.overlay).addEventListener('click', () => {
      const form = qs('#task-form', m.overlay);
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const data = {
        title: fd.get('title').trim(),
        description: fd.get('description'),
        category: fd.get('category'),
        priority: fd.get('priority'),
        status: fd.get('status'),
        scheduled_date: fd.get('scheduled_date') || '',
        estimated_minutes: fd.get('estimated_minutes') === '' ? '' : Utils.num(fd.get('estimated_minutes')),
        actual_minutes: fd.get('actual_minutes') === '' ? '' : Utils.num(fd.get('actual_minutes')),
        goal_id: fd.get('goal_id'),
        project_id: fd.get('project_id').trim()
      };
      if (data.status === 'completed' && !t.completed_at) data.completed_at = Utils.nowISO();
      if (data.status !== 'completed') data.completed_at = t.completed_at && data.status === 'completed' ? t.completed_at : '';

      const save = existing ? API.updateTask(t.id, data) : API.createTask(data);
      save.then(rec => {
        App.replaceRecord('tasks', rec);
        m.close();
        App.refreshCurrent();
        toast(existing ? 'Task updated' : 'Task created', 'success');
      }).catch(e => App.handleError(e));
    });
  }
};
