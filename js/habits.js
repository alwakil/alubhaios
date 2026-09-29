/* ============================================================
   PersonalOS — Habits (streaks computed from HabitLogs so edits
   and deletes never corrupt historical records)
   ============================================================ */
'use strict';

const Habits = {
  page(container) {
    container.innerHTML = `
      <div class="page-head">
        <h2>Habits</h2>
        <button class="btn btn-primary" data-act="new">${icon('plus')} New habit</button>
      </div>
      <div id="habit-list" class="stack"></div>
    `;
    container.onclick = e => {
      if (e.target.closest('[data-act="new"]')) return this.openForm();
      const freezeBtn = e.target.closest('[data-habit-freeze]');
      if (freezeBtn) return this.useFreeze(freezeBtn.dataset.habitFreeze);
      const toggle = e.target.closest('[data-habit-toggle]');
      if (toggle) return this.toggleToday(toggle.dataset.habitToggle);
      const btn = e.target.closest('[data-habit-action]');
      if (!btn) return;
      const h = (App.state.habits || []).find(x => x.id === btn.closest('[data-id]').dataset.id);
      if (!h) return;
      const act = btn.dataset.habitAction;
      if (act === 'edit') this.openForm(h);
      if (act === 'delete') this.remove(h);
      if (act === 'enable') {
        API.updateHabit(h.id, { enabled: h.enabled === false })
          .then(rec => { App.replaceRecord('habits', rec); App.refreshCurrent(); })
          .catch(e2 => App.handleError(e2));
      }
    };
    this.renderList();
  },

  renderList() {
    const list = qs('#habit-list', App.container());
    if (!list) return;
    const habits = App.state.habits || [];
    if (!habits.length) {
      list.innerHTML = '';
      list.appendChild(el(emptyState('fire', 'No habits yet',
        'Track the small things you repeat daily: study, exercise, reading…',
        `<button class="btn btn-primary" data-act="new">${icon('plus')} Create habit</button>`)));
      return;
    }
    list.innerHTML = habits.map(h => {
      const st = Analytics.habitStreaks(h.id);
      const pct30 = Analytics.habitPctDays(h.id, 30);
      const doneToday = Analytics.habitDates(h.id).has(Utils.today());
      const canFreeze = !doneToday && st.current > 0 && Gamify.heldFreezes() > 0;
      return `
      <div class="card habit-card ${h.enabled === false ? 'is-disabled' : ''}" data-id="${h.id}">
        <div class="habit-head">
          <div class="habit-title">${icon('fire', 'fa-xs fire-ic')} ${Utils.esc(h.title)}</div>
          <div class="task-meta">
            ${chip(h.frequency || 'daily', '#8b5cf6')}
            ${h.target ? chip('target ' + h.target + '/period', '#64748b') : ''}
            ${h.enabled === false ? chip('disabled', '#64748b') : ''}
          </div>
          <div class="task-actions">
            <button class="btn btn-icon btn-ghost" data-habit-action="enable" title="${h.enabled === false ? 'Enable' : 'Disable'}">${icon(h.enabled === false ? 'toggle-off' : 'toggle-on')}</button>
            <button class="btn btn-icon btn-ghost" data-habit-action="edit" title="Edit">${icon('pencil')}</button>
            <button class="btn btn-icon btn-ghost danger" data-habit-action="delete" title="Delete">${icon('trash')}</button>
          </div>
        </div>
        <div class="habit-stats">
          <div><b>🔥 ${st.current}</b><span>current streak</span></div>
          <div><b>🏆 ${st.best}</b><span>best streak</span></div>
          <div><b>${pct30}%</b><span>last 30 days</span></div>
          <button class="btn ${doneToday ? 'btn-success' : 'btn-primary'} habit-done-btn" data-habit-toggle="${h.id}">
            ${icon(doneToday ? 'check' : 'plus')} ${doneToday ? 'Done today' : 'Mark done'}
          </button>
        </div>
        ${canFreeze ? `
        <div class="freeze-row">
          <span class="muted small">${icon('snowflake')} Streak at risk? Use a freeze (you have ${Gamify.heldFreezes()}) to keep it alive.</span>
          <button class="btn btn-sm freeze-btn" data-habit-freeze="${h.id}">${icon('snowflake')} Use freeze</button>
        </div>` : ''}
        <div class="heatmap-wrap">
          <div class="heatmap-label muted small">Last 10 weeks</div>
          <div class="heatmap">${this.heatmap(h.id)}</div>
        </div>
      </div>`;
    }).join('');
  },

  /** GitHub-style calendar heatmap: 10 columns (weeks) x 7 rows (Mon..Sun). */
  heatmap(habitId) {
    const set = Analytics.habitDates(habitId);
    const today = Utils.today();
    const todayIdx = (Utils.parseDate(today).getDay() + 6) % 7; // 0=Mon
    const cells = [];
    // start = Monday, 9 full weeks + current week
    const start = Utils.addDays(today, -(9 * 7 + todayIdx));
    for (let w = 0; w < 10; w++) {
      for (let d = 0; d < 7; d++) {
        const date = Utils.addDays(start, w * 7 + d);
        const future = date > today;
        const done = set.has(date);
        cells.push(`<div class="hm-cell ${done ? 'on' : ''} ${future ? 'future' : ''} ${date === today ? 'today' : ''}"
          title="${Utils.fmtDate(date)}${done ? ' — done' : ''}"></div>`);
      }
    }
    return cells.join('');
  },

  async toggleToday(habitId) {
    const h = (App.state.habits || []).find(x => x.id === habitId);
    if (!h) return;
    const done = Analytics.habitDates(habitId).has(Utils.today());
    try {
      const res = await API.setHabitLog(habitId, Utils.today(), !done);
      if (res && res.log) {
        const logs = App.state.habitLogs || [];
        const i = logs.findIndex(l => l.id === res.log.id);
        if (i > -1) logs[i] = res.log; else logs.push(res.log);
      }
      if (res && res.habit) App.replaceRecord('habits', res.habit);
      App.refreshCurrent();
      if (!done) Gamify.checkFreezeAward(); // 7-day streak milestones earn a freeze
      toast(!done ? `${h.title} — done! 🔥` : `${h.title} marked as not done`, 'success');
    } catch (e) { App.handleError(e); }
  },

  async useFreeze(habitId) {
    const h = (App.state.habits || []).find(x => x.id === habitId);
    if (!h) return;
    const ok = await confirmDialog({
      title: 'Use a streak freeze?',
      message: `One freeze (❄️) will be spent to keep "<b>${Utils.esc(h.title)}</b>"'s ${Analytics.habitStreaks(habitId).current}-day streak alive. You hold ${Gamify.heldFreezes()} freeze(s).`,
      confirmText: 'Use freeze',
      danger: false
    });
    if (!ok) return;
    if (await Gamify.useFreeze(habitId)) App.refreshCurrent();
  },

  async remove(h) {
    const ok = await confirmDialog({
      title: 'Delete habit?',
      message: `Are you sure you want to delete "<b>${Utils.esc(h.title)}</b>"?` +
        ' Its full completion history (logs) will be deleted too. This cannot be undone.'
    });
    if (!ok) return;
    try {
      await API.deleteHabit(h.id);
      App.state.habits = App.state.habits.filter(x => x.id !== h.id);
      App.state.habitLogs = (App.state.habitLogs || []).filter(l => l.habit_id !== h.id);
      App.refreshCurrent();
      toast('Habit deleted', 'success');
    } catch (e) { App.handleError(e); }
  },

  openForm(existing) {
    const h = existing || {};
    const m = openModal({
      title: existing ? 'Edit habit' : 'New habit',
      body: `
        <form id="habit-form">
          <label class="field"><span>Title *</span>
            <input name="title" required maxlength="200" value="${Utils.esc(h.title || '')}" placeholder="e.g. Study security"></label>
          <div class="field-row">
            <label class="field"><span>Frequency</span>
              <select name="frequency">
                ${['daily', 'weekdays', 'weekly'].map(f => `<option ${h.frequency === f ? 'selected' : ''}>${f}</option>`).join('')}
              </select></label>
            <label class="field"><span>Target (per period)</span>
              <input type="number" min="1" name="target" value="${Utils.esc(h.target || 1)}"></label>
          </div>
          <p class="muted small">Editing a habit never breaks its history — streaks are always recalculated from the completion logs.</p>
        </form>`,
      footer: `
        <button class="btn btn-ghost" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-save>${existing ? 'Save changes' : 'Create habit'}</button>`
    });
    qs('[data-cancel]', m.overlay).addEventListener('click', m.close);
    qs('[data-save]', m.overlay).addEventListener('click', () => {
      const form = qs('#habit-form', m.overlay);
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const data = {
        title: fd.get('title').trim(),
        frequency: fd.get('frequency'),
        target: Utils.num(fd.get('target')) || 1
      };
      const save = existing ? API.updateHabit(h.id, data) : API.createHabit(data);
      save.then(rec => {
        App.replaceRecord('habits', rec);
        m.close();
        App.refreshCurrent();
        toast(existing ? 'Habit updated' : 'Habit created', 'success');
      }).catch(e => App.handleError(e));
    });
  }
};
