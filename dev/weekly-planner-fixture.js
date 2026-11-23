/* Local synthetic browser data. No live Supabase requests or personal backups. */
'use strict';
(() => {
  let day = sessionStorage.getItem('wp-qa-day') || '2026-11-20';
  let failNext = false;
  const seed = {
    tasks: [
      { id: 'qa-htb', title: 'HTB Lab', category: 'Learning', priority: 'high', status: 'pending', scheduled_date: '', created_at: '2026-11-20T08:00:00' },
      { id: 'qa-ctf', title: 'CTF', category: 'Learning', priority: 'medium', status: 'pending', scheduled_date: '', created_at: '2026-11-20T08:00:00' }
    ],
    archive: [], goals: [], routines: [{ id: 'qa-legacy', title: 'Old daily study', days: 'Every day', enabled: 'true', target_time: '08:00', category: 'Learning', duration_minutes: '30' }],
    habits: [], habit_logs: [], focus_sessions: [], daily_reviews: [], weekly_reviews: [], study_modules: [], challenges: [], salah: [],
    settings: [{ key: 'user_name', value: 'Synthetic QA' }, { key: 'routine_auto_task', value: '{"qa-legacy":true}' }]
  };
  const tables = JSON.parse(sessionStorage.getItem('wp-qa-data') || JSON.stringify(seed));
  const persist = () => sessionStorage.setItem('wp-qa-data', JSON.stringify(tables));
  Utils.today = () => day;
  Utils.nowISO = () => day + 'T10:00:00';
  API.configured = () => true;
  API.url = () => location.origin;
  API.key = () => 'synthetic-public-test-key-not-a-credential';
  API.rest = async (table, opts) => {
    const rows = tables[table] || [], method = opts.method || 'GET', q = new URLSearchParams(opts.qs || '');
    if (method === 'GET') {
      const offset = Number(q.get('offset') || 0);
      return JSON.parse(JSON.stringify(rows.slice(offset, offset + 1000)));
    }
    if (failNext) { failNext = false; throw new Error('Synthetic network failure — changes were not saved.'); }
    const match = row => [...q.entries()].filter(([k]) => !['select', 'on_conflict'].includes(k)).every(([key, cond]) => {
      if (cond.startsWith('eq.')) return String(row[key]) === cond.slice(3);
      if (cond.startsWith('in.(')) return cond.slice(4, -1).split(',').includes(String(row[key]));
      if (cond.startsWith('gte.')) return String(row[key]) >= cond.slice(4);
      if (cond.startsWith('lte.')) return String(row[key]) <= cond.slice(4);
      if (cond === 'not.is.null') return row[key] !== null && row[key] !== undefined;
      return true;
    });
    let result = [];
    if (method === 'POST') {
      const payload = Array.isArray(opts.body) ? opts.body : [opts.body];
      payload.forEach(rec => {
        const field = table === 'settings' ? 'key' : 'id', index = rows.findIndex(r => r[field] === rec[field]);
        if (index >= 0 && (opts.prefer || '').includes('ignore-duplicates')) return;
        const next = index >= 0 ? Object.assign({}, rows[index], rec) : Object.assign({}, rec);
        if (index >= 0) rows[index] = next; else rows.push(next);
        result.push(next);
      });
    } else if (method === 'PATCH') {
      rows.forEach(row => { if (match(row)) { Object.assign(row, opts.body); result.push(row); } });
    } else if (method === 'DELETE') {
      result = rows.filter(match); tables[table] = rows.filter(r => !match(r));
    }
    if (method !== 'DELETE') tables[table] = rows;
    persist();
    return opts.wantCount ? result.length : JSON.parse(JSON.stringify(result));
  };
  document.addEventListener('DOMContentLoaded', () => {
    const banner = document.createElement('div');
    banner.id = 'wp-qa-controls';
    banner.style.cssText = 'position:relative;padding:10px;margin:8px;border:2px dashed #f59e0b;display:flex;flex-wrap:wrap;gap:8px;align-items:center;z-index:5';
    banner.innerHTML = '<b>LOCAL QA · synthetic data only</b><label>Test date <input type="date" id="wp-qa-date" value="' + day + '"></label><button class="btn btn-sm" id="wp-qa-fail">Fail next save</button><button class="btn btn-sm" id="wp-qa-complete-task">Complete original HTB task</button>';
    document.getElementById('main').prepend(banner);
    document.getElementById('wp-qa-date').addEventListener('change', e => {
      day = e.target.value; sessionStorage.setItem('wp-qa-day', day); WeeklyPlanner.selectedWeek = null; WeeklyPlanner.dayTab = 'All'; App.refreshCurrent();
    });
    document.getElementById('wp-qa-fail').onclick = () => { failNext = true; toast('Next write will fail (synthetic test).', 'info'); };
    document.getElementById('wp-qa-complete-task').onclick = () => {
      const t = tables.tasks.find(t => t.id === 'qa-htb'); t.status = 'completed'; t.completed_at = Utils.nowISO(); persist(); App.reload();
    };
  });
})();
