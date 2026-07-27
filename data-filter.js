/**
 * ============================================================
 * 数据过滤模块 - 14天裁剪算法
 * ============================================================
 *
 * 职责：
 *   - 手机端：只保留最近 14 天的数据（显示层 + 存储层）
 *   - 电脑端：不做裁剪，保留全量
 *   - 安全机制：未同步的数据即使超过 14 天也不删除
 *
 * 调用时机：
 *   - 每次打开 App 时执行一次本地清理
 *   - 从 Gist 下载数据后，手机端执行裁剪
 */

/**
 * 过滤出最近 14 天的记录
 *
 * @param {Array} records - 记录数组（focus_sessions 或 tasks）
 * @param {number} days - 保留天数，默认 14
 * @returns {Array} 仅包含最近 N 天的记录
 *
 * 规则：
 *   - 以记录的 date 字段（YYYY-MM-DD）为判断依据
 *   - date >= 今天 - 14天 → 保留
 *   - date < 今天 - 14天 → 移除
 */
function filterLast14Days(records, days = 14) {
  if (!Array.isArray(records)) return [];

  const cutoffDate = getCutoffDate(days);

  return records.filter((record) => {
    // 记录必须有 date 字段
    if (!record.date) return true; // 无日期的保留（安全兜底）

    // 比较日期字符串（YYYY-MM-DD 格式可直接字符串比较）
    return record.date >= cutoffDate;
  });
}

/**
 * 计算截止日期字符串
 * @param {number} days - 往回推的天数
 * @returns {string} YYYY-MM-DD 格式的截止日期
 */
function getCutoffDate(days = 14) {
  const now = new Date();
  now.setDate(now.getDate() - days);
  return now.toISOString().split("T")[0]; // "2026-07-14"
}

/**
 * 安全清理本地数据（手机端每次打开 App 时调用）
 *
 * 与 filterLast14Days 的区别：
 *   - 本函数会检查「是否已同步」，未同步的旧数据不删除
 *   - 直接修改 localStorage
 *
 * @param {object} options
 * @param {boolean} options.forceClean - 强制清理（忽略未同步检查）
 * @returns {object} { removedSessions, removedTasks, keptUnsafe }
 */
function safeCleanLocalData(options = { forceClean: false }) {
  const raw = localStorage.getItem("workbench_data");
  if (!raw) return { removedSessions: 0, removedTasks: 0, keptUnsafe: 0 };

  const data = JSON.parse(raw);
  const cutoffDate = getCutoffDate(14);
  const lastSyncAt = data.meta?.last_sync_at;

  let removedSessions = 0;
  let removedTasks = 0;
  let keptUnsafe = 0; // 超期但未同步，被迫保留的数量

  // 清理专注记录
  if (data.focus_sessions) {
    const before = data.focus_sessions.length;
    data.focus_sessions = data.focus_sessions.filter((record) => {
      if (record.date >= cutoffDate) return true; // 14天内，保留

      // 超过14天：检查是否已同步
      if (!options.forceClean && !lastSyncAt) {
        // 从未同步过 → 不敢删
        keptUnsafe++;
        return true;
      }

      // 如果记录的 updated_at 在最后一次同步之后 → 说明还没上传过
      if (!options.forceClean && record.updated_at && lastSyncAt) {
        if (new Date(record.updated_at) > new Date(lastSyncAt)) {
          keptUnsafe++;
          return true; // 未同步，保留
        }
      }

      removedSessions++;
      return false; // 已同步的旧数据，安全删除
    });
  }

  // 清理任务
  if (data.tasks) {
    data.tasks = data.tasks.filter((record) => {
      if (record.date >= cutoffDate) return true;

      if (!options.forceClean && !lastSyncAt) {
        keptUnsafe++;
        return true;
      }

      if (!options.forceClean && record.updated_at && lastSyncAt) {
        if (new Date(record.updated_at) > new Date(lastSyncAt)) {
          keptUnsafe++;
          return true;
        }
      }

      removedTasks++;
      return false;
    });
  }

  // 写回 localStorage
  localStorage.setItem("workbench_data", JSON.stringify(data));

  return { removedSessions, removedTasks, keptUnsafe };
}

/**
 * 获取数据统计信息（供 UI 显示）
 * @param {Array} records
 * @returns {object} { total, todayCount, last14DaysCount, dateRange }
 */
function getDataStats(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { total: 0, todayCount: 0, last14DaysCount: 0, dateRange: null };
  }

  const today = new Date().toISOString().split("T")[0];
  const cutoff = getCutoffDate(14);

  const dates = records.map((r) => r.date).filter(Boolean).sort();

  return {
    total: records.length,
    todayCount: records.filter((r) => r.date === today).length,
    last14DaysCount: records.filter((r) => r.date >= cutoff).length,
    dateRange: {
      earliest: dates[0],
      latest: dates[dates.length - 1],
    },
  };
}

// 导出
if (typeof module !== "undefined" && module.exports) {
  module.exports = { filterLast14Days, getCutoffDate, safeCleanLocalData, getDataStats };
}
