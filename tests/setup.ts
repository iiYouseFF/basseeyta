// Jest setup: ensure mock OTP and required secrets are set before any app import
process.env.USE_MOCK_OTP = process.env.USE_MOCK_OTP || 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_32_chars_min_for_ci';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
process.env.CRON_SECRET = process.env.CRON_SECRET || 'test_cron_secret';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test_key';
process.env.DATABASE_URL = process.env.DATABASE_URL || '';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
