# 交互层迁移报告（阶段三）

- 执行时间：2026-11-28
- 任务单：`交互层重构-任务单.md`
- 数据库：`moti`（MariaDB 13.0.2）
- DDL 落盘：`db/schema_interaction.sql`

---

## 1. 建表（7 张）

| 表 | 说明 |
|---|---|
| `quiz_sessions` | 练习场次，`sid` 自增主键 + `ext_id`（原 `s1795…`） |
| `quiz_items` | 每场每道题，`qids` 全量展开（未答的 chosen/correct 为 NULL） |
| `q_weight` | 每人每题掌握度（`last5` / 连对连错 / 累计） |
| `ai_messages` | AI 对话（`scope=ask` 单题答疑 / `review` 整场评价） |
| `ask_usage` | AI 计费（`sid=0` 表示旧数据无场次） |
| `feedback` | 题目反馈（`user_id` 允许 NULL，见 3.2） |
| `admin_notes` | 想法记录（`username` 改存 `user_id`） |

---

## 2. 行数

| 表 | 行数 | 说明 |
|---|---|---|
| `quiz_sessions` | **53** | 5 个用户 sessions 共 52 + user 52 的 1 场未完成 `current` |
| `quiz_items` | **1630** | 与 `SUM(qcount)` 完全相等 |
| `q_weight` | **280** | 有作答记录的 (user, 题) 组合 |
| `ai_messages` | **280** | ask 266 + review 14 |
| `ask_usage` | **78** | 与源库一致 |
| `feedback` | **35** | 与源库一致 |
| `admin_notes` | **22** | 与源库一致 |

---

## 3. 验收结果（任务单第 8 节 ①～⑮）

| # | 项 | 结果 |
|---|---|---|
| ① | 场次数 | ✅ 53 |
| ② | items = SUM(qcount) | ✅ 1630 = 1630 |
| ③ | q_weight 行数 | ✅ 280 |
| ④ | ai_messages | ✅ ask 266 / review 14 |
| ⑤ | ask_usage | ✅ 78 |
| ⑥ | feedback | ✅ 35 |
| ⑦ | admin_notes | ✅ 22 |
| ⑧ | 每场 answered 与实际作答行数 | ✅ 0 行不一致 |
| ⑨ | 每场 correct 与答对行数 | ✅ 0 行不一致 |
| ⑩ | items 连续覆盖 1..qcount | ✅ 0 行异常 |
| ⑪ | ai_messages.sid 都能对上 | ✅ 0 行孤儿 |
| ⑫ | weight 在 0-100 | ✅ 0 行越界 |
| ⑬ | last5 只能是 0/1（≤5 位） | ✅ 0 行非法 |
| ⑭ | 权重抽样 | ✅ 见下 |
| ⑮ | admin_notes 用户名反查 | ✅ 22 条全部对上 |

### 权重抽样（⑭，可手工核对）

| user | 题 | last5 | 连对 | 连错 | 作答 | 答对 | weight | 验算 |
|---|---|---|---|---|---|---|---|---|
| 3 | D-5 | 01101 | 1 | 0 | 9 | 4 | **57** | (3+1)/(5+2)×100 = 57.14 → 57 |
| 3 | A-26 | 11111 | 5 | 0 | 9 | 5 | **100** | 连对 ≥3 走例外 |
| 3 | A-7 | 10111 | 3 | 0 | 8 | 6 | **100** | 连对 ≥3 走例外 |
| 3 | A-6 | 10111 | 3 | 0 | 7 | 4 | **100** | 同上 |
| 3 | A-15 | 10111 | 3 | 0 | 7 | 5 | **100** | 同上 |

权重函数 `db/weight.py` 内置任务单 4.6 的 6 个用例，每次导入前自动跑：

```
✅ 3 次全对        last5=111    streak=(0,0) →  80（期望 80）
✅ 2 次全对        last5=11     streak=(0,0) →  75（期望 75）
✅ 5 次里 4 对 1 错 last5=11011  streak=(0,0) →  71（期望 71）
✅ 1 次全对        last5=1      streak=(0,0) →  67（期望 67）
✅ 连对 3 次        last5=00111  streak=(3,0) → 100（期望 100）
✅ 连错 2 次        last5=11000  streak=(0,2) →   0（期望 0）
```

> 前 4 条只验证 Laplace 公式本身（人为把 streak 置 0），否则「3 次全对」会同时命中「连对 3 次=100」的例外。这条口径与前端 `home.js` 的 `qWeights()` 一致。

---

## 4. 迁移过程中的判断与异常

### 4.1 `current` 只在其 id 不在 `sessions` 里时才单独插

