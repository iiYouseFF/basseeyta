# Basita (بسيطة) — Backend

Node.js (Express 4 + Socket.io 4) · Supabase PostgreSQL 17 · Firebase Auth + FCM · BullMQ + Redis · TypeScript strict

Replaces Flutter frontend-only mock (`lib/core/network/mock_backend.dart`) with real REST API. Flutter switches via `API_BASE_URL`.

**Deployed:** `https://api.basita.example.com` (VPS via PM2 + Nginx, GitHub Actions CI/CD)

## Stack

| Layer | Tech |
|-------|------|
| Runtime | Node 20 LTS |
| Framework | Express 4, Socket.io 4 |
| DB | Supabase PostgreSQL 17 (`pg` + `supabase-js`) |
| Storage | Supabase Storage (5 buckets) |
| Auth | Firebase Admin (Phone OTP + JWT) |
| Push | FCM HTTP v1 |
| Payments | Stripe + Fawry + InstaPay |
| Queue | BullMQ + Redis |
| Language | TypeScript strict |
| CI/CD | GitHub Actions → VPS (SSH) |
| Process | PM2 cluster (max instances) |
| Proxy | Nginx + gzip |

## Quick Start

```bash
cp .env.example .env # fill secrets
npm install
npm run dev          # ts-node + nodemon at http://localhost:3000
npm test             # jest – 37 tests
npm run build        # tsc -> dist/
npm start            # node dist/server.js
```

**Test health:**
```bash
curl http://localhost:3000/health
# {"status":"ok","version":"1.0.0","timestamp":"...","uptime":...}
```

## Environment

See `.env.example` for all vars. Required:

- `PORT`, `NODE_ENV`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `STORAGE_CDN_BASE`, `STRIPE_SECRET_KEY`, `OPENAI_API_KEY`, `REDIS_URL`, `CRON_SECRET`, `USE_MOCK_OTP`

## API

Base URL: `http://localhost:3000` or `https://api.basita.example.com`

**Auth:** `Authorization: Bearer <jwt>` (from `POST /auth/verify-otp`)

| Module | Endpoints |
|--------|-----------|
| Auth & Users |  `POST /auth/request-otp`, `POST /auth/verify-otp`, `POST /auth/verify-firebase-token`, `POST /auth/register`, `POST /auth/technicians/register`, `GET /users/me`, `GET /users?phone=`, `PUT /users/me`, `GET /technicians?phone=`, `GET /technicians/:phone`, `PUT /technicians/:phone`, `GET /technicians/:phone/wallet`, `POST /auth/logout`, `DELETE /auth/session` |
| Service Requests | `POST /service-requests`, `POST /service-requests/carpentry\|plumbing\|painting`, `GET /service-requests`, `GET /service-requests/:id`, `PATCH /service-requests/:id`, `PATCH /service-requests/:id/status`, `DELETE /service-requests/:id` |
| Offers | `POST /service-requests/:id/offers`, `GET /service-requests/:id/offers`, `PATCH /offers/:id` |
| Chat | `POST /chat/rooms`, `GET /chat/rooms?userId=`, `GET /chat/rooms/:id/messages`, `POST /chat/rooms/:id/messages`, `PATCH /chat/rooms/:id/read`, `GET /chat/rooms/:id/unread` |
| Payments | `POST /payment-cards`, `GET /payment-cards?userId=`, `DELETE /payment-cards/:id`, `PATCH /payment-cards/:id`, `POST /payments`, `GET /payments`, `POST /payments/instapay`, `POST /payments/instapay/:id/verify`, `GET /payments/instapay`, `GET /promo-codes/validate`, `POST /promo-codes/:id/apply` |
| Community | `POST /posts`, `GET /posts`, `POST /posts/:id/like`, `PATCH /posts/:id`, `DELETE /posts/:id` |
| Storage | `POST /storage/upload`, `GET /storage/:bucket/:path`, `DELETE /storage/:bucket/:path` |
| Search | `GET /search?q=`, `POST /search/index`, `DELETE /search/index/:type/:id` |
| Notifications | `GET /notifications`, `POST /notifications`, `PATCH /notifications/:id`, `POST /notifications/mark-all-read`, `GET /notifications/unread-count`, `POST /push/send` |
| Support | `POST /support-tickets`, `GET /support-tickets`, `GET /support-tickets/:id`, `PATCH /support-tickets/:id` |
| Reviews | `POST /reviews`, `GET /reviews?technicianId=`, `DELETE /reviews/:id` |
| Visits | `GET /visits?userId=` |
| Appointments | `POST /appointments`, `POST /appointments/upsert-on-accept`, `PATCH /appointments/:id/status`, `PATCH /appointments/:id/location`, `PATCH /appointments/by-request/:requestId/complete`, `GET /appointments`, `GET /appointments/:id` |
| Family | `GET /users/:uid/family-members`, `POST /users/:uid/family-members`, `DELETE /users/:uid/family-members/:id`, `POST /families/join`, `GET /families/:code` |
| Verification | `POST /verification`, `GET /verification?userId=`, `PATCH /verification/:userId` |
| AI | `POST /ai/assistant` |
| Jobs | `POST /jobs/:name` (Bearer CRON_SECRET) |
| Health | `GET /health` |

