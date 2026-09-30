/** ============================================================================
 *  PersonalOS — Google Apps Script backend
 *  ---------------------------------------------------------------------------
 *  Database: one Google Spreadsheet (the one this script is bound to).
 *  The frontend talks to this Web App with JSON POST requests:
 *      { "action": "createTask", "data": { "title": "..." } }
 *  Every response is:  { "success": true|false, "message": "...", "data": {...} }
 *
 *  SETUP (see README for the full walkthrough):
 *    1. Create a Google Spreadsheet.
 *    2. Extensions → Apps Script → paste this file.
 *    3. Run setupSheets() once (authorizes permissions).
 *    4. Optional: run setupSampleData() for test data.
 *    5. Deploy → New deployment → Web app → Execute as: Me, Access: Anyone.
 *    6. Copy the /exec URL into the frontend (js/config.js → CONFIG.API_URL).
 *
 *  All dates are stored as plain TEXT in the spreadsheet, in LOCAL time:
 *      date     -> "YYYY-MM-DD"
 *      datetime -> "YYYY-MM-DDTHH:MM:SS"
 *  Set the Apps Script project time zone (Project Settings) to your own so
 *  "today" is calculated correctly server-side.
 *  ========================================================================== */

var SCHEMA = {
  Tasks: ['id', 'title', 'description', 'category', 'priority', 'status',
          'estimated_minutes', 'actual_minutes', 'goal_id', 'project_id',
          'scheduled_date', 'completed_at', 'created_at', 'updated_at'],
  Archive: ['id', 'title', 'description', 'category', 'priority', 'status',
            'estimated_minutes', 'actual_minutes', 'goal_id', 'project_id',
            'scheduled_date', 'completed_at', 'created_at', 'updated_at'],
  Goals: ['id', 'title', 'description', 'category', 'target_date', 'progress',
          'status', 'parent_goal_id', 'created_at', 'updated_at'],
  Routines: ['id', 'title', 'description', 'category', 'target_time',
             'duration_minutes', 'days', 'enabled', 'created_at', 'updated_at'],
  Habits: ['id', 'title', 'frequency', 'target', 'current_streak', 'best_streak',
           'enabled', 'created_at', 'updated_at'],
  HabitLogs: ['id', 'habit_id', 'date', 'completed', 'note', 'created_at'],
  FocusSessions: ['id', 'task_id', 'category', 'start_time', 'end_time',
                  'duration_minutes', 'focus_rating', 'interruptions', 'notes'],
  DailyReviews: ['id', 'date', 'energy', 'focus', 'motivation', 'stress',
                 'accomplishments', 'blockers', 'notes'],
  WeeklyReviews: ['id', 'week_start', 'week_end', 'planned_tasks', 'completed_tasks',
                  'focus_minutes', 'distraction_minutes', 'biggest_win',
                  'biggest_problem', 'next_week_focus', 'notes'],
  StudyModules: ['id', 'title', 'type', 'total_units', 'done_units', 'status',
                 'link', 'notes', 'created_at', 'updated_at'],
  Challenges: ['id', 'name', 'platform', 'category', 'difficulty', 'status',
               'link', 'solved_date', 'notes', 'created_at', 'updated_at'],
  Settings: ['key', 'value']
};

var DATE_HEADERS = ['scheduled_date', 'target_date', 'date', 'week_start', 'week_end'];
var DATETIME_HEADERS = ['created_at', 'updated_at', 'completed_at', 'start_time', 'end_time'];

/* ============================================================================
 *  WEB APP ENTRY POINTS
 *  ========================================================================== */

function doPost(e) {
  var action = '';
  var data = {};
  try {
    if (e && e.postData && e.postData.contents) {
      var body = JSON.parse(e.postData.contents);
      action = body.action || '';
      data = body.data || {};
    }
  } catch (err) {
    return json_({ success: false, message: 'Invalid JSON body: ' + err.message });
  }
  if (!action && e && e.parameter && e.parameter.action) {
    action = e.parameter.action;
  }
  return handle_(action, data);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || '';
  var data = {};
  if (p.data) {
    try { data = JSON.parse(p.data); } catch (err) { data = {}; }
  }
  Object.keys(p).forEach(function (k) {
    if (k !== 'action' && k !== 'data') data[k] = p[k];
  });
  return handle_(action, data);
}

/** Central dispatcher — every action goes through here. */
function handle_(action, data) {
  try {
    if (!action) {
      return json_({ success: true, message: 'PersonalOS API is running.',
                     data: { hint: 'Send {"action":"ping"} or use ?action=ping' } });
    }
    data = data || {};

    var reads = {
      ping: 1, getAll: 1, getSettings: 1, getAnalytics: 1,
      getTasks: 1, getGoals: 1, getRoutines: 1, getHabits: 1, getHabitLogs: 1,
      getFocusSessions: 1, getDailyReviews: 1, getWeeklyReviews: 1
    };

    var out;
    if (reads[action]) {
      out = readAction_(action, data);
    } else {
      out = withLock_(function () { return writeAction_(action, data); });
    }
    return json_({ success: true, message: out.message || 'OK', data: (out.data === undefined ? {} : out.data) });
  } catch (err) {
    return json_({ success: false, message: (err && err.message) ? err.message : String(err) });
  }
}

