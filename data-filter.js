/**
 * ============================================================
 * 数据过滤模块 - 14天裁剪算法
 * ============================================================
 *
 * 职责：
 *   - 手机端：只保留最近 14 个学习日的数据（显示层 + 存储层）
 *   - 电脑端：不做裁剪，保留全量
 *   - 安全机制：未同步或日期不可信的数据即使超期也不删除
 *
 * 调用时机：
 *   - 每次打开 App 时执行一次本地清理
 *   - 从 Gist 下载数据后，手机端执行裁剪
 */

const FALLBACK_DAY_START = "15:00";
let sleepScheduleModule = null;

// data-filter.js 在页面中先于 sleep-schedule.js 加载，因此只在函数调用时解析依赖。
if (typeof require === "function") {
  try { sleepScheduleModule = require("./sleep-schedule.js"); } catch (_) { /* 浏览器环境没有该模块 */ }
}

function getSleepScheduleApi() {
  if (typeof SleepSchedule !== "undefined") return SleepSchedule;
  if (typeof globalThis !== "undefined" && globalThis.SleepSchedule) return globalThis.SleepSchedule;
  return sleepScheduleModule;
}

function isValidTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeSchedule(schedule) {
  const api = getSleepScheduleApi();
  if (api && typeof api.normalizeSleepSchedule === "function") {
    return api.normalizeSleepSchedule(schedule);
  }
  return { day_start: isValidTime(schedule && schedule.day_start) ? schedule.day_start : FALLBACK_DAY_START };
}

function learningDateString(date, schedule) {
  const api = getSleepScheduleApi();
  const normalized = normalizeSchedule(schedule);
  if (api && typeof api.learningDateString === "function") {
    return api.learningDateString(date, normalized);
  }

  const current = date instanceof Date ? new Date(date) : new Date();
  const parts = normalized.day_start.split(":");
  const dayStart = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  if (current.getHours() * 60 + current.getMinutes() < dayStart) current.setDate(current.getDate() - 1);
  return localDateString(current);
}

function shiftDateString(value, days) {
  const api = getSleepScheduleApi();
  if (api && typeof api.shiftDateString === "function") return api.shiftDateString(value, days);

  const current = new Date(String(value || "") + "T12:00:00");
  if (Number.isNaN(current.getTime())) return String(value || "");
  current.setDate(current.getDate() + days);
  return localDateString(current);
}

function normalizeDays(value) {
  if (value === undefined || value === null || value === "") return 14;
  const days = Number(value);
  return Number.isFinite(days) ? days : 14;
}

function normalizeFilterArgs(daysOrSchedule, schedule) {
  if (daysOrSchedule && typeof daysOrSchedule === "object") {
    const hasOptions = Object.prototype.hasOwnProperty.call(daysOrSchedule, "days") ||
      Object.prototype.hasOwnProperty.call(daysOrSchedule, "schedule");
    return {
      days: hasOptions ? normalizeDays(daysOrSchedule.days) : 14,
      schedule: hasOptions ? daysOrSchedule.schedule : daysOrSchedule
    };
  }
  return { days: normalizeDays(daysOrSchedule), schedule: schedule };
}

function isValidDateString(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(String(value) + "T12:00:00");
  return !Number.isNaN(date.getTime()) &&
    date.getFullYear() === Number(match[1]) &&
    date.getMonth() + 1 === Number(match[2]) &&
    date.getDate() === Number(match[3]);
}

