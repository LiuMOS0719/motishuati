-- 墨题 · 内容层架构（阶段一）
-- 生成时间：2026-11-28
-- 执行：mariadb -uroot -p moti < schema.sql
-- 回滚：DROP DATABASE moti;

CREATE DATABASE IF NOT EXISTS moti
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE moti;

-- 1. 一级分类
CREATE TABLE domains (
  id    VARCHAR(16) PRIMARY KEY,
  name  VARCHAR(64) NOT NULL,
  sort  INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. 二级分类（原 banks）
CREATE TABLE courses (
  id             VARCHAR(16) PRIMARY KEY,
  domain_id      VARCHAR(16) NOT NULL,
  name           VARCHAR(64) NOT NULL,
  short          VARCHAR(16),
  subtitle       VARCHAR(128),
  syllabus_doc   VARCHAR(255)  COMMENT '大纲原文文件/URL，给人看，与挂题的节点树无关',
  ai_context     TEXT,
  review_context TEXT,
  copyright      TEXT,
  copyright_note TEXT,
  sort           INT DEFAULT 0,
  CONSTRAINT fk_course_domain FOREIGN KEY (domain_id) REFERENCES domains(id),
  KEY idx_domain (domain_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 大纲节点（树）
CREATE TABLE syllabus_nodes (
  id         VARCHAR(40) PRIMARY KEY,
  course_id  VARCHAR(16) NOT NULL,
  parent_id  VARCHAR(40) DEFAULT NULL,
  code       VARCHAR(16)  COMMENT '显示编码，如 2.1.3',
  name       VARCHAR(128) NOT NULL,
  level      TINYINT DEFAULT 1,
  sort       INT DEFAULT 0,
  CONSTRAINT fk_node_course FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT fk_node_parent FOREIGN KEY (parent_id) REFERENCES syllabus_nodes(id),
  KEY idx_course (course_id),
  KEY idx_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. 试卷集
CREATE TABLE papers (
  id        VARCHAR(24) PRIMARY KEY,
  course_id VARCHAR(16) NOT NULL,
  name      VARCHAR(128) NOT NULL,
  kind      VARCHAR(16) COMMENT 'mock 模拟 / real 真题 / extra 附加',
  year      SMALLINT,
  source    VARCHAR(64),
  qcount    INT DEFAULT 0,
  sort      INT DEFAULT 0,
  CONSTRAINT fk_paper_course FOREIGN KEY (course_id) REFERENCES courses(id),
  KEY idx_course (course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. 题目（富文本统一 Markdown + LaTeX；图表一律用 {{FIG:id}} 占位，不内联大段 HTML）
CREATE TABLE questions (
  course_id    VARCHAR(16) NOT NULL,
  id           VARCHAR(16) NOT NULL,
  stem         MEDIUMTEXT  COMMENT 'Markdown + LaTeX 源码',
  stem_plain   TEXT        COMMENT '去标记纯文本，导入时自动生成，供后台搜索和 AI 相关性预检',
  options_json JSON        COMMENT '[{k,t}]，t 同样是 Markdown + LaTeX',
  answer_json  JSON,
  `explain`    MEDIUMTEXT  COMMENT 'Markdown + LaTeX 源码，允许内嵌 {{FIG:id}}',
  lo           VARCHAR(24),
  k_level      VARCHAR(8),
  pts          TINYINT,
  stem_hash    CHAR(32),
  sort         INT DEFAULT 0,
  created_at   VARCHAR(19) DEFAULT NULL,
  updated_at   VARCHAR(19) DEFAULT NULL,
  PRIMARY KEY (course_id, id),
  CONSTRAINT fk_q_course FOREIGN KEY (course_id) REFERENCES courses(id),
  KEY idx_hash (stem_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. 图表资源库（题目用 {{FIG:id}} 引用；一题可多图、图可复用、可独立编辑）
CREATE TABLE figures (
  course_id  VARCHAR(16) NOT NULL,
  id         VARCHAR(40) NOT NULL  COMMENT '图自身 id，如 ctfl.C-23',
  kind       VARCHAR(16)           COMMENT '渲染结果类型：table / svg / image / log',
  html       MEDIUMTEXT            COMMENT '可直接插入的片段；svg 类存完整 <svg>…</svg>；image 类存 <img src="/img/x.webp">',
  src        MEDIUMTEXT            COMMENT '生成源码：Mermaid 源码 / 绘图脚本 / 手工说明。用于日后修改，可为空',
  src_kind   VARCHAR(16)           COMMENT 'mermaid / python / manual / null',
  title      VARCHAR(128)          COMMENT '图注，可选',
  created_at VARCHAR(19),
  updated_at VARCHAR(19),
  PRIMARY KEY (course_id, id),
  CONSTRAINT fk_fig_course FOREIGN KEY (course_id) REFERENCES courses(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- 注意：figures 不建指向 questions 的外键。题干通过 {{FIG:id}} 软引用，
-- 由导入脚本做完整性校验（见 4.4），这样才能支持一题多图与多题复用同一图。
-- 注意：figures 不建指向 questions 的外键。题干通过 {{FIG:id}} 软引用，
-- 由导入脚本做完整性校验（见 4.4），这样才能支持一题多图与多题复用同一图。

-- 7. 题 ↔ 大纲节点（多对多）
CREATE TABLE question_syllabus (
  course_id VARCHAR(16) NOT NULL,
  qid       VARCHAR(16) NOT NULL,
  node_id   VARCHAR(40) NOT NULL,
  PRIMARY KEY (course_id, qid, node_id),
  CONSTRAINT fk_qs_q    FOREIGN KEY (course_id, qid) REFERENCES questions(course_id, id),
  CONSTRAINT fk_qs_node FOREIGN KEY (node_id) REFERENCES syllabus_nodes(id),
  KEY idx_node (node_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. 题 ↔ 卷（多对多，带卷内题号）
CREATE TABLE question_papers (
  course_id VARCHAR(16) NOT NULL,
  qid       VARCHAR(16) NOT NULL,
  paper_id  VARCHAR(24) NOT NULL,
  no        VARCHAR(8)  NOT NULL,
  is_extra  TINYINT DEFAULT 0 COMMENT '该题在这张卷里是否为附加题',
  PRIMARY KEY (course_id, qid, paper_id),
  CONSTRAINT fk_qp_q     FOREIGN KEY (course_id, qid) REFERENCES questions(course_id, id),
  CONSTRAINT fk_qp_paper FOREIGN KEY (paper_id) REFERENCES papers(id),
  KEY idx_paper_no (paper_id, no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. 图表 AI 转写缓存（可选，可后置）
CREATE TABLE image_desc (
  course_id  VARCHAR(16) NOT NULL,
  qid        VARCHAR(16) NOT NULL,
  desc_text  TEXT,
  model      VARCHAR(16),
  created_at VARCHAR(19),
  PRIMARY KEY (course_id, qid),
  CONSTRAINT fk_img_q FOREIGN KEY (course_id, qid) REFERENCES questions(course_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
