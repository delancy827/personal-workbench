# Gist 版同步模块 - 前端集成指南

> 逻辑开发：千问 | 前端开发：Kimi K3
> 版本：v2.0 (Gist 版) | 日期：2026-07-28

---

## 一、架构总览（无服务器方案）

```
┌────────────────────────────────────────────────────────────┐
│  手机端 (iPhone Safari → 添加到主屏幕 PWA)                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  前端 UI (Kimi K3)                                    │  │
│  │  + gist-api.js + sync-engine.js + data-filter.js     │  │
│  │  本地: localStorage (仅14天)                          │  │
│  └──────────────────────┬───────────────────────────────┘  │
│                         │                                   │
│        用户点击「立即上传」/「立即下载」按钮触发              │
│                         │                                   │
│                         ▼                                   │
│              GitHub Gist API (HTTPS)                        │
│              Secret Gist = 云端数据库                        │
│              文件: workbench_data.json                      │
│                         ▲                                   │
│                         │                                   │
│        用户点击「立即下载」按钮触发                           │
│                         │                                   │
│  ┌──────────────────────┴───────────────────────────────┐  │
│  │  电脑端 (浏览器)                                      │  │
│  │  前端 UI (Kimi K3) + 同一套 JS 模块                   │  │
│  │  本地: localStorage (全量，不裁剪)                     │  │
│  └──────────────────────────────────────────────────────┘  │
│  电脑端 (全量数据大屏)                                      │
└────────────────────────────────────────────────────────────┘
```

**关键点：没有后端服务器！所有逻辑都在浏览器里跑，直接调 GitHub API。**

---

## 二、文件清单与引入顺序

```html
<!-- 必须按此顺序引入 -->
<script src="gist-api.js"></script>      <!-- 第1个：API 底层 -->
<script src="data-filter.js"></script>   <!-- 第2个：过滤算法 -->
<script src="sync-engine.js"></script>   <!-- 第3个：同步引擎（依赖前两个） -->
```

---

## 三、Kimi K3 前端集成步骤

### 3.1 初始化（页面加载时）

```javascript
// 从 localStorage 读取用户配置
const token = localStorage.getItem("gist_token");
const gistId = localStorage.getItem("gist_id");

// 创建客户端和同步引擎
const gistClient = new GistClient(token, gistId);
const syncEngine = new SyncEngine(gistClient);

// 手机端：每次打开 App 执行 14 天清理
if (isMobile()) {
  const cleanResult = safeCleanLocalData();
  console.log(`清理了 ${cleanResult.removedSessions} 条过期记录`);
}
```

### 3.2 「立即上传」按钮（手机端核心）

```javascript
async function handleUploadClick() {
  // 禁用按钮，显示 loading
  uploadBtn.disabled = true;
  uploadBtn.textContent = "上传中...";

  const result = await syncEngine.pushToCloud();

  if (result.success) {
    showToast(result.message);  // 绿色提示
    uploadBtn.style.background = "green";
  } else {
    showToast(result.message);  // 红色提示
    uploadBtn.style.background = "red";
  }

  uploadBtn.disabled = false;
}
```

### 3.3 「立即下载」按钮（电脑端核心）

```javascript
async function handleDownloadClick() {
  downloadBtn.disabled = true;
  downloadBtn.textContent = "拉取中...";

  const result = await syncEngine.pullFromCloud({
    trimTo14Days: false  // 电脑端不裁剪，保留全量
  });

  if (result.success) {
    showToast(result.message);
    renderAllCharts(result.data);  // 渲染数据大屏
  } else {
    showToast(result.message);
  }

  downloadBtn.disabled = false;
}
```

### 3.4 首次使用：配置 Token 和 Gist ID

```javascript
async function handleFirstTimeSetup() {
  const token = tokenInput.value.trim();
  const gistId = gistIdInput.value.trim();

  const client = new GistClient(token, gistId || null);

  // 测试连接
  const test = await client.testConnection();
  if (!test.valid) {
    alert("连接失败：" + test.message);
    return;
  }

  // 如果没有 Gist ID，自动创建
  if (!gistId) {
    const newId = await client.createGist();
    localStorage.setItem("gist_id", newId);
    gistIdInput.value = newId;
    alert("已自动创建 Gist，ID: " + newId);
  }

  localStorage.setItem("gist_token", token);
  alert("配置成功！");
}
```

