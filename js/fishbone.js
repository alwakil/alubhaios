/* ============================================================
   PersonalOS — Fishbone (Ishikawa) diagram
   "Factors that Really Hamper Your Cybersecurity Learning Consistency"

   Fully drawn in SVG (no image): the spine draws itself, the eight
   bones unfold, causes slide in, dots flow toward the problem.
   Interactive: hover a category to spotlight it, click a header to
   fold its causes, mark causes solved (persisted in Settings), and
   turn any cause into a real PersonalOS task with one click.
   ============================================================ */
'use strict';

const FISHBONE_DATA = {
  effect: { title: 'Inconsistent Cybersecurity Learning', sub: 'Slow progress · uneven skills · frustration' },
  categories: [
    { id: 1, title: 'Mental & Personal Factors', icon: 'brain', color: '#ef4444', map: 'Personal',
      causes: [
        'Easily distracted (many interests)',
        'Procrastination',
        'Overthinking — which course, which tool, what next',
        'Motivation goes up and down',
        'Feeling overwhelmed by too many resources',
        'Fear of falling behind',
        'Sometimes low confidence'
      ] },
    { id: 2, title: 'Technical / Setup Issues', icon: 'laptop-code', color: '#f59e0b', map: 'Projects',
      causes: [
        'VM / OS setup problems (Kali, Parrot, VMware, VirtualBox)',
        'Tool installation issues (MobSF, Frida, Docker…)',
        'System resource limits (high RAM / CPU usage)',
        'Network issues (VPN, DNS, package downloads)',
        'Storage management',
        'Time spent on troubleshooting instead of learning'
      ] },
    { id: 3, title: 'Learning Resources & Direction', icon: 'book-open', color: '#22c55e', map: 'Learning',
      causes: [
        'Too many platforms (THM, HTB, PortSwigger…)',
        'Confusion about the learning path',
        'Switching between multiple topics too quickly',
        'Not following a structured plan',
        'Getting stuck on specific topics (e.g. auth bypass)',
        'Time on side topics (malware analysis, APK testing…)',
        'Not enough hands-on practice and note-taking'
      ] },
    { id: 4, title: 'Time & Routine', icon: 'clock', color: '#8b5cf6', map: 'Personal',
      causes: [
        'Irregular study schedule',
        'Hard to maintain a daily study routine',
        'Academic responsibilities (student)',
        'Other personal commitments',
        'Time on non-learning activities (social media…)',
        'Inconsistent study hours',
        'Trying to do too much in a short time'
      ] },
    { id: 5, title: 'Financial Constraints', icon: 'dollar-sign', color: '#3b82f6', map: 'Personal',
      causes: [
        'Limited budget for certifications',
        "Can't afford paid courses / tools easily",
        'Need to prioritize free resources',
        'Worrying about job / certification costs',
        'Hardware upgrade limits (RAM, dual monitor…)'
      ] },
    { id: 6, title: 'Career & Market Concerns', icon: 'chart-simple', color: '#ec4899', map: 'Work',
      causes: [
        'Uncertainty about job opportunities',
        'Worry: no certifications = no job',
        'Overthinking the market (2026, AI…)',
        'Pressure to be job-ready quickly',
        'Comparing with others',
        'Fear of AI replacing pentesters'
      ] },
    { id: 7, title: 'External Influences', icon: 'users', color: '#14b8a6', map: 'Learning',
      causes: [
        'Too many shiny tools & new tech (LLMs…)',
        'Side projects / CTFs instead of core learning',
        'Time spent on client projects & reports',
        'Distractions from online communities & news',
        'Overconsumption of content (videos, blogs…)'
      ] },
    { id: 8, title: 'Health & Well-being', icon: 'heart-pulse', color: '#f97316', map: 'Personal',
      causes: [
        'Mental fatigue / burnout',
        'Irregular sleep schedule',
        'Long screen time',
        'Stress and anxiety',
        'Lack of physical exercise',
        'These reduce focus and consistency'
      ] }
  ],
  takeaway: 'Most of these factors are solvable. Awareness is the first step. Focus on a few high-impact areas — time management, structured learning, reducing distractions and a stable setup — to build consistent progress.',
  quotes: [
    { text: 'Identify the real causes, so you can fix them and move forward with consistency.', by: 'A more focused and stronger you' },
    { text: 'Consistency beats intensity. Small steps every day lead to big results.', by: 'PersonalOS' }
  ]
};

