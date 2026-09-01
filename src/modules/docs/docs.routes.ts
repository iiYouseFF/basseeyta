import { Router } from 'express';

const router = Router();

const endpoints = [
  {
    group: 'Health',
    endpoints: [
      { method: 'GET', path: '/health', auth: false, description: 'Health check – status, version, uptime, db', query: '', body: '' },
      { method: 'GET', path: '/api/health', auth: false, description: 'Alias for /health', query: '', body: '' },
    ],
  },
  {
    group: 'Auth & Users (11)',
    endpoints: [
      { method: 'POST', path: '/auth/request-otp', auth: false, description: 'Send 6-digit OTP (mock when USE_MOCK_OTP=true)', body: '{ phone }', query: '' },
      { method: 'POST', path: '/auth/verify-otp', auth: false, description: 'Verify OTP → JWT (mock accepts any 6 digits)', body: '{ phone, code, verificationId?, idToken? }', query: '' },
      { method: 'POST', path: '/auth/verify-firebase-token', auth: false, description: 'Verify Firebase idToken → JWT', body: '{ idToken }', query: '' },
      { method: 'POST', path: '/auth/register', auth: false, description: 'Customer sign-up (json or multipart)', body: '{ name, phone, email?, governorate, city?, region?, placeType?, profileImageUrl? }', query: '' },
      { method: 'POST', path: '/auth/technicians/register', auth: false, description: 'Technician onboarding', body: '{ fullName, phone, experience?, specialty?, governorate, area?, profileImageUrl? }', query: '' },
      { method: 'GET', path: '/users/me', auth: true, description: 'Own profile', query: '', body: '' },
      { method: 'GET', path: '/users', auth: false, description: 'Lookup by phone (4 variants)', query: '?phone=+2010...', body: '' },
      { method: 'PUT', path: '/users/me', auth: true, description: 'Update own profile', body: '{ name?, email?, governorate?, city? }', query: '' },
      { method: 'GET', path: '/technicians', auth: false, description: 'List or lookup by phone', query: '?phone=+2010...', body: '' },
      { method: 'GET', path: '/technicians/:phone', auth: false, description: 'Single technician', query: '', body: '' },
      { method: 'PUT', path: '/technicians/:phone', auth: true, description: 'Update technician (owner phone check)', body: '{ fullName?, specialty? }', query: '' },
      { method: 'GET', path: '/technicians/:phone/wallet', auth: true, description: 'Wallet summary', query: '', body: '' },
      { method: 'POST', path: '/auth/logout', auth: true, description: 'Blacklist JWT via Redis', query: '', body: '' },
      { method: 'DELETE', path: '/auth/session', auth: true, description: 'Alias for logout', query: '', body: '' },
    ],
  },
  {
    group: 'Service Requests (8)',
    endpoints: [
      { method: 'POST', path: '/service-requests', auth: true, description: 'Create request', body: '{ userId, userName, userPhone, userGovernorate, title, description, budget, serviceType, scheduledDate?, images? }', query: '' },
      { method: 'POST', path: '/service-requests/carpentry', auth: true, description: 'Alias carpentery', body: 'same, serviceType preset', query: '' },
      { method: 'POST', path: '/service-requests/plumbing', auth: true, description: 'Alias plumbing', body: '', query: '' },
      { method: 'POST', path: '/service-requests/painting', auth: true, description: 'Alias painting', body: '', query: '' },
      { method: 'POST', path: '/service-requests/electrical', auth: true, description: 'Alias electrical', body: '', query: '' },
      { method: 'GET', path: '/service-requests', auth: false, description: 'List with filters (technician: pending+governorate, customer: userId)', query: '?userId&status&governorate&serviceType&sort&limit&offset', body: '' },
      { method: 'GET', path: '/service-requests/:id', auth: false, description: 'Single request', query: '', body: '' },
      { method: 'PATCH', path: '/service-requests/:id', auth: true, description: 'Update (owner or technician)', query: '', body: '' },
      { method: 'PATCH', path: '/service-requests/:id/status', auth: true, description: 'Lifecycle transition', body: '{ status, extra? }', query: '' },
      { method: 'DELETE', path: '/service-requests/:id', auth: true, description: 'Owner only if pending', query: '', body: '' },
    ],
  },
  {
    group: 'Offers (3)',
    endpoints: [
      { method: 'POST', path: '/service-requests/:id/offers', auth: true, description: 'Technician only, sets hasOffers', body: '{ price, technicianId?, message? }', query: '' },
      { method: 'GET', path: '/service-requests/:id/offers', auth: false, description: 'List offers desc', query: '', body: '' },
      { method: 'PATCH', path: '/offers/:id', auth: true, description: 'Accept/reject – transactional (6 steps: offer, request, reject siblings, chat, appointment, push)', body: '{ status: accepted|rejected }', query: '' },
    ],
  },
  {
    group: 'Chat (6)',
    endpoints: [
      { method: 'POST', path: '/chat/rooms', auth: true, description: 'Idempotent by requestId', body: '{ clientId, technicianId, requestId, serviceType? }', query: '' },
      { method: 'GET', path: '/chat/rooms', auth: true, description: 'Rooms for user', query: '?userId', body: '' },
      { method: 'GET', path: '/chat/rooms/:id/messages', auth: true, description: 'Paginated desc', query: '?limit=50', body: '' },
      { method: 'POST', path: '/chat/rooms/:id/messages', auth: true, description: 'Insert + update updatedAt + push + socket', body: '{ senderId, senderType: user|technician, message }', query: '' },
      { method: 'PATCH', path: '/chat/rooms/:id/read', auth: true, description: 'Mark read', body: '{ userId }', query: '' },
      { method: 'GET', path: '/chat/rooms/:id/unread', auth: true, description: 'Count unread', query: '?userId', body: '' },
    ],
  },
  {
    group: 'Storage (3)',
    endpoints: [
      { method: 'POST', path: '/storage/upload', auth: true, description: 'Multer memory 10MB, supabase fallback', body: 'multipart: bucket (profiles|account_verification|request|task_images|community_posts), documentId, file', query: '' },
      { method: 'GET', path: '/storage/:bucket/:path', auth: false, description: 'Public 302 CDN, private signed 1h, memory fallback', query: '', body: '' },
      { method: 'DELETE', path: '/storage/:bucket/:path', auth: true, description: 'Owner check + supabase remove', query: '', body: '' },
    ],
  },
  {
    group: 'Payments & Wallet (10)',
    endpoints: [
      { method: 'POST', path: '/payment-cards', auth: true, description: 'PCI-safe cardLast4 + token only (reject cardNumber)', body: '{ userId, cardLast4(4), cardHolder?, expiryDate?, cardType?, isDefault?, token? }', query: '' },
      { method: 'GET', path: '/payment-cards', auth: true, description: 'Owner only', query: '?userId', body: '' },
      { method: 'DELETE', path: '/payment-cards/:id', auth: true, description: 'Owner only', query: '', body: '' },
      { method: 'PATCH', path: '/payment-cards/:id', auth: true, description: '{ isDefault } clear others', query: '', body: '' },
      { method: 'POST', path: '/payments', auth: true, description: '6-step atomic: promo→gateway→payment_logs→transactions→wallet→request isPaid', body: '{ userId, requestId, technicianId, amount, paymentMethod: card|cash|wallet|instapay, promoCode?, serviceName? }', query: '' },
      { method: 'GET', path: '/payments', auth: true, description: 'Customer history or technician wallet', query: '?userId or ?technicianId', body: '' },
      { method: 'POST', path: '/payments/instapay', auth: true, description: 'Create with 6-digit verification_code', body: '{ userId?, technicianId?, requestId?, amount }', query: '' },
      { method: 'POST', path: '/payments/instapay/:id/verify', auth: true, description: 'Verify code → verified', body: '{ code }', query: '' },
      { method: 'GET', path: '/payments/instapay', auth: true, description: 'List by user', query: '?userId', body: '' },
      { method: 'GET', path: '/promo-codes/validate', auth: false, description: 'Check active, valid_until, max_uses, min_amount → discount', query: '?code=SAVE20&amount=500', body: '' },
      { method: 'POST', path: '/promo-codes/:id/apply', auth: true, description: 'Atomic used_count++', query: '', body: '' },
    ],
  },
  {
    group: 'Community (5)',
    endpoints: [
      { method: 'POST', path: '/posts', auth: true, description: 'authorId must match JWT', body: '{ authorId, authorName, authorRole?, title, content, imagePath?, isQuestion?, category? }', query: '' },
      { method: 'GET', path: '/posts', auth: false, description: 'Filter by category/author, ETag 304', query: '?category=plumbing&authorId&sort&limit', body: '' },
      { method: 'POST', path: '/posts/:id/like', auth: true, description: 'Toggle likedBy atomic', body: '{ userId }', query: '' },
      { method: 'PATCH', path: '/posts/:id', auth: true, description: 'Author only', query: '', body: '' },
      { method: 'DELETE', path: '/posts/:id', auth: true, description: 'Author only', query: '', body: '' },
    ],
  },
  {
    group: 'Search (3)',
    endpoints: [
      { method: 'GET', path: '/search', auth: false, description: 'Arabic full-text ts_rank (fallback memory)', query: '?q=سباكة&entityType=technician&governorate=القاهرة&limit', body: '' },
      { method: 'POST', path: '/search/index', auth: false, description: 'Upsert (called on register/request/post)', body: '{ entityType, entityId, title, description, governorate?, specialty? }', query: '' },
      { method: 'DELETE', path: '/search/index/:type/:id', auth: false, description: 'Remove', query: '', body: '' },
    ],
  },
  {
    group: 'Notifications & Push (6)',
    endpoints: [
      { method: 'GET', path: '/notifications', auth: true, description: 'Inbox', query: '?userId&unreadOnly&limit', body: '' },
      { method: 'POST', path: '/notifications', auth: true, description: 'Internal create + socket', body: '{ userId, userType, title, body, type, data? }', query: '' },
      { method: 'PATCH', path: '/notifications/:id', auth: true, description: '{ isRead }', query: '', body: '' },
      { method: 'POST', path: '/notifications/mark-all-read', auth: true, description: '', body: '{ userId }', query: '' },
      { method: 'GET', path: '/notifications/unread-count', auth: true, description: '', query: '?userId', body: '' },
      { method: 'POST', path: '/push/send', auth: true, description: 'Insert notifications + FCM HTTP v1 (topics: user_{uid}, technician_{phone}, requests_{gov}) + socket fallback', body: '{ userId, userType?, title, body, type?, data?, topic?, token? }', query: '' },
    ],
  },
  {
    group: 'Support (4)',
    endpoints: [
      { method: 'POST', path: '/support-tickets', auth: true, description: '', body: '{ userId, userType, subject, description, priority? }', query: '' },
      { method: 'GET', path: '/support-tickets', auth: true, description: '', query: '?userId', body: '' },
      { method: 'GET', path: '/support-tickets/:id', auth: true, description: 'Owner', query: '', body: '' },
      { method: 'PATCH', path: '/support-tickets/:id', auth: true, description: 'Admin: status, adminReply', body: '{ status?, adminReply? }', query: '' },
    ],
  },
  {
    group: 'Reviews (3)',
    endpoints: [
      { method: 'POST', path: '/reviews', auth: true, description: 'Recalculates technician avg', body: '{ requestId, reviewerId, technicianId, rating 1-5, comment? }', query: '' },
      { method: 'GET', path: '/reviews', auth: false, description: 'With avg', query: '?technicianId', body: '' },
      { method: 'DELETE', path: '/reviews/:id', auth: true, description: 'Reviewer only', query: '', body: '' },
    ],
  },
  {
    group: 'Visits (1)',
    endpoints: [
      { method: 'GET', path: '/visits', auth: true, description: 'Joins service_requests+appointments where status=completed', query: '?userId&status=completed', body: '' },
    ],
  },
  {
    group: 'Appointments (7)',
    endpoints: [
      { method: 'POST', path: '/appointments', auth: true, description: 'Full model', body: '{ requestId, clientId, technicianId, serviceType, serviceName?, appointmentDate?, appointmentTime?, clientAddress?, price? }', query: '' },
      { method: 'POST', path: '/appointments/upsert-on-accept', auth: true, description: 'Called from offer accept', body: '{ requestId }', query: '' },
      { method: 'PATCH', path: '/appointments/:id/status', auth: true, description: '{ status }', query: '', body: '' },
      { method: 'PATCH', path: '/appointments/:id/location', auth: true, description: '{ role, latitude, longitude }', query: '', body: '' },
      { method: 'PATCH', path: '/appointments/by-request/:requestId/complete', auth: true, description: 'Snapshot both locations', body: '{ technicianLatitude?, technicianLongitude?, clientLatitude?, clientLongitude? }', query: '' },
      { method: 'GET', path: '/appointments', auth: true, description: 'Filter by user/technician/request', query: '?userId&technicianId&requestId', body: '' },
      { method: 'GET', path: '/appointments/:id', auth: true, description: '', query: '', body: '' },
    ],
  },
  {
    group: 'Family (5)',
    endpoints: [
      { method: 'GET', path: '/users/:uid/family-members', auth: true, description: '', query: '', body: '' },
      { method: 'POST', path: '/users/:uid/family-members', auth: true, description: '', body: '{ memberName, memberPhone, relationship? }', query: '' },
      { method: 'DELETE', path: '/users/:uid/family-members/:id', auth: true, description: '', query: '', body: '' },
      { method: 'POST', path: '/families/join', auth: true, description: 'Phone lookup + add', body: '{ phone, familyCode }', query: '' },
      { method: 'GET', path: '/families/:code', auth: true, description: '{ family, members, invitees }', query: '', body: '' },
    ],
  },
  {
    group: 'Verification (3)',
    endpoints: [
      { method: 'POST', path: '/verification', auth: true, description: 'Paths from account_verification bucket', body: '{ userId, name, phone, email?, city?, governorate?, frontIdPath, backIdPath }', query: '' },
      { method: 'GET', path: '/verification', auth: true, description: 'Status pending|approved|rejected', query: '?userId', body: '' },
      { method: 'PATCH', path: '/verification/:userId', auth: true, description: 'Admin: status', body: '{ status, reviewedAt? }', query: '' },
    ],
  },
  {
    group: 'AI (1)',
    endpoints: [
      { method: 'POST', path: '/ai/assistant', auth: true, description: 'OpenAI or mock fallback, 20/day per user, system prompt covers electrical/plumbing/painting/carpentry/AC, EGP estimates', body: '{ query, userContext?: { governorate?, serviceHistory? } }', query: '' },
    ],
  },
  {
    group: 'Jobs (1)',
    endpoints: [
      { method: 'POST', path: '/jobs/:name', auth: true, description: 'Bearer CRON_SECRET, queued or in-memory. Allowed: dailyReset, expireOffers, invoiceReminder, searchIndexGC, cleanupDrafts', body: '', query: '' },
    ],
  },
];

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Basita API – Docs</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
:root{--bg:#0b0e14;--card:#151a27;--muted:#9aa3b2;--accent:#4f46e5;--border:#222839}
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,Segoe UI,Roboto,sans-serif;background:var(--bg);color:#e6e8ee}
a{color:#8ea6ff}header{position:sticky;top:0;backdrop-filter:blur(8px);background:rgba(11,14,20,.7);border-bottom:1px solid var(--border);padding:18px 24px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
h1{margin:0;font-size:22px}header p{margin:0;color:var(--muted)}
.badges span{display:inline-block;padding:4px 10px;border-radius:999px;background:var(--card);border:1px solid var(--border);font-size:12px;margin-right:8px}
.wrap{max-width:1100px;margin:0 auto;padding:24px}
.card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:18px;margin:16px 0}
h2{margin:8px 0 12px;font-size:18px;border-left:4px solid var(--accent);padding-left:10px}
table{width:100%;border-collapse:collapse}
th,td{padding:8px 10px;border-bottom:1px solid var(--border);text-align:left;font-size:13px;vertical-align:top}
th{color:var(--muted);font-weight:600}
code{background:rgba(255,255,255,.06);padding:2px 6px;border-radius:6px;font-size:12px}
.method{display:inline-block;min-width:56px;text-align:center;padding:3px 8px;border-radius:6px;font-weight:700;font-size:11px}
.GET{background:#0e3a2a;color:#34d399} .POST{background:#1e2e5a;color:#93b4ff} .PATCH{background:#3a2e0e;color:#fbbf24} .DELETE{background:#3a0e14;color:#fb7185} .PUT{background:#2e1e3a;color:#c4b5fd}
details{margin:8px 0}summary{cursor:pointer;color:#cbd5e1}
.kbd{font-family:monospace;background:#0b0e14;border:1px solid var(--border);padding:6px 10px;border-radius:8px;display:inline-block}
</style></head><body>
<header>
  <div>
    <h1>Basita (بسيطة) — API Docs</h1>
    <p>Node 20 · Express 4 + Socket.io 4 · Supabase PG 17 · Firebase Auth/FCM · BullMQ · ~81 endpoints · 
    <code>Authorization: Bearer &lt;jwt&gt;</code> after <code>POST /auth/verify-otp</code> · 
    <a href="/api-docs.json">JSON</a> · <a href="/health">health</a></p>
  </div>
  <div class="badges"><span>Mock OTP: ${process.env.USE_MOCK_OTP==='true'?'ON':'OFF'}</span><span>92 smoke tests</span><span>PM2 cluster</span><a href="/socket-test.html" style="display:inline-block;padding:6px 12px;border-radius:999px;background:#4f46e5;color:white;text-decoration:none;font-size:13px;font-weight:700;margin-left:8px">🧪 Socket Chat Tester</a></div>
</header>
<div class="wrap">
  <div class="card">
    <h2>Quick start</h2>
    <p>Base URL: <code>http://basseeyta.duckdns.org/</code> (prod) or <code>http://localhost:3000</code> (dev)</p>
    <pre class="kbd">curl http://basseeyta.duckdns.org/health
curl -X POST http://basseeyta.duckdns.org/auth/request-otp -H 'Content-Type: application/json' -d '{"phone":"+201012345678"}'
# mock returns {mock:true, verificationId}
curl -X POST http://basseeyta.duckdns.org/auth/verify-otp -d '{"phone":"+201012345678","code":"123456","verificationId":"..."}' # → {token}
curl -H "Authorization: Bearer &lt;token&gt;" http://basseeyta.duckdns.org/users/me</pre>
    <p>Flutter: <code>flutter run --dart-define=API_BASE_URL=http://basseeyta.duckdns.org/ --dart-define=USE_MOCK_OTP=true</code></p>
    <p>Smoke (92 checks): <code>npm run smoke</code> or <code>API_BASE=http://basseeyta.duckdns.org/ npm run smoke:live</code></p>
  </div>
  <div class="card">
    <h2>Auth flow</h2>
    <ol>
      <li><code>POST /auth/request-otp</code> → normalize to E.164 <code>+20...</code>, rate-limit 5/10min, mock → <code>{mock:true}</code></li>
      <li><code>POST /auth/verify-otp</code> → mock accepts any 6 digits → <code>{token, user}</code> (JWT <code>sub, phone, userType, jti</code>, 30d)</li>
      <li>Use <code>Authorization: Bearer &lt;jwt&gt;</code> for all guarded routes. <code>POST /auth/logout</code> blacklists <code>jti</code> in Redis.</li>
    </ol>
  </div>
  ${endpoints.map(g=>`
    <div class="card">
      <h2>${g.group}</h2>
      <table>
        <tr><th>Method</th><th>Path</th><th>Auth</th><th>Description</th><th>Params</th></tr>
        ${g.endpoints.map(e=>`<tr>
          <td><span class="method ${e.method}">${e.method}</span></td>
          <td><code>${e.path}</code></td>
          <td>${e.auth?'🔒':'🌐'}</td>
          <td>${e.description}</td>
          <td><code>${e.query || e.body}</code></td>
        </tr>`).join('')}
      </table>
    </div>`).join('')}
  <div class="card">
    <h2>Socket.io</h2>
    <p>Namespaces: <code>/chat</code>, <code>/notifications</code>, <code>/requests</code> – auth via <code>handshake.auth.token</code> (JWT)</p>
    <pre class="kbd">socket = io('http://basseeyta.duckdns.org/chat', {auth:{token}})
socket.emit('join_room', roomId); socket.on('new_message', cb)
io('/notifications').emit('subscribe', userId) // also user:{id}
io('/requests').emit('subscribe_governorate', 'القاهرة')</pre>
    <p style="margin-top:10px"><a href="/socket-test.html" style="display:inline-block;padding:8px 14px;background:#4f46e5;color:white;border-radius:8px;text-decoration:none;font-weight:700">Open Interactive Tester → /socket-test.html</a> <span style="color:var(--muted);font-size:13px">Live auth + REST + Socket in one page, plus Postman guide</span></p>
  </div>
  <div class="card">
    <h2>Buckets & Jobs</h2>
    <p>Buckets: <code>profiles</code> (public 5MB), <code>account_verification</code> (private 10MB signed), <code>request</code>, <code>task_images</code> (private), <code>community_posts</code> (public) – <code>POST /storage/upload</code> multipart</p>
    <p>Jobs (BullMQ, fallback in-memory): <code>dailyReset 0 0 * * * Cairo</code>, <code>expireOffers */6h (48h)</code>, <code>invoiceReminder 0 9 * * *</code>, <code>searchIndexGC daily</code>, <code>cleanupDrafts weekly</code> – trigger <code>POST /jobs/:name</code> with <code>Bearer CRON_SECRET</code></p>
  </div>
  <details class="card"><summary>View raw JSON</summary><pre style="white-space:pre-wrap;word-break:break-all" id="raw"></pre></details>
</div>
<script>fetch('/api-docs.json').then(r=>r.json()).then(j=>{document.getElementById('raw').textContent=JSON.stringify(j,null,2)}).catch(()=>{})</script>
</body></html>`;

router.get('/', (_req, res) => {
  res.type('html').send(html);
});

router.get('/api-docs.json', (_req, res) => {
  const total = endpoints.reduce((n, g) => n + g.endpoints.length, 0);
  res.json({
    name: 'Basita (بسيطة) API',
    version: '1.0.0',
    baseUrl: 'http://basseeyta.duckdns.org/',
    health: '/health',
    auth: 'Bearer JWT from POST /auth/verify-otp',
    totalEndpoints: total,
    generatedAt: new Date().toISOString(),
    groups: endpoints,
  });
});

// JSON at / and /api per spec
router.get('/api', (_req, res) => {
  const total = endpoints.reduce((n, g) => n + g.endpoints.length, 0);
  res.json({
    name: 'Basita API',
    docs: '/api-docs',
    json: '/api-docs.json',
    health: '/health',
    smoke: 'npm run smoke',
    totalEndpoints: total,
    groups: endpoints.map(g => ({ group: g.group, count: g.endpoints.length })),
  });
});

export default router;
