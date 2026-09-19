# 个人工作台刷题系统工程实施蓝图

版本：v1.0  
编写日期：2026-09-19  
目标项目：`F:\codexspace\personal-workbench`

> 本文是给 Luna 或其他执行模型使用的实施蓝图。当前阶段只完成设计，不直接实现刷题功能。

## 1. 现有项目分析

### 1.1 已确认的技术体系

当前个人工作台不是 React、Vue 或其他前端框架项目，而是：

- 原生 HTML、CSS、JavaScript。
- 无构建系统、无包管理依赖、无后端服务。
- 主界面和业务逻辑集中在 `index.html`。
- 可复用的独立脚本包括 `gist-api.js`、`data-filter.js`、`sync-engine.js`、`sleep-schedule.js`、`bluetooth.js`。
- 本地持久化使用浏览器 `localStorage`，主键为 `workbench_data`。
- 云端同步使用 GitHub Secret Gist 的 `workbench_data.json`。
- 同步由用户手动触发，当前设计明确禁止自动同步、后台同步和轮询。
- PWA 由 `manifest.json` 和 `service-worker.js` 提供。
- 现有逻辑测试命令为 `node test-logic.js`，当前结果为 `23 passed, 0 failed`。

### 1.2 当前数据结构

`workbench_data` 当前包含：

```json
{
  "focus_sessions": [],
  "tasks": [],
  "courses": [],
  "notes": [],
  "checkins": [],
  "reviews": [],
  "goals": [],
  "settings": {},
  "meta": {}
}
```

大多数记录使用：

```text
client_id       唯一标识
updated_at      最后更新时间
is_deleted      软删除标记
```

`sync-engine.js` 当前通过固定的 `SYNC_COLLECTIONS` 合并集合，采用 `client_id` 加 `updated_at` 的最后写入优先策略。`settings` 是整体对象合并。

### 1.3 对刷题系统的直接约束

1. 不更换现有技术栈。
2. 不引入框架、数据库、打包器或第三方状态管理。
3. 不把所有刷题逻辑继续无限堆入 `index.html`。
4. 新数据必须显式加入同步集合，否则不会上传或下载。
5. `data-filter.js` 的 14 天裁剪当前只处理 `focus_sessions` 和 `tasks`。题库、答题事件、题目状态、练习会话不能加入这两个会被裁剪的集合。
6. 当前云端是一个完整的 `workbench_data.json`，长期题库增长会产生体积风险，必须保留迁移和归档边界。
7. 当前仓库没有确认到智谱、GLM、OpenAI、统一模型中转站或具体 AI API 的代码、配置和调用入口。因此 AI 供应商、协议、鉴权字段和返回格式均为“待确认”，执行时必须复用真实存在的现有接口，不能自行臆造。
8. 当前工作区有与蓝牙和作息相关的用户改动，实施刷题系统时不得回退或覆盖它们。

### 1.4 推荐新增模块

第一阶段建议增加以下独立脚本：

```text
quiz-data.js       数据默认值、版本迁移、题目和记录读写
quiz-engine.js     抽题、判题、统计、掌握度和计时纯逻辑
quiz-import.js     标准题库校验、重复分析、预览、应用和回滚
quiz-ui.js         刷题视图、题号导航、导入报告和统计页面
```

这些文件使用浏览器全局函数或对象，保持现有原生脚本风格；Node 测试环境通过 `module.exports` 暴露纯函数。

## 2. 产品定位与边界

刷题系统是个人工作台里的一个长期学习模块，不是独立 App。

### 2.1 首期目标

支持企业文化、企业价值观、企业使命、企业愿景、中国石化相关知识和招聘考试知识型选择题的长期积累与练习。

### 2.2 明确不做

- 用户注册、多用户、好友、排行榜和社交。
- 原始 PDF、图片、OCR 和脏题库清洗。
- 判断题、填空题、简答题和材料题。
- AI 参与最终判题。
- 为刷题系统新建后端或另建一套数据库。
- 为了未来题型提前建立复杂通用规则引擎。

外部流程负责：

```text
原始资料 -> 外部 AI 清洗 -> 标准题库 JSON -> 工作台导入
```

工作台负责：

```text
标准校验 -> 题库管理 -> 刷题 -> 判题 -> 记录 -> 统计 -> 个性化分析
```

## 3. 产品功能树

```text
个人工作台
└── 刷题
    ├── 首页
    │   ├── 今日答题量
    │   ├── 今日正确率
    │   ├── 今日学习时间
    │   ├── 当前错题数
    │   ├── 继续上次练习
    │   └── 今日推荐复习
    ├── 开始练习
    │   ├── 顺序练习
    │   ├── 随机练习
    │   ├── 分类练习
    │   ├── 错题练习
    │   └── 收藏练习
    ├── 模拟考试
    │   ├── 题量
    │   ├── 时间
    │   ├── 单选/多选范围
    │   ├── 考试答题页
    │   └── 交卷结算页
    ├── 题库管理
    │   ├── 题库列表
    │   ├── 题库详情
    │   ├── 分类和标签筛选
    │   ├── 启用/停用题目
    │   ├── 题目详情和版本
    │   └── 增量导入
    ├── 错题
    │   ├── 当前错题
    │   ├── 高频错误
    │   ├── 最近错误
    │   └── 错题练习
    ├── 收藏
    │   ├── 收藏列表
    │   └── 收藏练习
    ├── 学习统计
    │   ├── 今日
    │   ├── 累计
    │   ├── 分类
    │   ├── 趋势
    │   └── 题目掌握度
    └── AI 学习分析
        ├── 薄弱分类分析
        ├── 反复错误分析
        ├── 今日复习建议
        ├── 个性化训练建议
        └── 自然语言查询
```

