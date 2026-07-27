/**
 * ============================================================
 * GitHub Gist API 连接模块
 * ============================================================
 * 
 * 职责：封装所有与 GitHub Gist 的 HTTP 通信
 * 使用方式：由 sync-engine.js 调用，前端不直接调用本文件
 * 
 * 前置条件：
 *   1. 用户需生成 GitHub Personal Access Token (classic)
 *      权限勾选：gist
 *      生成地址：https://github.com/settings/tokens
 *   2. 首次使用时创建一个 Secret Gist，获取 Gist ID
 *      或通过本模块的 createGist() 自动创建
 */

const GIST_API_BASE = "https://api.github.com/gists";

// Gist 中存储数据的文件名（固定）
const DATA_FILENAME = "workbench_data.json";

/**
 * GistClient - GitHub Gist API 封装类
 */
class GistClient {
  /**
   * @param {string} token - GitHub Personal Access Token
   * @param {string} gistId - Gist ID（可选，首次可为空，通过 create 获取）
   */
  constructor(token, gistId = null) {
    this.token = token;
    this.gistId = gistId;
  }

  /**
   * 通用请求方法
   */
  async _request(url, options = {}) {
    const headers = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "PersonalWorkbench/1.0",
    };

    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options.headers },
    });

    // Token 无效
    if (response.status === 401) {
      throw new Error("Token 无效或已过期，请检查 GitHub Token");
    }
    // Gist 不存在
    if (response.status === 404) {
      throw new Error("Gist 不存在，请检查 Gist ID 或重新创建");
    }
    // 其他错误
    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`GitHub API 错误 (${response.status}): ${errBody}`);
    }

    return response.json();
  }

  /**
   * 创建一个新的 Secret Gist（首次使用调用）
   * @returns {string} 新创建的 Gist ID
   */
  async createGist() {
    const payload = {
      description: "Personal Workbench Data Store (Auto-created)",
      public: false, // Secret Gist
      files: {
        [DATA_FILENAME]: {
          content: JSON.stringify(
            {
              version: 1,
              created_at: new Date().toISOString(),
              focus_sessions: [],
              tasks: [],
            },
            null,
            2
          ),
        },
      },
    };

    const result = await this._request(GIST_API_BASE, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    this.gistId = result.id;
    return result.id;
  }

  /**
   * 读取 Gist 中的数据（下载）
   * @returns {object} 解析后的 JSON 数据对象
   */
  async download() {
    if (!this.gistId) {
      throw new Error("Gist ID 未设置，无法下载");
    }

    const result = await this._request(`${GIST_API_BASE}/${this.gistId}`);

    // 检查数据文件是否存在
    const file = result.files[DATA_FILENAME];
    if (!file) {
      throw new Error(`Gist 中未找到数据文件 "${DATA_FILENAME}"`);
    }

    // 如果文件被截断（大于 1MB），需要通过 raw_url 获取
    let content = file.content;
    if (file.truncated) {
      const rawResponse = await fetch(file.raw_url);
      content = await rawResponse.text();
    }

    return {
      data: JSON.parse(content),
      // 返回 Gist 的历史版本号，用于冲突检测
      gist_updated_at: result.updated_at,
      gist_history_count: result.history ? result.history.length : 0,
    };
  }

  /**
   * 写入数据到 Gist（上传）
   * @param {object} dataObj - 要上传的完整数据对象
   * @returns {object} 更新后的 Gist 元信息
   */
  async upload(dataObj) {
    if (!this.gistId) {
      throw new Error("Gist ID 未设置，无法上传");
    }

    const payload = {
      files: {
        [DATA_FILENAME]: {
          content: JSON.stringify(dataObj, null, 2),
        },
      },
    };

    const result = await this._request(`${GIST_API_BASE}/${this.gistId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    return {
      success: true,
      gist_updated_at: result.updated_at,
      html_url: result.html_url,
    };
  }

  /**
   * 验证 Token 和 Gist ID 是否有效（连通性测试）
   * @returns {object} { valid: boolean, message: string }
   */
  async testConnection() {
    try {
      if (!this.token) {
        return { valid: false, message: "Token 为空" };
      }
      if (!this.gistId) {
        // Token 有效但没有 Gist，可以创建
        await this._request(`${GIST_API_BASE}?per_page=1`);
        return { valid: true, message: "Token 有效，Gist 未配置（可自动创建）" };
      }
      await this._request(`${GIST_API_BASE}/${this.gistId}`);
      return { valid: true, message: "连接成功，Gist 可读写" };
    } catch (err) {
      return { valid: false, message: err.message };
    }
  }
}

// 导出（兼容 ES Module 和直接 script 引入）
if (typeof module !== "undefined" && module.exports) {
  module.exports = { GistClient, DATA_FILENAME, GIST_API_BASE };
}
