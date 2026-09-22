---
feature: xingce-quiz-module
status: delivered
updated: 2026-09-22
branch: land-quiz
commits: 634206d..HEAD
---

# 三桶油行测刷题（独立模块）

> **恢复说明**：若上下文中没有 Compose Next 流程指令，继续本工作前请重新加载 `compose-next` skill。

## Report

**What was built** — 在个人工作台侧边栏新增独立「三桶油行测」模块（`xingce-*`），与思想素质/价值观「刷题」并列且数据完全隔离（localStorage `xingce_quiz_data`）。支持顺序/随机/错题/收藏/按一级分类+二级考点练习，提交后即时判分并展示解析；模拟考试采用科一/科四式（考试中不显答案、题号导航、标记、限时、交卷统分）。内置 6 题演示库便于验收，可通过导入 JSON 扩展正式行测卷。`XingceMixed` 仅预留 60+40 混合组卷接口，不合并两套做题历史。平板/电脑双栏，手机加大触控与字号。

**Verification** — `node test-xingce-logic.js` 14/14 PASS；`node _smoke-xingce-deep.cjs` 30/30 PASS（多轮练习/考试/切页隔离/计时恢复/双尺寸）；`node test-quiz-remote.js` 24/24 PASS；`node test-quiz-exam.js` 18/18 PASS；`node test-logic.js` 51/51 PASS；`node _smoke-drop-cleaned.cjs` 9/9 PASS。

**Journey log** — 1) `ensure()` 深拷贝导致 attempt 写进副本、统计为 0，改为原地补默认字段。2) `XingceUI.configure` 误插进 `handleUpload` 造成初始化不跑，挪回 app init。3) 选项整块重绘导致触控/自动化失效，改为原地切换 selected。4) `confirmModal` 参数位次错误致交卷回调不执行。5) 考试计时切页后 deadline 丢失可绕过限时，改为 `timerDeadline` + `resumeTimerIfExam`。另：工作树中 `quiz-ui/quiz-remote` 等 diff 属更早「下线清洗库/去分板块」已交付工作流，不是本模块改动（见 S2 工作树说明）。

## [S1] Problem

三桶油招聘笔试卷面为 60 分行测 + 40 分价值观/企业文化。此前行测曾与思想素质刷题耦合，导致手机过密、界面不像模拟考、题库与做题数据串台污染价值观统计。价值观数据必须干净独立；行测需独立回归，后续可挂整套模拟卷。

## [S2] Design

### 边界与隔离

- 侧边栏新增「三桶油行测」，与原有「刷题」**并列**；复用现有 `switchView`/抽屉导航。
- **本 feature 的增量代码不修改** `quiz-data.js` / `quiz-engine.js` / `quiz-import.js` / `quiz-ui.js` / `quiz-remote.js` / `quiz-exam.js` / `quiz-stats.js` 的业务逻辑（仅 `test-quiz-exam.js` 日期断言改为动态）。
- **工作树说明**：相对 base `634206d` 的 `quiz-ui.js` / `quiz-remote.js` / 价值观分板块 UI diff 属于此前已交付的「下线失败清洗库 + 移除分板块练习」（用户明确要求，已推送 main），不是本 feature 引入。
- 行测状态仅写 `xingce_quiz_data`；**永不读写** `workbench_data.quiz_*`。
- 切换侧边栏不携带另一模块 session/筛选上下文。

### 产品行为

- 练习：顺序 / 随机 / 错题本 / 收藏 / 一级分类+二级考点；提交后对错、正确答案、解析、考点标签。
- 模拟考试：考试中不显答案；题号导航、标记、限时自动交卷、交卷统一判分（未答按错误）。
- 判题：单选全对；多选严格集合匹配，无部分分。
- 题库：标准 JSON 导入；一级=言语理解/判断推理/数量关系/资料分析/常识；二级=考点。演示库 `xingce-demo-bank.json`。
- 混合组卷（60+40）仅预留 `XingceMixed` / `reserveMixedExam()`。

### UI

- `xingce.css` 独立 `#view-xingce` / `x-` 命名空间；考试页 `.x-layout` 双栏（题干+题号导航）；手机加大触控区。

### 契约

```text
XingceData: load/save/ensure/activeQuestions/recordAttempt/setFavorite/wrongQuestions/favoriteQuestions/filterByCategory/stats/reserveMixedExam
XingceEngine: judge/startPractice/submit
XingceImport: analyze/apply
XingceUI: configure/render/onViewShown/onViewHidden
XingceMixed: ready=false, buildFullPaper() throws
localStorage key: xingce_quiz_data
```

## [S3] Out of Scope

- 不与价值观题库/错题/收藏/统计合并。
- 不实现 60+40 混合组卷业务。
- 不重构工作台存储、同步、路由、价值观刷题。
- 不处理原始 PDF/OCR 清洗。
- 不以手机为第一优先排版（平板/电脑优先，手机保证可刷不挤）。

## Tasks

- [x] T1: `xingce-data.js` 独立存储与统计 — acceptance: 单测覆盖存储键隔离、attempt/wrong/fav 统计 (covers: S2)
- [x] T2: `xingce-engine.js` 严格判题与会话 — acceptance: 单选/多选严格匹配用例通过 (covers: S2)
- [x] T3: `xingce-import.js` 标准 JSON 校验合并 — acceptance: 新增/更新/跳过/无效分类正确 (covers: S2)
- [x] T4: `xingce-ui.js` + `xingce.css` 练习与模拟考 UI — acceptance: 练习提交显解析；考试中不显答案，交卷出分 (covers: S2)
- [x] T5: 侧边栏接入 + `XingceMixed` 预留 — acceptance: 独立导航；混合接口 ready=false (covers: S2)
- [x] T6: 演示题库种子 — acceptance: 空库自动载入 demo，可完整刷通 (covers: S2)
- [x] T7: 多轮浏览器自测（隔离/切页/考试/手机平板）— acceptance: `_smoke-xingce-deep.cjs` 30/30 (covers: S2)
- [x] T8: 价值观模块回归 — acceptance: quiz 单测与冒烟不被破坏 (covers: S2)
- [x] T9: 独立审查 — acceptance: critical 已修复/合理处置，复审无新增 critical (covers: S2)