## 4. 数据模型

### 4.1 关系原则

必须区分以下对象：

```text
题库 bank
  └── 题目 question
        └── 题目版本 question_version

练习会话 session
  └── 答题事件 attempt -> 题目版本

题目状态 question_state -> 题目当前聚合状态

导入批次 import_batch
  └── 导入项 import_item -> 题目处理结果
```

答题历史是不可覆盖的事件；错题和收藏是当前状态；题目版本保证历史仍能关联到当时的题干、选项和答案。

### 4.2 `quiz_banks`

```text
client_id             string, 必填，题库唯一 ID
bank_id               string, 必填，稳定外部 ID
name                  string, 必填
description           string|null
source                string|null
version               string, 必填
status                active|archived
question_count        number, 可重算
created_at            ISO 时间
updated_at            ISO 时间
is_deleted             boolean
```

`bank_id` 一旦使用不得改变。题库改名或版本更新不应创建新 ID，除非它确实是完全不同的题库。

### 4.3 `quiz_questions`

这是题目的当前实体，不保存每次答题结果。

```text
client_id             string, 必填，内部记录 ID
question_id           string, 必填，跨导入稳定 ID
bank_id               string, 必填
current_version       string, 必填
question_type         single_choice|multiple_choice
status                active|inactive|needs_review
category_l1           string, 必填
category_l2           string|null
tags                  string[]
difficulty             easy|medium|hard|unknown
importance             low|normal|high|critical
source                 string|null
source_year            number|null
source_question_no     string|null
content_fingerprint    string, 必填
created_at             ISO 时间
updated_at             ISO 时间
is_deleted             boolean
```

`question_id` 和 `client_id` 都不可因更新而改变。题目停用采用 `status: inactive` 或软删除，不物理删除历史引用对象。

### 4.4 `quiz_question_versions`

题干、选项、答案和解析属于版本内容。

```text
client_id             string, 必填
question_id           string, 必填
version               string, 必填
stem                  string, 必填
options               object[], 必填
correct_keys          string[], 必填，排序后保存
explanation           string|null
source_snapshot       object|null
content_fingerprint   string, 必填
created_at            ISO 时间
created_by            import|manual|migration
is_current            boolean
```

选项格式：

```json
[
  { "key": "A", "text": "选项一" },
  { "key": "B", "text": "选项二" },
  { "key": "C", "text": "选项三" },
  { "key": "D", "text": "选项四" }
]
```

首期只允许 `A` 到 `Z` 的大写字母键。选项键在一个版本中不能重复。选项顺序是展示顺序，答案比较使用排序后的 key 集合。

### 4.5 `quiz_sessions`

一次完整练习或模拟考试。

```text
client_id             string
session_id            string
mode                  sequential|random|category|wrong|favorite|mock_exam
bank_ids              string[]
filters               object
question_ids          string[]
question_versions     object
current_index         number
status                active|completed|abandoned
started_at            ISO 时间
ended_at              ISO 时间|null
learning_date         YYYY-MM-DD
active_seconds        number
paused_seconds        number
answered_count        number
correct_count         number|null
total_count           number
time_limit_seconds    number|null
created_at            ISO 时间
updated_at            ISO 时间
is_deleted             boolean
```

`question_versions` 记录本次会话开始时使用的版本，例如：

```json
{ "q-001": "1.0", "q-002": "1.1" }
```

这样题目后来更新，也不会改变正在进行或已经结束的会话。

### 4.6 `quiz_attempts`

每一次提交答案产生一条不可覆盖的答题事件。

```text
client_id             string
attempt_id            string
session_id            string
question_id           string
question_version      string
bank_id               string
learning_date         YYYY-MM-DD
selected_keys          string[]
correct_keys           string[]
is_correct             boolean
active_seconds         number
answered_at            ISO 时间
mode                  string
is_deleted             boolean
```

不要把题干或完整选项重复写入每条 attempt。历史展示通过 `question_id + question_version` 关联版本；如果未来需要极强的审计能力，可在归档时生成只读快照，不放入 P0。

### 4.7 `quiz_question_states`

这是根据 attempts 聚合出的当前状态，允许重算，不是历史事实唯一来源。

