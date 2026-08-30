-- 002_core_tables.sql — users, technicians, service_requests, offers, payment_cards, transactions, posts, verifications, family_members

-- Users (customers)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  governorate TEXT NOT NULL,
  city TEXT,
  region TEXT,
  place_type TEXT,
  profile_image_url TEXT,
  profile_image_path TEXT,
  user_type TEXT DEFAULT 'user' CHECK (user_type IN ('user')),
  fcm_token TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Technicians
CREATE TABLE IF NOT EXISTS technicians (
  phone TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  experience TEXT,
  specialty TEXT,
  governorate TEXT NOT NULL,
  area TEXT,
  profile_image_url TEXT,
  wallet_balance NUMERIC DEFAULT 0,
  total_earnings NUMERIC DEFAULT 0,
  today_earnings NUMERIC DEFAULT 0,
  today_orders_count INTEGER DEFAULT 0,
  last_earning_timestamp TIMESTAMPTZ,
  last_earning_date_str TEXT,
  rating NUMERIC DEFAULT 0,
  completed_orders_count INTEGER DEFAULT 0,
  is_verified BOOLEAN DEFAULT false,
  fcm_token TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Service Requests
CREATE TABLE IF NOT EXISTS service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  user_phone TEXT NOT NULL,
  user_governorate TEXT NOT NULL,
  user_region TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  budget TEXT NOT NULL,
  price TEXT,
  service_type TEXT NOT NULL,
  scheduled_date TEXT,
  images TEXT[] DEFAULT '{}',
  task_images TEXT[] DEFAULT '{}',
  image TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','offer_submitted','accepted','in_progress','completed','paid','cancelled','rejected','disputed','pending_cash')),
  has_offers BOOLEAN DEFAULT false,
  last_offer_time TIMESTAMPTZ,
  technician_id TEXT REFERENCES technicians(phone),
  technician_name TEXT,
  accepted_price NUMERIC,
  accepted_at TIMESTAMPTZ,
  is_paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  payment_method TEXT,
  paid_amount NUMERIC,
  final_price NUMERIC,
  client_accepted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Offers
CREATE TABLE IF NOT EXISTS offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  technician_id TEXT NOT NULL REFERENCES technicians(phone),
  technician_name TEXT,
  name TEXT,
  price NUMERIC NOT NULL,
  rating NUMERIC,
  reviews_count INTEGER DEFAULT 0,
  experience_years INTEGER,
  arrival_time TEXT,
  duration TEXT,
  image_path TEXT,
  is_verified BOOLEAN DEFAULT false,
  has_green_arrival_tag BOOLEAN DEFAULT false,
  warranty TEXT,
  message TEXT,
  provide_materials BOOLEAN DEFAULT false,
  price_includes_materials BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','expired')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Payment Cards (PCI-safe)
CREATE TABLE IF NOT EXISTS payment_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_last4 TEXT NOT NULL CHECK (char_length(card_last4)=4),
  card_holder TEXT,
  expiry_date TEXT,
  card_type TEXT CHECK (card_type IN ('visa','mastercard','amex','unknown')),
  is_default BOOLEAN DEFAULT false,
  token TEXT, -- PSP paymentMethodId
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id TEXT NOT NULL REFERENCES technicians(phone),
  request_id UUID REFERENCES service_requests(id),
  service_name TEXT,
  amount NUMERIC NOT NULL,
  is_positive BOOLEAN DEFAULT true,
  type TEXT CHECK (type IN ('income','expense')),
  payment_method TEXT,
  date_str TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Posts (community)
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_role TEXT CHECK (author_role IN ('user','technician')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_path TEXT,
  likes INTEGER DEFAULT 0,
  liked_by TEXT[] DEFAULT '{}',
  is_question BOOLEAN DEFAULT false,
  category TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- Verifications
CREATE TABLE IF NOT EXISTS verifications (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  city TEXT,
  governorate TEXT,
  front_id_path TEXT NOT NULL,
  back_id_path TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

-- Family Members
CREATE TABLE IF NOT EXISTS family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_name TEXT NOT NULL,
  member_phone TEXT NOT NULL,
  relationship TEXT,
  role TEXT DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Families (for family code join)
CREATE TABLE IF NOT EXISTS families (
  code TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id),
  members JSONB DEFAULT '[]',
  invitees JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);
