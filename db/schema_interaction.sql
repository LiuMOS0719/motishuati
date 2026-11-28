-- 墨题 · 交互层架构（阶段三）
-- 生成时间：2026-11-28
-- 注意：quiz_items / q_weight / ask_usage / feedback 对 questions 是软引用（不建外键）
USE moti;

-- 1. 练习场次（替代 sessions[] 与 current）
CREATE TABLE quiz_sessions (
  sid         BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '内部主键，新代码一律用它关联',
  ext_id      VARCHAR(24) NOT NULL COMMENT '原场次 id，如 s1795515767830',
  user_id     INT NOT NULL,
  course_id   VARCHAR(16) NOT NULL,
  ts          BIGINT NOT NULL COMMENT '开始毫秒时间戳',
  sources     VARCHAR(128) COMMENT '来源集合，逗号分隔：CH1,CH2,A,EXTRA,WRONG',
  source      VARCHAR(32)  COMMENT '单来源简写，多来源为 MULTI',
  mode        VARCHAR(8)   COMMENT 'seq 顺序 / random 加权随机',
  qcount      INT NOT NULL DEFAULT 0 COMMENT '本场计划题数 = qids 长度',
  answered    INT NOT NULL DEFAULT 0 COMMENT '已作答题数',
  correct     INT NOT NULL DEFAULT 0 COMMENT '答对题数',
  score       INT DEFAULT NULL COMMENT '按 pts 累加的得分',
  finished    TINYINT NOT NULL DEFAULT 0 COMMENT '1=已完成，0=进行中/中途退出',
  started_at  VARCHAR(19),
  finished_at VARCHAR(19) DEFAULT NULL,
  UNIQUE KEY uk_ext (user_id, ext_id),
  KEY idx_user_time (user_id, finished_at),
  KEY idx_board (finished, finished_at),
  CONSTRAINT fk_sess_user   FOREIGN KEY (user_id)   REFERENCES users(id),
  CONSTRAINT fk_sess_course FOREIGN KEY (course_id) REFERENCES courses(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='一场练习。ext_id 不唯一，唯一的是 (user_id, ext_id)';

-- 2. 每场每道题
CREATE TABLE quiz_items (
  sid          BIGINT NOT NULL,
  seq          INT NOT NULL COMMENT '场内顺序 1..qcount',
  course_id    VARCHAR(16) NOT NULL,
  qid          VARCHAR(16) NOT NULL,
  chosen       JSON DEFAULT NULL COMMENT '["C"]；NULL = 未作答',
  correct      TINYINT DEFAULT NULL COMMENT '1/0；NULL = 未作答',
  option_order JSON DEFAULT NULL COMMENT '本场该题的选项乱序表，原 perms 的值',
  answered_at  VARCHAR(19) DEFAULT NULL,
  PRIMARY KEY (sid, seq),
  KEY idx_q (course_id, qid),
  CONSTRAINT fk_item_sess FOREIGN KEY (sid) REFERENCES quiz_sessions(sid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 每人每题的掌握度
CREATE TABLE q_weight (
  user_id        INT NOT NULL,
  course_id      VARCHAR(16) NOT NULL,
  qid            VARCHAR(16) NOT NULL,
  last5          VARCHAR(5) NOT NULL DEFAULT '' COMMENT '最近 5 次结果，1=对 0=错，左起最早',
  streak_correct TINYINT NOT NULL DEFAULT 0,
  streak_wrong   TINYINT NOT NULL DEFAULT 0,
  attempts       INT NOT NULL DEFAULT 0 COMMENT '累计作答次数',
  correct_total  INT NOT NULL DEFAULT 0,
  weight         TINYINT NOT NULL DEFAULT 0 COMMENT '0-100 缓存值',
  updated_at     VARCHAR(19) DEFAULT NULL,
  PRIMARY KEY (user_id, course_id, qid),
  KEY idx_user_weight (user_id, weight),
  CONSTRAINT fk_w_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. AI 对话（单题答疑 + 整场评价）
CREATE TABLE ai_messages (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  course_id  VARCHAR(16) NOT NULL,
  sid        BIGINT DEFAULT NULL COMMENT '关联场次，旧按题数据为 NULL',
  qid        VARCHAR(16) DEFAULT NULL COMMENT '单题答疑的题号；整场评价为 NULL',
  scope      VARCHAR(8) NOT NULL COMMENT 'ask 单题答疑 / review 整场评价',
  role       VARCHAR(8) NOT NULL COMMENT 'me 用户 / ai 模型',
  model      VARCHAR(16) DEFAULT NULL COMMENT 'deepseek / glm',
  content    MEDIUMTEXT,
  prompt_tokens     INT DEFAULT NULL,
  completion_tokens INT DEFAULT NULL,
  tokens_cost       BIGINT NOT NULL DEFAULT 0,
  latency_ms        INT DEFAULT NULL,
  created_at VARCHAR(19),
  KEY idx_user_qid (user_id, course_id, qid),
  KEY idx_sid (sid),
  CONSTRAINT fk_msg_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_msg_sess FOREIGN KEY (sid) REFERENCES quiz_sessions(sid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. AI 计费
CREATE TABLE ask_usage (
  user_id  INT NOT NULL,
  sid      BIGINT NOT NULL DEFAULT 0 COMMENT '0 = 旧数据无场次',
  qid      VARCHAR(16) NOT NULL,
  model    VARCHAR(16) NOT NULL COMMENT 'deepseek / glm',
  cnt      INT NOT NULL DEFAULT 0,
  first_ts VARCHAR(19),
  last_ts  VARCHAR(19),
  PRIMARY KEY (user_id, sid, qid, model),
  CONSTRAINT fk_au_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. 题目反馈
CREATE TABLE feedback (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NULL COMMENT 'NULL = 早期匿名反馈（账号系统上线前）',
  course_id  VARCHAR(16) NOT NULL,
  qid        VARCHAR(16) NOT NULL,
  kind       VARCHAR(40) NOT NULL COMMENT '六类固定选项之一',
  note       TEXT,
  status     VARCHAR(12) NOT NULL DEFAULT 'open' COMMENT 'open / fixed / ignored',
  created_at VARCHAR(19),
  KEY idx_status (status),
  KEY idx_q (course_id, qid),
  KEY idx_user (user_id),
  CONSTRAINT fk_fb_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. 想法记录
CREATE TABLE admin_notes (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT DEFAULT NULL COMMENT '记录者；原 username 字段改存 id',
  page       VARCHAR(16) COMMENT '主页/答题页/结果页/管理页',
  course_id  VARCHAR(16) DEFAULT NULL,
  qid        VARCHAR(16) DEFAULT NULL,
  kind       VARCHAR(12) COMMENT 'bug / improve',
  note       TEXT,
  status     VARCHAR(8) NOT NULL DEFAULT 'open' COMMENT 'open / done',
  created_at VARCHAR(19),
  done_at    VARCHAR(19) DEFAULT NULL,
  KEY idx_status (status),
  CONSTRAINT fk_note_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