```text
client_id             string
question_id           string
attempt_count         number
correct_count         number
wrong_count           number
accuracy              number
total_active_seconds  number
average_seconds       number
last_attempt_at       ISO|null
last_result           correct|wrong|null
consecutive_correct   number
consecutive_wrong     number
ever_wrong            boolean
wrong_active          boolean
favorite              boolean
mastery_score         number
last_review_at        ISO|null
updated_at            ISO 时间
is_deleted             boolean
```

规则：

- `ever_wrong` 一旦为 true，不因后来答对而变回 false。
- `wrong_active` 表示当前是否应该出现在错题列表，建议为“曾错且最近一次结果为错”，并允许用户手动标记已掌握后隐藏。
- `favorite` 与错题状态完全独立。
- 删除状态只用于同步和撤销，不用于清除历史 attempt。

### 4.8 `quiz_import_batches`

每次导入都保留批次记录，支持报告和回滚。

```text
client_id             string
batch_id              string
file_name              string
schema_version        number
bank_id               string
bank_version          string
status                staged|confirmed|applied|rolled_back|failed
created_at            ISO 时间
confirmed_at          ISO|null
completed_at          ISO|null
summary               object
is_deleted             boolean
```

`summary` 至少包含 `total`, `added`, `updated`, `skipped`, `needs_review`, `invalid`, `rolled_back`。

P0 可以把导入明细暂存在内存和批次摘要中；P1 应增加 `quiz_import_items`，记录每个外部题目 ID、处理动作、匹配对象、错误和旧版本。

### 4.9 `workbench_data` 新增集合

建议增加：

```text
quiz_banks
quiz_questions
quiz_question_versions
quiz_sessions
quiz_attempts
quiz_question_states
quiz_import_batches
```

不要使用当前会被手机端裁剪的 `focus_sessions` 或 `tasks` 存刷题数据。

## 5. 标准题库导入格式

### 5.1 顶层 JSON

```json
{
  "schema_version": 1,
  "exported_at": "2026-09-19T00:00:00.000Z",
  "bank": {
    "bank_id": "sinopec-culture",
    "name": "中国石化企业文化",
    "version": "2026.09.1",
    "description": "企业使命、愿景、价值观及相关知识",
    "source": "外部整理",
    "language": "zh-CN"
  },
  "questions": [
    {
      "question_id": "sinopec-culture-0001",
      "version": "1.0",
      "question_type": "single_choice",
      "stem": "题目文本",
      "options": [
        { "key": "A", "text": "选项 A" },
        { "key": "B", "text": "选项 B" },
        { "key": "C", "text": "选项 C" },
        { "key": "D", "text": "选项 D" }
      ],
      "correct_keys": ["B"],
      "explanation": "答案解析",
      "category_l1": "企业文化",
      "category_l2": "企业使命",
      "tags": ["使命", "高频"],
      "difficulty": "easy",
      "importance": "high",
      "source": "内部资料",
      "source_year": 2026,
      "source_question_no": "1",
      "status": "active",
      "created_at": "2026-09-19T00:00:00.000Z",
      "updated_at": "2026-09-19T00:00:00.000Z"
    }
  ]
}
```

### 5.2 字段要求

| 字段 | 类型 | 必填 | 规则 |
|---|---|---:|---|
| `schema_version` | integer | 是 | 当前为 `1` |
| `exported_at` | ISO string | 是 | 可解析为有效时间 |
| `bank.bank_id` | string | 是 | 稳定、非空、建议小写短横线 |
| `bank.name` | string | 是 | 非空 |
| `bank.version` | string | 是 | 由外部清洗流程维护 |
| `question_id` | string | 是 | 在题库内唯一，长期稳定 |
| `version` | string | 是 | 同一题修订时递增 |
| `question_type` | enum | 是 | `single_choice` 或 `multiple_choice` |
| `stem` | string | 是 | 去除题号前缀和无意义空白 |
| `options` | array | 是 | 至少 2 个，key 唯一 |
| `correct_keys` | string[] | 是 | 必须存在于 options |
| `explanation` | string/null | 否 | 建议提供 |
| `category_l1` | string | 是 | 一级分类 |
| `category_l2` | string/null | 否 | 二级分类 |
| `tags` | string[] | 否 | 去重、去空白 |
| `difficulty` | enum | 是 | `easy`, `medium`, `hard`, `unknown` |
| `importance` | enum | 是 | `low`, `normal`, `high`, `critical` |
| `source` | string/null | 否 | 来源说明 |
| `source_year` | integer/null | 否 | 合理年份 |
| `source_question_no` | string/null | 否 | 原始题号 |
| `status` | enum | 是 | `active`, `inactive`, `needs_review` |
| `created_at` | ISO string | 是 | 有效时间 |
| `updated_at` | ISO string | 是 | 有效时间 |

### 5.3 导入校验

格式校验：

- 文件必须是 UTF-8 JSON。
- 顶层必须为对象。
- `schema_version` 必须支持。
- `bank` 和 `questions` 必须存在。
- `questions` 必须为数组。

题目校验：

