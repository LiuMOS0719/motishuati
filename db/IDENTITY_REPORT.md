# 身份层迁移报告（阶段二）

- 执行时间：2026-11-28
- 任务单：`用户表重构-任务单.md`
- 数据库：`moti`（MariaDB 13.0.2），账号 `moti_app`
- DDL 落盘：`db/schema_identity.sql`

---

## 1. 建表

| 表 | 说明 |
|---|---|
| `users` | 账号，含 `role`(owner/admin/user) / `status` / `quota`，`owner_slot` 生成列保证 owner 唯一 |
| `auth_tokens` | 登录令牌，`token CHAR(48) ascii_bin` |
| `admin_logs` | 管理操作审计（本期为空表） |

**`pass_hash` 是 `CHAR(64)`**（PBKDF2-SHA256 / 200,000 次 / dklen=32 → 32 字节 → 64 hex），与线上 6 个账号一致。任务单原文的 `CHAR(128)` 已修正。

---

## 2. 迁移结果

| 项 | 源（SQLite） | 目标（MariaDB） |
|---|---|---|
| `users` | 6 | **6** |
| `auth_tokens` | 17 | **16**（丢弃 1 条测试残留，见 3.2） |
| `admin_logs` | — | 0（本阶段不写入） |

### 角色映射

| id | username | is_admin | → role | quota |
|---|---|---|---|---|
| 3 | liumos | 1 | **owner** | 26 |
| 45 | 123 | 0 | user | 50 |
| 51 | test1 | 0 | user | 5 |
| 52 | 1103112031 | 0 | user | 50 |
| 54 | stan | 0 | user | 50 |
| 55 | 牵着云朵漫步 | 0 | user | 0 |

`owner_slot` 唯一索引确认：`SELECT COUNT(*) FROM users WHERE role='owner'` = **1**。

---

## 3. 关键校验

### 3.1 哈希逐字节一致（「账号原样登录」的直接证据）

| id | username | pass_hash 一致 | salt 一致 | quota 一致 |
|---|---|---|---|---|
| 3 | liumos | ✅ | ✅ | 26 → 26 |
| 45 | 123 | ✅ | ✅ | 50 → 50 |
| 51 | test1 | ✅ | ✅ | 5 → 5 |
| 52 | 1103112031 | ✅ | ✅ | 50 → 50 |
| 54 | stan | ✅ | ✅ | 50 → 50 |
| 55 | 牵着云朵漫步 | ✅ | ✅ | 0 → 0 |

`pass_hash` / `salt` **原样字符串搬运，脚本没有重算、没有改算法**。只要后端用同一参数（PBKDF2-HMAC-SHA256、200,000 次、dklen=32、salt 按 hex 解码），原密码必然能登录，不需要任何人重置。

> 自查方式：新后端起来后，用 6 个账号各自的**原密码**逐个登录一次即可确认。

### 3.2 丢弃 1 条 token

| token | user_id | 原因 |
|---|---|---|
| `adm_test` | 3 | 8 字符（正常是 48），`created_at` 与 `expires_at` 相同——是 11-28 我测试管理接口时临时插入的，非真实会话 |

其余 16 条全部搬运，长度均为 48。

### 3.3 其它

| 项 | 结果 |
|---|---|
| `id` 原样 | ✅ 3/45/51/52/54/55，未重排 |
| `last_login` 空串 | 源库无空串（NULL 保持 NULL） |
| `created_at` | 6 条都有值，无缺失 |
| `ck_uname_len`（3–20 字符） | 全部满足（"123" 3 字符，"牵着云朵漫步" 6 字符） |
| `ck_owner_alive` | owner=liumos 且 status=active ✅ |

---

## 4. 交付物

| 文件 | 说明 |
|---|---|
| `db/schema_identity.sql` | 3 张表 DDL |
| `db/import_identity.py` | 幂等导入（`--dry-run` 可预演；`OWNER_ID` 为显式常量） |
| 本报告 | 迁移记录 |

**未做**（按任务单边界）：没改 `server.py`、没动 SQLite、没写权限中间件（留阶段三接口层）。

---

## 5. 回滚

```sql
DROP TABLE admin_logs; DROP TABLE auth_tokens; DROP TABLE users;
```
或整体 `DROP DATABASE moti;` 重来（内容层可用 `db/import_content.py` 一键重建）。线上 8090 仍在用 SQLite，不受影响。

---

## 6. 当前 moti 库状态

| 表 | 行数 | 阶段 |
|---|---|---|
| `domains` / `courses` | 1 / 1 | 一 |
| `syllabus_nodes` | 6 | 一 |
| `papers` | 5 | 一 |
| `questions` | 184 | 一 |
| `figures` | 19 | 一 |
| `question_syllabus` / `question_papers` | 184 / 186 | 一 |
| `users` / `auth_tokens` / `admin_logs` | 6 / 16 / 0 | 二 |
| `image_desc` | 0 | 一（可后置） |

**下一步（阶段三 · 交互层）**：拆 `user_state.state_json` → `quiz_sessions` / `quiz_items` / `q_weight` / `session_summary` / `ai_messages` / `ask_usage` / `feedback` / `admin_notes` 共 7~8 张表，并迁移 5 个用户 52 场练习、67 个 AI 对话键、78 条计费记录、35 条反馈、22 条想法。权重回填要严格按任务单 4.6 的公式（连对 3 次=100、连错 2 次=0、最近 5 次 Laplace）。