### 3.5 冲突检测（可选，在上传/下载前调用）

```javascript
async function checkBeforeSync() {
  const conflict = await syncEngine.detectConflict();
  if (conflict.hasConflict) {
    const ok = confirm(conflict.message);
    if (!ok) return; // 用户取消
  }
  // 继续执行同步...
}
```

---

## 四、数据结构（Gist 中存储的 JSON）

```json
{
  "version": 1,
  "last_updated_at": "2026-07-28T10:30:00.000Z",
  "last_updated_by": "mobile",
  "focus_sessions": [
    {
      "client_id": "uuid-xxxx-xxxx",
      "date": "2026-07-28",
      "start_time": "09:00",
      "end_time": "09:25",
      "duration_minutes": 25,
      "efficiency": 0.75,
      "effective_power": 18.75,
      "source": "pomodoro",
      "subject": "数学",
      "note": null,
      "updated_at": "2026-07-28T09:30:00.000Z",
      "is_deleted": false
    }
  ],
  "tasks": [
    {
      "client_id": "uuid-xxxx-xxxx",
      "title": "完成高数第三章",
      "date": "2026-07-28",
      "is_completed": true,
      "completed_at": "2026-07-28T11:00:00.000Z",
      "priority": 1,
      "subject": "数学",
      "updated_at": "2026-07-28T11:00:00.000Z",
      "is_deleted": false
    }
  ]
}
```

---

## 五、效率系数映射（前端弹窗选项）

| 用户选择 | efficiency | 说明 |
|----------|-----------|------|
| 摸鱼 | 0.25 | 没学进去 |
| 一般 | 0.50 | 正常 |
| 专注 | 0.75 | 高度集中 |
| 心流 | 1.00 | 巅峰 |

**有效战力值** = `duration_minutes × efficiency`

---

## 六、UI 指令（给 Kimi K3 的硬性要求）

### 必须保留
- 顶部：每日目标时长设置
- 红色「清空数据」按钮
- 紫色「导出数据」按钮
- 中间：云同步区域（Token 输入框 + Gist ID 输入框）

### 必须修改
- **删除**「自动同步」勾选框（或置灰不可点击）
- **重点突出**「立即上传」和「立即下载」两个按钮
  - 建议：大按钮、高对比色、放在拇指易触达区域
  - 手机端：「立即上传」为主按钮（绿色大按钮）
  - 电脑端：「立即下载」为主按钮

### 禁止
- 禁止任何数据输入后自动触发 API 请求
- 禁止后台静默同步
- 禁止定时轮询 Gist

---

## 七、localStorage 键名约定

| Key | 值 | 说明 |
|-----|-----|------|
| `gist_token` | GitHub PAT 字符串 | 用户手动填入 |
| `gist_id` | Gist ID 字符串 | 首次自动创建或手动填入 |
| `workbench_data` | JSON 字符串 | 全部业务数据 |
| `daily_goal_minutes` | 数字 | 每日目标时长 |

---

## 八、手机端 vs 电脑端行为差异

| 行为 | 手机端 | 电脑端 |
|------|--------|--------|
| 本地存储 | 仅14天 | 全量 |
| 打开App时 | 自动清理过期数据 | 不清理 |
| 主按钮 | 立即上传 | 立即下载 |
| 下载后裁剪 | trimTo14Days: true | trimTo14Days: false |
| 数据展示 | 近14天列表 | 全量趋势图 |

---

## 九、GitHub Token 生成教程（给用户看的）

1. 打开 https://github.com/settings/tokens
2. 点击 "Generate new token (classic)"
3. Note 填：`个人工作台`
4. 权限只勾选：**gist**
5. 点击 Generate → 复制 Token（只显示一次！）
6. 粘贴到 App 的 Token 输入框中