- `question_id`、`stem`、`category_l1` 非空。
- `question_id` 在本批次内不得重复。
- 选项至少两个，key 唯一，text 非空。
- `correct_keys` 不得为空，且必须全部存在于选项。
- 单选题必须且只能有一个答案。
- 多选题必须至少有两个答案。
- 多选题的答案保存为排序后的 key 数组。
- 禁止通过大小写、数组顺序或空格差异制造不同答案。
- `status: active` 的题目不能缺少可判题答案。
- 不接受 PDF、图片、OCR 原文或未结构化文本。

## 6. 增量导入、重复和版本

### 6.1 匹配优先级

1. `bank_id + question_id` 精确匹配。
2. 标准化后的题干、选项生成完全内容指纹。
3. 题干和选项的相似候选匹配。
4. 比较答案、分类、来源和版本，判断是重复、修订还是冲突。

标准化至少包括：

- 去除首尾空白。
- 连续空白折叠。
- 统一全角/半角标点。
- 统一选项前缀。
- 选项按 key 顺序参与指纹。

### 6.2 导入动作

每题生成一个动作：

```text
add            新题，新增 question 和 version
skip           内容完全相同，无需变化
update         相同 question_id 的新版本，保留旧版本
needs_review   疑似重复或答案冲突，等待人工确认
invalid        格式或字段不合法
disable        外部明确要求停用现有题目
```

疑似重复不能自动删除。答案不同但内容高度相似时必须进入 `needs_review`。

### 6.3 导入流程

```text
选择 JSON
 -> 解析
 -> schema 校验
 -> 字段和题型校验
 -> 答案校验
 -> ID 校验
 -> 指纹和候选重复分析
 -> 生成预览报告
 -> 用户确认
 -> 写入导入批次
 -> 写入题库、题目和版本
 -> 重建相关题目状态
 -> 标记批次 applied
```

### 6.4 原子性和回滚

P0 使用“确认前不写入，确认后单次保存”的最小事务模型：

1. 先在内存中构造完整新数据。
2. 保存应用前的 `workbench_data` 快照到导入批次临时字段或内存。
3. 所有校验通过后才写 `localStorage`。
4. 写入失败时恢复旧快照。
5. 应用成功后记录批次摘要。

P1 增加显式“撤销最近导入”，仅撤销该批次创建或更新的题目版本，不能删除之后产生的答题事件。回滚更新时恢复旧的 `current_version`，历史版本继续保留。

## 7. 答题逻辑

### 7.1 单选

标准答案 `["B"]`：

```text
["B"] -> 正确
[]    -> 错误
["A"] -> 错误
["B","C"] -> UI 层禁止提交；引擎层按错误处理
```

### 7.2 多选

严格集合相等，不使用部分得分：

```text
标准答案 ["A","B","C"]

["A","B","C"] -> 正确
["A","B"]     -> 错误
["A","C","D"] -> 错误
["A","B","C","D"] -> 错误
```

判题函数必须先排序、去重，再比较数组长度和每一项。

### 7.3 练习模式和考试模式

普通练习提交后立即显示：

- 当前结果。
- 正确答案。
- 解析。
- 本题耗时。
- 收藏按钮。
- 上一题、下一题。

模拟考试过程中不显示正确答案、解析和对错；交卷后统一结算，并为每道题生成 attempt。

## 8. 计时设计

### 8.1 时间来源

- 审计时间使用 `new Date().toISOString()`。
- 活跃耗时使用 `performance.now()` 的区间差。
- 不使用“打开页面到提交的墙上时间”直接当学习时间。

### 8.2 单题计时

每道题维护活跃时间片：

```text
进入题目 -> active segment 开始
visibilitychange hidden/pagehide -> 暂停
回到前台 -> 新 active segment
用户操作 -> 重置 idle 计时器
超过 60 秒无操作 -> 计为 idle，不再累加
提交 -> 汇总全部 active segment
```

建议：

- 单个连续时间片设置 5 分钟上限，防止生命周期事件丢失造成异常膨胀。
- 题目离开、切题、提交时强制 flush。
- `visibilitychange`、`pagehide` 和 `beforeunload` 只做最后一次 flush，不依赖它们保证数据完整。
- 计时状态只存在当前内存会话，提交后写入 attempt。

### 8.3 Session 计时

Session 记录：

- `started_at`、`ended_at`。
- `active_seconds`。
- `paused_seconds`。
- `answered_count`。
- `completed` 或 `abandoned`。
- `learning_date` 使用现有 `SleepSchedule.learningDateString` 规则。

### 8.4 模拟考试倒计时

模拟考试的剩余时间使用墙上时钟计算：

```text
deadline = started_at + time_limit_seconds
remaining = deadline - Date.now()
```

页面切后台不能暂停考试倒计时；但每题的 `active_seconds` 仍只记录活跃阅读/操作时间，作为统计元数据。

## 9. 错题和收藏

### 9.1 错题

每次答错都追加 attempt，并更新 question state：

- `wrong_count + 1`
- `ever_wrong = true`
- `wrong_active = true`
- `consecutive_wrong + 1`
- `consecutive_correct = 0`
- `last_result = wrong`

答对时：

