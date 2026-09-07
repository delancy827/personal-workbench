/* Learning-day aggregation based on real timestamps. */
(function (root) {
  'use strict';

  var SleepSchedule = root.SleepSchedule;
  if (!SleepSchedule && typeof module !== 'undefined' && module.exports) {
    SleepSchedule = require('./sleep-schedule.js');
  }

  var DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  function asDate(value) {
    if (!value) return null;
    var date = value instanceof Date ? new Date(value) : new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  function hasValidTimestamp(value) {
    return !!asDate(value);
  }

  function validDateString(value) {
    return DATE_PATTERN.test(String(value || ''));
  }

  // A saved learning-day start keeps historical sessions stable when the user
  // later changes today's schedule. New records receive this snapshot when
  // they are created or migrated.
  function sessionSchedule(session, schedule) {
    var normalized = SleepSchedule.normalizeSleepSchedule(schedule);
    if (session && SleepSchedule.validTime(session.learning_day_start)) {
      normalized.day_start = session.learning_day_start;
    }
    return normalized;
  }

  function durationMinutes(session) {
    var value = parseFloat(session && session.duration_minutes);
    return isNaN(value) || value < 0 ? 0 : value;
  }

  function endClock(session, fallback) {
    if (session && SleepSchedule.validTime(session.end_time)) return session.end_time;
    if (session && SleepSchedule.validTime(session.start_time)) return session.start_time;
    return fallback || '12:00';
  }

  function legacySessionEnd(session, schedule) {
    var fallback = asDate(session && session.updated_at) || new Date();
    if (!session || !session.date) return fallback;

    var clock = endClock(session, String(fallback.getHours()).padStart(2, '0') + ':' + String(fallback.getMinutes()).padStart(2, '0'));
    var calendarCandidate = SleepSchedule.dateAtTime(session.date, clock);
    var learningCandidate = SleepSchedule.dateTimeForLearningDate(session.date, clock, schedule);
    // `date` is the learning date, so a pre-boundary clock belongs to the
    // following natural date. Do not let an edit timestamp silently switch it
    // back to a calendar-day interpretation.
    return learningCandidate || calendarCandidate || fallback;
  }

  function sessionInterval(session, schedule) {
    session = session || {};
    var effectiveSchedule = sessionSchedule(session, schedule);
    var end = asDate(session.ended_at) || asDate(session.occurred_at) || legacySessionEnd(session, effectiveSchedule);
    var start = asDate(session.started_at);
    if (!start || start.getTime() > end.getTime()) {
      start = new Date(end.getTime() - durationMinutes(session) * 60000);
    }
    return { start: start, end: end };
  }

  function sessionLearningDate(session, schedule) {
    if (session && validDateString(session.date)) return String(session.date);
    var effectiveSchedule = sessionSchedule(session, schedule);
    return SleepSchedule.learningDateString(sessionInterval(session, effectiveSchedule).end, effectiveSchedule);
  }

  function rangeForLearningDate(date, schedule) {
    var start = SleepSchedule.learningDayStart(date, schedule);
    var end = SleepSchedule.learningDayStart(SleepSchedule.shiftDateString(date, 1), schedule);
    return { start: start, end: end };
  }

  function overlapMinutes(interval, range) {
    if (!interval || !range || !range.start || !range.end) return 0;
    var start = Math.max(interval.start.getTime(), range.start.getTime());
    var end = Math.min(interval.end.getTime(), range.end.getTime());
    return end > start ? (end - start) / 60000 : 0;
  }

  function sessionMinutesOnLearningDate(session, date, schedule) {
    var effectiveSchedule = sessionSchedule(session, schedule);
    return overlapMinutes(sessionInterval(session, effectiveSchedule), rangeForLearningDate(date, effectiveSchedule));
  }

  function sessionMinutesInLearningRange(session, startDate, endDate, schedule) {
    var effectiveSchedule = sessionSchedule(session, schedule);
    var start = SleepSchedule.learningDayStart(startDate, effectiveSchedule);
    var end = SleepSchedule.learningDayStart(SleepSchedule.shiftDateString(endDate, 1), effectiveSchedule);
    return overlapMinutes(sessionInterval(session, effectiveSchedule), { start: start, end: end });
  }

  function sessionSortTime(session, schedule) {
    return sessionInterval(session, schedule).end.getTime();
  }

  function learningDateForTask(task, schedule) {
    if (task && validDateString(task.date)) return String(task.date);
    var created = asDate(task && task.created_at);
    return created ? SleepSchedule.learningDateString(created, schedule) : String((task && task.date) || '');
  }

  function learningDateForCheckin(checkin, schedule) {
    if (checkin && validDateString(checkin.date)) return String(checkin.date);
    var created = asDate(checkin && (checkin.checkin_at || checkin.created_at));
    return created ? SleepSchedule.learningDateString(created, schedule) : String((checkin && checkin.date) || '');
  }

  function updateTimestamp(target, key, value) {
    var iso = value.toISOString();
    if (target[key] === iso) return false;
    target[key] = iso;
    return true;
  }

  function updateValue(target, key, value) {
    if (target[key] === value) return false;
    target[key] = value;
    return true;
  }

  function migrateFocusSession(session, schedule, nowIso) {
    if (!session || typeof session !== 'object') return false;

    var normalized = SleepSchedule.normalizeSleepSchedule(schedule);
    var interval = sessionInterval(session, normalized);
    var hasCompleteInterval = hasValidTimestamp(session.started_at) && hasValidTimestamp(session.ended_at)
      && new Date(session.started_at).getTime() <= new Date(session.ended_at).getTime();
    var changed = false;

    if (!hasCompleteInterval) {
      changed = updateTimestamp(session, 'started_at', interval.start) || changed;
      changed = updateTimestamp(session, 'ended_at', interval.end) || changed;
    }
    changed = updateValue(session, 'start_time', SleepSchedule.validTime(session.start_time) ? session.start_time :
      String(interval.start.getHours()).padStart(2, '0') + ':' + String(interval.start.getMinutes()).padStart(2, '0')) || changed;
    changed = updateValue(session, 'end_time', SleepSchedule.validTime(session.end_time) ? session.end_time :
      String(interval.end.getHours()).padStart(2, '0') + ':' + String(interval.end.getMinutes()).padStart(2, '0')) || changed;
    if (!validDateString(session.date)) {
      changed = updateValue(session, 'date', SleepSchedule.learningDateString(interval.end, normalized)) || changed;
    }
    if (!SleepSchedule.validTime(session.learning_day_start)) {
      changed = updateValue(session, 'learning_day_start', normalized.day_start) || changed;
    }
    return changed;
  }

  function inferTaskTimestamp(task, schedule) {
    var created = asDate(task && task.created_at);
    if (created) return created;
    var updated = asDate(task && task.updated_at);
    if (!updated || !task || !task.date) return null;
    return SleepSchedule.learningDateString(updated, schedule) === task.date ? updated : null;
  }

  function migrateTask(task, schedule, nowIso) {
    if (!task || typeof task !== 'object') return false;
    var created = inferTaskTimestamp(task, schedule);
    var changed = false;
    if (!hasValidTimestamp(task.created_at) && created) {
      changed = updateTimestamp(task, 'created_at', created) || changed;
    }
    if (!validDateString(task.date) && created) {
      changed = updateValue(task, 'date', SleepSchedule.learningDateString(created, schedule)) || changed;
    }
    return changed;
  }

  function inferCheckinTimestamp(checkin, schedule) {
    var checked = asDate(checkin && (checkin.checkin_at || checkin.created_at));
    if (checked) return checked;
    var updated = asDate(checkin && checkin.updated_at);
    if (!updated || !checkin || !checkin.date) return null;
    return SleepSchedule.learningDateString(updated, schedule) === checkin.date ? updated : null;
  }

  function migrateCheckin(checkin, schedule, nowIso) {
    if (!checkin || typeof checkin !== 'object') return false;
    var checked = inferCheckinTimestamp(checkin, schedule);
    var changed = false;
    if (!hasValidTimestamp(checkin.checkin_at) && checked) {
      changed = updateTimestamp(checkin, 'checkin_at', checked) || changed;
    }
    if (!validDateString(checkin.date) && checked) {
      changed = updateValue(checkin, 'date', SleepSchedule.learningDateString(checked, schedule)) || changed;
    }
    return changed;
  }

  var api = {
    sessionInterval: sessionInterval,
    sessionLearningDate: sessionLearningDate,
    sessionMinutesOnLearningDate: sessionMinutesOnLearningDate,
    sessionMinutesInLearningRange: sessionMinutesInLearningRange,
    sessionSortTime: sessionSortTime,
    learningDateForTask: learningDateForTask,
    learningDateForCheckin: learningDateForCheckin,
    migrateFocusSession: migrateFocusSession,
    migrateTask: migrateTask,
    migrateCheckin: migrateCheckin
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LearningTimeline = api;
})(typeof window !== 'undefined' ? window : globalThis);
