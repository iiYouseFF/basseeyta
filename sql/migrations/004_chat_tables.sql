-- 004_chat_tables.sql — chat_rooms, chat_messages

CREATE TABLE IF NOT EXISTS chat_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  technician_id TEXT NOT NULL,
  request_id TEXT,
  service_type TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_client ON chat_rooms (client_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_technician ON chat_rooms (technician_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_request ON chat_rooms (request_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_type TEXT CHECK (sender_type IN ('user','technician')),
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages (sender_id);
