-- 003_supabase_tables.sql — notifications, reviews, promo_codes, support_tickets, search_index, payment_logs, appointments

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  user_type TEXT CHECK (user_type IN ('user','technician')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT CHECK (type IN ('request_update','payment','chat','system','promo','verification')),
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, is_read, created_at DESC);

-- Reviews
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  technician_id TEXT NOT NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reviews_technician ON reviews (technician_id, created_at DESC);

-- Promo Codes
CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  discount_type TEXT CHECK (discount_type IN ('percentage','fixed')),
  discount_value NUMERIC NOT NULL,
  min_order_amount NUMERIC DEFAULT 0,
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  user_type TEXT CHECK (user_type IN ('user','technician')),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  admin_reply TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets (user_id, created_at DESC);

-- Search Index (tsvector)
CREATE TABLE IF NOT EXISTS search_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT CHECK (entity_type IN ('technician','service','post')),
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  governorate TEXT,
  specialty TEXT,
  search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(specialty,''))) STORED,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_search_vector ON search_index USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_search_gov_type ON search_index (governorate, entity_type);

-- RPC function search_entities
CREATE OR REPLACE FUNCTION search_entities(q TEXT, etype TEXT DEFAULT NULL, gov TEXT DEFAULT NULL, lim INTEGER DEFAULT 20)
RETURNS TABLE(entity_type TEXT, entity_id TEXT, title TEXT, description TEXT, governorate TEXT, specialty TEXT, rank REAL) AS $$
BEGIN
  RETURN QUERY
  SELECT s.entity_type, s.entity_id, s.title, s.description, s.governorate, s.specialty,
         ts_rank(s.search_vector, plainto_tsquery('simple', q)) AS rank
  FROM search_index s
  WHERE s.search_vector @@ plainto_tsquery('simple', q)
    AND (etype IS NULL OR s.entity_type = etype)
    AND (gov IS NULL OR s.governorate = gov)
  ORDER BY rank DESC
  LIMIT lim;
END;
$$ LANGUAGE plpgsql;

-- RPC increment_used_count
CREATE OR REPLACE FUNCTION increment_used_count(promo_id UUID)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE promo_codes SET used_count = used_count + 1 WHERE id = promo_id AND used_count < max_uses RETURNING used_count INTO new_count;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Max uses reached or promo not found';
  END IF;
  RETURN new_count;
END;
$$ LANGUAGE plpgsql;

-- Payment Logs
CREATE TABLE IF NOT EXISTS payment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  request_id TEXT,
  technician_id TEXT,
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'EGP',
  payment_method TEXT CHECK (payment_method IN ('card','cash','wallet','instapay')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','refunded')),
  gateway_response JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_logs_user ON payment_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_logs_tech ON payment_logs (technician_id, created_at DESC);

-- InstaPay Transactions
CREATE TABLE IF NOT EXISTS instapay_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  technician_id TEXT,
  request_id TEXT,
  amount NUMERIC NOT NULL,
  verification_code TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','verified','failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  verified_at TIMESTAMPTZ
);

-- Appointments
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  technician_id TEXT NOT NULL,
  service_type TEXT NOT NULL,
  service_name TEXT,
  appointment_date DATE,
  appointment_time TEXT,
  client_address TEXT,
  client_latitude DOUBLE PRECISION,
  client_longitude DOUBLE PRECISION,
  technician_latitude DOUBLE PRECISION,
  technician_longitude DOUBLE PRECISION,
  estimated_duration TEXT,
  price NUMERIC,
  notes TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('pending','scheduled','confirmed','in_progress','completed','cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_tech ON appointments (technician_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_request ON appointments (request_id);
