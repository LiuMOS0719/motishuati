# 前端重构报告（阶段五）

- 完成时间：2026-11-28
- 任务单：`前端重构-任务单.md`（3.10 定稿：Vue 3 + Vue Router + Pinia + Vite + Element Plus 局部用）
- 代码：`front/`，**53 个文件 / 3,894 行**（33 个 `.vue` + 20 个 `.js`）
- 部署：**与 Node 服务同一个容器、同一个端口 8091**，不再单独起 nginx

---

## 1. 和任务单的一处偏离（需要你知道）

任务单 3.6 定的是「nginx 直托管 + `/api` 反代 8091」。你这轮要求「和后端在同一个容器」，所以改成 **Node 自己发静态**：

| 方案 | 结果 |
|---|---|
| 原定 nginx + node 双进程 | 一个容器塞两个进程 + supervisord，多一层故障点 |
| **实际采用：node 直接发 dist** | 一个进程、一个健康检查、一条重启命令 |

连带好处：SSE 不需要配 `proxy_buffering off`；坏处是少了 nginx 的 gzip，所以由 node 侧保证（见第 5 节）。

`Dockerfile.node` 现在是多阶段构建：stage1 用 Vite 打前端，stage2 只拷 `dist` + `server/` + `data/img`。

---

## 2. 目录结构（按任务单 3.12 拆分规则落地）

```
front/
├── index.html                 首屏骨架（含 #boot，挂载后自动移除）
├── vite.config.js             按需引入 + manualChunks + dev 代理
├── src/
│   ├── main.js                24 行
│   ├── App.vue                RouterView + Toast + Dialog
│   ├── router/                index / routes.user / routes.admin / guards
│   ├── stores/                auth · course · bank · session · mastery · ui（6 个）
│   ├── api/                   client · auth · course · question · session · ai · feedback · admin
│   ├── components/            AppShell · AppToast · AppDialog · StemView · FigureView
│   │                          OptionList · ExplainView · QuestionCard · AiDrawer
│   │                          FeedbackDialog · MasteryBar · Loading/Error/Empty
│   ├── views/                 Login · Home · Quiz · Result · History · Settings
│   │                          PaperSelect · Status · NotFound
│   ├── views/admin/           AdminLayout · Users · Feedback · SiteFeedback
│   │                          Papers · Question · Notice · Logs
│   ├── composables/           useMarkdown.js（零依赖）
│   ├── utils/                 （并入各 store，暂未单列）
│   └── styles/                theme.css（17 变量原样搬）· base.css · element-override.css
└── dist/                      构建产物
```

**文件行数全部达标**：最大的 `Home.vue` 287 行（上限 300），`Quiz.vue` 248、`Result.vue` 219、`AiDrawer.vue` 179。

---

## 3. 12 个页面全部可用

| 路由 | 页面 | 状态 |
|---|---|---|
| `/login` | 登录 / 注册 | ✅ 登录、注册、错误提示、`?next=` 回跳 |
| `/` | 主页 | ✅ 卷/章筛选（交集）、三种模式、题量、章节三段掌握条、继续上次 |
| `/quiz/:sid` | 答题 | ✅ 逐题服务端判题、选项乱序、解析、题号导航、计时、交卷 |
| `/result/:sid` | 结果 | ✅ 正确率、错题（含正确答案）、用时、AI 复盘 |
| （覆盖层） | AI 追问抽屉 | ✅ 历史载入、模型切换、计费显示、markdown |
| `/history` | 做题记录 | ✅ 按时间/正确率排序、进详情、删除 |
| `/settings` | 个人设置 | ✅ 改密、会话管理（踢下线）、余额、导出掌握度 |
| `/papers` | 试卷选择 | ✅ 批量勾选、单卷直练、掌握率 |
| `/status` | 状态页 | ✅ 健康检查、公告、服务不可用时降级 |
| `/admin` | 后台（7 板块） | ✅ 用户/反馈/想法/日志/试卷/公告备份 |
| `/admin/papers` | 试卷与大纲 | ✅ 卷/章题数、题目搜索、进编辑器 |
| `/admin/question/:qid` | 单题编辑器 | ✅ 题干/选项/答案/解析/LO/K/分值、配图预览、直写库 |

AI 抽屉是覆盖层不占路由，`/quiz/:sid` 刷新后能恢复到当前题号与已答状态。

---

## 4. 性能（实测）

| 项 | 数据 |
|---|---|
| 首屏 JS（gzip） | **50 KB**（index 4.9 + vue-core 45.3） |
| 首屏 CSS | 内联在 JS 里，无独立阻塞请求 |
| Element Plus | 793 KB（gzip 250 KB），**只在管理页加载**，普通用户零下载 |
| 路由分包 | 每个页面独立 chunk（Home 3.8 KB、Quiz 6.4 KB gzip） |
| 全站产物 | 1.6 MB / 54 个文件 |
| 依赖 | 只装了用到的 Element 组件（`unplugin-vue-components` 按需），没有 `import ElementPlus` |

---

## 5. 浏览器实测记录（真实走查，不是"应该能用"）

用 Playwright 在 8091 上完整走了一遍：

