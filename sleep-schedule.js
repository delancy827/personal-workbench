/* Personal learning-day boundaries for late sleep schedules. */
(function (root) {
  'use strict';

  var DEFAULT_SLEEP_SCHEDULE = {
    wake_time: '15:00',
    sleep_time: '07:00',
    day_start: '15:00'
  };

  function validTime(value) {
    return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  }

  function normalizeSleepSchedule(value) {
    value = value || {};
    return {
      wake_time: validTime(value.wake_time) ? value.wake_time : DEFAULT_SLEEP_SCHEDULE.wake_time,
      sleep_time: validTime(value.sleep_time) ? value.sleep_time : DEFAULT_SLEEP_SCHEDULE.sleep_time,
      day_start: validTime(value.day_start) ? value.day_start : DEFAULT_SLEEP_SCHEDULE.day_start
    };
  }

  function shiftDate(date, days) {
    var result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function dateString(date) {
    return date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
  }

  function learningDateString(date, schedule) {
    var current = date instanceof Date ? new Date(date) : new Date();
    var normalized = normalizeSleepSchedule(schedule);
    var currentTime = current.getHours() * 60 + current.getMinutes();
    var startParts = normalized.day_start.split(':');
    var dayStart = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10);
    return dateString(currentTime < dayStart ? shiftDate(current, -1) : current);
  }

  function describeSleepSchedule(schedule) {
    var s = normalizeSleepSchedule(schedule);
    return '学习日 ' + s.day_start + ' 开始 · 作息 ' + s.sleep_time + '–' + s.wake_time;
  }

  var api = {
    DEFAULT_SLEEP_SCHEDULE: DEFAULT_SLEEP_SCHEDULE,
    normalizeSleepSchedule: normalizeSleepSchedule,
    learningDateString: learningDateString,
    describeSleepSchedule: describeSleepSchedule
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SleepSchedule = api;
})(typeof window !== 'undefined' ? window : globalThis);
