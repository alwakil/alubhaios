/* ============================================================
   AluBhaiOS — Focus Arena
   Daily battle visualisation: AluBhai ⚡ (focus hero) vs
   Phonu 😈 (distraction monster). Pure SVG + CSS animation,
   computed from TODAY's real focus sessions. No assets, no CDN.
   ============================================================ */
'use strict';

const Arena = {

  /** Today's battle numbers: productive vs distraction minutes. */
  todayBattle() {
    const today = Utils.today();
    let focus = 0, dist = 0, sessions = 0;
    (App.state.focusSessions || []).forEach(s => {
      if (String(s.start_time).slice(0, 10) !== today) return;
      sessions++;
      const m = Utils.num(s.duration_minutes);
      if (Utils.isDistraction(s.category)) dist += m; else focus += m;
    });
    return { focus: focus, dist: dist, sessions: sessions };
  },

  /** Verdict for the battle: text + CSS tone class. Pure function (testable). */
  verdict(focus, dist) {
    if (focus + dist === 0) return { text: '🏟 The arena awaits your first session!', cls: 'v-neutral', state: 'idle' };
    if (dist === 0) return { text: '🏆 PERFECT — Phonu hasn\'t landed a single blow!', cls: 'v-gold', state: 'perfect' };
    const pct = Math.round(focus / (focus + dist) * 100);
    const lead = Math.abs(focus - dist);
    const leadTxt = Utils.fmtMinutes(lead);
    if (pct === 50) return { text: '⚔ DEAD TIED — take a side!', cls: 'v-warn', state: 'tied' };
    if (pct >= 80) return { text: `💪 AluBhai is WINNING by ${leadTxt}!`, cls: 'v-good', state: 'win' };
    if (pct > 50) return { text: `🙂 AluBhai leads by ${leadTxt} — keep pushing!`, cls: 'v-good', state: 'lead' };
    return { text: `😈 Phonu is WINNING by ${leadTxt} — fight back!`, cls: 'v-bad', state: 'lose' };
  },

  /* ---------------- SVG fighters ---------------- */

  aluSvg() {
    return `
    <svg class="fighter-svg alu-svg" viewBox="0 0 140 150" aria-hidden="true">
      <ellipse cx="70" cy="143" rx="34" ry="5" fill="rgba(0,0,0,.28)"/>
      <line x1="70" y1="28" x2="70" y2="15" stroke="var(--c-primary)" stroke-width="4" stroke-linecap="round"/>
      <polygon class="ab-bolt" points="70,0 77,12 63,12" fill="#f5c518"/>
      <rect x="38" y="27" width="64" height="52" rx="16" fill="var(--c-primary)"/>
      <rect x="45" y="35" width="50" height="37" rx="10" fill="#f4f7fb"/>
      <g class="ab-eyes">
        <circle cx="60" cy="51" r="5" fill="#202226"/>
        <circle cx="80" cy="51" r="5" fill="#202226"/>
      </g>
      <path d="M61 61 Q70 68 79 61" stroke="#202226" stroke-width="3" fill="none" stroke-linecap="round"/>
      <rect class="ab-arm ab-arm-l" x="22" y="88" width="28" height="10" rx="5" fill="var(--c-primary)"/>
      <rect class="ab-arm ab-arm-r" x="90" y="88" width="28" height="10" rx="5" fill="var(--c-primary)"/>
      <rect x="46" y="84" width="48" height="40" rx="12" fill="var(--c-primary)" opacity="0.94"/>
      <text x="70" y="110" text-anchor="middle" font-size="15">⚡</text>
      <rect x="53" y="124" width="13" height="12" rx="5" fill="var(--c-primary)"/>
      <rect x="74" y="124" width="13" height="12" rx="5" fill="var(--c-primary)"/>
    </svg>`;
  },

  phonuSvg() {
    return `
    <svg class="fighter-svg ph-svg" viewBox="0 0 140 150" aria-hidden="true">
      <ellipse cx="70" cy="143" rx="30" ry="5" fill="rgba(0,0,0,.28)"/>
      <polygon points="50,26 43,7 60,20" fill="#b91c1c"/>
      <polygon points="90,26 97,7 80,20" fill="#b91c1c"/>
      <rect x="44" y="23" width="52" height="90" rx="14" fill="#ef4444"/>
      <rect x="51" y="37" width="38" height="60" rx="8" fill="#181a1f"/>
      <path d="M55 46 L69 51 M85 46 L71 51" stroke="#fbbf24" stroke-width="3" stroke-linecap="round"/>
      <g class="ph-eyes">
        <circle cx="63" cy="57" r="5.5" fill="#fbbf24"/>
        <circle cx="77" cy="57" r="5.5" fill="#fbbf24"/>
      </g>
      <path class="ph-grin" d="M58 75 L64 80 L70 75 L76 80 L82 75" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="70" cy="103" r="3" fill="#4b5563"/>
      <rect class="ph-arm ph-arm-l" x="29" y="60" width="17" height="9" rx="4.5" fill="#b91c1c"/>
      <rect class="ph-arm ph-arm-r" x="94" y="60" width="17" height="9" rx="4.5" fill="#b91c1c"/>
      <rect x="51" y="113" width="15" height="11" rx="4" fill="#b91c1c"/>
      <rect x="74" y="113" width="15" height="11" rx="4" fill="#b91c1c"/>
    </svg>`;
  },

  /* ---------------- render ---------------- */

  render(container) {
    if (!container) return;
    const b = this.todayBattle();
    const v = this.verdict(b.focus, b.dist);
    const total = b.focus + b.dist;
    const focusPct = total ? Math.round(b.focus / total * 100) : 50;
    const distPct = 100 - focusPct;
    // tug-of-war push: winner advances toward the centre (max ±34px)
    const push = total ? Utils.clamp((focusPct - 50) * 1.3, -34, 34) : 0;

    const fCls = ['f-focus'];
    if (v.state === 'perfect') fCls.push('f-win');
    if (v.state === 'win') fCls.push('f-win');
    if (v.state === 'lose') fCls.push('f-lose');
    const pCls = ['f-phonu'];
    if (v.state === 'perfect') pCls.push('f-knock');
    if (v.state === 'win') pCls.push('f-lose');
    if (v.state === 'lose') pCls.push('f-win');
    if (v.state === 'idle') pCls.push('f-idle');

    const barLabel = (pct, txt) => pct >= 14 ? `<span>${txt}</span>` : '';

    container.innerHTML = `
      <div class="arena-stage" data-state="${v.state}">
        <span class="arena-impact" id="arena-impact">💥</span>
        <div class="fighter f-alu ${fCls.join(' ')}" style="transform:translateX(${push}px)">
          <div class="fighter-anim">${this.aluSvg()}</div>
          <div class="fighter-name">⚡ AluBhai</div>
          <div class="fighter-score good">${Utils.fmtMinutes(b.focus)}</div>
        </div>
        <div class="arena-mid">
          <div class="arena-vs">VS</div>
          <div class="battle-bar" role="img" aria-label="Focus ${focusPct}% vs distraction ${distPct}%">
            <div class="battle-focus" style="width:${focusPct}%">${barLabel(focusPct, '⚡ ' + focusPct + '%')}</div>
            <div class="battle-dist" style="width:${distPct}%">${barLabel(distPct, distPct + '% 😈')}</div>
          </div>
        </div>
        <div class="fighter f-phonu ${pCls.join(' ')}" style="transform:translateX(${-push}px)">
          <div class="fighter-anim">${this.phonuSvg()}</div>
          <div class="fighter-name danger">😈 Phonu</div>
          <div class="fighter-score bad">${Utils.fmtMinutes(b.dist)}</div>
        </div>
      </div>
      <div class="arena-verdict ${v.cls}">${v.text}</div>
      <div class="arena-stats muted small">${icon('stopwatch')} Focus: <b>${Utils.fmtMinutes(b.focus)}</b>
        · ${icon('phone-flip')} Distraction: <b>${Utils.fmtMinutes(b.dist)}</b>
        · ${icon('list')} Sessions: <b>${b.sessions}</b></div>
    `;
  },

  /** Brief attack animation: kind = 'phonu' | 'alu' (called on nag / pause-log). */
  punch(kind) {
    const stage = document.querySelector('.arena-stage');
    if (!stage) return;
    const fighter = stage.querySelector(kind === 'phonu' ? '.f-phonu .fighter-anim' : '.f-alu .fighter-anim');
    if (fighter) {
      fighter.classList.remove('lunge-l', 'lunge-r');
      void fighter.offsetWidth; // restart animation
      fighter.classList.add(kind === 'phonu' ? 'lunge-l' : 'lunge-r');
      setTimeout(() => fighter.classList.remove('lunge-l', 'lunge-r'), 650);
    }
    const impact = document.getElementById('arena-impact');
    if (impact) {
      impact.classList.remove('show');
      void impact.offsetWidth;
      impact.classList.add('show');
      setTimeout(() => impact.classList.remove('show'), 550);
    }
  }
};
window.Arena = Arena;