- `correct_count + 1`
- `consecutive_correct + 1`
- `consecutive_wrong = 0`
- `last_result = correct`
- 不减少历史 `wrong_count`
- 不把 `ever_wrong` 变回 false
- 默认将 `wrong_active` 设为 false；如果用户手动保持错题状态，应允许状态覆盖

### 9.2 收藏

收藏只修改 `quiz_question_states.favorite`，不产生答题事件。

合法组合：

```text
收藏=true, wrong_active=true
收藏=true, wrong_active=false
收藏=false, wrong_active=true
收藏=false, wrong_active=false
```

## 10. 学习统计

所有统计从 `quiz_attempts`、`quiz_sessions` 和当前题目表实时计算或按需缓存，不能从 AI 输出反推。

### 10.1 今日

按现有学习日规则筛选 `learning_date`：

- 答题总数。
- 正确数和正确率。
- 活跃学习时间。
- 今日新增错题。
- 今日收藏变化。

### 10.2 累计

- 累计答题量。
- 累计正确率。
- 累计活跃学习时间。
- 做过的题目数。
- 曾经答错的题目数。
- 当前错题数。

### 10.3 分类

按题目当前分类聚合：

- 题量。
- 答题量。
- 正确率。
- 平均耗时。
- 当前错题数。
- 平均掌握度。

历史 attempt 通过当时的 `question_id` 和版本关联题目；如果分类也会变化，建议在 attempt 中保留当时的 `category_l1` 和 `category_l2` 快照，避免历史统计随分类编辑漂移。P0 可暂不做，P1 必须决定是否启用。

### 10.4 趋势

按 `learning_date` 展示：

- 答题量。
- 正确率。
- 活跃学习时间。
- 新增错题量。

## 11. 掌握度模型

P0 使用可解释的基础分数，不引入复杂间隔重复算法。

建议基础分数：

```text
accuracy_score = correct_count / attempt_count
recency_score = 最近一次答题距今天数的衰减值
streak_score = min(consecutive_correct / 5, 1)
error_penalty = min(wrong_count / 5, 1)
speed_score = 根据同题历史平均耗时的相对值，缺数据时为 0.5

mastery_score =
  0.40 * accuracy_score
  + 0.20 * recency_score
  + 0.20 * streak_score
  + 0.10 * (1 - error_penalty)
  + 0.10 * speed_score
```

规则：

- 没有作答时为 0。
- 只有一次答对不能直接标记掌握。
- 曾错且最近仍错的题目上限建议不超过 0.49。
- 连续至少 3 次正确、最近一次正确且至少作答 3 次，才允许显示“初步掌握”。
- P3 再考虑 SM-2、FSRS 或其他复习算法。

## 12. AI 与模型中转适配

### 12.1 已确认事实

当前源码中没有确认到具体 AI 供应商、API 地址、鉴权字段、模型名称或既有 AI UI。因此不能把“智谱 AI”当作已存在的实现事实。

用户可能使用：

- 智谱。
- 其他国产模型。
- 自建中转站。
- 兼容某种通用聊天 API 的网关。

最终以实际源码和用户补充的配置为准。

### 12.2 适配边界

P2 只增加一个最小抽象，不把供应商协议写进刷题业务：

```javascript
const modelProvider = {
  isConfigured() {},
  async complete(request) {}
};
```

`request` 至少包含：

```text
task
context
output_schema
```

适配器负责：

- 读取现有模型配置。
- 调用现有中转/API。
- 解析失败和超时。
- 返回结构化结果。

刷题系统负责：

- 从本地真实数据生成 context。
- 限制查询范围和数量。
- 校验模型返回的题目 ID、统计数字和建议。
- 在模型失败时提供非 AI 的基础统计。

不得在 P2 直接新增固定的智谱 URL、OpenAI URL、API key 字段或新的秘密配置机制，除非源码确认当前项目确实如此设计。

### 12.3 AI 用例

- “我最近哪一部分最差？”
- “我最近反复错哪些题？”
- “今天应该复习什么？”
- “给我安排 30 道薄弱企业文化题。”
- “找出过去一个月错过两次以上的题。”

AI context 必须包含真实的题目 ID、分类统计、attempt 统计和时间范围。输出中的题目 ID 必须回查本地数据，不允许模型凭空生成题目。

### 12.4 AI 安全规则

- AI 不负责最终判题。
- AI 不修改题库和历史答题记录。
- AI 生成的训练计划先显示预览，用户确认后才创建 session。
- 数字回答必须能映射到本地查询结果。
- API key 不写入题目数据、attempt 或导出的普通题库文件。

## 13. UI/UX 结构

### 13.1 导航

在现有抽屉导航中增加“刷题”入口，保持当前工作台的浅色 Grow/iOS 视觉体系、卡片、Toast、Action Sheet、确认弹窗和响应式布局。

不要建立独立 App，不要改变现有首页结构。

### 13.2 刷题首页

优先显示：

- 今日答题量、正确率、学习时间。
- 继续上次未完成练习。
- 当前错题和收藏入口。
- 今日复习推荐。
- 快速开始按钮。

### 13.3 答题页

固定区域：