/* ============================================================================
 *  READ ACTIONS
 *  ========================================================================== */

function readAction_(action, data) {
  switch (action) {
    case 'ping':
      return ok_('Connected', {
        serverTime: nowIso_(),
        timezone: Session.getScriptTimeZone(),
        spreadsheet: ss_().getName()
      });

    case 'getAll':
      return ok_('Data loaded', getAllData_());

    case 'getSettings':
      return ok_('Settings loaded', getSettings_());

    case 'getAnalytics':
      return ok_('Analytics computed', analyticsBundle_(Number(data.days) || 90));

    case 'getTasks':         return ok_('OK', list_('Tasks'));
    case 'getGoals':         return ok_('OK', list_('Goals'));
    case 'getRoutines':      return ok_('OK', list_('Routines'));
    case 'getHabits':        return ok_('OK', list_('Habits'));
    case 'getHabitLogs':     return ok_('OK', list_('HabitLogs'));
    case 'getFocusSessions': return ok_('OK', list_('FocusSessions'));
    case 'getDailyReviews':  return ok_('OK', list_('DailyReviews'));
    case 'getWeeklyReviews': return ok_('OK', list_('WeeklyReviews'));

    default:
      throw new Error('Unknown action: ' + action);
  }
}

function getAllData_() {
  return {
    tasks: list_('Tasks'),
    archivedTasks: list_('Archive'),
    goals: list_('Goals'),
    routines: list_('Routines'),
    habits: list_('Habits'),
    habitLogs: list_('HabitLogs'),
    focusSessions: list_('FocusSessions'),
    dailyReviews: list_('DailyReviews'),
    weeklyReviews: list_('WeeklyReviews'),
    studyModules: list_('StudyModules'),
    challenges: list_('Challenges'),
    settings: getSettings_(),
    serverTime: nowIso_()
  };
}

/* ============================================================================
 *  WRITE ACTIONS (CRUD + settings + reset)
 *  ========================================================================== */

