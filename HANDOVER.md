# 个人工作台 · 项目交接文档

> 交接给下一个 AI（原前端开发者 Kimi K3 已完成 v2.1 开发）

---

## 一、文件在哪（所有路径）

```
F:\traespace\个人工作台\gist-sync\
├── index.html            ← 前端单文件（~2300行，所有 UI + 业务 JS）
├── gist-api.js           ← GitHub Gist API 底层（由千问开发，不要改）
├── data-filter.js        ← 14 天裁剪算法（由千问开发，不要改）
├── sync-engine.js        ← 同步引擎 v2.1（已扩展为 7 集合泛型合并）
├── INTEGRATION-GUIDE.md  ← 集成指南（千问写的 v2.0）
└── HANDOVER.md           ← 本文件

参考风格视频：
  F:\traespace\个人工作台\前端风格喜好正常白天模式.mp4
  F:\traespace\个人工作台\前端iu风格以及动画偏好展示参考.mp4
```

---

## 二、架构一句话

**纯前端 + 无服务器**：浏览器直连 GitHub Gist（Secret Gist），所有数据存于：
- 云端：Gist 里的 `workbench_data.json`
- 本地：各设备自己的 `localStorage`

**手机用法**：把 4 个文件（index.html + 3 个 JS）拷到手机上，Safari 打开 index.html → 分享 → 添加到主屏幕，就是 PWA。不需要部署服务器。

---

## 三、数据模型

`workbench_data`（localStorage / Gist 存储）:

```json
{
  "version": 1,
  "last_updated_at": "ISO",
  "last_updated_by": "mobile|desktop",
  "focus_sessions": [{ client_id, date, start_time, end_time, duration_minutes, efficiency, effective_power, source, subject, note, updated_at, is_deleted }],
  "tasks": [{ client_id, title, date, is_completed, completed_at, priority, subject, updated_at, is_deleted }],
  "courses": [{ client_id, name, start_date, end_date, total_lessons, done_lessons, updated_at, is_deleted }],
  "notes": [{ client_id, title, content, updated_at, is_deleted }],
  "checkins": [{ client_id, date, updated_at, is_deleted }],
  "reviews": [{ client_id (period_key), content, updated_at, is_deleted }],
  "goals": [{ client_id, type (week|month|custom), name, target_hours, current_hours, updated_at, is_deleted }],
  "settings": { nickname, exam_date, updated_at },
  "meta": { last_sync_at, last_sync_action, gist_updated_at }
}
```

同步规则：所有集合以 `client_id` 为唯一键、`updated_at` 最新优先合并（LWW）。`settings` 整体 LWW。14 天裁剪仅作用于 `focus_sessions` 和 `tasks`。

---

## 四、已实现功能清单

### 核心（按集成指南 v2.0）
- ✅ 三 JS 按序引入（gist-api → data-filter → sync-engine）
- ✅ Token + Gist ID 输入、测试连接并保存、自动创建 Gist
- ✅ 立即上传（手机端绿色主按钮）、立即下载（电脑端蓝色主按钮）
- ✅ conflict 检测（弹窗确认）
- ✅ safeCleanLocalData（手机端每次打开清理 14 天外已同步数据）
- ✅ 移动端/桌面端自适应（isMobile() 判断，按钮互换主次）
- ✅ 禁止自动同步、后台同步、轮询（全手动）
- ✅ localStorage 键名约定：gist_token, gist_id, workbench_data, daily_goal_minutes
- ✅ 效率系数映射弹窗（摸鱼 0.25 / 一般 0.50 / 专注 0.75 / 心流 1.00）
- ✅ 有效战力值 = 时长 × 效率
- ✅ 每日目标时长步进器、红色清空、紫色导出（JSON）
- ✅ Toast / Action Sheet / 确认弹窗