Total ~81 endpoints. See `docs/BASITA_BACKEND_PLAN.md` and `docs/PROJECT_DETAILS.md`.

## Socket.io

Namespaces: `/chat`, `/notifications`, `/requests`

Auth: `socket.handshake.auth.token` (JWT)

```ts
// chat
socket.emit('join_room', roomId)
socket.emit('send_message', {roomId, senderId, senderType, message})
// notifications
socket.emit('subscribe', userId)
// requests
socket.emit('subscribe_governorate', 'القاهرة')
```

## Database

Migrations in `sql/migrations/`:

- `001_extensions.sql` – pgcrypto, uuid-ossp, pg_trgm
- `002_core_tables.sql` – users, technicians, service_requests, offers, payment_cards, transactions, posts, verifications, family_members, families
- `003_supabase_tables.sql` – notifications, reviews, promo_codes, support_tickets, search_index (+ RPC search_entities, increment_used_count), payment_logs, instapay, appointments
- `004_chat_tables.sql` – chat_rooms, chat_messages
- `005_indexes.sql` – composite + GIN
- `006_rls_policies.sql` – RLS (mirrors Firestore rules)

Run:
```bash
psql $DATABASE_URL -f sql/migrations/001_extensions.sql
# or npm run migrate (ts-node scripts/migrate.ts)
```

## Storage Buckets

| Bucket | Public | Max |
|--------|--------|-----|
| profiles | Yes | 5 MB |
| account_verification | No (signed) | 10 MB |
| request | No | 10 MB |
| task_images | No | 10 MB |
| community_posts | Yes | 5 MB |

Upload: `POST /storage/upload` (multipart: bucket, documentId, file)

## Jobs (BullMQ)

- `dailyReset` – 0 0 * * * Cairo – reset todayEarnings/todayOrdersCount
- `expireOffers` – every 6h – expire pending >48h
- `invoiceReminder` – 0 9 * * * – push unpaid
- `searchIndexGC` – daily – stale search_index
- `cleanupDrafts` – weekly – draftNotes >30d

Fallback to in-memory intervals if Redis unavailable. Trigger manually: `POST /jobs/:name` with `Authorization: Bearer $CRON_SECRET`.

## Security

- helmet, cors, express-rate-limit (global 200/15min, OTP 5/10min, AI 20/day)
- zod validation, no unknown fields
- JWT blacklist via Redis SETEX
- Signed URLs for private buckets (1h)
- cardLast4 only (reject cardNumber)
- Phone ownership checks
- Input sanitization

## Observability

- morgan (combined prod), winston JSON file+stdout, X-Request-Id
- Analytics events: login, request_created, offer_submitted, payment_completed, chat_message_sent, post_created, search_performed
- Health: `GET /health` → `{status, uptime, version, db}`

## Performance

- ETag / If-None-Match on GET /service-requests, GET /posts (304)
- pg Pool max 20
- Redis cache for promo/search (TTL)
- Nginx gzip, PM2 cluster

## CI/CD

`.github/workflows/ci-cd.yml` – 4 jobs: lint/typecheck, test, build (on main), deploy (SSH → VPS → git pull → npm ci → build → pm2 reload → curl /health)

## E2E Happy Path

See `tests/integration/*` and `docs/PROJECT_DETAILS.md:15` – 12 steps: register → upload → request → tech register → GET pending → offer → accept → chat → pay → review → push → search

Run:
```bash
npm test
```

Flutter switch:
```bash
flutter run --dart-define=API_BASE_URL=https://api.basita.example.com --dart-define=USE_MOCK_OTP=false
```

## Project Structure

```
src/
  config/ env, supabase, firebase, redis
  middleware/ auth, errorHandler, rateLimit, upload, requestId
  modules/ auth, users, technicians, service-requests, offers, chat, payments, community, storage, search, notifications, support, reviews, visits, appointments, family, verification, ai
  jobs/ queue, workers/* (5 workers)
  socket/ index (3 namespaces)
  utils/ phone, response, jwt, logger, store
  types/
  app.ts, server.ts
sql/migrations/
tests/
.github/workflows/
ecosystem.config.js
```

## Docs

- `docs/BASITA_BACKEND_PLAN.md` – 9 phases, build order
- `docs/PROJECT_DETAILS.md` – full PRD
- `docs/ARCHITECTURE.md` – distilled
- `docs/vps-setup.md` – VPS steps
- `nginx/basita.conf` – Nginx reverse proxy