function writeAction_(action, data) {
  switch (action) {

    /* ---------------- Tasks ---------------- */
    case 'createTask':
      requireText_(data.title, 'Task title');
      var taskDefaults = {
        description: '', category: data.category || 'Other',
        priority: data.priority || 'medium', status: data.status || 'pending',
        estimated_minutes: '', actual_minutes: '', goal_id: '', project_id: '',
        scheduled_date: data.scheduled_date || today_(), completed_at: ''
      };
      if (taskDefaults.status === 'completed' && !data.completed_at) taskDefaults.completed_at = nowIso_();
      return ok_('Task created successfully', createRecord_('Tasks', mergeDefaults_(data, taskDefaults)));

    case 'updateTask':
      requireId_(data.id, 'task');
      return ok_('Task updated successfully', updateRecord_('Tasks', data.id, patchOf_(data)));

    case 'deleteTask':
      requireId_(data.id, 'task');
      // keep session history but unlink it from the deleted task
      list_('FocusSessions').forEach(function (s) {
        if (String(s.task_id) === String(data.id)) updateRecord_('FocusSessions', s.id, { task_id: '' });
      });
      deleteRecord_('Tasks', data.id);
      deleteRecord_('Archive', data.id); // no-op if not archived
      return ok_('Task deleted successfully', { id: data.id });

    case 'archiveOldData': {
      var days = Number(data.days) || 120;
      if (days < 30) throw new Error('Archive threshold must be at least 30 days.');
      var cutoff = addDaysStr_(today_(), -days);
      var moved = 0;
      list_('Tasks').forEach(function (t) {
        if (t.status !== 'completed') return;
        var cdate = String(t.completed_at).slice(0, 10);
        if (!cdate || cdate >= cutoff) return;
        createRecord_('Archive', t);      // keeps the original id/timestamps
        deleteRecord_('Tasks', t.id);
        moved++;
      });
      return ok_('Archived ' + moved + ' completed task(s)', { moved: moved, cutoff: cutoff });
    }

    /* ---------------- Goals ---------------- */
    case 'createGoal':
      requireText_(data.title, 'Goal title');
      var goalDefaults = {
        description: '', category: data.category || 'Other', target_date: '',
        progress: 0, status: 'active', parent_goal_id: ''
      };
      return ok_('Goal created successfully', createRecord_('Goals', mergeDefaults_(data, goalDefaults)));

    case 'updateGoal':
      requireId_(data.id, 'goal');
      return ok_('Goal updated successfully', updateRecord_('Goals', data.id, patchOf_(data)));

    case 'deleteGoal':
      requireId_(data.id, 'goal');
      // unlink tasks + re-parent sub-goals
      list_('Tasks').forEach(function (t) {
        if (String(t.goal_id) === String(data.id)) updateRecord_('Tasks', t.id, { goal_id: '' });
      });
      list_('Goals').forEach(function (g) {
        if (String(g.parent_goal_id) === String(data.id)) updateRecord_('Goals', g.id, { parent_goal_id: '' });
      });
      deleteRecord_('Goals', data.id);
      return ok_('Goal deleted successfully', { id: data.id });

    /* ---------------- Routines ---------------- */
    case 'createRoutine':
      requireText_(data.title, 'Routine title');
      var routineDefaults = {
        description: '', category: data.category || 'Other', target_time: '',
        duration_minutes: '', days: 'Every day', enabled: true
      };
      return ok_('Routine created successfully', createRecord_('Routines', mergeDefaults_(data, routineDefaults)));

    case 'updateRoutine':
      requireId_(data.id, 'routine');
      return ok_('Routine updated successfully', updateRecord_('Routines', data.id, patchOf_(data)));

    case 'deleteRoutine':
      requireId_(data.id, 'routine');
      deleteRecord_('Routines', data.id);
      return ok_('Routine deleted successfully', { id: data.id });

    /* ---------------- Habits + logs ---------------- */
    case 'createHabit':
      requireText_(data.title, 'Habit title');
      var habitDefaults = { frequency: 'daily', target: 1, current_streak: 0, best_streak: 0, enabled: true };
      return ok_('Habit created successfully', createRecord_('Habits', mergeDefaults_(data, habitDefaults)));

    case 'updateHabit':
      requireId_(data.id, 'habit');
      return ok_('Habit updated successfully', updateRecord_('Habits', data.id, patchOf_(data)));

    case 'deleteHabit':
      requireId_(data.id, 'habit');
      deleteRowsWhere_('HabitLogs', function (l) { return String(l.habit_id) === String(data.id); });
      deleteRecord_('Habits', data.id);
      return ok_('Habit deleted successfully', { id: data.id });

    case 'setHabitLog': {
      requireId_(data.habit_id, 'habit');
      requireText_(data.date, 'Date');
      var completed = isTrue_(data.completed);
      var existing = list_('HabitLogs').filter(function (l) {
        return String(l.habit_id) === String(data.habit_id) && String(l.date).slice(0, 10) === String(data.date).slice(0, 10);
      });
      var log;
      if (existing.length) {
        log = updateRecord_('HabitLogs', existing[0].id, { completed: completed, note: data.note || '' });
      } else {
        log = createRecord_('HabitLogs', {
          habit_id: data.habit_id, date: String(data.date).slice(0, 10),
          completed: completed, note: data.note || ''
        });
      }
      var streaks = recomputeStreaks_(data.habit_id);
      return ok_(completed ? 'Habit marked complete' : 'Habit check-in removed', { log: log, habit: streaks.habit, streaks: streaks });
    }

    /* ---------------- Focus sessions ---------------- */
    case 'createFocusSession': {
      var sessionDefaults = {
        task_id: data.task_id || '', category: data.category || 'Other',
        start_time: data.start_time || nowIso_(), end_time: data.end_time || nowIso_(),
        duration_minutes: data.duration_minutes || '',
        focus_rating: data.focus_rating === '' ? '' : (data.focus_rating || ''),
        interruptions: data.interruptions || 0, notes: data.notes || ''
      };
      return ok_('Focus session saved', createRecord_('FocusSessions', mergeDefaults_(data, sessionDefaults)));
    }

    case 'deleteFocusSession':
      requireId_(data.id, 'focus session');
      deleteRecord_('FocusSessions', data.id);
      return ok_('Focus session deleted', { id: data.id });

    /* ---------------- Reviews (upsert by natural key) ---------------- */
    case 'createDailyReview': {
      requireText_(data.date, 'Date');
      var dr = list_('DailyReviews').filter(function (r) { return String(r.date).slice(0, 10) === String(data.date).slice(0, 10); });
      var fields = ['energy', 'focus', 'motivation', 'stress', 'accomplishments', 'blockers', 'notes'];
      var patch = { date: String(data.date).slice(0, 10) };
      fields.forEach(function (f) { if (data[f] !== undefined) patch[f] = data[f]; });
      var rec = dr.length ? updateRecord_('DailyReviews', dr[0].id, patch)
                          : createRecord_('DailyReviews', patch);
      return ok_('Daily review saved', rec);
    }

    case 'deleteDailyReview':
      requireId_(data.id, 'daily review');
      deleteRecord_('DailyReviews', data.id);
      return ok_('Daily review deleted', { id: data.id });

    case 'createWeeklyReview': {
      requireText_(data.week_start, 'Week start');
      var ws = String(data.week_start).slice(0, 10);
      var wr = list_('WeeklyReviews').filter(function (r) { return String(r.week_start).slice(0, 10) === ws; });
      var wFields = ['week_end', 'planned_tasks', 'completed_tasks', 'focus_minutes',
                     'distraction_minutes', 'biggest_win', 'biggest_problem', 'next_week_focus', 'notes'];
      var wPatch = { week_start: ws };
      wFields.forEach(function (f) { if (data[f] !== undefined) wPatch[f] = data[f]; });
      var wRec = wr.length ? updateRecord_('WeeklyReviews', wr[0].id, wPatch)
                           : createRecord_('WeeklyReviews', wPatch);
      return ok_('Weekly review saved', wRec);
    }

    case 'deleteWeeklyReview':
      requireId_(data.id, 'weekly review');
      deleteRecord_('WeeklyReviews', data.id);
      return ok_('Weekly review deleted', { id: data.id });

    /* ---------------- Study modules (Writeups / HTB / PortSwigger) ------ */
    case 'createStudyModule':
      requireText_(data.title, 'Module title');
      var smDefaults = {
        type: data.type || 'HTB Module', total_units: data.total_units || 1,
        done_units: data.done_units || 0, status: data.status || 'active',
        link: data.link || '', notes: data.notes || ''
      };
      return ok_('Study module created', createRecord_('StudyModules', mergeDefaults_(data, smDefaults)));

    case 'updateStudyModule':
      requireId_(data.id, 'study module');
      return ok_('Study module updated', updateRecord_('StudyModules', data.id, patchOf_(data)));

    case 'deleteStudyModule':
      requireId_(data.id, 'study module');
      deleteRecord_('StudyModules', data.id);
      return ok_('Study module deleted', { id: data.id });

    /* ---------------- CTF challenges ---------------- */
    case 'createChallenge':
      requireText_(data.name, 'Challenge name');
      var chDefaults = {
        platform: data.platform || 'HTB', category: data.category || 'Web',
        difficulty: data.difficulty || 'Easy', status: data.status || 'unsolved',
        link: data.link || '', solved_date: data.solved_date || '', notes: data.notes || ''
      };
      return ok_('Challenge created', createRecord_('Challenges', mergeDefaults_(data, chDefaults)));

    case 'updateChallenge':
      requireId_(data.id, 'challenge');
      return ok_('Challenge updated', updateRecord_('Challenges', data.id, patchOf_(data)));

    case 'deleteChallenge':
      requireId_(data.id, 'challenge');
      deleteRecord_('Challenges', data.id);
      return ok_('Challenge deleted', { id: data.id });

    /* ---------------- Settings ---------------- */
    case 'saveSettings':
      if (!data.settings || typeof data.settings !== 'object') throw new Error('Missing settings object.');
      return ok_('Settings saved', { settings: saveSettings_(data.settings) });

    /* ---------------- RESET SYSTEM ---------------- */
    case 'reset':
      return ok_('Reset complete', resetAction_(data.type));

    default:
      throw new Error('Unknown action: ' + action);
  }
}

