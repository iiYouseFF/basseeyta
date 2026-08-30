-- 005_indexes.sql — All composite indexes from Firestore + GIN

-- Service Requests composite indexes (from archive_firestore.indexes.json)
CREATE INDEX IF NOT EXISTS idx_requests_status_gov_created ON service_requests (status, user_governorate, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_user_status_created ON service_requests (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_governorate ON service_requests (user_governorate);
CREATE INDEX IF NOT EXISTS idx_requests_service_type ON service_requests (service_type);

-- Offers
CREATE INDEX IF NOT EXISTS idx_offers_request_created ON offers (request_id, created_at DESC);

-- Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_tech_created ON transactions (technician_id, created_at DESC);

-- Plumbing/carpentry/painting specialized (if using single table with service_type, already covered)
-- Additional GIN already created in 003 for search_vector

-- Users phone
CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);
CREATE INDEX IF NOT EXISTS idx_technicians_governorate ON technicians (governorate);
CREATE INDEX IF NOT EXISTS idx_technicians_specialty ON technicians (specialty);

-- Posts
CREATE INDEX IF NOT EXISTS idx_posts_category_created ON posts (category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts (author_id, created_at DESC);

-- Payment logs already indexed in 003

-- Chat already indexed in 004
