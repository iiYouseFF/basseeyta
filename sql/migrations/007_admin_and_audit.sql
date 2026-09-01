-- 007_admin_and_audit.sql — Admin RBAC + audit log + superadmin seed

-- Admins table (separate from users/technicians for email+password login)
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT DEFAULT 'Super Admin',
  is_superadmin BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Audit log for every admin action
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('login','create','update','delete','approve','reject','bulk','view')),
  table_name TEXT,
  record_id TEXT,
  diff JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_admin_idx ON admin_audit_logs(admin_email, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_table_idx ON admin_audit_logs(table_name, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit_logs(created_at DESC);

-- Optional: add is_admin to users for future phone-based admins (idempotent)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
-- Relax user_type check to allow admin if needed (drop old, add new)
DO $$ BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_type_check;
  ALTER TABLE users ADD CONSTRAINT users_user_type_check CHECK (user_type IN ('user','admin'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Seed superadmin — email: admin@basseeyta.com, password: basseytaAdmin123 (bcrypt 10)
INSERT INTO admins (email, password_hash, name, is_superadmin)
VALUES (
  'admin@basseeyta.com',
  '$2a$10$3WLmfzezkBrWAluCH9rtCOuj2Pn11fWQD391Nl.P4Uh7nQonKJFEO',
  'Super Admin',
  true
) ON CONFLICT (email) DO NOTHING;

-- RLS
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_service" ON admins;
CREATE POLICY "admins_service" ON admins FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "audit_service" ON admin_audit_logs;
CREATE POLICY "audit_service" ON admin_audit_logs FOR ALL USING (true) WITH CHECK (true);