/* ============================================================================
 *  RESET SYSTEM
 *  types: today | week | progress | everything
 *  ========================================================================== */

function resetAction_(type) {
  var today = today_();
  var counts = { tasks: 0, focus_sessions: 0, habit_logs: 0, daily_reviews: 0, weekly_reviews: 0 };

  if (type === 'today' || type === 'week') {
    var days = (type === 'today') ? [today] : weekDates_(today);
    var inRange = {};
    days.forEach(function (d) { inRange[d] = true; });

    list_('Tasks').forEach(function (t) {
      if (inRange[String(t.completed_at).slice(0, 10)]) {
        updateRecord_('Tasks', t.id, { status: 'pending', completed_at: '' });
        counts.tasks++;
      }
    });
    counts.focus_sessions += deleteRowsWhere_('FocusSessions', function (s) { return !!inRange[String(s.start_time).slice(0, 10)]; });
    counts.habit_logs     += deleteRowsWhere_('HabitLogs',     function (l) { return !!inRange[String(l.date).slice(0, 10)]; });
    counts.daily_reviews  += deleteRowsWhere_('DailyReviews',  function (r) { return !!inRange[String(r.date).slice(0, 10)]; });

    if (type === 'week') {
      var ws = startOfWeekStr_(today);
      counts.weekly_reviews += deleteRowsWhere_('WeeklyReviews', function (r) { return String(r.week_start).slice(0, 10) === ws; });
    }

  } else if (type === 'progress') {
    // deletes ALL productivity records; keeps Goals, Routines, Habits, Settings
    counts.tasks           = clearSheet_('Tasks');
    counts.tasks          += clearSheet_('Archive');
    counts.focus_sessions  = clearSheet_('FocusSessions');
    counts.habit_logs      = clearSheet_('HabitLogs');
    counts.daily_reviews   = clearSheet_('DailyReviews');
    counts.weekly_reviews  = clearSheet_('WeeklyReviews');
    list_('Habits').forEach(function (h) {
      updateRecord_('Habits', h.id, { current_streak: 0, best_streak: 0 });
    });

  } else if (type === 'everything') {
    // wipes the complete database INCLUDING settings
    Object.keys(SCHEMA).forEach(function (name) { clearSheet_(name); });

  } else {
    throw new Error('Unknown reset type: ' + type + ' (use today | week | progress | everything)');
  }

  return { type: type, counts: counts };
}

/* ============================================================================
 *  ANALYTICS (server-side mirror of the frontend engine — same real data)
 *  ========================================================================== */

