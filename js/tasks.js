/* ============================================================
   AluBhaiOS — Tasks (full CRUD, filters, complete/undo)
   ============================================================ */
'use strict';

const Tasks = {
  filter: { status: '', category: '', priority: '', goal: '', date: '', search: '' },
  showArchived: false,
  view: 'list',
  calY: null,
  calM: null,

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
            <button class="${this.view === 'matrix' ? 'on' : ''}" data-act="view-matrix" title="Eisenhower matrix — urgent × important">${icon('table-cells-large')} Matrix</button>
            <button class="${this.view === 'calendar' ? 'on' : ''}" data-act="view-calendar" title="Month calendar">${icon('calendar-days')} Calendar</button>
          </div>
          <button class="btn btn-sm" data-act="templates" title="Reusable task bundles">${icon('layer-group')} Templates</button>
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
      if (e.target.closest('[data-act="view-matrix"]')) { this.view = 'matrix'; return this.page(container); }
      if (e.target.closest('[data-act="view-calendar"]')) { this.view = 'calendar'; return this.page(container); }
      if (e.target.closest('[data-act="templates"]')) return this.openTemplates();
      if (e.target.closest('[data-act="clear-filters"]')) {
        this.filter = { status: '', category: '', priority: '', goal: '', date: '', search: '' };
        return this.page(container);
      }
      const chk = e.target.closest('[data-task-checklist]');
      if (chk) return this.toggleChecklist(chk.dataset.taskChecklist, Number(chk.dataset.idx));
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

  /** ✅ checklist inside a task — stored as [ ] / [x] lines in the
      description (zero schema change). Pure helpers + toggle. */
  parseChecklist(desc) {
    const plain = [], items = [];
    String(desc || '').split('\n').forEach(line => {
      const m = line.match(/^\s*\[( |x|X)\]\s*(.*)$/);
      if (m) items.push({ done: m[1].toLowerCase() === 'x', text: m[2] });
      else if (line.trim()) plain.push(line.trim());
    });
    return { plain, items };
  },
  toggleChecklistLine(desc, idx) {
    let n = -1;
    return String(desc || '').split('\n').map(line => {
      const m = line.match(/^(\s*)\[( |x|X)\](\s*)(.*)$/);
      if (!m) return line;
      n++;
      if (n !== idx) return line;
      return `${m[1]}[${m[2].toLowerCase() === 'x' ? ' ' : 'x'}]${m[4]}`;
    }).join('\n');
  },
  async toggleChecklist(taskId, idx) {
    const t = (App.state.tasks || []).find(x => x.id === taskId);
    if (!t) return;
    try {
      const rec = await API.updateTask(taskId, { description: this.toggleChecklistLine(t.description, idx) });
      App.replaceRecord('tasks', rec);
      App.refreshCurrent();
    } catch (e) { App.handleError(e); }
  },
  checklistHtml(t) {
    const { items } = this.parseChecklist(t.description);
    if (!items.length) return '';
    const doneN = items.filter(i => i.done).length;
    const rows = items.map((it, i) => `
      <label class="chk-row${it.done ? ' checked' : ''}">
        <input type="checkbox" data-task-checklist="${t.id}" data-idx="${i}" ${it.done ? 'checked' : ''}>
        <span>${Utils.esc(it.text)}</span>
      </label>`).join('');
    return `<div class="task-checklist"><div class="chk-progress muted small">☑ ${doneN}/${items.length} steps</div>${rows}</div>`;
  },

  /** 🗂 task templates — reusable bundles, stored in Settings JSON. */
  templates() {
    try { return JSON.parse(App.settings.task_templates || '[]'); } catch (e) { return []; }
  },
  parseTemplateLines(text) {
    return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const parts = line.split('|').map(p => p.trim());
      return {
        title: parts[0],
        priority: ['high', 'medium', 'low'].includes(parts[1]) ? parts[1] : 'medium',
        estimated_minutes: Utils.num(parts[2]) || ''
      };
    });
  },
  async saveTemplates(tpl) {
    App.settings.task_templates = JSON.stringify(tpl);
    await API.saveSettings({ task_templates: App.settings.task_templates });
  },
  openTemplates() {
    const tpl = this.templates();
    const m = openModal({
      title: icon('layer-group') + ' Task templates',
      body: `
        <div class="stack" id="tpl-list">
          ${tpl.length ? tpl.map(t => `
          <div class="card" style="padding:10px">
            <div class="task-meta"><b>${Utils.esc(t.name)}</b><span class="muted small">${t.items.length} tasks</span></div>
            <div class="muted small">${t.items.map(i => Utils.esc(i.title)).join(' · ')}</div>
            <div class="form-actions" style="margin:8px 0 0">
              <button class="btn btn-sm btn-primary" data-tpl-apply="${t.id}">${icon('rocket')} Create ${t.items.length} tasks today</button>
              <button class="btn btn-sm btn-ghost danger" data-tpl-del="${t.id}">${icon('trash')} Delete</button>
            </div>
          </div>`).join('') : '<p class="muted small">No templates yet — create one below (one task per line).</p>'}
        </div>
        <div class="section-subhead" style="margin-top:14px">New template</div>
        <form id="tpl-form">
          <label class="field"><span>Template name *</span>
            <input name="name" required maxlength="60" placeholder="e.g. CTF solve"></label>
          <label class="field"><span>Tasks — one per line (title | priority | minutes)</span>
            <textarea name="lines" rows="4" required placeholder="Enumerate machine | high | 45&#10;Write report | medium | 30"></textarea></label>
          <button class="btn btn-primary btn-sm" type="button" id="tpl-create">${icon('plus')} Save template</button>
        </form>`
    });
    m.overlay.onclick = e => {
      const apply = e.target.closest('[data-tpl-apply]');
      const del = e.target.closest('[data-tpl-del]');
      const create = e.target.closest('#tpl-create');
      if (apply) {
        const t = this.templates().find(x => x.id === apply.dataset.tplApply);
        if (!t) return;
        (async () => {
          for (const item of t.items) {
            try { const rec = await API.createTask({ title: item.title, priority: item.priority, estimated_minutes: item.estimated_minutes, scheduled_date: Utils.today(), status: 'pending' }); App.replaceRecord('tasks', rec); }
            catch (e) { App.handleError(e); return; }
          }
          m.close(); App.refreshCurrent();
          toast(`🚀 ${t.items.length} tasks created from "${t.name}"`, 'success');
        })();
      }
      if (del) {
        this.saveTemplates(this.templates().filter(x => x.id !== del.dataset.tplDel))
          .then(() => { m.close(); this.openTemplates(); });
      }
      if (create) {
        const form = qs('#tpl-form', m.overlay);
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        const items = this.parseTemplateLines(fd.get('lines'));
        if (!items.length) return toast('Add at least one task line.', 'warn');
        this.saveTemplates(this.templates().concat([{ id: Utils.uid(), name: fd.get('name').trim(), items }]))
          .then(() => { m.close(); this.openTemplates(); toast('Template saved', 'success'); })
          .catch(e => App.handleError(e));
      }
    };
  },

  renderCurrentView() {
    if (this.view === 'projects') return this.renderProjects();
    if (this.view === 'matrix') return this.renderMatrix();
    if (this.view === 'calendar') return this.renderCalendar();
    this.renderList();
  },

  /** 📅 month view helpers — pure date math (testable). */
  monthDates(y, m) {
    // array for one calendar month: null = leading blank, else 'YYYY-MM-DD'
    const startDow = (new Date(y, m, 1).getDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const out = [];
    for (let i = 0; i < startDow; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(`${y}-${Utils.pad(m + 1)}-${Utils.pad(d)}`);
    return out;
  },
  dayItems(date) {
    const tasks = (App.state.tasks || []).filter(t => !t._archived && String(t.scheduled_date || '').slice(0, 10) === date);
    const wd = Utils.weekdayShort(date);
    const routines = (App.state.routines || []).filter(r => r.enabled !== false && (typeof Routines !== 'undefined' ? Routines.coversDay(r, wd) : String(r.days || '') === 'Every day'));
    return { tasks, routines };
  },

  /** 📅 month calendar view — tasks + routine days on a real grid. */
  renderCalendar() {
    const list = qs('#task-list', App.container());
    if (!list) return;
    if (this.calY === null || this.calY === undefined) {
      const d = Utils.parseDate(Utils.today());
      this.calY = d.getFullYear(); this.calM = d.getMonth();
    }
    const today = Utils.today();
    const first = new Date(this.calY, this.calM, 1);
    const monthName = first.toLocaleString('en-us', { month: 'long' });
    const byDate = {};
    (App.state.tasks || []).forEach(t => {
      if (t._archived) return;
      const d = String(t.scheduled_date || '').slice(0, 10);
      if (d) (byDate[d] = byDate[d] || []).push(t);
    });

    const cells = this.monthDates(this.calY, this.calM).map(date => {
      if (!date) return '<div class="cal-cell blank"></div>';
      const wd = Utils.weekdayShort(date);
      const tasks = byDate[date] || [];
      const pend = tasks.filter(t => t.status !== 'completed');
      const doneN = tasks.length - pend.length;
      const rtN = (App.state.routines || []).filter(r => r.enabled !== false && (typeof Routines !== 'undefined' ? Routines.coversDay(r, wd) : String(r.days || '') === 'Every day')).length;
      const items = [];
      if (doneN) items.push(`<div class="cal-item done">✓ ${doneN} done</div>`);
      pend.slice(0, 2).forEach(t => items.push(`<div class="cal-item pending">${Utils.esc(t.title)}</div>`));
      if (rtN) items.push(`<div class="cal-item routine">⏰ ${rtN} routine${rtN > 1 ? 's' : ''}</div>`);
      const extra = tasks.length + rtN - items.length;
      if (extra > 0) items.push(`<div class="cal-item more">+${extra} more</div>`);
      return `
        <button type="button" class="cal-cell${date === today ? ' today' : ''}${tasks.length || rtN ? ' has-items' : ''}" data-cal-day="${date}" title="Open ${date}">
          <span class="cal-daynum">${Number(date.slice(8))}</span>
          ${items.join('')}
        </button>`;
    }).join('');

    list.innerHTML = `
      <div class="card cal-head">
        <button class="btn btn-icon btn-ghost" data-cal-nav="prev" title="Previous month">${icon('chevron-left')}</button>
        <b>${monthName} ${this.calY}</b>
        <button class="btn btn-icon btn-ghost" data-cal-nav="next" title="Next month">${icon('chevron-right')}</button>
        <button class="btn btn-ghost btn-sm" data-cal-nav="today">Today</button>
      </div>
      <div class="cal-weekdays">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(w => `<span>${w}</span>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
      <p class="muted small" style="margin-top:10px">Tap a day to see its tasks and routines · ✓ = completed · ⏰ = routine day.</p>`;

    list.onclick = e => {
      const nav = e.target.closest('[data-cal-nav]');
      if (nav) {
        if (nav.dataset.calNav === 'today') { const d = Utils.parseDate(today); this.calY = d.getFullYear(); this.calM = d.getMonth(); }
        else if (nav.dataset.calNav === 'prev') { this.calM--; if (this.calM < 0) { this.calM = 11; this.calY--; } }
        else { this.calM++; if (this.calM > 11) { this.calM = 0; this.calY++; } }
        return this.renderCalendar();
      }
      const dayBtn = e.target.closest('[data-cal-day]');
      if (dayBtn) return this.showDayModal(dayBtn.dataset.calDay);
    };
  },

  showDayModal(date) {
    const { tasks, routines } = this.dayItems(date);
    const doneN = tasks.filter(t => t.status === 'completed').length;
    openModal({
      title: icon('calendar-days') + ' ' + Utils.fmtDay(date),
      body: `
        <div class="stack">
          <div class="section-subhead">Routines</div>
          ${routines.length ? routines.map(r => `<div class="muted">⏰ ${Utils.esc(r.target_time || '')} — ${Utils.esc(r.title)}</div>`).join('') : '<p class="muted small">None on this day.</p>'}
          <div class="section-subhead">Tasks (${doneN}/${tasks.length} done)</div>
          ${tasks.length ? tasks.map(t => `<div class="muted">${t.status === 'completed' ? '✓' : '○'} ${Utils.esc(t.title)} ${chip(t.priority || 'medium', Utils.priorityColor(t.priority))}</div>`).join('') : '<p class="muted small">No tasks on this day.</p>'}
        </div>`
    });
  },

  /** 📊 Eisenhower matrix — pending tasks split on urgent (due ≤ tomorrow,
      incl. overdue) × important (high priority). Pure classification +
      2×2 grid; tapping a task opens its edit form. */
  matrixQuadrants() {
    const today = Utils.today();
    const tomorrow = Utils.addDays(today, 1);
    const items = this.filtered().filter(t => t.status !== 'completed');
    const isUrgent = t => !!t.scheduled_date && t.scheduled_date <= tomorrow;
    const isImp = t => (t.priority || 'medium') === 'high';
    const q = { q1: [], q2: [], q3: [], q4: [] };
    items.forEach(t => {
      const u = isUrgent(t), i = isImp(t);
      if (u && i) q.q1.push(t);
      else if (i) q.q2.push(t);
      else if (u) q.q3.push(t);
      else q.q4.push(t);
    });
    return q;
  },

  renderMatrix() {
    const list = qs('#task-list', App.container());
    if (!list) return;
    const q = this.matrixQuadrants();
    const box = (title, sub, arr, color, ic) => `
      <div class="matrix-box" style="--mq:${color}">
        <div class="matrix-head"><b>${ic} ${title}</b><span class="matrix-count">${arr.length}</span></div>
        <div class="muted small" style="margin:2px 0 6px">${sub}</div>
        ${arr.length ? arr.map(t => `
          <button type="button" class="matrix-item" data-matrix-task="${t.id}" title="Open task">
            <span class="mi-title">${Utils.esc(t.title)}</span>
            <span class="muted small">${t.scheduled_date ? Utils.fmtDate(t.scheduled_date) : 'no date'}</span>
          </button>`).join('') : '<p class="muted small" style="margin:4px 0 0">— empty —</p>'}
      </div>`;
    list.innerHTML = `
      <div class="matrix-grid">
        ${box('DO NOW', 'urgent + important', q.q1, '#ef4444', icon('fire'))}
        ${box('SCHEDULE', 'important, not urgent', q.q2, '#6366f1', icon('calendar-days'))}
        ${box('QUICK WINS', 'urgent, less important', q.q3, '#f5c518', icon('bolt'))}
        ${box('LATER / DROP', 'neither urgent nor important', q.q4, '#64748b', icon('hourglass'))}
      </div>
      <p class="muted small" style="margin-top:10px">Urgent = due today, tomorrow or overdue · Important = high priority. Tap a task to edit it.</p>`;
    list.onclick = e => {
      const b = e.target.closest('[data-matrix-task]');
      if (!b) return;
      const t = (App.state.tasks || []).find(x => x.id === b.dataset.matrixTask);
      if (t) this.openForm(t);
    };
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
      // routine markers get their real routine name as the group label
      const label = key.startsWith('routine:')
        ? '⏰ ' + (((App.state.routines || []).find(r => r.id === key.slice(8)) || {}).title || 'routine')
        : key;
      const labelIcon = key === 'No project' ? icon('inbox') : key.startsWith('routine:') ? icon('clock-rotate-left') : icon('folder-open');
      return `
      <div class="project-group">
        <div class="project-head">
          <span class="project-name">${labelIcon} ${Utils.esc(label)}</span>
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
            ${(!done && Utils.num(t.estimated_minutes) > 0 && Utils.num(t.estimated_minutes) <= 5) ? chip('⚡ quick win', '#10b981') : ''}
            ${t.category ? chip(t.category, Utils.categoryColor(t.category)) : ''}
            ${chip(t.priority || 'medium', Utils.priorityColor(t.priority))}
            ${t.status !== 'pending' ? chip(t.status, t.status === 'completed' ? '#10b981' : '#f59e0b') : ''}
            ${t.scheduled_date ? chip(overdue ? 'overdue' : Utils.fmtDate(t.scheduled_date), overdue ? '#ef4444' : '#64748b') : ''}
            ${t.estimated_minutes ? chip('est ' + Utils.fmtMinutes(t.estimated_minutes), '#64748b') : ''}
            ${t.actual_minutes ? chip('actual ' + Utils.fmtMinutes(t.actual_minutes), '#10b981') : ''}
            ${(() => {
              if (!t.project_id) return '';
              // auto routine tasks: show the routine's NAME, never the raw marker id
              if (t.project_id.startsWith('routine:')) {
                const rt = (App.state.routines || []).find(r => r.id === t.project_id.slice(8));
                return rt ? chip('⏰ ' + rt.title, '#0ea5e9') : chip('⏰ routine', '#8b5cf6');
              }
              return chip('📂 ' + t.project_id, '#8b5cf6');
            })()}
            ${goal ? chip('🎯 ' + goal.title, 'var(--c-primary)') : ''}
          </div>
          ${this.checklistHtml(t)}
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
