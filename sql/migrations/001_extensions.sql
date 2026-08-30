-- 001_extensions.sql - Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- pg_cron is enabled at Supabase project level via dashboard
-- Enable http and vector if needed
-- CREATE EXTENSION IF NOT EXISTS http;
-- CREATE EXTENSION IF NOT EXISTS vector;