function analyticsBundle_(days) {
  var tasks = list_('Tasks');
  var sessions = list_('FocusSessions');
  var habits = list_('Habits').filter(function (h) { return isTrue_(h.enabled); });
  var habitIds = {};
  habits.forEach(function (h) { habitIds[h.id] = true; });
  var focusGoal = Number(getSettings_().daily_focus_goal_minutes) || 120;

  var logsByDate = {};
  list_('HabitLogs').forEach(function (l) {
    if (!isTrue_(l.completed) || !habitIds[l.habit_id]) return;
    var d = String(l.date).slice(0, 10);
    if (!logsByDate[d]) logsByDate[d] = 0;
    logsByDate[d]++;
  });

  var daily = [];
  for (var i = days - 1; i >= 0; i--) {
    var date = addDaysStr_(today_(), -i);
    var planned = 0, completed = 0;
    tasks.forEach(function (t) {
      if (String(t.scheduled_date).slice(0, 10) === date) planned++;
      if (String(t.completed_at).slice(0, 10) === date && t.status === 'completed') completed++;
    });
    var focusMin = 0, distrMin = 0;
    sessions.forEach(function (s) {
      if (String(s.start_time).slice(0, 10) !== date) return;
      var m = Number(s.duration_minutes) || 0;
      if (String(s.category) === 'Entertainment' || String(s.category) === 'Distraction') distrMin += m;
      else focusMin += m;
    });
    var habitDone = logsByDate[date] || 0;
    var score = scoreDay_(planned, completed, focusMin, habitDone, habits.length, distrMin, focusGoal);
    daily.push({
      date: date, score: score, tasksPlanned: planned, tasksCompleted: completed,
      focusMinutes: focusMin, distractionMinutes: distrMin,
      habitDone: habitDone, habitTotal: habits.length,
      habitPct: habits.length ? Math.round(habitDone / habits.length * 100) : 0
    });
  }

  // weekly aggregation (Monday-based)
  var byWeek = {};
  daily.forEach(function (d) {
    var ws = startOfWeekStr_(d.date);
    if (!byWeek[ws]) byWeek[ws] = { weekStart: ws, scores: [], focusMinutes: 0, planned: 0, completed: 0, habitPct: [] };
    byWeek[ws].scores.push(d.score);
    byWeek[ws].focusMinutes += d.focusMinutes;
    byWeek[ws].planned += d.tasksPlanned;
    byWeek[ws].completed += d.tasksCompleted;
    byWeek[ws].habitPct.push(d.habitPct);
  });
  var weekly = Object.keys(byWeek).sort().map(function (ws) {
    var w = byWeek[ws];
    return {
      weekStart: ws,
      score: w.scores.length ? Math.round(w.scores.reduce(function (a, b) { return a + b; }, 0) / w.scores.length) : 0,
      focusMinutes: w.focusMinutes, planned: w.planned, completed: w.completed,
      habitPct: w.habitPct.length ? Math.round(w.habitPct.reduce(function (a, b) { return a + b; }, 0) / w.habitPct.length) : 0
    };
  });

  // category distribution over the whole range
  var cats = {};
  var tracked = 0;
  sessions.forEach(function (s) {
    if (String(s.start_time).slice(0, 10) < addDaysStr_(today_(), -(days - 1))) return;
    var c = s.category || 'Other';
    var m = Number(s.duration_minutes) || 0;
    cats[c] = (cats[c] || 0) + m;
    tracked += m;
  });
  var categories = Object.keys(cats).map(function (c) {
    return { category: c, minutes: cats[c], pct: tracked ? Math.round(cats[c] / tracked * 100) : 0 };
  }).sort(function (a, b) { return b.minutes - a.minutes; });

  return { days: days, daily: daily, weekly: weekly, categories: categories, generatedAt: nowIso_() };
}

/** Same simple score formula as the frontend. */
function scoreDay_(planned, completed, focusMinutes, habitDone, habitTotal, distrMinutes, focusGoal) {
  var taskPts = planned > 0 ? (completed / planned) * 40 : (completed > 0 ? 40 : 0);
  var goal = focusGoal || 120;
  var focusPts = Math.min(1, focusMinutes / goal) * 30;
  var habitPts = habitTotal > 0 ? (habitDone / habitTotal) * 20 : (habitDone > 0 ? 20 : 0);
  var penalty = Math.min(10, Math.round(distrMinutes / 6));
  return Math.max(0, Math.min(100, Math.round(taskPts + focusPts + habitPts - penalty)));
}

/* ============================================================================
 *  GENERIC SHEET DATA LAYER
 *  ========================================================================== */

var _ensured = false;

function ensureSheets_() {
  if (_ensured) return;
  var book = ss_();
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = book.getSheetByName(name);
    var created = false;
    if (!sh) { sh = book.insertSheet(name); created = true; }
    var header = SCHEMA[name];

    var existing = [];
    if (sh.getLastRow() > 0 && sh.getLastColumn() > 0) {
      existing = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
        .map(function (v) { return String(v).trim(); })
        .filter(function (v) { return v !== ''; });
    }

    if (created || existing.length === 0) {
      sh.getRange(1, 1, 1, header.length).setValues([header]);
      sh.getRange(1, 1, 1, header.length).setFontWeight('bold');
      sh.setFrozenRows(1);
      // keep all date/time columns as plain text so no timezone is ever applied twice
      header.forEach(function (h, i) {
        if (DATE_HEADERS.indexOf(h) !== -1 || DATETIME_HEADERS.indexOf(h) !== -1) {
          sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
        }
      });
    }
  });
  _ensured = true;
}