### v2.1 新增
- ✅ 抽屉导航（6 视图：工作台/课程进度/目标管理/总结复盘/学习笔记/设置）
- ✅ 考试倒计时（设置里设日期，首页自动算天数）
- ✅ 每日打卡 + 连续 streak
- ✅ 本周目标进度卡（周总小时 + 今日完成率 + 彩虹渐变条）
- ✅ 课程进度管理（新建/完成一课/删除，首页概览）
- ✅ 目标管理（本周/本月目标可编辑，自定义目标 +0.5h 进度）
- ✅ 总结复盘（周/月/季/半年：统计大字、科目×周日程表、各科分布条、自动汇总文本、手动复盘记录）
- ✅ 学习笔记（新建/编辑/删除）
- ✅ 专注模式（全屏计时器，结束自动记一笔）
- ✅ 待办任务筛选页签（全部/今日/未完成/已完成）
- ✅ 自定义专注时长输入
- ✅ 导入数据（JSON 文件按 client_id 合并）
- ✅ 连续达标天数统计（圆环+柱状图绿标）
- ✅ sync-engine.js 升级为 7 集合泛型 + settings LWW（单测 22/22）
- ✅ 粘贴 Token 防呆（自动检测重复粘贴，截取第一段）
- ✅ 作息与学习日：可设置入睡、起床和学习日起点，凌晨记录按自定义学习日归档

---

## 五、给下一位 AI 的工作提示（可直接复制发送）

```
你接手「个人工作台」项目。项目代码在 F:\traespace\个人工作台\gist-sync\ 下，
HANDOVER.md 是完整交接文档。

先做的事：
1. 读 HANDOVER.md + INTEGRATION-GUIDE.md
2. 读 index.html + sync-engine.js + gist-api.js + data-filter.js
3. 本机启动测试：cd F:\traespace\个人工作台\gist-sync && python -m http.server 8765
4. 浏览器打开 http://127.0.0.1:8765/index.html

用户的 Gist 配置：
  Token：[已撤销/已脱敏]（已暴露，请在 GitHub 立即 revoke 并 regenerate）
  Gist ID：e6456b67c88efc5a36cdf690a33eb1b7

用户已阐明：
- 这些文件可以直接拷到 iPhone 上，用 Safari 打开并「添加到主屏幕」当 PWA 用，不需要部署服务器（GitHub API 支持 file:// 跨域）。
- 数据通过 Gist 在手机和电脑之间互相同步（手动上传/下载）。
- 电脑更新代码后，手机通过电脑的 HTTP 服务器访问时刷新即得最新版。

接下来可以做的方向（优先级排序）：
1. PWA 完善：添加 manifest.json、应用图标（至少 180×180）、splash screen、service worker（实现离线缓存）—— 这是"添加到主屏幕"体验的决定性提升。
2. 苹果手机适配测试：用真实 iPhone Safari 打开确认页面正常、打卡/记一笔/上传下载流程走通、localStorage 持久化正常、添加到主屏幕后图标/启动屏正确。如有布局 bug 修复。
3. 暗色护眼模式（用户参考视频 2 是暗色模式，但用户目前选择了白天风；可在设置里加一个「暗色模式」开关，CSS 变量切换）。
4. 番茄钟结束后的通知提醒（Notification API，PWA 支持，仅在专注模式下）。
5. 动画优化：专注模式下倒计时 ring 粒子效果？保持轻量。
6. 用户提到的「自动同步」——集成指南禁止（铁律），但可以做一个「手动刷新按钮变闪烁提醒云端有更新」的轻提示（只检测不自动拉取，不违反规则）。

风格要求：保持 Grow 健康 App 白天模式（#EDEEF3 背景、白色 24px 圆角卡片、iOS 风格)。所有 UI 动画保持（卡片入场/数字滚动/进度环/按钮回弹/柱状图生长/Toast 滑入）。
```

---

## 六、技术要点

| 项目 | 说明 |
|---|---|
| 前端框架 | 无（原生 HTML/CSS/JS，单文件） |
| CSS 风格 | Grow 健康 App 白天模式（iOS 风） |
| 颜色 | bg #EDEEF3, card #fff, blue #3478F6, green #34C759, 紫渐变用于主操作按钮 |
| 动画 | cubic-bezier(.22,1,.36,1)，卡片错峰入场、数字滚动、进度环发光、柱状图生长 |
| 字体 | -apple-system / PingFang SC / SF Pro Display |
| 存储 | localStorage（键：gist_token, gist_id, workbench_data, daily_goal_minutes） |
| 云 | GitHub Gist API（Secret Gist，file:// 跨域支持 \*） |
| 无服务器 | ✅ 不需要任何后端服务 |
| 手机端 | Safari 打开 → 添加到主屏幕（PWA），已配 apple-mobile-web-app meta |
| 同步 | 全手动：上传/下载按钮。无自动、无后台、无轮询 |
| 包管理 | 无（零依赖） |
