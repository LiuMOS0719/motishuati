# Node 服务重构报告（阶段四）

- 完成时间：2026-11-28
- 任务单：`后端Node重构-任务单.md`
- 代码：`/vol2/1000/Hermes/moti/server/`（1,935 行，21 个文件）
- 镜像：`moti-node:v1`（ubuntu:24.04 + Node 20.18.1 arm64）
- 容器：`moti-node`，**只监听 127.0.0.1:8091**，旧站 8090 / 公网全程未动

---

## 1. 目录结构

```
server/
├── index.js              115  入口：路由分发、鉴权、优雅退出
├── config.js              37  环境变量（缺必填项直接退出）
├── package.json           14  唯一依赖 mysql2 3.11.3
├── core/
│   ├── router.js          39  /api/sessions/:sid → 编译成正则
│   ├── body.js            34  JSON body，限 1MB
│   ├── respond.js         27  ok/fail 统一输出 + 错误码
│   ├── static.js          69  静态文件 + 路径穿越防护 + SPA fallback
│   └── validate.js        33  轻量参数校验
├── db/
│   ├── pool.js            21  mysql2 连接池
│   └── tx.js              17  withTx 事务包装
├── lib/
│   ├── password.js        28  PBKDF2 KEYLEN=32（与存量 6 个账号一致）
│   ├── weight.js          38  权重公式 + 启动自测
│   ├── qfmt.js            42  题目格式转换（见 4.2）
│   ├── time.js            19  时间格式化 + DeepSeek 高峰判断
│   └── ids.js              5  token / 场次 id
└── routes/
    ├── meta.js           125  health/domains/courses/index/questions/figures/notice
    ├── auth.js           139  注册/登录/登出/me/改密/会话管理
    ├── quiz.js           456  state 读写/场次/逐题判题/权重/榜单/统计
    ├── ai.js             304  答疑/复盘/模型/历史 + token 计费
    ├── feedback.js        66  题目反馈 + 想法记录
    └── admin.js          307  概览/用户/公告/题库/导入/备份/日志
```

**路由 54 条**，其中兼容旧路径的别名：`/api/register`、`/api/login`、`/api/logout`、`/api/me`、`/api/banks`、`/api/ask`、`/api/review`。

---

## 2. 部署

```bash
# 镜像（构建上下文里的离线 node 包，不依赖容器内网络）
docker build -f Dockerfile.node -t moti-node:v1 .

# 网络：与 mariadb 共享 moti-net，靠容器名通信（不发布数据库端口）
docker network create moti-net
docker network connect moti-net mariadb

# 容器：只绑 127.0.0.1，不对外
docker run -d --name moti-node --network moti-net \
  --env-file .env.node -p 127.0.0.1:8091:8091 \
  --restart unless-stopped moti-node:v1
```

- `.env.node`（权限 600，已进 `.gitignore`）：DB 账号、DeepSeek / GLM 密钥、端口
- 容器内以 uid 10001 的非 root 用户运行
- HEALTHCHECK 每 30 秒打 `/api/health`
- SIGTERM 优雅退出：关闭监听 → 排空连接池 → 5 秒兜底强杀

---

## 3. 验收：64 项全通过

### P1 账号与基础（40 项）

| 组 | 覆盖 |
|---|---|
| 公开接口 | health / courses（1 课程 6 章 5 卷）/ domains / 首页 HTML / 未知接口 404 JSON |
| 鉴权 | 未登录 401、伪造 token 401、登出后失效、另一 token 不受影响 |
| 注册登录 | 新注册发 48 位 token、重复注册 409、弱参数 400、错密码 401、me、会话列表 |
| 题库 | 索引 184 题、字段完整、按 id 取题、整库下发 184 条 |
| 场次 | 开新场、**选中正确答案 → correct=true**、**故意选错 → correct=false**、场次累计、交卷、已交卷再答 409、历史列表、单场详情 |
| 状态 | 空账号三空结构、保存进行中场次、回读一致、**重复提交不产生重复场次** |
| 权重 | 2 行（只算答过的） |
| 统计 | 总量 184 / 做过 2 |
| 安全 | 普通账号进管理接口 403、`/../../etc/passwd` 不泄密、`/js/../server/config.js` 不泄密 |

### P3/P4 AI 与管理（24 项）

| 组 | 覆盖 |
|---|---|
| 管理 | overview、用户列表、充值 20 万 token、负数夹到 0、题库搜索、单题详情、单题保存、备份导出（184 题 / 279 KB）、操作日志、公告写入 + 公开读回 |
| AI 答疑 | 真实调用 DeepSeek：**2.3 秒返回 360 字**，入 187 / 出 207 token |
| 计费 | 按单价算出 cost=1015 token，余额 200000 → 198985，落库一致 |
| 额度 | 余额 0 → 402 `NO_TOKENS` |
| 复盘 | **整场评价 661 字，cost=2030 token** |
| 对话 | ai_messages 落库（me + ai 两条） |
| 反馈 | 提交 / 查询状态 / 写想法记录 / 标完成 |

迁移数据在验收后回到原状：users 6 / tokens 16 / questions 184 / sessions 53 / quiz_items 1630 / q_weight 280 / ai_messages 280 / feedback 35 / admin_notes 22 / ask_usage 78。测试账号与其产生的数据已全部清除。

---

## 4. 开发中修掉的 8 个真问题