function timestamp(value) {
  if (value === undefined || value === null || value === "") return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * 过滤出最近 14 个学习日的记录
 *
 * @param {Array} records - 记录数组（focus_sessions 或 tasks）
 * @param {number|object} days - 保留学习日数，默认 14；也可直接传 schedule
 * @param {object} schedule - 作息配置，学习日从 schedule.day_start 开始
 * @returns {Array} 仅包含最近 N 天的记录
 *
 * 规则：
 *   - 以记录的 date 字段（YYYY-MM-DD 学习日）为判断依据
 *   - date >= 当前学习日 - 14天 → 保留
 *   - date < 当前学习日 - 14天 → 移除
 *   - 缺失或非法 date 始终保留，避免误删无法判断的数据
 */
function filterLast14Days(records, days = 14, schedule) {
  if (!Array.isArray(records)) return [];

  const args = normalizeFilterArgs(days, schedule);
  const cutoffDate = getCutoffDate(args.days, args.schedule);

  return records.filter((record) => {
    // 日期缺失或非法时无法安全判断，始终保留。
    if (!record || !isValidDateString(record.date)) return true;

    // 合法 YYYY-MM-DD 字符串可以直接比较。
    return String(record.date) >= cutoffDate;
  });
}

function localDateString(date) {
  return date.getFullYear() + "-" +
    String(date.getMonth() + 1).padStart(2, "0") + "-" +
    String(date.getDate()).padStart(2, "0");
}

/**
 * 计算截止学习日字符串
 * @param {number|object} days - 往回推的学习日数；也可直接传 schedule
 * @param {object} schedule - 作息配置
 * @returns {string} YYYY-MM-DD 格式的截止日期
 */
function getCutoffDate(days = 14, schedule) {
  const args = normalizeFilterArgs(days, schedule);
  const normalized = normalizeSchedule(args.schedule);
  const now = new Date();
  const api = getSleepScheduleApi();
  if (api && typeof api.learningDateOffset === "function") {
    return api.learningDateOffset(now, normalized, -args.days);
  }
  return shiftDateString(learningDateString(now, normalized), -args.days);
}

/**
 * 安全清理本地数据（手机端每次打开 App 时调用）
 *
 * 与 filterLast14Days 的区别：
 *   - 本函数会检查「是否已同步」，未同步或同步状态不可信的旧数据不删除
 *   - 使用 settings.sleep_schedule 的学习日边界
 *   - 直接修改 localStorage
 *
 * @param {object} options
 * @param {boolean} options.forceClean - 强制清理（忽略未同步检查）
 * @param {object} options.schedule - 覆盖数据中的作息配置
 * @returns {object} { removedSessions, removedTasks, keptUnsafe }
 */
function safeCleanLocalData(options = {}) {
  const raw = localStorage.getItem("workbench_data");
  if (!raw) return { removedSessions: 0, removedTasks: 0, keptUnsafe: 0 };

  const data = JSON.parse(raw);
  options = options || {};
  const cutoffDate = getCutoffDate(14, options.schedule || data.settings?.sleep_schedule);
  const lastSyncTime = timestamp(data.meta?.last_sync_at);

  let removedSessions = 0;
  let removedTasks = 0;
  let keptUnsafe = 0;

  function cleanRecord(record, type) {
    // 日期缺失或非法时无法证明记录已过期，始终保留。
    if (!record || !isValidDateString(record.date)) {
      keptUnsafe++;
      return true;
    }
    if (String(record.date) >= cutoffDate) return true;

    // 强制清理只作用于日期可信的超期记录。
    if (!options.forceClean) {
      const updatedTime = timestamp(record.updated_at);
      // 无法确认同步状态时保留，避免误删本地数据。
      if (lastSyncTime === null || updatedTime === null || updatedTime > lastSyncTime) {
        keptUnsafe++;
        return true;
      }
    }

    if (type === "sessions") removedSessions++;
    else removedTasks++;
    return false;
  }

  // 清理专注记录
  if (Array.isArray(data.focus_sessions)) {
    data.focus_sessions = data.focus_sessions.filter((record) => cleanRecord(record, "sessions"));
  }

  // 清理任务
  if (Array.isArray(data.tasks)) {
    data.tasks = data.tasks.filter((record) => cleanRecord(record, "tasks"));
  }

  // 写回 localStorage
  localStorage.setItem("workbench_data", JSON.stringify(data));

  return { removedSessions, removedTasks, keptUnsafe };
}

/**
 * 获取数据统计信息（供 UI 显示）
 * @param {Array} records
 * @param {object} schedule - 作息配置，学习日从 schedule.day_start 开始
 * @returns {object} { total, todayCount, last14DaysCount, dateRange }
 */
function getDataStats(records, schedule) {
  if (!Array.isArray(records) || records.length === 0) {
    return { total: 0, todayCount: 0, last14DaysCount: 0, dateRange: null };
  }

  const args = normalizeFilterArgs(schedule);
  const today = learningDateString(new Date(), args.schedule);
  const cutoff = getCutoffDate(14, args.schedule);

  const dates = records.map((record) => String(record && record.date || ""))
    .filter(isValidDateString)
    .sort();

  return {
    total: records.length,
    todayCount: records.filter((record) => isValidDateString(record && record.date) && String(record.date) === today).length,
    last14DaysCount: records.filter((record) => isValidDateString(record && record.date) && String(record.date) >= cutoff).length,
    dateRange: dates.length ? {
      earliest: dates[0],
      latest: dates[dates.length - 1],
    } : null,
  };
}

// 导出
if (typeof module !== "undefined" && module.exports) {
  module.exports = { filterLast14Days, getCutoffDate, safeCleanLocalData, getDataStats };
}
