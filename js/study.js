/* ============================================================
   PersonalOS — Study tracker
   Tab 1: Study Modules — Writeup reading / HTB modules /
          PortSwigger modules / Other, with unit progress.
   Tab 2: CTF Tracker — challenges with platform, category,
          difficulty and solved status.
   Backend: StudyModules + Challenges sheets (v1.3 actions).
   ============================================================ */
'use strict';

const Study = {
  tab: 'modules',          // 'modules' | 'ctf'
  typeFilter: 'All',       // modules tab
  ctfFilter: 'all',        // ctf tab: all | solved | unsolved

  TYPES: [
    { key: 'Writeup',      label: '📝 Writeup Reading',      color: '#8a97a8' },
    { key: 'HTB Module',   label: '🔴 HTB Module',           color: '#22c55e' },
    { key: 'PortSwigger',  label: '🟠 PortSwigger Module',   color: '#f97316' },
    { key: 'Other',        label: '➕ Other',                color: '#8b5cf6' }
  ],

  typeColor(type) {
    const t = this.TYPES.find(x => x.key === type);
    return t ? t.color : '#64748b';
  },

  diffColor(d) {
    return { easy: '#22c55e', medium: '#f59e0b', hard: '#ef4444', insane: '#a855f7' }[String(d).toLowerCase()] || '#64748b';
  },

  /* ================= page ================= */
  page(container) {
    container.innerHTML = `
      <div class="page-head">
        <div>
          <h2>Study</h2>
          <p class="muted small">Modules, writeups and CTF challenges — your learning progress in one place.</p>
        </div>
      </div>
      <div class="tabs" id="study-tabs">
        <button class="tab ${this.tab === 'modules' ? 'active' : ''}" data-stab="modules">${icon('graduation-cap')} Study modules</button>
        <button class="tab ${this.tab === 'ctf' ? 'active' : ''}" data-stab="ctf">${icon('flag')} CTF tracker</button>
      </div>
      <div id="study-body"></div>
    `;

    container.onclick = e => {
      const stab = e.target.closest('[data-stab]');
      if (stab) { this.tab = stab.dataset.stab; return this.page(container); }
      this.handleAction(e);
    };

    if (this.tab === 'modules') this.renderModules(qs('#study-body', container));
    else this.renderCtf(qs('#study-body', container));
  },

  /* ================= Study modules ================= */
  renderModules(container) {
    const mods = App.state.studyModules || [];
    const total = mods.length;
    const done = mods.filter(m => m.status === 'completed').length;

    container.innerHTML = `
      <div class="fb-head-stats" style="margin-bottom:12px">
        <span class="chip" style="--chip-c:#10b981">${icon('circle-check')} Completed <b>${done}/${total}</b></span>
        ${this.TYPES.map(t => {
          const n = mods.filter(m => m.type === t.key).length;
          return n ? `<span class="chip" style="--chip-c:${t.color}">${Utils.esc(t.label)} <b>${n}</b></span>` : '';
        }).join('')}
      </div>
      <div class="tabs" id="module-type-tabs">
        ${['All'].concat(this.TYPES.map(t => t.key)).map(k =>
          `<button class="tab ${this.typeFilter === k ? 'active' : ''}" data-mtype="${k}">${k === 'All' ? 'All' : k}</button>`).join('')}
        <span class="topbar-spacer"></span>
        <button class="btn btn-primary btn-sm" data-study-act="new-module">${icon('plus')} New module</button>
      </div>
      <div id="module-list" class="stack"></div>
    `;

    container.querySelectorAll('[data-mtype]').forEach(b => b.addEventListener('click', () => {
      this.typeFilter = b.dataset.mtype;
      this.renderModules(container);
    }));

    const list = qs('#module-list', container);
    const filtered = mods
      .filter(m => this.typeFilter === 'All' || m.type === this.typeFilter)
      .sort((a, b) => {
        const ac = a.status === 'completed' ? 1 : 0;
        const bc = b.status === 'completed' ? 1 : 0;
        return (ac - bc) || (Utils.pct(Utils.num(b.done_units), Utils.num(b.total_units)) - Utils.pct(Utils.num(a.done_units), Utils.num(a.total_units)));
      });

    if (!filtered.length) {
      list.innerHTML = '';
      list.appendChild(el(emptyState('graduation-cap',
        (App.state.studyModules || []).length ? 'No modules of this type' : 'No study modules yet',
        'Track writeups, HTB and PortSwigger modules with unit-by-unit progress.',
        `<button class="btn btn-primary" data-study-act="new-module">${icon('plus')} Add your first module</button>`)));
      return;
    }

    list.innerHTML = filtered.map(m => {
      const totalU = Math.max(1, Utils.num(m.total_units) || 1);
      const doneU = Utils.clamp(Utils.num(m.done_units), 0, totalU);
      const pct = Utils.pct(doneU, totalU);
      const completed = m.status === 'completed' || doneU >= totalU;
      return `
      <div class="card module-card ${completed ? 'is-done' : ''}" data-id="${m.id}">
        <div class="task-main">
          <div class="task-title">
            <span class="chip" style="--chip-c:${this.typeColor(m.type)}">${Utils.esc(m.type)}</span>
            ${Utils.esc(m.title)}
            ${completed ? chip('completed', '#10b981') : ''}
          </div>
          <div class="goal-progress-row" style="margin-top:8px">
            <div class="progress-bar big"><div class="progress-fill" style="width:${pct}%"></div></div>
            <b class="goal-pct">${pct}%</b>
          </div>
          <div class="muted small" style="margin-top:4px">${doneU} / ${totalU} units${m.notes ? ' · ' + Utils.esc(m.notes) : ''}</div>
        </div>
        <div class="task-actions">
          ${m.link ? `<a class="btn btn-icon btn-ghost" href="${Utils.esc(m.link)}" target="_blank" rel="noopener" title="Open link">${icon('arrow-up-right-from-square')}</a>` : ''}
          <button class="btn btn-sm" data-study-act="inc" title="+1 unit">${icon('plus')}</button>
          <button class="btn btn-icon btn-ghost" data-study-act="edit" title="Edit">${icon('pencil')}</button>
          <button class="btn btn-icon btn-ghost danger" data-study-act="delete" title="Delete">${icon('trash')}</button>
        </div>
      </div>`;
    }).join('');
  },

  openModuleForm(existing) {
    const m = existing || {};
    const typeOptions = this.TYPES.map(t => `<option value="${t.key}" ${m.type === t.key ? 'selected' : ''}>${t.label}</option>`).join('');
    const mod = openModal({
      title: existing ? 'Edit study module' : 'New study module',
      body: `
        <form id="module-form">
          <label class="field"><span>Title *</span>
            <input name="title" required maxlength="200" value="${Utils.esc(m.title || '')}" placeholder="e.g. Authentication — lab 3"></label>
          <div class="field-row">
            <label class="field"><span>Type</span>
              <select name="type">${typeOptions}</select></label>
            <label class="field"><span>Status</span>
              <select name="status">
                ${['active', 'completed', 'paused'].map(s => `<option value="${s}" ${(m.status || 'active') === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select></label>
          </div>
          <div class="field-row">
            <label class="field"><span>Total units</span>
              <input type="number" name="total_units" min="1" value="${Utils.esc(m.total_units || 10)}"></label>
            <label class="field"><span>Done units</span>
              <input type="number" name="done_units" min="0" value="${Utils.esc(m.done_units || 0)}"></label>
          </div>
          <label class="field"><span>Link (optional)</span>
            <input name="link" type="url" value="${Utils.esc(m.link || '')}" placeholder="https://…"></label>
          <label class="field"><span>Notes</span>
            <textarea name="notes" rows="2">${Utils.esc(m.notes || '')}</textarea></label>
        </form>`,
      footer: `
        <button class="btn btn-ghost" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-save>${existing ? 'Save changes' : 'Create module'}</button>`
    });

    qs('[data-cancel]', mod.overlay).addEventListener('click', mod.close);
    qs('[data-save]', mod.overlay).addEventListener('click', () => {
      const form = qs('#module-form', mod.overlay);
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const data = {
        title: fd.get('title').trim(),
        type: fd.get('type'),
        status: fd.get('status'),
        total_units: Math.max(1, Utils.num(fd.get('total_units')) || 1),
        done_units: Utils.clamp(Utils.num(fd.get('done_units')), 0, 999),
        link: fd.get('link').trim(),
        notes: fd.get('notes')
      };
      if (data.done_units >= data.total_units) data.status = 'completed';
      const save = existing ? API.updateStudyModule(m.id, data) : API.createStudyModule(data);
      save.then(rec => {
        App.replaceRecord('studyModules', rec);
        mod.close();
        App.refreshCurrent();
        toast(existing ? 'Module updated' : 'Module added 📚', 'success');
      }).catch(e => App.handleError(e));
    });
  },

  async incrementModule(id) {
    const m = (App.state.studyModules || []).find(x => x.id === id);
    if (!m) return;
    const totalU = Math.max(1, Utils.num(m.total_units) || 1);
    const next = Utils.clamp(Utils.num(m.done_units) + 1, 0, totalU);
    const patch = { done_units: next };
    if (next >= totalU) patch.status = 'completed';
    try {
      const rec = await API.updateStudyModule(id, patch);
      App.replaceRecord('studyModules', rec);
      App.refreshCurrent();
      if (patch.status === 'completed') toast('🎉 Module completed — brilliant!', 'success');
    } catch (e) { App.handleError(e); }
  },

  /* ================= CTF tracker ================= */
  renderCtf(container) {
    const chs = App.state.challenges || [];
    const solved = chs.filter(c => c.status === 'solved');
    const platforms = [...new Set(chs.map(c => c.platform).filter(Boolean))];

    container.innerHTML = `
      <div class="fb-head-stats" style="margin-bottom:12px">
        <span class="chip" style="--chip-c:#10b981">${icon('flag-checkered')} Solved <b>${solved.length}/${chs.length}</b></span>
        ${['Easy', 'Medium', 'Hard', 'Insane'].map(d => {
          const n = solved.filter(c => String(c.difficulty).toLowerCase() === d.toLowerCase()).length;
          return n ? `<span class="chip" style="--chip-c:${this.diffColor(d)}">${d} <b>${n}</b></span>` : '';
        }).join('')}
      </div>
      <div class="tabs" id="ctf-tabs">
        ${[['all', 'All'], ['solved', 'Solved'], ['unsolved', 'Unsolved']].map(([k, l]) =>
          `<button class="tab ${this.ctfFilter === k ? 'active' : ''}" data-cfilter="${k}">${l}</button>`).join('')}
        ${platforms.length ? `<select id="ctf-platform" class="btn btn-sm" style="width:auto">
          <option value="">All platforms</option>
          ${platforms.map(p => `<option>${Utils.esc(p)}</option>`).join('')}
        </select>` : ''}
        <span class="topbar-spacer"></span>
        <button class="btn btn-primary btn-sm" data-study-act="new-challenge">${icon('plus')} Log challenge</button>
      </div>
      <div id="ctf-list" class="stack"></div>
    `;

    container.querySelectorAll('[data-cfilter]').forEach(b => b.addEventListener('click', () => {
      this.ctfFilter = b.dataset.cfilter;
      this.renderCtf(container);
    }));
    const platSel = qs('#ctf-platform', container);
    if (platSel) platSel.addEventListener('change', () => this.renderCtfList());

    this.renderCtfList();
  },

  renderCtfList() {
    const list = qs('#ctf-list', App.container());
    if (!list) return;
    const platSel = qs('#ctf-platform', App.container());
    const plat = platSel ? platSel.value : '';
    const chs = (App.state.challenges || [])
      .filter(c => this.ctfFilter === 'all' || c.status === this.ctfFilter)
      .filter(c => !plat || c.platform === plat)
      .sort((a, b) => {
        const as = a.status === 'solved' ? 1 : 0;
        const bs = b.status === 'solved' ? 1 : 0;
        return (as - bs) || String(b.solved_date || '').localeCompare(String(a.solved_date || ''));
      });

    if (!chs.length) {
      list.innerHTML = '';
      list.appendChild(el(emptyState('flag', 'No challenges here',
        (App.state.challenges || []).length ? 'Try another filter.' : 'Log your first CTF challenge and start the collection.',
        `<button class="btn btn-primary" data-study-act="new-challenge">${icon('plus')} Log challenge</button>`)));
      return;
    }

    list.innerHTML = chs.map(c => {
      const solvedC = c.status === 'solved';
      return `
      <div class="card challenge-card ${solvedC ? 'is-done' : ''}" data-id="${c.id}">
        <div class="task-main">
          <div class="task-title">
            ${solvedC ? icon('flag-checkered', 'fa-xs ctf-solved') : icon('circle', 'fa-xs muted')} ${Utils.esc(c.name)}
          </div>
          <div class="task-meta">
            ${c.platform ? chip(c.platform, '#8b5cf6') : ''}
            ${c.category ? chip(c.category, '#6d83a6') : ''}
            ${c.difficulty ? chip(c.difficulty, this.diffColor(c.difficulty)) : ''}
            ${solvedC
              ? chip('solved ' + (c.solved_date ? Utils.fmtDate(String(c.solved_date).slice(0, 10)) : ''), '#10b981')
              : chip('unsolved', '#f59e0b')}
          </div>
          ${c.notes ? `<div class="muted small">${Utils.esc(c.notes)}</div>` : ''}
        </div>
        <div class="task-actions">
          ${c.link ? `<a class="btn btn-icon btn-ghost" href="${Utils.esc(c.link)}" target="_blank" rel="noopener" title="Open link">${icon('arrow-up-right-from-square')}</a>` : ''}
          <button class="btn btn-sm ${solvedC ? '' : 'btn-success'}" data-study-act="toggle-solve" title="${solvedC ? 'Mark unsolved' : 'Mark solved'}">
            ${solvedC ? icon('rotate-left') : icon('check')} ${solvedC ? '' : 'Solve'}
          </button>
          <button class="btn btn-icon btn-ghost" data-study-act="edit-ch" title="Edit">${icon('pencil')}</button>
          <button class="btn btn-icon btn-ghost danger" data-study-act="delete-ch" title="Delete">${icon('trash')}</button>
        </div>
      </div>`;
    }).join('');
  },

  openChallengeForm(existing) {
    const c = existing || {};
    const mod = openModal({
      title: existing ? 'Edit challenge' : 'Log CTF challenge',
      body: `
        <form id="challenge-form">
          <label class="field"><span>Challenge name *</span>
            <input name="name" required maxlength="200" value="${Utils.esc(c.name || '')}" placeholder="e.g. History of Augsburg — HTB"></label>
          <div class="field-row">
            <label class="field"><span>Platform</span>
              <input name="platform" list="ctf-platforms" value="${Utils.esc(c.platform || '')}" placeholder="HTB / THM / CTFd…">
              <datalist id="ctf-platforms">
                ${['HTB', 'THM', 'PortSwigger', 'CTFd', 'picoCTF', 'pwnable.kr'].map(p => `<option value="${p}">`).join('')}
              </datalist></label>
            <label class="field"><span>Category</span>
              <select name="category">
                ${['Web', 'Crypto', 'Pwn', 'Reverse', 'Forensics', 'OSINT', 'Misc'].map(x => `<option ${c.category === x ? 'selected' : ''}>${x}</option>`).join('')}
              </select></label>
          </div>
          <div class="field-row">
            <label class="field"><span>Difficulty</span>
              <select name="difficulty">
                ${['Easy', 'Medium', 'Hard', 'Insane'].map(x => `<option ${String(c.difficulty || 'Easy').toLowerCase() === x.toLowerCase() ? 'selected' : ''}>${x}</option>`).join('')}
              </select></label>
            <label class="field"><span>Status</span>
              <select name="status">
                ${['unsolved', 'solved'].map(x => `<option value="${x}" ${(c.status || 'unsolved') === x ? 'selected' : ''}>${x}</option>`).join('')}
              </select></label>
          </div>
          <div class="field-row">
            <label class="field"><span>Link</span>
              <input name="link" type="url" value="${Utils.esc(c.link || '')}" placeholder="https://…"></label>
            <label class="field"><span>Solved date</span>
              <input name="solved_date" type="date" value="${Utils.esc(c.solved_date || '')}"></label>
          </div>
          <label class="field"><span>Notes / writeup link</span>
            <textarea name="notes" rows="2">${Utils.esc(c.notes || '')}</textarea></label>
        </form>`,
      footer: `
        <button class="btn btn-ghost" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-save>${existing ? 'Save changes' : 'Log challenge'}</button>`
    });

    qs('[data-cancel]', mod.overlay).addEventListener('click', mod.close);
    qs('[data-save]', mod.overlay).addEventListener('click', () => {
      const form = qs('#challenge-form', mod.overlay);
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const data = {
        name: fd.get('name').trim(),
        platform: fd.get('platform').trim(),
        category: fd.get('category'),
        difficulty: fd.get('difficulty'),
        status: fd.get('status'),
        link: fd.get('link').trim(),
        solved_date: fd.get('solved_date') || '',
        notes: fd.get('notes')
      };
      if (data.status === 'solved' && !data.solved_date) data.solved_date = Utils.today();
      const save = existing ? API.updateChallenge(c.id, data) : API.createChallenge(data);
      save.then(rec => {
        App.replaceRecord('challenges', rec);
        mod.close();
        App.refreshCurrent();
        if (data.status === 'solved' && (!existing || existing.status !== 'solved')) toast('🏁 Challenge solved! +15 XP', 'success');
        else toast(existing ? 'Challenge updated' : 'Challenge logged', 'success');
      }).catch(e => App.handleError(e));
    });
  },

  /* ================= actions ================= */
  handleAction(e) {
    const btn = e.target.closest('[data-study-act]');
    if (!btn) return;
    const act = btn.dataset.studyAct;
    const card = btn.closest('[data-id]');
    const id = card ? card.dataset.id : null;

    if (act === 'new-module') return this.openModuleForm();
    if (act === 'edit') return this.openModuleForm((App.state.studyModules || []).find(x => x.id === id));
    if (act === 'inc') return this.incrementModule(id);
    if (act === 'delete') {
      const m = (App.state.studyModules || []).find(x => x.id === id);
      if (!m) return;
      confirmDialog({ title: 'Delete study module?', message: `Are you sure you want to delete "<b>${Utils.esc(m.title)}</b>"?` })
        .then(ok => {
          if (!ok) return;
          API.deleteStudyModule(id)
            .then(() => {
              App.state.studyModules = App.state.studyModules.filter(x => x.id !== id);
              App.refreshCurrent();
              toast('Module deleted', 'success');
            })
            .catch(e => App.handleError(e));
        });
      return;
    }

    if (act === 'new-challenge') return this.openChallengeForm();
    if (act === 'edit-ch') return this.openChallengeForm((App.state.challenges || []).find(x => x.id === id));
    if (act === 'delete-ch') {
      const c = (App.state.challenges || []).find(x => x.id === id);
      if (!c) return;
      confirmDialog({ title: 'Delete challenge?', message: `Are you sure you want to delete "<b>${Utils.esc(c.name)}</b>"?` })
        .then(ok => {
          if (!ok) return;
          API.deleteChallenge(id)
            .then(() => {
              App.state.challenges = App.state.challenges.filter(x => x.id !== id);
              App.refreshCurrent();
              toast('Challenge deleted', 'success');
            })
            .catch(e => App.handleError(e));
        });
      return;
    }
    if (act === 'toggle-solve') {
      const c = (App.state.challenges || []).find(x => x.id === id);
      if (!c) return;
      const nowSolved = c.status !== 'solved';
      const patch = { status: nowSolved ? 'solved' : 'unsolved' };
      if (nowSolved) patch.solved_date = Utils.today();
      API.updateChallenge(id, patch)
        .then(rec => {
          App.replaceRecord('challenges', rec);
          App.refreshCurrent();
          if (nowSolved) toast('🏁 Challenge solved! +15 XP', 'success');
        })
        .catch(e => App.handleError(e));
    }
  }
};