5 个用户的 `current` 有 4 个是**上一场的副本**（id 已在 sessions 里），只有 `user 52` 的 `s1795770777551` 是真·进行中（`finished=false`）。

⇒ 若不加判断，场次会重复 4 场、items 重复约 120 行。现在 52 + 1 = 53 场。

### 4.2 5 条早期匿名反馈的 `user_id = 0`

源库有 5 条反馈的 `user_id=0`、`username=NULL`（账号系统上线前提交的，含「图表不对」「答案解析没有换行」这类真实反馈）。

`feedback.user_id` 原本是 `NOT NULL` + 外键，这 5 条插不进去。处理：

- **没有丢弃**，也没有篡改归属
- 把 `feedback.user_id` 放开成 `NULL`，这 5 条存 NULL（语义就是"匿名反馈"）
- `schema_interaction.sql` 已同步

### 4.3 `chats` 键数量：74 个（任务单预估 67）

| 用户 | chats 键 |
|---|---|
| 3（liumos） | 67 |
| 51（test1） | 5 |
| 54（stan） | 2 |
| 45 / 52 | 0 |

两种键格式都处理了：`s1795…::A-1`（带场次）→ `sid` + `qid`；裸 `A-1`（早期按题存）→ `sid=NULL`。

### 4.4 `explain` / `real` 都是 MariaDB 保留字

阶段三又踩了一个：验收 SQL 里的别名 `COUNT(...) real` 直接 1064（`REAL` 是浮点类型）。已改名 `cnt`。
（阶段一踩的是 `explain` 列名，已在 schema 与任务单里修正。）

### 4.5 字符集 collation 不一致（阶段一二的表已重建）

MariaDB 13 的默认 collation 是 `utf8mb4_uca1400_ai_ci`，而库指定的是 `utf8mb4_unicode_ci`。
阶段一的表创建时写的是 `DEFAULT CHARSET=utf8mb4`（没带 COLLATE），于是继承了新默认，
导致 `quiz_sessions.course_id → courses.id` 外键报 `errno 150`。

处理：三个 schema 文件全部显式补 `COLLATE=utf8mb4_unicode_ci`，**DROP DATABASE 重建**，三层导入脚本全部重跑（幂等验证顺带完成）。

---

## 5. ⚠️ 本阶段是「预演」，不是终态（任务单第 7 节，原样记录）

阶段三做完后，**线上后端仍然读写 SQLite**。用户每答一题、每问一次 AI，数据只进 `state_json`，不会进这 7 张表。

所以：

- 从迁移完成到后端切换之间，所有新产生的答题记录、AI 对话都**只在 `state_json` 里**
- **后端切换的那一刻，必须在停写窗口内再跑一次 `python3 db/import_interaction.py` 全量同步**，否则这段时间的数据全部丢失
- 同步完成后才开始切后端；切换成功后**立即停用** `import_interaction.py`

---

## 6. 交付物

| 文件 | 说明 |
|---|---|
| `db/schema_interaction.sql` | 7 张表 DDL（`feedback.user_id` 可空） |
| `db/import_interaction.py` | 幂等导入（`--dry-run` 可预演） |
| `db/weight.py` | 权重函数（Decimal + ROUND_HALF_UP，含 6 个断言） |
| `db/verify_interaction.py` | 第 8 节 ①～⑮ 全部校验 |
| 本报告 | — |

**未做**：没改 `server.py`、没改前端、没删 `GET/POST /api/state`、没动 SQLite 一行。

---

## 7. 回滚

```sql
DELETE FROM ai_messages; DELETE FROM quiz_items; DELETE FROM q_weight;
DELETE FROM ask_usage; DELETE FROM feedback; DELETE FROM admin_notes; DELETE FROM quiz_sessions;
```
或 `DROP DATABASE moti` 后重跑 `db/import_content.py` + `import_identity.py` + `import_interaction.py`（三个脚本都幂等，实测重跑结果一致）。

---

## 8. 三层合并后的库状态

| 层 | 表 | 行数 |
|---|---|---|
| 一 内容层 | domains 1 / courses 1 / syllabus_nodes 6 / papers 5 / questions 184 / figures 19 / question_syllabus 184 / question_papers 186 / image_desc 0 | — |
| 二 身份层 | users 6 / auth_tokens 16 / admin_logs 0 | — |
| 三 交互层 | quiz_sessions 53 / quiz_items 1630 / q_weight 280 / ai_messages 280 / ask_usage 78 / feedback 35 / admin_notes 22 | — |

**共 19 张表**。下一步（阶段四 · Node 服务）才有意义开始写代码。
