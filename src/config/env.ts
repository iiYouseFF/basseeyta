import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string, fallback?: string): string {
  const val = process.env[key] || fallback;
  if (!val || val === '...') {
    // Allow placeholder in dev but warn
    if (process.env.NODE_ENV === 'production' && !fallback) {
      console.warn(`[env] Missing ${key}, using placeholder`);
    }
    return fallback || '';
  }
  return val;
}

export const env = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  DATABASE_URL: process.env.DATABASE_URL || '',
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'bassyta-851a5',
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || '',
  FIREBASE_PRIVATE_KEY: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  JWT_SECRET: requireEnv('JWT_SECRET', 'dev_jwt_secret_change_in_production_32chars_min'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '30d',
  STORAGE_CDN_BASE: process.env.STORAGE_CDN_BASE || 'https://eczybgjywdppvyyygnrd.supabase.co/storage/v1/object/public',
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  FAWRY_MERCHANT_CODE: process.env.FAWRY_MERCHANT_CODE || '',
  FAWRY_SECURITY_KEY: process.env.FAWRY_SECURITY_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  CRON_SECRET: process.env.CRON_SECRET || 'dev_cron_secret',
  USE_MOCK_OTP: process.env.USE_MOCK_OTP === 'true',
};

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
