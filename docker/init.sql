-- AI Team OS — PostgreSQL 初始化指令碼
-- 由 docker-entrypoint-initdb.d 自動執行

-- 向量搜尋擴充套件 (pgvector)
CREATE EXTENSION IF NOT EXISTS vector;

-- 三字組模糊搜尋擴充套件
CREATE EXTENSION IF NOT EXISTS pg_trgm;