### 4.1 handler 入参约定不一致
所有路由写成 `({ ctx, res, body })` 解构，但调用点传的是 `ctx` 本身 → 全站 `Cannot read properties of undefined`。
改调用点 `handler({ ...ctx, ctx })`，两种写法都能用（1 处改动修 54 条路由）。

### 4.2 题目格式：库里存对象，前端要字符串 ⚠️ 最严重
数据库 `options_json` 是 `[{"k":"A","t":"..."}]`、`answer_json` 是 `["C"]`（字母）；
代码按「字符串数组 + 索引」处理 → **判题会永远判 false**，admin 保存会写进 `[object Object]`。
新增 `lib/qfmt.js` 集中转换：对外 `options:[字符串] + answer:[索引]`，入库 `[{k,t}] + ['C']`。
判题时还要叠加选项乱序 `option_order` 还原真实选项。

### 4.3 MySQL SUM() 返回字符串
`SUM(correct)` 经 mysql2 返回 `'1'` 而不是 `1`，`'1' == 1` 为假 → 场次统计断言失败。
所有聚合值显式 `Number()`。

### 4.4 `query()` 与 `con.query()` 解构层数不同
`query()` 返回 rows 数组（`const [x]` 得第一行），`con.query()` 返回 `[rows, fields]`（`const [x]` 得 rows）。
混用导致 `agg[0].answered` 取 undefined。统一：单行一律走 `one()`。

### 4.5 表结构缺口
- `ai_messages` 缺 `prompt_tokens/completion_tokens/tokens_cost/latency_ms`（阶段三是次数本位）
- `admin_logs` 用 `actor_id`/`target_id`，不是 `user_id`
- `questions` 缺 `created_at`/`updated_at`
- `site_config`（公告）表不存在

已 ALTER 补齐，并同步回 `db/schema*.sql`，避免重建时再次缺列。

### 4.6 `ask_usage.sid` 是 NOT NULL DEFAULT 0
无场次的答疑（直接问题目）传 `null` 直接 `Column 'sid' cannot be null`。改为无场次写 0。

### 4.7 `stats.done` 把没答的题算成「做过」
`COUNT(DISTINCT qid)` 没排除 `chosen IS NULL`，开一场 3 题就显示做过 3 题。已加条件。

### 4.8 `REAL` 是 MariaDB 保留字
验收 SQL 里 `COUNT(...) real` 直接 1064。（阶段一踩过 `explain`，阶段三踩过这个。）

---

## 5. 与旧站的行为差异（都是有意为之）

| 项 | 旧站（Python 8090） | 新站（Node 8091） |
|---|---|---|
| 判题 | 浏览器端算，服务端不记录 | **服务端判题**，每题落 `quiz_items` |
| AI 计费 | 按次扣 `quota` | **按 token 扣 `tokens`**（1 token = 0.000001 元，区分高峰/低谷价） |
| 题库编辑 | 写回 `questions.json` + 重建表 | **直接 UPDATE 表**，无需重建 |
| 权重 | 前端每次现算 | 落 `q_weight` 表，作答后增量回算 |
| 会话 | 单表 token | **可列出并踢掉**指定会话 |
| 场次 | 存 `state_json` 整块 | 拆成 `quiz_sessions` + `quiz_items` |
| 权限 | user / admin | user / admin / **owner** 三级 |

## 6. 与旧站保持一致的

- `pass_hash`/`salt` 算法与长度不变（PBKDF2-HMAC-SHA256, 200k 次, 32 字节），**6 个存量账号可原样登录**
- 前端接口字段兼容：`/api/index` 的 `id/bank_id/chapter/papers/no/is_extra/lo/k_level/refs`、`/api/questions` 的 `stem/options/answer/explain/figure`、`/api/ask` 的 `answer/model/charged/quota/prompt_tokens`
- 一次性下发的静态资源仍是 `app/static`，`?v=32` 缓存策略不变
- 错误信息全中文，未登录统一 401

---

## 7. 已知缺口（下一步）

1. **前端还没接**：8090 上跑的是旧前端，指着旧 API。要等阶段五前端改造完成后才能切流量。
2. **相关性预检简化**：旧站会先用 GLM 判断「问题是否与本题相关」，新站只在带 `session_id` 时预检，且失败就放行。
3. **流式输出未做**：旧站也是非流式，两边一致；前端若要打字机效果需要改 SSE。
4. **`/api/state` 兼容层是过渡件**：新前端应直接用 `/api/sessions` 系列，`state` 接口在阶段五后可下线。
5. **备份只导题库**：用户/答题数据没进备份文件（旧站也只备题库 + 账号）。

---

## 8. 切换步骤（等阶段五前端就绪后）

```bash
# 1) 停写窗口：先停旧站，防止期间产生新数据
docker stop moti

# 2) 全量同步 SQLite → MariaDB（关键，否则丢这一刻之前的增量）
cd /vol2/1000/Hermes/moti
PYTHONPATH=/tmp/pym python3 db/import_interaction.py

# 3) 前端切到新 API（阶段五产物），静态目录指向
#    - 或直接把 nginx / 端口映射从 8090 改到 8091

# 4) 观察一天，确认无异常再删旧容器
```

回滚：`docker start moti` 即可（MariaDB 里的数据是旁路，不影响 SQLite）。

---

## 9. 交付物

| 文件 | 说明 |
|---|---|
| `server/**`（21 文件 / 1,935 行） | Node 服务全部代码 |
| `Dockerfile.node` | 镜像定义（离线 node 包） |
| `.env.node` | 运行环境（600 权限，不进 git） |
| `.dockerignore` | 构建上下文裁剪 |
| 本报告 | — |
