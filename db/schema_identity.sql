-- 墨题 · 身份层架构（阶段二）
-- 生成时间：2026-11-28
-- 关键：pass_hash CHAR(64)（PBKDF2 dklen=32），与现有 6 个账号一致
USE moti;

-- 1. 账号
CREATE TABLE users (
  id          INT AUTO_INCREMENT PRIMARY KEY COMMENT '原 SQLite id 原样迁移，不重排',
  username    VARCHAR(32)  NOT NULL COMMENT '3-20 位字母数字下划线，大小写不敏感唯一',
  pass_hash   CHAR(64)     NOT NULL COMMENT 'PBKDF2-SHA256 hex，64 字符（dklen=32）',
  salt        CHAR(32)     NOT NULL COMMENT '16 字节盐 hex，32 字符',
  role        VARCHAR(16)  NOT NULL DEFAULT 'user'  COMMENT 'owner / admin / user',
  status      VARCHAR(16)  NOT NULL DEFAULT 'active' COMMENT 'active / disabled',
  quota       INT          NOT NULL DEFAULT 0 COMMENT '剩余 AI 提问次数',
  remark      VARCHAR(64)  DEFAULT NULL COMMENT '管理员备注，如"同事/测试号"',
  created_at  VARCHAR(19)  NOT NULL COMMENT 'YYYY-MM-DD HH:MM:SS',
  last_login  VARCHAR(19)  DEFAULT NULL COMMENT '未登录为 NULL',
  updated_at  VARCHAR(19)  DEFAULT NULL COMMENT '用户名/角色/状态/密码最后修改时间',
  owner_slot  TINYINT AS (CASE WHEN role = 'owner' THEN 1 ELSE NULL END) PERSISTENT
              COMMENT '仅用于约束 owner 单例，业务代码禁止读写',
  UNIQUE KEY uk_username (username),
  UNIQUE KEY uk_owner (owner_slot),
  KEY idx_role (role),
  KEY idx_status (status),
  CONSTRAINT ck_role        CHECK (role IN ('owner','admin','user')),
  CONSTRAINT ck_status      CHECK (status IN ('active','disabled')),
  CONSTRAINT ck_quota       CHECK (quota >= 0),
  CONSTRAINT ck_uname_len   CHECK (CHAR_LENGTH(username) BETWEEN 3 AND 20),
  CONSTRAINT ck_owner_alive CHECK (role <> 'owner' OR status = 'active')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='账号。owner 全库唯一且不可被禁用，由 DB 约束保证';

-- 2. 登录令牌
CREATE TABLE auth_tokens (
  token      CHAR(48) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY COMMENT '48 位 hex',
  user_id    INT NOT NULL,
  created_at VARCHAR(19),
  expires_at VARCHAR(19) COMMENT '签发时间 + 30 天',
  KEY idx_user (user_id),
  KEY idx_expires (expires_at),
  CONSTRAINT fk_tok_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 管理操作审计
CREATE TABLE admin_logs (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_id   INT NOT NULL COMMENT '操作人（owner 或 admin）',
  target_id  INT DEFAULT NULL COMMENT '被操作用户，无目标时为 NULL',
  action     VARCHAR(32) NOT NULL COMMENT 'quota_change / role_change / status_change / password_reset / backup_download / user_create',
  detail     TEXT COMMENT 'JSON：{before, after, note}',
  created_at VARCHAR(19),
  KEY idx_actor (actor_id),
  KEY idx_created (created_at),
  CONSTRAINT fk_log_actor  FOREIGN KEY (actor_id) REFERENCES users(id),
  CONSTRAINT fk_log_target FOREIGN KEY (target_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