1. **登录页**：深色 `rgb(10,12,17)`、两个输入框、登录/注册切换正常
2. **主页**：5 张卷（40/40/40/40/26）、6 章（37/27/20/48/44/8）
3. **筛选交集**：勾「A 卷」+「第 1 章」→ 可选 **8 题**（与阶段一数据一致）
4. **开一场 3 题**：题号 `A-4`、标签 `K2` / `LO FL-1.4.1`、计时 00:03
5. **答错一题**：提示「答错了 掌握度 33」，选项 A 标红、正确项 B 标绿，解析展开
6. **交卷**：自绘确认弹窗（不是原生 confirm）→ 跳结果页
7. **结果页**：正确率 33%、1 对 2 错 0 未答、用时「0 分 30 秒」、错题显示「你选 A / 正确 B」
8. **AI 复盘**：661 字，含总体判断/两个薄弱点/下一步建议，扣 1358 token
9. **AI 抽屉**：问「这道题为什么选 C」→ 正确回答并指出「C 其实不对」，显示「入 143 出 126 扣 647 token」
10. **历史/设置**：1 场记录、2 个登录设备（当前 + 可踢）
11. **管理端**：8 行用户表、5 卷 6 章、概览（184 题 / 54 场次 / 281 次 AI）、操作日志、单题编辑器（A-1 答案 C 高亮）

---

## 6. 这轮修掉的问题

### 6.1 章节标识对不上（显示「已选 0 / 0」）
`syllabus_nodes.code` 存的是 `"1"`（不是 `"ctfl.ch1"`），前端按 `'ctfl.ch' + code` 拼 → 全部匹配失败，主页章节列表空、掌握条 0/0。
统一成直接用 `code`，`bank.filter` 用 `split(',').includes(code)`。

### 6.2 结果页正确答案空白
`/api/sessions/:sid` 的 items 里没有 `answer` 字段（只有 chosen/correct），前端 `w.answer` 是 undefined。
改为从题库缓存取 `bank.get(qid).answer`（原始索引）再转字母。

### 6.3 结果页用时显示「—」
单场详情 SQL 没查 `started_at` / `finished_at`。补进 SELECT，用时改成 `finished_at - started_at`。

### 6.4 K 等级重复前缀
数据里是 `K2`，模板又拼了一个 `K` → 显示 `KK2`。改为直接输出并 `toUpperCase()`。

### 6.5 AI 相关性预检误伤
`glm-4-flash` 对「这道题为什么选 C？」判成「无关」，直接拒答。
换了两版 prompt 仍误判，最终 **默认关闭预检**（保留 `AI_RELEVANCE=1` 开关）。
理由：按 token 计费后预检省不了钱，反而多一次调用还挡正常提问。

### 6.6 AI 回复不渲染 markdown
回答里的 `**粗体**`、列表都是原文。写了零依赖 `useMarkdown.js`（粗体/斜体/代码/标题/列表/引用/分隔线，40 行），AI 抽屉和结果页都用它。

### 6.7 Element Plus 全量进首屏
第一版 `manualChunks` 条件写成 `id.includes('/vue/')`，`@vue/shared` 之类没被归到 vue-core，落到 vendor 里 222 KB 并进了首屏预加载。
修正条件（加 `/@vue/`、`/vue-router/`、`/pinia/`）后，首屏只剩 50 KB。

---

## 7. 与旧站（8090）的差异

| 项 | 旧站 | 新站 |
|---|---|---|
| 技术 | 原生 JS 单页，10 文件 3,026 行 | Vue 3 + Vite，53 文件 3,894 行 |
| 路由 | hash 无刷新，手工切页 | Vue Router history，可刷新/可直达 |
| 判题 | 浏览器算 | 服务端算并落库 |
| 版本号 | 手工 `?v=32` 双处同步 | **内容哈希，不用再管** |
| 弹窗 | `confirm`/`alert`（已删确认类） | 全部自绘，无原生对话框 |
| 手机 | 只有主页一个断点 | 10 个页面都有 `@media(max-width:1120px)`（非完整手机版） |

---

## 8. 没做的

1. **独立手机版**（任务单 3.11-4 暂缓）：目前只做了响应式降级，不是单独布局。
2. **SSE 流式输出**（3.8 选了流式）：后端仍是整段返回，前端也没写 `useAiStream`。要做得先给 `/api/ask` 加 `text/event-stream`。
3. **`/api/state` 兼容层**：新前端已经不用它（走 `/api/sessions` 系列），但接口还在，阶段六可下线。
4. 试卷/大纲编辑器只做了「看 + 跳单题编辑」，没做增删试卷、改章节树。

---

## 9. 切换步骤（等你说可以切）

```bash
# 1) 停写窗口：先停旧站，避免期间产生新数据
docker stop moti

# 2) 全量同步 SQLite → MariaDB（关键）
cd /vol2/1000/Hermes/moti
PYTHONPATH=/tmp/pym python3 db/import_interaction.py

# 3) 公网入口改指向 8091（现在 8091 只绑 127.0.0.1）
#    改 nginx / 反代 upstream 即可，容器不用动

# 4) 观察 7 天，旧容器保留，回滚就是 upstream 改回 8090
```

现在旧站 8090 与公网仍是老前端，8091 只有本机能访问。

---

## 10. 改前端后怎么重新发布

```bash
cd /vol2/1000/Hermes/moti
docker build -f Dockerfile.node -t moti-node:v2 .
docker rm -f moti-node
docker run -d --name moti-node --network moti-net --env-file .env.node \
  -p 127.0.0.1:8091:8091 --restart unless-stopped moti-node:v2
```

前端构建在镜像里完成（stage1），不用在宿主装 node。