const Fishbone = {
  /* ---- geometry constants (SVG user units = px) ---- */
  W: 1500, H: 810,
  SPINE_X1: 70, SPINE_X2: 1210, SPINE_Y: 405,
  CHIP_W: 240, CHIP_H: 46,
  ROW_H: 38, TEXT_W: 220,
  CAT_X: [170, 455, 740, 1025],   // chip centers, 4 per row
  TOP_Y: 57, BOTTOM_Y: 694,       // chip tops

  causeId(catIdx, i) { return 'fb' + catIdx + '-' + i; },

  /** solved = manual set (Settings) ∪ causes with a completed [fb:id] task */
  solvedSet() {
    const set = new Set();
    try { (JSON.parse(App.settings.fishbone_solved || '[]')).forEach(id => set.add(id)); } catch (e) { /* ignore */ }
    (App.state.tasks || []).forEach(t => {
      if (t.status !== 'completed') return;
      const m = String(t.description || '').match(/\[fb:([a-z0-9-]+)\]/);
      if (m) set.add(m[1]);
    });
    return set;
  },

  /* ---------------- page ---------------- */
  page(container) {
    const D = FISHBONE_DATA;
    const solved = this.solvedSet();
    const totalCauses = D.categories.reduce((a, c) => a + c.causes.length, 0);

    container.innerHTML = `
      <div class="page-head">
        <div>
          <h2>Fishbone — Learning Consistency</h2>
          <p class="muted small">Factors that really hamper your cybersecurity learning consistency.</p>
        </div>
        <div class="fb-head-stats">
          <span class="chip" style="--chip-c:#10b981">${icon('circle-check')} Solved <b id="fb-solved-count">${solved.size}/${totalCauses}</b></span>
          <span class="chip" style="--chip-c:#6366f1">${icon('hand-pointer')} Hover to focus · click a header to fold</span>
        </div>
      </div>

      <div class="card fb-card">
        <div class="fb-scroll">
          <svg class="fb-svg" width="${this.W}" height="${this.H}" viewBox="0 0 ${this.W} ${this.H}" xmlns="http://www.w3.org/2000/svg"></svg>
        </div>
        <div class="fb-scroll-hint muted small">${icon('arrows-left-right')} Drag / scroll horizontally to see the whole fish.</div>
      </div>

      <div class="fb-below">
        <div class="card fb-takeaway">
          <h3 class="card-title">${icon('lightbulb')} Key takeaway</h3>
          <p>${Utils.esc(D.takeaway)}</p>
        </div>
        ${D.quotes.map(q => `
          <div class="card fb-quote">
            ${icon('quote-left')}
            <div>
              <p>"${Utils.esc(q.text)}"</p>
              <span class="muted small">— ${Utils.esc(q.by)}</span>
            </div>
          </div>`).join('')}
      </div>
    `;

    this.buildSvg(qs('.fb-svg', container));

    container.onclick = e => {
      const chip = e.target.closest('.fb-chip');
      if (chip) {
        chip.closest('.fb-cat').classList.toggle('collapsed');
        return;
      }
      const solveBtn = e.target.closest('.fb-solve');
      if (solveBtn) return this.toggleSolve(solveBtn.closest('.fb-cause'));
      const addBtn = e.target.closest('.fb-add');
      if (addBtn) return this.addAsTask(addBtn.closest('.fb-cause'));
    };
  },

  /* ---------------- SVG construction ---------------- */
  buildSvg(svg) {
    const D = FISHBONE_DATA;
    const solved = this.solvedSet();
    const g = [];

    /* spine (draws itself) */
    g.push(`<line class="fb-spine" x1="${this.SPINE_X1}" y1="${this.SPINE_Y}" x2="${this.SPINE_X2}" y2="${this.SPINE_Y}"
      pathLength="1000" marker-end="url(#fb-arrow)"/>`);

    /* flowing dots toward the problem */
    for (let i = 0; i < 5; i++) {
      g.push(`<circle class="fb-flow" cx="0" cy="${this.SPINE_Y}" r="4" style="--fd:${(i * 1.2)}s" fill="#6366f1"/>`);
    }

    /* tail + head */
    g.push(`<polygon class="fb-tail" points="${this.SPINE_X1},405 8,318 ${this.SPINE_X1 - 14},405 8,492" />`);
    g.push(`<path class="fb-head" d="M ${this.SPINE_X2},330 C 1310,330 1400,360 1448,${this.SPINE_Y} C 1400,450 1310,480 ${this.SPINE_X2},480 Z" />`);
    g.push(`<foreignObject x="${this.SPINE_X2 + 14}" y="338" width="230" height="134">
      <div xmlns="http://www.w3.org/1999/xhtml" class="fb-effect">
        <b>${Utils.esc(D.effect.title)}</b>
        <span>${Utils.esc(D.effect.sub)}</span>
      </div></foreignObject>`);
    g.push(`<circle class="fb-eye" cx="1408" cy="${this.SPINE_Y}" r="9" />
            <circle class="fb-eye-pupil" cx="1408" cy="${this.SPINE_Y}" r="3.5" />`);

    /* arrowhead for the spine */
    g.push(`<defs><marker id="fb-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text)"/></marker></defs>`);

    /* categories: 4 top, 4 bottom */
    D.categories.forEach((cat, idx) => {
      const top = idx < 4;
      const xC = this.CAT_X[idx % 4];
      const chipLeft = xC - this.CHIP_W / 2;
      const chipTop = top ? this.TOP_Y : this.BOTTOM_Y;
      const anchorY = top ? chipTop + this.CHIP_H : chipTop;          // bone leaves chip's bottom (top row) or top (bottom row)
      const spineAttachX = chipLeft + 60;
      const rows = cat.causes.length;
      const boxTop = top ? this.TOP_Y + this.CHIP_H + 16 : this.BOTTOM_Y - rows * this.ROW_H - 14;
      const catSolved = cat.causes.filter((c, i) => solved.has(this.causeId(cat.id, i))).length;

      const bones = [`<line class="fb-bone" x1="${chipLeft}" y1="${anchorY}" x2="${spineAttachX}" y2="${this.SPINE_Y}"
        pathLength="100" stroke="${cat.color}" style="--bd:${(0.9 + idx * 0.22)}s"/>`];

      const ribs = [];
      const rowsHtml = [];
      cat.causes.forEach((cause, i) => {
        const id = this.causeId(cat.id, i);
        const y = boxTop + i * this.ROW_H + this.ROW_H / 2;
        const span = Math.abs(this.SPINE_Y - anchorY);
        const boneX = chipLeft + 60 * (Math.abs(y - anchorY) / span);
        ribs.push(`<circle cx="${boneX}" cy="${y}" r="3.2" fill="${cat.color}" />
                   <line class="fb-rib" x1="${boneX}" y1="${y}" x2="${chipLeft + 92}" y2="${y}" stroke="${cat.color}" />`);
        const isSolved = solved.has(id);
        rowsHtml.push(`
          <div class="fb-cause ${isSolved ? 'solved' : ''}" data-id="${id}" data-cat="${idx}" style="--ad:${(1.4 + idx * 0.22 + i * 0.06)}s">
            <span class="fb-cause-text">${Utils.esc(cause)}</span>
            <span class="fb-cause-btns">
              <button class="fb-btn fb-add" title="Add as task">${icon('plus')}</button>
              <button class="fb-btn fb-solve" title="${isSolved ? 'Mark unsolved' : 'Mark solved'}">${icon('check')}</button>
            </span>
          </div>`);
      });

      g.push(`<g class="fb-cat" data-cat="${idx}">`);
      g.push(`<foreignObject x="${chipLeft}" y="${chipTop}" width="${this.CHIP_W}" height="${this.CHIP_H}" style="--ad:${(0.7 + idx * 0.22)}s">
        <div xmlns="http://www.w3.org/1999/xhtml" class="fb-chip" style="--cc:${cat.color}">
          <i class="fa-solid fa-${cat.icon}"></i>
          <span class="fb-chip-title">${Utils.esc(cat.title)}</span>
          <span class="fb-chip-meta"><b class="fb-cat-count">${catSolved}/${rows}</b>${icon('chevron-down', 'fb-chevron')}</span>
        </div></foreignObject>`);
      g.push(bones.join(''));
      g.push(`<g class="fb-ribs">${ribs.join('')}</g>`);
      g.push(`<foreignObject class="fb-causes-fog" x="${chipLeft + 92}" y="${boxTop}" width="${this.TEXT_W + 8}" height="${rows * this.ROW_H + 6}"
        style="--mh:${rows * this.ROW_H + 6}px; --ad:${(1.3 + idx * 0.22)}s">
        <div xmlns="http://www.w3.org/1999/xhtml" class="fb-causes">${rowsHtml.join('')}</div></foreignObject>`);
      g.push('</g>');
    });

    svg.innerHTML = g.join('');
    /* entrance animation on first render of the session; instant afterwards
       (theme toggle / data refresh should not replay the whole show) */
    if (this._playedOnce) {
      svg.classList.add('fb-play', 'fb-noanim');
    } else {
      this._playedOnce = true;
      requestAnimationFrame(() => requestAnimationFrame(() => svg.classList.add('fb-play')));
    }
  },

  /* ---------------- interactions ---------------- */
  async toggleSolve(row) {
    const id = row.dataset.id;
    const set = new Set();
    try { (JSON.parse(App.settings.fishbone_solved || '[]')).forEach(x => set.add(x)); } catch (e) { /* ignore */ }
    const wasSolved = set.has(id);
    if (wasSolved) set.delete(id); else set.add(id);

    // optimistic: update state + UI immediately, revert if the save fails
    const prev = App.settings.fishbone_solved;
    App.settings.fishbone_solved = JSON.stringify([...set]);
    row.classList.toggle('solved', !wasSolved);
    this.updateCounts();

    try {
      await API.saveSettings({ fishbone_solved: App.settings.fishbone_solved });
      toast(wasSolved ? 'Marked as unsolved' : 'Cause solved! 💪', 'success');
    } catch (e) {
      App.settings.fishbone_solved = prev;
      row.classList.toggle('solved', wasSolved);
      this.updateCounts();
      App.handleError(e);
    }
  },

  addAsTask(row) {
    const idx = Number(row.dataset.cat);
    const cat = FISHBONE_DATA.categories[idx];
    const causeIdx = Number(row.dataset.id.split('-')[1]);
    const cause = cat.causes[causeIdx];
    Tasks.openForm({
      title: 'Fix: ' + cause,
      description: `Fishbone → ${cat.title}: ${cause} [fb:${row.dataset.id}]`,
      category: cat.map,
      priority: 'medium',
      scheduled_date: Utils.today()
    });
  },

  /** refresh solved counters without re-rendering the whole diagram */
  updateCounts() {
    const solved = this.solvedSet();
    const total = FISHBONE_DATA.categories.reduce((a, c) => a + c.causes.length, 0);
    const countEl = qs('#fb-solved-count');
    if (countEl) countEl.textContent = `${solved.size}/${total}`;
    qsa('.fb-cat').forEach(grp => {
      const idx = Number(grp.dataset.cat);
      const cat = FISHBONE_DATA.categories[idx];
      const n = cat.causes.filter((c, i) => solved.has(this.causeId(cat.id, i))).length;
      const el = qs('.fb-cat-count', grp);
      if (el) el.textContent = `${n}/${cat.causes.length}`;
    });
  }
};