- 顶部：返回、题号、题型、收藏。
- 中部：题干和选项。
- 底部：提交、上一题、下一题。
- 侧边或抽屉：题号导航。

题号状态：

```text
未作答
已作答
答错
收藏
当前题
```

普通练习显示解析区；模拟考试隐藏解析区直到交卷。

### 13.4 导入页

流程必须可见：

```text
选择文件 -> 解析中 -> 校验报告 -> 重复分析 -> 预览动作 -> 确认导入
```

报告至少显示新增、更新、跳过、待确认、无效数量，并能展开到单题。

## 14. 持久化与同步

### 14.1 本地写入

所有写入都必须：

1. 读取当前 `workbench_data`。
2. 只修改目标集合。
3. 保留未知字段和未知集合。
4. 写回完整 JSON。
5. 处理 `JSON.parse` 失败和 `localStorage` 写入异常。

题库首次接入时增加数据版本，例如：

```json
{
  "version": 2,
  "quiz_schema_version": 1
}
```

迁移必须幂等，旧数据打开后自动补默认空集合，但不能删除未知数据。

### 14.2 同步

需要修改 `sync-engine.js` 的集合列表，增加：

```text
quiz_banks
quiz_questions
quiz_question_versions
quiz_sessions
quiz_attempts
quiz_question_states
quiz_import_batches
```

所有这些集合使用 `client_id` 合并和 `updated_at` 冲突规则。

注意：`quiz_attempts` 是追加型事件。若两个设备产生相同 `attempt_id`，视为同一事件；不同 ID 直接取并集。不要因为较旧的整批数据而删除另一设备新产生的 attempt。

### 14.3 手机裁剪

绝不把刷题集合纳入当前 14 天清理逻辑。手机端必须保留：

- 题库。
- 题目版本。
- 答题事件。
- 题目状态。
- 导入批次。

否则用户会在手机打开后丢失长期学习历史。

### 14.4 数据体积风险

当前是一个完整 JSON 文件。题库和 attempts 长期增长可能导致：

- `localStorage` 写入失败。
- Gist 文件增大。
- 上传下载耗时增长。
- 每次合并成本升高。

P0/P1 先沿用现有机制，但加入体积监测和导出备份。当满足任一条件时必须评估归档：

- attempts 超过 10,000 条。
- Gist 文件接近实际可接受上限。
- 手机写入频繁失败。
- 单次同步明显影响使用。

归档不能静默删除历史。未来若迁移到 IndexedDB 或拆分多个云端文件，必须作为独立版本迁移项目。

## 15. 兼容方式

### 15.1 文件边界

优先新增 `quiz-*.js`，只在 `index.html` 中做最小接入：

- script 引入。
- 一个导航入口。
- 刷题视图容器。
- 初始化和事件绑定。

不重写现有页面，不移动无关业务。

### 15.2 数据兼容

- 缺少任何新集合时按空数组处理。
- 旧 `version` 自动迁移。
- 旧导入功能继续支持原有工作台集合。
- 导出 JSON 继续包含原有数据。
- 未知集合保留，避免新旧版本互相覆盖。

### 15.3 同步兼容

更新后的同步引擎必须兼容没有刷题集合的旧 Gist。下载旧文件时自动补空数组，上传时保留旧字段和新集合。

## 16. 开发阶段

### P0：核心闭环

- 增加数据默认值和迁移。
- 题库标准 JSON 导入。
- 单选和多选严格判题。
- 普通练习页。
- 解析、上下题、题号。
- 每题 active time。
- attempts 持久化。
- 错题状态。
- 收藏状态。
- 基础今日和累计统计。
- 接入同步集合。
- 导出和异常保护。
- 纯逻辑测试。

验收：导入一组题，刷新页面后数据仍在；完成同一题多次后历史次数和正确率正确；切后台不虚增耗时；手机同步不会裁剪刷题数据。

### P1：完整练习与运营

- 顺序、随机、分类、错题、收藏练习。
- 模拟考试和统一结算。
- 题号导航状态。
- Session 生命周期。
- 分类统计和趋势。
- 增量更新、版本和重复检测。
- 导入预览、待确认和回滚。
- 继续上次练习。
- 基础掌握度。

### P2：模型辅助

- 先定位并确认现有模型/中转 API。
- 实现供应商无关适配器。
- 基于真实数据的薄弱项分析。
- 错题分析。
- 今日复习建议。
- 个性化训练计划预览。
- 自然语言查询。

如果现有 AI 入口仍无法确认，P2 只完成数据查询函数和接口契约，不擅自新增 API。

### P3：长期演进

- 更高级的掌握度和复习算法。
- 更多题型。
- 大规模题库归档或 IndexedDB。
- 云端文件分片。
- 题库质量审计和变更对比。

## 17. 测试方案

### 17.1 数据和迁移

- 空旧数据能补齐所有新集合。
- 已有工作台数据迁移后不丢字段。
- 迁移重复执行结果一致。
- 未知集合保持不变。
- `localStorage` 解析失败时不覆盖原数据。

### 17.2 判题

