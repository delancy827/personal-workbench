/**
 * ============================================================
 * 同步引擎 - 上传/下载/合并/冲突处理
 * ============================================================
 *
 * 核心规则（必须严格执行）：
 *   1. 所有同步操作必须由用户手动点击按钮触发
 *   2. 禁止任何自动/静默同步
 *   3. 冲突解决：以 updated_at 时间戳最新者为准
 *   4. 无法判断时，返回冲突信息供前端弹窗询问用户
 */

// 依赖：gist-api.js 中的 GistClient（假设已在同一页面引入）

// 参与同步的记录集合（均以 client_id 为键、updated_at 最新优先合并）
// v2.1：在 focus_sessions / tasks 基础上扩展 courses / notes / checkins / reviews / goals
const SYNC_COLLECTIONS = ["focus_sessions", "tasks", "courses", "notes", "checkins", "reviews", "goals"];

/**
 * SyncEngine - 同步引擎
 * 负责本地数据与 Gist 云端数据的双向同步
 */
class SyncEngine {
  /**
   * @param {GistClient} gistClient - Gist API 客户端实例
   * @param {object} options
   * @param {function} options.onConflict - 冲突回调，前端弹窗用
   */
  constructor(gistClient, options = {}) {
    this.gist = gistClient;
    this.onConflict = options.onConflict || null;
  }

  // ==================== 本地存储操作 ====================

  /**
   * 从 localStorage 读取本地数据
   * @returns {object} 含全部集合 + settings + meta
   */
  getLocalData() {
    const empty = {
      focus_sessions: [], tasks: [], courses: [], notes: [],
      checkins: [], reviews: [], goals: [],
      settings: null, meta: { last_sync_at: null },
    };
    const raw = localStorage.getItem("workbench_data");
    if (!raw) return empty;
    try {
      const d = JSON.parse(raw);
      for (const key of SYNC_COLLECTIONS) d[key] = d[key] || [];
      d.settings = d.settings || null;
      d.meta = d.meta || { last_sync_at: null };
      return d;
    } catch {
      return empty;
    }
  }

  /**
   * 将数据写入 localStorage
   * @param {object} data
   */
  saveLocalData(data) {
    localStorage.setItem("workbench_data", JSON.stringify(data));
  }

  /**
   * settings 对象合并：整体 Last-Write-Wins（按 updated_at）
   */
  mergeSettings(localSettings, remoteSettings) {
    if (!localSettings) return remoteSettings || null;
    if (!remoteSettings) return localSettings;
    const lt = new Date(localSettings.updated_at || 0).getTime();
    const rt = new Date(remoteSettings.updated_at || 0).getTime();
    return lt >= rt ? localSettings : remoteSettings;
  }

  // ==================== 核心：合并算法 ====================

  /**
   * 合并两个记录数组（本地 + 云端）
   *
   * 策略：
   *   - 以 client_id 为唯一键
   *   - 两边都有 → 比较 updated_at，新的赢
   *   - 只有一边有 → 保留（并集）
   *   - updated_at 完全相同 → 视为无冲突，保留任一份
   *
   * @param {Array} localArr - 本地记录数组
   * @param {Array} remoteArr - 云端记录数组
   * @returns {object} { merged: Array, conflicts: Array, stats: object }
   */
  mergeRecords(localArr, remoteArr) {
    const merged = new Map();
    const conflicts = [];
    const stats = { local_only: 0, remote_only: 0, updated_local: 0, updated_remote: 0, same: 0 };

    // 1. 先把云端数据全部放入 Map
    for (const record of remoteArr) {
      merged.set(record.client_id, { ...record, _source: "remote" });
    }

    // 2. 遍历本地数据，进行合并
    for (const localRecord of localArr) {
      const id = localRecord.client_id;
      const remoteRecord = merged.get(id);

      if (!remoteRecord) {
        // 本地独有 → 直接加入
        merged.set(id, { ...localRecord, _source: "local" });
        stats.local_only++;
      } else {
        // 两边都有 → 比较时间戳
        const localTime = new Date(localRecord.updated_at || 0).getTime();
        const remoteTime = new Date(remoteRecord.updated_at || 0).getTime();

        if (localTime > remoteTime) {
          // 本地更新 → 本地赢
          merged.set(id, { ...localRecord, _source: "local" });
          stats.updated_local++;
        } else if (remoteTime > localTime) {
          // 云端更新 → 云端赢（已在 Map 中，不动）
          stats.updated_remote++;
        } else {
          // 时间戳相同 → 无冲突
          stats.same++;
        }
      }
    }

    // 3. 清理内部标记
    const mergedArray = Array.from(merged.values()).map(({ _source, ...record }) => record);

    return { merged: mergedArray, conflicts, stats };
  }

  // ==================== 上传（手机 → Gist） ====================