function ss_() {
  var propId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (propId) return SpreadsheetApp.openById(propId);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('No spreadsheet found. Open your Google Sheet → Extensions → Apps Script and paste this code there, or set the SPREADSHEET_ID script property.');
}

function getSheet_(name) {
  ensureSheets_();
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" is missing. Run setupSheets() once from the Apps Script editor.');
  return sh;
}

function headers_(sh) {
  if (sh.getLastColumn() < 1) return [];
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (v) { return String(v).trim(); });
}

function list_(name) {
  var sh = getSheet_(name);
  var headers = headers_(sh);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(1, 1, last, Math.max(headers.length, sh.getLastColumn())).getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    if (values[i].join('') === '') continue;
    out.push(rowToObj_(headers, values[i]));
  }
  return out;
}

function rowToObj_(headers, row) {
  var obj = {};
  for (var i = 0; i < headers.length; i++) {
    if (!headers[i]) continue;
    obj[headers[i]] = normalize_(headers[i], row[i]);
  }
  return obj;
}

/** Convert accidental Date cells back to the text format we standardize on. */
function normalize_(header, v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    var tz = Session.getScriptTimeZone();
    if (DATETIME_HEADERS.indexOf(header) !== -1) return Utilities.formatDate(v, tz, "yyyy-MM-dd'T'HH:mm:ss");
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  return v;
}

function createRecord_(name, obj) {
  var sh = getSheet_(name);
  var headers = headers_(sh);
  if (!obj.id) obj.id = newId_();
  if (!obj.created_at) obj.created_at = nowIso_();
  obj.updated_at = nowIso_();
  var row = headers.map(function (h) {
    return (obj[h] === undefined || obj[h] === null) ? '' : obj[h];
  });
  sh.appendRow(row);
  return obj;
}

function updateRecord_(name, id, patch) {
  var sh = getSheet_(name);
  var headers = headers_(sh);
  var idCol = headers.indexOf('id');
  if (idCol === -1) throw new Error('Sheet "' + name + '" has no "id" column.');
  var last = sh.getLastRow();
  if (last < 2) throw new Error('No records in "' + name + '" — id ' + id + ' not found.');

  var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][idCol]) !== String(id)) continue;

    var existing = rowToObj_(headers, values[i]);
    var merged = {};
    headers.forEach(function (h) {
      if (h === 'id' || h === 'created_at') { merged[h] = existing[h]; return; } // never overwritten
      if (patch.hasOwnProperty(h)) merged[h] = patch[h];
      else merged[h] = existing[h];
    });
    merged.updated_at = nowIso_();
    var row = headers.map(function (h) {
      return (merged[h] === undefined || merged[h] === null) ? '' : merged[h];
    });
    sh.getRange(i + 2, 1, 1, headers.length).setValues([row]);
    return merged;
  }
  throw new Error('Record with id ' + id + ' not found in "' + name + '".');
}

function deleteRecord_(name, id) {
  var sh = getSheet_(name);
  var headers = headers_(sh);
  var idCol = headers.indexOf('id');
  var last = sh.getLastRow();
  if (last < 2 || idCol === -1) return;
  var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (String(values[i][idCol]) === String(id)) {
      sh.deleteRow(i + 2);
      return;
    }
  }
}

function deleteRowsWhere_(name, predicate) {
  var sh = getSheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var headers = headers_(sh);
  var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  var removed = 0;
  for (var i = values.length - 1; i >= 0; i--) {
    if (predicate(rowToObj_(headers, values[i]))) {
      sh.deleteRow(i + 2);
      removed++;
    }
  }
  return removed;
}

function clearSheet_(name) {
  var sh = getSheet_(name);
  var last = sh.getLastRow();
  if (last > 1) {
    sh.deleteRows(2, last - 1);
    return last - 1;
  }
  return 0;
}

/* ============================================================================
 *  SETTINGS (key/value)
 *  ========================================================================== */

function getSettings_() {
  var rows = list_('Settings');
  var obj = {};
  rows.forEach(function (r) {
    if (r.key !== undefined && String(r.key) !== '') obj[String(r.key)] = r.value;
  });
  return obj;
}

function saveSettings_(settings) {
  var sh = getSheet_('Settings');
  var headers = headers_(sh);
  var keyCol = headers.indexOf('key');
  var valCol = headers.indexOf('value');
  if (keyCol === -1 || valCol === -1) throw new Error('Settings sheet must have "key" and "value" columns.');

  var rowByKey = {};
  var last = sh.getLastRow();
  if (last > 1) {
    var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
    values.forEach(function (row, i) {
      var k = String(row[keyCol]).trim();
      if (k) rowByKey[k] = i + 2;
    });
  }

  Object.keys(settings).forEach(function (k) {
    var v = (settings[k] === null || settings[k] === undefined) ? '' : settings[k];
    if (rowByKey[k]) {
      sh.getRange(rowByKey[k], valCol + 1).setValue(v);
    } else {
      sh.appendRow([k, v]);
      rowByKey[k] = true; // in case the same key appears twice in one call
    }
  });
  return getSettings_();
}

/* ============================================================================
 *  HABIT STREAKS (recomputed from logs, then persisted to the Habits sheet)
 *  ========================================================================== */