- 单选正确、错误、空答案。
- 多选完全匹配。
- 多选少选、多选、多余答案均错误。
- 答案顺序不同但集合相同应正确。
- 重复答案键按非法输入处理。

### 17.3 历史

- 同一题多次作答追加多条 attempts。
- 正确率、错误次数和连续结果正确。
- 后来答对不删除过去错误。
- 收藏和错题可以同时存在。
- 停用题仍能打开历史 attempt。
- 旧版本题目仍能展示历史解析。

### 17.4 计时

- 普通前台操作累加。
- 切后台暂停。
- 返回前台恢复。
- 60 秒无操作后不继续累加。
- 切题和提交会 flush。
- 模拟考试倒计时切后台仍按墙上时间推进。

### 17.5 导入

- JSON 解析失败。
- 顶层字段缺失。
- 题型非法。
- 选项重复。
- 答案不存在。
- 单选多个答案。
- 多选没有两个答案。
- 批次内重复 ID。
- 与现有题目完全重复。
- 同 ID 新版本。
- 疑似重复进入待确认。
- 用户取消确认不写入。
- 写入失败恢复旧数据。
- 回滚不删除历史 attempts。

### 17.6 同步

- 无刷题集合旧 Gist 下载成功。
- 两端新 attempt 取并集。
- 相同 `client_id` 的题目状态按更新时间合并。
- 手机 trim 不影响刷题集合。
- 同步失败不覆盖本地数据。

运行方式保持：

```powershell
node test-logic.js
```

新增纯逻辑测试优先继续放在 `test-logic.js`，除非文件明显失控，再拆成 `test-quiz.js`，但不要引入测试框架。

## 18. 风险与注意事项

### 数据丢失

最大的风险是全量 JSON 写回时覆盖未知集合，或新代码初始化时用默认对象替换旧数据。所有保存函数必须基于现有对象 patch，不得重建并丢弃未知字段。

### 题目版本

修改题干、选项、答案或解析时必须创建新版本。不能原地覆盖旧版本，否则历史答题记录会指向错误内容。

### 重复题

相似题判断只能生成候选，不能把不确定结果自动删除。答案不同尤其需要人工确认。

### 同步冲突

attempt 是追加事件，不能简单按整数组的最后写入优先替换整个数组。集合合并必须按记录 ID 取并集。

### AI 数据准确性

模型只能解释和建议，不能成为统计数据源、判题源或数据写入源。所有数字和题目 ID 都必须由本地回查。

### 性能

每次答题都扫描全部 attempts 会随数据增长变慢。P0 可以简单聚合；P1 应维护 `quiz_question_states`；P3 再考虑索引、归档和拆分存储。

### 长期增长

题库文本和历史事件会持续增长。不能依赖手机端 14 天清理解决问题；必须通过体积监测、导出备份和明确归档策略解决。

### 安全

模型 API key、Gist Token 和其他凭据不能写入题库导出文件、attempt 或 AI context 快照。现有凭据机制保持原样，不复制到刷题模块。

## 19. 给执行模型的 Implementation Prompt

以下内容可以直接复制给 Luna 或其他执行模型。