  /**
   * 手动上传：将本地数据合并到 Gist 云端
   *
   * 触发方式：用户点击「立即上传」按钮
   * 逻辑：
   *   1. 读取本地数据
   *   2. 下载 Gist 云端数据
   *   3. 合并（Last-Write-Wins）
   *   4. 将合并结果上传回 Gist
   *   5. 更新本地 meta.last_sync_at
   *
   * @returns {object} { success, message, stats }
   */
  async pushToCloud() {
    try {
      // 1. 读取本地
      const localData = this.getLocalData();

      // 2. 下载云端
      let remoteData;
      try {
        const result = await this.gist.download();
        remoteData = result.data;
      } catch (err) {
        // 如果 Gist 为空或不存在，视为空数据（首次上传场景）
        if (err.message.includes("不存在") || err.message.includes("未找到")) {
          remoteData = {};
        } else {
          throw err;
        }
      }

      // 3. 逐集合合并（Last-Write-Wins）
      const uploadPayload = {
        version: 1,
        last_updated_at: new Date().toISOString(),
        last_updated_by: "mobile",
      };
      const stats = {};
      for (const key of SYNC_COLLECTIONS) {
        const r = this.mergeRecords(localData[key] || [], remoteData[key] || []);
        uploadPayload[key] = r.merged;
        stats[key] = r.stats;
      }
      // 4. settings 整体 LWW
      uploadPayload.settings = this.mergeSettings(localData.settings, remoteData.settings);

      // 5. 上传到 Gist
      await this.gist.upload(uploadPayload);

      // 6. 合并结果回写本地（保证两端一致）+ 更新同步时间戳
      for (const key of SYNC_COLLECTIONS) localData[key] = uploadPayload[key];
      localData.settings = uploadPayload.settings;
      localData.meta = localData.meta || {};
      localData.meta.last_sync_at = new Date().toISOString();
      localData.meta.last_sync_action = "upload";
      this.saveLocalData(localData);

      return {
        success: true,
        message: `上传成功！专注 ${uploadPayload.focus_sessions.length} 条，任务 ${uploadPayload.tasks.length} 条，课程 ${uploadPayload.courses.length} 门，笔记 ${uploadPayload.notes.length} 篇`,
        stats,
      };
    } catch (err) {
      return { success: false, message: `上传失败：${err.message}`, stats: null };
    }
  }

  // ==================== 下载（Gist → 本地） ====================

  /**
   * 手动下载：从 Gist 拉取全量数据合并到本地
   *
   * 触发方式：用户点击「立即下载」按钮
   * 逻辑：
   *   1. 下载 Gist 云端全量数据
   *   2. 读取本地数据
   *   3. 合并（Last-Write-Wins）
   *   4. 将合并结果保存到本地
   *   5. 手机端额外执行 14 天裁剪（由 data-filter.js 处理）
   *
   * @param {object} options
   * @param {boolean} options.trimTo14Days - 是否裁剪到14天（手机端=true，电脑端=false）
   * @returns {object} { success, message, data, stats }
   */
  async pullFromCloud(options = { trimTo14Days: false }) {
    try {
      // 1. 下载云端
      const { data: remoteData, gist_updated_at } = await this.gist.download();

      // 2. 读取本地
      const localData = this.getLocalData();

      // 3. 逐集合合并（14 天裁剪仅作用于 focus_sessions / tasks）
      const newLocalData = {
        meta: {
          last_sync_at: new Date().toISOString(),
          last_sync_action: "download",
          gist_updated_at: gist_updated_at,
        },
      };
      const stats = {};
      for (const key of SYNC_COLLECTIONS) {
        const r = this.mergeRecords(localData[key] || [], remoteData[key] || []);
        let merged = r.merged;
        if (
          options.trimTo14Days &&
          typeof filterLast14Days === "function" &&
          (key === "focus_sessions" || key === "tasks")
        ) {
          merged = filterLast14Days(merged);
        }
        newLocalData[key] = merged;
        stats[key] = r.stats;
      }
      // 4. settings 整体 LWW
      newLocalData.settings = this.mergeSettings(localData.settings, remoteData.settings);

      // 5. 保存到本地
      this.saveLocalData(newLocalData);

      return {
        success: true,
        message: `下载成功！专注 ${newLocalData.focus_sessions.length} 条，任务 ${newLocalData.tasks.length} 条，课程 ${newLocalData.courses.length} 门，笔记 ${newLocalData.notes.length} 篇`,
        data: newLocalData,
        stats,
      };
    } catch (err) {
      return { success: false, message: `下载失败：${err.message}`, data: null, stats: null };
    }
  }

  // ==================== 冲突处理（供前端调用） ====================

  /**
   * 检测本地与云端是否存在冲突（不执行合并，仅检测）
   * 前端可在用户操作前调用此方法，决定是否弹窗提示
   *
   * @returns {object} { hasConflict, localNewer, remoteNewer, details }
   */
  async detectConflict() {
    try {
      const localData = this.getLocalData();
      const { data: remoteData } = await this.gist.download();

      const localLastSync = localData.meta?.last_sync_at
        ? new Date(localData.meta.last_sync_at).getTime()
        : 0;
      const remoteUpdatedAt = remoteData.last_updated_at
        ? new Date(remoteData.last_updated_at).getTime()
        : 0;

      // 如果云端更新时间 > 本地上次同步时间，说明有其他设备修改过
      const hasConflict = remoteUpdatedAt > localLastSync && localLastSync > 0;

      return {
        hasConflict,
        localLastSync: localData.meta?.last_sync_at || "从未同步",
        remoteUpdatedAt: remoteData.last_updated_at || "无数据",
        message: hasConflict
          ? "检测到云端数据与本地不一致（其他设备可能修改过），是否合并？"
          : "无冲突",
      };
    } catch (err) {
      return { hasConflict: false, error: err.message };
    }
  }
}

// 导出
if (typeof module !== "undefined" && module.exports) {
  module.exports = { SyncEngine };
}