function recomputeStreaks_(habitId) {
  var dates = list_('HabitLogs')
    .filter(function (l) { return String(l.habit_id) === String(habitId) && isTrue_(l.completed); })
    .map(function (l) { return String(l.date).slice(0, 10); })
    .sort();

  var set = {};
  dates.forEach(function (d) { set[d] = true; });

  var cursor = today_();
  if (!set[cursor]) cursor = addDaysStr_(cursor, -1); // grace: done yesterday still counts
  var current = 0;
  while (set[cursor]) { current++; cursor = addDaysStr_(cursor, -1); }

  var best = 0, run = 0, prev = null;
  dates.forEach(function (d) {
    run = (prev !== null && addDaysStr_(prev, 1) === d) ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  });
  if (current > best) best = current;

  var habit = updateRecord_('Habits', habitId, { current_streak: current, best_streak: best });
  return { current: current, best: best, habit: habit };
}

/* ============================================================================
 *  HELPERS
 *  ========================================================================== */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function ok_(message, data) {
  return { message: message, data: (data === undefined ? {} : data) };
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (e) { /* ignore */ }
  }
}

function newId_() { return Utilities.getUuid(); }

function nowIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}

function today_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function addDaysStr_(dateStr, n) {
  var p = String(dateStr).split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  d.setDate(d.getDate() + n);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function startOfWeekStr_(dateStr) {
  var p = String(dateStr).split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function weekDates_(dateStr) {
  var ws = startOfWeekStr_(dateStr);
  var out = [];
  for (var i = 0; i < 7; i++) out.push(addDaysStr_(ws, i));
  return out;
}

function isTrue_(v) {
  return v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1';
}

function requireText_(v, label) {
  if (v === undefined || v === null || String(v).trim() === '') {
    throw new Error(label + ' is required.');
  }
}

function requireId_(id, label) {
  if (id === undefined || id === null || String(id).trim() === '') {
    throw new Error('Missing id for ' + label + '.');
  }
}

/** Copy allowed fields from data, filling any missing schema field with its default. */
function mergeDefaults_(data, defaults) {
  var out = {};
  Object.keys(defaults).forEach(function (k) {
    out[k] = (data[k] === undefined || data[k] === null) ? defaults[k] : data[k];
  });
  Object.keys(data).forEach(function (k) {
    if (!(k in out)) out[k] = data[k]; // pass through any other schema field (e.g. title)
  });
  return out;
}

function patchOf_(data) {
  var patch = {};
  Object.keys(data).forEach(function (k) {
    if (k !== 'id' && k !== 'created_at') patch[k] = data[k];
  });
  return patch;
}

/* ============================================================================
 *  ONE-TIME SETUP — run these from the Apps Script editor (or the sheet menu)
 *  ========================================================================== */

/** Adds the PersonalOS menu to the spreadsheet. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('PersonalOS')
    .addItem('1. Create/repair database sheets', 'setupSheets')
    .addItem('2. Add sample data (for testing)', 'setupSampleData')
    .addToUi();
}

/** Creates every sheet with its header row. Safe to run again. */
function setupSheets() {
  _ensured = false;
  ensureSheets_();
  try {
    SpreadsheetApp.getActive().toast('PersonalOS database is ready.', 'PersonalOS', 5);
  } catch (e) { /* running outside a bound context — ignore */ }
}

/** Optional: fill the database with realistic sample data so you can
 *  immediately see the dashboard, charts and analytics working.
 *  Dates are generated relative to today. */
function setupSampleData() {
  _ensured = false;
  ensureSheets_();

  var now = nowIso_();
  var today = today_();

  // ---- settings ----
  saveSettings_({ user_name: 'Student', daily_focus_goal_minutes: '120' });

  // ---- goals (hierarchy) ----
  var gMaster = createRecord_('Goals', {
    title: 'Web Security Mastery', description: 'Become strong at web exploitation end to end.',
    category: 'Learning', target_date: addDaysStr_(today, 180), progress: 80, status: 'active', parent_goal_id: ''
  });
  var gCpts = createRecord_('Goals', {
    title: 'HTB CPTS Certification', description: 'Pass the CPTS exam.',
    category: 'Learning', target_date: addDaysStr_(today, 90), progress: 45, status: 'active', parent_goal_id: gMaster.id
  });
  createRecord_('Goals', {
    title: 'Read 12 books this year', description: '',
    category: 'Personal', target_date: addDaysStr_(today, 120), progress: 33, status: 'active', parent_goal_id: ''
  });

  // ---- tasks ----
  var t1 = createRecord_('Tasks', {
    title: 'Complete PortSwigger SQLi labs', description: 'Finish the SQL injection section.',
    category: 'Learning', priority: 'high', status: 'pending',
    estimated_minutes: 90, actual_minutes: '', goal_id: gMaster.id, project_id: '',
    scheduled_date: today, completed_at: ''
  });
  var t2 = createRecord_('Tasks', {
    title: 'Finish pentest report', description: 'Methodology + findings.',
    category: 'Projects', priority: 'high', status: 'pending',
    estimated_minutes: 120, actual_minutes: '', goal_id: '', project_id: 'pentest-report',
    scheduled_date: today, completed_at: ''
  });
  var t3 = createRecord_('Tasks', {
    title: 'CTF practice — web challenges', description: '2 challenges minimum.',
    category: 'Learning', priority: 'medium', status: 'pending',
    estimated_minutes: 60, actual_minutes: '', goal_id: '', project_id: '',
    scheduled_date: today, completed_at: ''
  });
  createRecord_('Tasks', {
    title: 'Review IAM privilege escalation notes', description: '',
    category: 'Learning', priority: 'low', status: 'pending',
    estimated_minutes: 45, actual_minutes: '', goal_id: gCpts.id, project_id: '',
    scheduled_date: addDaysStr_(today, -1), completed_at: '' // overdue sample
  });
  createRecord_('Tasks', {
    title: 'Set up PersonalOS spreadsheet database', description: '',
    category: 'Projects', priority: 'medium', status: 'completed',
    estimated_minutes: 60, actual_minutes: 50, goal_id: '', project_id: 'personal-os',
    scheduled_date: addDaysStr_(today, -1), completed_at: addDaysStr_(today, -1) + 'T18:30:00'
  });
  createRecord_('Tasks', {
    title: 'Morning review of CPTS module', description: '',
    category: 'Learning', priority: 'medium', status: 'completed',
    estimated_minutes: 30, actual_minutes: 35, goal_id: gCpts.id, project_id: '',
    scheduled_date: today, completed_at: today + 'T09:15:00'
  });

  // ---- routines ----
  var routines = [
    ['06:30', 'Wake Up', 15], ['07:00', 'Exercise', 45], ['08:00', 'Deep Work', 120],
    ['10:00', 'Break', 20], ['10:30', 'Learning', 90], ['14:00', 'Project Work', 150], ['20:00', 'Review', 30]
  ];
  routines.forEach(function (r, i) {
    createRecord_('Routines', {
      title: r[1], description: '', category: i === 6 ? 'Personal' : 'Learning',
      target_time: r[0], duration_minutes: r[2],
      days: (i === 1 || i === 6) ? 'Sat,Sun' : 'Every day', enabled: true
    });
  });

  // ---- habits + 7 days of logs ----
  var hStudy = createRecord_('Habits', { title: 'Study security', frequency: 'daily', target: 1, enabled: true });
  var hExe   = createRecord_('Habits', { title: 'Exercise', frequency: 'daily', target: 1, enabled: true });
  var hRead  = createRecord_('Habits', { title: 'Read', frequency: 'daily', target: 1, enabled: true });
  createRecord_('Habits', { title: 'Sleep on time', frequency: 'daily', target: 1, enabled: true });
  createRecord_('Habits', { title: 'Daily review', frequency: 'daily', target: 1, enabled: true });

  var pattern = { study: 6, exe: 4, read: 5 }; // days completed out of last 7 (skipping some)
  for (var i = 6; i >= 0; i--) {
    var d = addDaysStr_(today, -i);
    if (pattern.study > 0) { createRecord_('HabitLogs', { habit_id: hStudy.id, date: d, completed: true, note: '' }); pattern.study--; }
    if (i % 2 === 1 && pattern.exe > 0) { createRecord_('HabitLogs', { habit_id: hExe.id, date: d, completed: true, note: '' }); pattern.exe--; }
    if (i !== 1 && pattern.read > 0) { createRecord_('HabitLogs', { habit_id: hRead.id, date: d, completed: true, note: '' }); pattern.read--; }
  }
  recomputeStreaks_(hStudy.id);
  recomputeStreaks_(hExe.id);
  recomputeStreaks_(hRead.id);

  // ---- focus sessions for the last 5 days ----
  for (var day = 4; day >= 0; day--) {
    var dd = addDaysStr_(today, -day);
    createRecord_('FocusSessions', {
      task_id: day === 0 ? t1.id : '', category: 'Learning',
      start_time: dd + 'T08:00:00', end_time: dd + 'T09:30:00',
      duration_minutes: 90, focus_rating: 4, interruptions: 1, notes: ''
    });
    createRecord_('FocusSessions', {
      task_id: day === 0 ? t2.id : '', category: 'Projects',
      start_time: dd + 'T14:00:00', end_time: dd + 'T15:20:00',
      duration_minutes: 80, focus_rating: 3, interruptions: 2, notes: ''
    });
    if (day % 2 === 0) {
      createRecord_('FocusSessions', {
        task_id: '', category: 'Entertainment',
        start_time: dd + 'T21:00:00', end_time: dd + 'T21:45:00',
        duration_minutes: 45, focus_rating: 1, interruptions: 3, notes: 'scrolling'
      });
    }
  }

  // ---- a few daily reviews ----
  [1, 2, 3].forEach(function (back) {
    createRecord_('DailyReviews', {
      date: addDaysStr_(today, -back),
      energy: 4, focus: back === 2 ? 2 : 4, motivation: 4, stress: 2,
      accomplishments: 'Finished CPTS reading block.', blockers: '', notes: ''
    });
  });

  Logger.log('Sample data created. Open the spreadsheet or the web app to see it.');
}