```text
你接手的是一个已有的个人工作台项目，不是从零新建 App。

项目真实路径：
F:\codexspace\personal-workbench

先阅读：
- index.html
- gist-api.js
- data-filter.js
- sync-engine.js
- test-logic.js
- HANDOVER.md
- QUIZ-SYSTEM-BLUEPRINT.md

项目约束：
1. 使用原生 HTML/CSS/JavaScript，不引入 React、Vue、构建系统、数据库或新依赖。
2. 这是个人工作台中的刷题模块，不新增用户系统、社交、排行榜或后端。
3. 保持现有工作台视觉风格、抽屉导航、Toast、Action Sheet、确认弹窗和 PWA 结构。
4. 保留现有用户未提交改动，不执行 reset、checkout 或覆盖无关文件。
5. 当前已有 GitHub Gist 手动同步。新增刷题集合必须接入上传、下载、合并和导出。
6. 绝不能把刷题集合放入 focus_sessions 或 tasks，也不能让 data-filter.js 的 14 天清理删除刷题数据。
7. 判题必须由程序依据标准答案完成，AI 不得参与最终判题。
8. 当前源码没有确认到具体模型供应商或 API。不要自行新增智谱、OpenAI 或任何固定厂商接口。P2 只有在真实既有中转/API 入口被确认后，才能实现供应商无关的 modelProvider 适配器。

第一阶段只实现 P0：
- quiz-data.js：默认结构、数据迁移、读写辅助。
- quiz-engine.js：单选/多选严格判题、抽题、题目状态聚合、基础统计、active time 计算。
- quiz-import.js：标准 JSON 解析、字段校验、答案校验、批次内重复检测、现有题目匹配、导入预览、确认写入、失败恢复。
- quiz-ui.js：刷题入口、题库导入入口、普通练习页、题干、选项、提交、解析、上一题、下一题、收藏、错题状态、基础统计。
- index.html：只做最小的 script 引入、导航入口和视图容器接入。
- sync-engine.js：加入新的 quiz 集合，并保持旧 Gist 兼容。
- service-worker.js：如新增脚本，需要加入离线 shell。
- test-logic.js：增加核心纯逻辑测试。

必须采用以下集合：
- quiz_banks
- quiz_questions
- quiz_question_versions
- quiz_sessions
- quiz_attempts
- quiz_question_states
- quiz_import_batches

必须满足以下数据规则：
- question_id 跨导入稳定。
- 题目实体与题目版本分离。
- 每次答题追加一条不可覆盖的 quiz_attempts。
- quiz_question_states 是可重算的当前聚合状态。
- 收藏独立于错题。
- 后来答对不能删除历史错误。
- 停用题目不能删除历史。
- 修改题干、选项、答案或解析必须创建新版本。
- attempt 必须记录 question_id 和 question_version。

标准导入文件格式：
{
  "schema_version": 1,
  "exported_at": "ISO",
  "bank": {
    "bank_id": "stable-id",
    "name": "题库名称",
    "version": "2026.09.1"
  },
  "questions": [
    {
      "question_id": "stable-question-id",
      "version": "1.0",
      "question_type": "single_choice|multiple_choice",
      "stem": "题干",
      "options": [{"key": "A", "text": "..." }],
      "correct_keys": ["A"],
      "explanation": "...",
      "category_l1": "...",
      "category_l2": null,
      "tags": [],
      "difficulty": "easy|medium|hard|unknown",
      "importance": "low|normal|high|critical",
      "source": null,
      "source_year": null,
      "source_question_no": null,
      "status": "active|inactive|needs_review",
      "created_at": "ISO",
      "updated_at": "ISO"
    }
  ]
}

判题：
- single_choice 必须一个答案且完全匹配。
- multiple_choice 必须排序、去重后做严格集合相等比较。
- 不使用部分得分。
- 普通练习提交后显示对错、正确答案和解析。
- 模拟考试暂不要求 P0 实现；后续实现时交卷后统一显示结果。

计时：
- 用 performance.now() 计算活跃区间。
- 用 ISO 时间记录审计时间。
- visibilitychange/pagehide 时暂停并 flush。
- 返回前台重新开始 active segment。
- 约 60 秒无用户操作后进入 idle，不继续累计。
- 单个连续 segment 设置上限，避免事件丢失导致时间膨胀。
- learning_date 复用现有 SleepSchedule.learningDateString 规则。

导入：
- 先解析和完整校验，再生成预览，用户确认后才写入。
- 支持 add、skip、update、needs_review、invalid。
- 同 question_id 新版本必须保留旧版本。
- 内容指纹用于完全重复检测。
- 相似但不确定的题目进入 needs_review，不自动删除。
- 写入失败必须恢复旧的 workbench_data。

同步：
- 更新 SYNC_COLLECTIONS。
- 旧云端数据没有新集合时按空数组处理。
- 不覆盖未知集合。
- quiz_attempts 按 client_id 取并集，不能因为一端数组较旧就删除另一端新事件。
- 不对任何 quiz 集合执行 14 天裁剪。

统计：
- 今日：答题量、正确率、活跃学习时间、新增错题。
- 累计：答题总量、正确率、累计时间、当前错题数。
- 分类：答题量、正确率、平均耗时、错题数。
- 维护 quiz_question_states，包含 attempt_count、correct_count、wrong_count、accuracy、平均耗时、最近结果、连续正确/错误、ever_wrong、wrong_active、favorite、mastery_score。
- 掌握度使用可解释的基础分数，不实现复杂复习算法。

测试至少覆盖：
- 迁移不丢旧数据。
- 单选和多选严格判题。
- 多次答题历史不覆盖。
- 答对后历史错误仍存在。
- 收藏与错题可独立共存。
- 切后台不虚增答题时间。
- 导入格式、答案、重复和回滚。
- 旧 Gist 下载、同步集合合并和手机 trim 安全。

完成顺序：
1. 先实现并测试纯数据/引擎/导入模块。
2. 再接入 index.html。
3. 再更新同步和 service worker。
4. 运行 node test-logic.js。
5. 检查 git diff，确认没有改动无关功能。
6. 不要在 P0 实现 AI，不要创建固定模型 API。

完成后报告：
- 修改了哪些文件。
- 新增了哪些集合和迁移。
- 测试结果。
- 尚未实现的 P1/P2/P3。
- 发现的同步或数据体积风险。
```

## 20. 实施前检查清单

- [ ] 确认实际执行目录为 `F:\codexspace\personal-workbench`。
- [ ] 确认没有把 `F:\codexspace\个人工作台ios` 的蓝牙探针当成目标项目。
- [ ] 读取并保留工作区现有未提交改动。
- [ ] 确认是否存在真实模型中转/API 入口；不存在则暂缓 P2。
- [ ] P0 完成前不修改无关页面。
- [ ] P0 完成后运行 `node test-logic.js`。
- [ ] 用测试数据验证刷新、重新打开、导入、同步和历史题目版本。
- [ ] 在真实长期使用前导出一次完整 JSON 备份。
