/**
 * 逻辑验证测试 - 用 Node.js 运行
 * 运行: node test-logic.js
 */

// 模拟浏览器环境
global.localStorage = {
  _store: {},
  getItem(key) { return this._store[key] || null; },
  setItem(key, val) { this._store[key] = val; },
  removeItem(key) { delete this._store[key]; },
};

// 引入模块
const { filterLast14Days, getCutoffDate, safeCleanLocalData, getDataStats } = require("./data-filter.js");
const { SyncEngine } = require("./sync-engine.js");
const { normalizeSleepSchedule, learningDateString, learningDateOffset } = require("./sleep-schedule.js");
const {
  sessionInterval,
  sessionLearningDate,
  sessionMinutesOnLearningDate,
  sessionSortTime,
  learningDateForTask,
  learningDateForCheckin,
  migrateFocusSession,
  migrateTask,
  migrateCheckin
} = require("./learning-timeline.js");

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  [PASS] ${msg}`); }
  else { failed++; console.log(`  [FAIL] ${msg}`); }
}

// ==================== 测试作息日切分 ====================
console.log("\n=== Test 0: sleep schedule ===");
const schedule = normalizeSleepSchedule({ sleep_time: "07:00", wake_time: "15:00", day_start: "15:00" });
assert(learningDateString(new Date("2026-08-20T04:00:00+08:00"), schedule) === "2026-08-19", "凌晨4点归入前一天学习日");
assert(learningDateString(new Date("2026-08-20T15:00:00+08:00"), schedule) === "2026-08-20", "下午3点开启新学习日");
assert(learningDateString(new Date("2026-08-20T12:00:00+08:00"), schedule) === "2026-08-19", "中午12点仍归入前一天学习日");
assert(learningDateOffset(new Date("2026-08-20T04:00:00+08:00"), schedule, -1) === "2026-08-18", "凌晨学习日向前偏移一天正确");
assert(learningDateOffset(new Date("2026-08-20T04:00:00+08:00"), schedule, 1) === "2026-08-20", "凌晨学习日向后偏移一天正确");

const earlySession = {
  date: "2026-08-31",
  start_time: "03:35",
  end_time: "04:00",
  duration_minutes: 25,
  updated_at: "2026-09-01T04:00:00+08:00"
};
const earlyInterval = sessionInterval(earlySession, schedule);
assert(earlyInterval.end.getDate() === 1 && earlyInterval.end.getHours() === 4, "旧版凌晨记录恢复为真实自然日时间");
assert(sessionLearningDate(earlySession, schedule) === "2026-08-31", "凌晨记录归入前一天学习日");

const boundarySession = {
  started_at: "2026-09-01T14:30:00+08:00",
  ended_at: "2026-09-01T15:30:00+08:00",
  duration_minutes: 60
};
assert(sessionMinutesOnLearningDate(boundarySession, "2026-08-31", schedule) === 30, "跨学习日起点前的30分钟归前一天");
assert(sessionMinutesOnLearningDate(boundarySession, "2026-09-01", schedule) === 30, "跨学习日起点后的30分钟归当天");

const lateSession = {
  started_at: "2026-09-01T20:00:00+08:00",
  ended_at: "2026-09-01T20:30:00+08:00",
  duration_minutes: 30
};
assert(sessionSortTime(lateSession, schedule) > sessionSortTime(earlySession, schedule), "记录按真实时间而非学习日日期排序");
assert(learningDateForTask({ date: "2026-09-01", created_at: "2026-09-01T04:00:00+08:00" }, schedule) === "2026-09-01", "任务显式登记日期优先");
assert(learningDateForCheckin({ date: "2026-09-01", checkin_at: "2026-09-01T04:00:00+08:00" }, schedule) === "2026-09-01", "打卡显式登记日期优先");

const legacySession = { ...earlySession };
assert(migrateFocusSession(legacySession, schedule, "2026-09-01T10:00:00+08:00"), "旧版专注记录会补全真实时间");
assert(legacySession.started_at && legacySession.ended_at && legacySession.date === "2026-08-31", "旧版专注记录迁移后保留正确学习日");
const legacyTask = { date: "2026-08-31", updated_at: "2026-09-01T04:00:00+08:00" };
assert(migrateTask(legacyTask, schedule, "2026-09-01T10:00:00+08:00"), "凌晨旧任务会补全创建时间");
assert(legacyTask.created_at && learningDateForTask(legacyTask, schedule) === "2026-08-31", "旧任务迁移后归属正确学习日");
const legacyCheckin = { date: "2026-08-31", updated_at: "2026-09-01T04:00:00+08:00" };
assert(migrateCheckin(legacyCheckin, schedule, "2026-09-01T10:00:00+08:00"), "凌晨旧打卡会补全真实时间");
assert(legacyCheckin.checkin_at && learningDateForCheckin(legacyCheckin, schedule) === "2026-08-31", "旧打卡迁移后归属正确学习日");

// ==================== 测试 14 天过滤 ====================
console.log("\n=== Test 1: filterLast14Days ===");

const today = new Date();
const fmt = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const learningToday = learningDateString(today, schedule);
const daysAgo = (n) => learningDateOffset(today, schedule, -n);

const testRecords = [
  { client_id: "r1", date: learningToday, duration_minutes: 25 },      // 今天 → 保留
  { client_id: "r2", date: daysAgo(7), duration_minutes: 30 },        // 7天前 → 保留
  { client_id: "r3", date: daysAgo(13), duration_minutes: 45 },       // 13天前 → 保留
  { client_id: "r4", date: daysAgo(14), duration_minutes: 20 },       // 14天前 → 边界
  { client_id: "r5", date: daysAgo(15), duration_minutes: 60 },       // 15天前 → 移除
  { client_id: "r6", date: daysAgo(30), duration_minutes: 90 },       // 30天前 → 移除
  { client_id: "r7", date: null, duration_minutes: 10 },              // 无日期 → 保留(兜底)
];

const filtered = filterLast14Days(testRecords);
assert(filtered.length === 5, `过滤后应为5条, 实际 ${filtered.length}`);
assert(filtered.some(r => r.client_id === "r1"), "今天的记录保留");
assert(filtered.some(r => r.client_id === "r3"), "13天前的记录保留");
assert(!filtered.some(r => r.client_id === "r5"), "15天前的记录移除");
assert(!filtered.some(r => r.client_id === "r6"), "30天前的记录移除");
assert(filtered.some(r => r.client_id === "r7"), "无日期记录保留(安全兜底)");

// ==================== 测试合并算法 ====================
console.log("\n=== Test 2: mergeRecords ===");

const mockGist = { download: async () => ({}), upload: async () => ({}) };
const engine = new SyncEngine(mockGist);

const localArr = [
  { client_id: "a", title: "local-new", updated_at: "2026-07-28T10:00:00Z" },
  { client_id: "b", title: "local-old", updated_at: "2026-07-20T08:00:00Z" },
  { client_id: "c", title: "local-only", updated_at: "2026-07-28T09:00:00Z" },
];

const remoteArr = [
  { client_id: "a", title: "remote-old", updated_at: "2026-07-27T10:00:00Z" },
  { client_id: "b", title: "remote-new", updated_at: "2026-07-25T12:00:00Z" },
  { client_id: "d", title: "remote-only", updated_at: "2026-07-26T10:00:00Z" },
];

const { merged, stats } = engine.mergeRecords(localArr, remoteArr);

assert(merged.length === 4, `合并后应为4条, 实际 ${merged.length}`);
assert(merged.find(r => r.client_id === "a").title === "local-new", "a: 本地更新赢");
assert(merged.find(r => r.client_id === "b").title === "remote-new", "b: 云端更新赢");
assert(merged.find(r => r.client_id === "c").title === "local-only", "c: 本地独有保留");
assert(merged.find(r => r.client_id === "d").title === "remote-only", "d: 云端独有保留");
assert(stats.local_only === 1, "local_only = 1");
assert(stats.updated_local === 1, "updated_local = 1");
assert(stats.updated_remote === 1, "updated_remote = 1");

// ==================== 测试安全清理 ====================
console.log("\n=== Test 3: safeCleanLocalData ===");

const cleanData = {
  focus_sessions: [
    { client_id: "s1", date: fmt(today), updated_at: "2026-07-28T10:00:00Z" },
    { client_id: "s2", date: daysAgo(20), updated_at: "2026-07-01T10:00:00Z" },
    { client_id: "s3", date: daysAgo(20), updated_at: "2026-07-27T10:00:00Z" }, // 旧日期但未同步
  ],
  tasks: [],
  meta: { last_sync_at: "2026-07-15T00:00:00Z" },
};
localStorage.setItem("workbench_data", JSON.stringify(cleanData));

const cleanResult = safeCleanLocalData();
const afterClean = JSON.parse(localStorage.getItem("workbench_data"));

assert(afterClean.focus_sessions.length === 2, `清理后应保留2条, 实际 ${afterClean.focus_sessions.length}`);
assert(cleanResult.removedSessions === 1, `应删除1条, 实际 ${cleanResult.removedSessions}`);
assert(cleanResult.keptUnsafe === 1, `应保留1条未同步, 实际 ${cleanResult.keptUnsafe}`);

// ==================== 测试统计 ====================
console.log("\n=== Test 4: getDataStats ===");

const statsRecords = [
  { date: fmt(today) },
  { date: fmt(today) },
  { date: daysAgo(5) },
  { date: daysAgo(20) },
];
const dataStats = getDataStats(statsRecords);
assert(dataStats.total === 4, "total = 4");
assert(dataStats.todayCount === 2, "todayCount = 2");
assert(dataStats.last14DaysCount === 3, "last14DaysCount = 3");

// ==================== 测试学习日边界与安全兜底 ====================
console.log("\n=== Test 5: learning-day filtering and cleanup ===");

const RealDate = Date;
const fixedNow = new RealDate("2026-09-07T04:00:00+08:00");
class MockDate extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [fixedNow.getTime()]));
  }
  static now() { return fixedNow.getTime(); }
}

global.Date = MockDate;
try {
  const lateSchedule = normalizeSleepSchedule({
    sleep_time: "07:00",
    wake_time: "15:00",
    day_start: "15:00"
  });
  const currentLearningDate = learningDateString(new Date(), lateSchedule);
  const cutoff = getCutoffDate(14, lateSchedule);

  assert(currentLearningDate === "2026-09-06", "凌晨4点的当前学习日是前一天");
  assert(cutoff === "2026-08-23", `学习日14天截止日期正确, 实际 ${cutoff}`);

  const lateRecords = [
    { client_id: "late-current", date: "2026-09-06" },
    { client_id: "late-cutoff", date: "2026-08-23" },
    { client_id: "late-old", date: "2026-08-22" },
    { client_id: "late-missing", date: null },
    { client_id: "late-invalid", date: "2026-02-30" },
  ];
  const lateFiltered = filterLast14Days(lateRecords, 14, lateSchedule);
  assert(lateFiltered.some((record) => record.client_id === "late-current"), "当前学习日记录保留");
  assert(lateFiltered.some((record) => record.client_id === "late-cutoff"), "学习日截止边界记录保留");
  assert(!lateFiltered.some((record) => record.client_id === "late-old"), "超过学习日截止的记录移除");
  assert(lateFiltered.some((record) => record.client_id === "late-missing"), "缺失日期记录保留");
  assert(lateFiltered.some((record) => record.client_id === "late-invalid"), "非法日期记录保留");

  localStorage.setItem("workbench_data", JSON.stringify({
    settings: { sleep_schedule: { day_start: "00:00" } },
    meta: { last_sync_at: "2026-09-01T00:00:00+08:00" },
    focus_sessions: [
      { client_id: "settings-cutoff", date: "2026-08-23", updated_at: "2026-08-20T00:00:00+08:00" },
      { client_id: "missing-date", date: null, updated_at: "2026-08-20T00:00:00+08:00" },
      { client_id: "invalid-date", date: "2026-02-30", updated_at: "2026-08-20T00:00:00+08:00" },
      { client_id: "missing-updated", date: "2026-08-22" },
      { client_id: "invalid-updated", date: "2026-08-22", updated_at: "not-a-date" },
    ],
    tasks: []
  }));
  const settingsCleanup = safeCleanLocalData();
  const afterSettingsCleanup = JSON.parse(localStorage.getItem("workbench_data"));
  assert(settingsCleanup.removedSessions === 1, "清理使用 data.settings.sleep_schedule");
  assert(afterSettingsCleanup.focus_sessions.length === 4, "日期或同步状态不可信的记录保留");
  assert(afterSettingsCleanup.focus_sessions.some((record) => record.client_id === "missing-date"), "清理保留缺失日期");
  assert(afterSettingsCleanup.focus_sessions.some((record) => record.client_id === "invalid-date"), "清理保留非法日期");
  assert(afterSettingsCleanup.focus_sessions.some((record) => record.client_id === "missing-updated"), "非强制清理保留缺失 updated_at");
  assert(afterSettingsCleanup.focus_sessions.some((record) => record.client_id === "invalid-updated"), "非强制清理保留非法 updated_at");
} finally {
  global.Date = RealDate;
}

// ==================== 结果 ====================
console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) console.log("[OK] All logic tests passed!");
else process.exit(1);
