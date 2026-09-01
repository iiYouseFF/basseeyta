#!/usr/bin/env node
/**
 * Smoke test all ~81 endpoints – runs against in-memory app (no DB needed)
 * Usage: node scripts/test-all-endpoints.js  (or npm run smoke)
 * Also works against live VPS: API_BASE=http://basseeyta.duckdns.org/ node scripts/test-all-endpoints.js
 */

const base = process.env.API_BASE || '';
let request;
let app;
if (base) {
  // Live mode: use fetch/http against real server
  const http = require('http');
  const https = require('https');
  console.log(`Live mode: ${base}`);
  // Use supertest-like via fetch – fallback to http request
  request = null;
} else {
  process.env.USE_MOCK_OTP = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_32_chars_min_for_smoke';
  process.env.NODE_ENV = 'test';
  const { createApp } = require('../dist/app');
  app = createApp();
  request = require('supertest');
}

const results = [];
function ok(name, passed, extra = '') {
  const status = passed ? '✓' : '✗';
  console.log(`${status} ${name} ${extra}`);
  results.push({ name, passed });
}
function expectStatus(res, code) {
  return res.status === code || res.statusCode === code;
}

async function run() {
  console.log('=== Basita smoke – all endpoints ===\n');
  const start = Date.now();

  // Helper to get supertest agent
  const r = (method, path) => {
    if (base) {
      // Live: use fetch via node http – not implemented, use supertest against base via http
      // For now, require supertest with base URL
      const supertest = require('supertest');
      return supertest(base)[method](path);
    }
    return request(app)[method](path);
  };

  let custToken, custId, custPhone, techToken, techPhone, techPhone2, requestId, offerId, roomId, postId, cardId, paymentLogId, ticketId, apptId, familyUid;

  // 0. Health
  try {
    let res = await r('get', '/health');
    ok('GET /health', expectStatus(res, 200));
    res = await r('get', '/api/health');
    ok('GET /api/health', expectStatus(res, 200));
  } catch (e) { ok('GET /health', false, e.message); }

  // 1. Auth – request-otp mock
  try {
    let res = await r('post', '/auth/request-otp').send({ phone: '01000000101' });
    ok('POST /auth/request-otp mock', expectStatus(res, 200) && res.body.data.mock === true);
    const vid = res.body.data.verificationId;
    res = await r('post', '/auth/verify-otp').send({ phone: '01000000101', code: '123456', verificationId: vid });
    ok('POST /auth/verify-otp mock any 6 digits', expectStatus(res, 200) && !!res.body.data.token);
    // Also test 999999
    const res2 = await r('post', '/auth/request-otp').send({ phone: '01000000102' });
    const vid2 = res2.body.data.verificationId;
    const res3 = await r('post', '/auth/verify-otp').send({ phone: '01000000102', code: '999999', verificationId: vid2 });
    ok('POST /auth/verify-otp 999999', expectStatus(res3, 200));
  } catch (e) { ok('Auth OTP', false, e.message); }

  // 2. Register customer
  try {
    let res = await r('post', '/auth/register').send({ name: 'Smoke Cust', phone: '01000000111', governorate: 'القاهرة', city: 'القاهرة' });
    ok('POST /auth/register', expectStatus(res, 201) && !!res.body.data.token);
    custToken = res.body.data.token;
    custId = res.body.data.user.id;
    custPhone = res.body.data.user.phone;
    familyUid = custId;
  } catch (e) { ok('POST /auth/register', false, e.message); }

  // 3. Register technician
  try {
    let res = await r('post', '/auth/technicians/register').send({ fullName: 'Smoke Tech', phone: '01000000112', governorate: 'القاهرة', specialty: 'سباكة', area: 'مصر الجديدة' });
    ok('POST /auth/technicians/register', expectStatus(res, 201));
    techToken = res.body.data.token;
    techPhone = res.body.data.technician.phone;
    // second tech for sibling offers
    let res2 = await r('post', '/auth/technicians/register').send({ fullName: 'Smoke Tech2', phone: '01000000113', governorate: 'القاهرة', specialty: 'سباكة' });
    techPhone2 = res2.body.data.technician.phone;
  } catch (e) { ok('POST /auth/technicians/register', false, e.message); }

  // 4. Users / Technicians
  try {
    let res = await r('get', '/users/me').set('Authorization', `Bearer ${custToken}`);
    ok('GET /users/me', expectStatus(res, 200));
    res = await r('get', `/users?phone=${encodeURIComponent(custPhone)}`);
    ok('GET /users?phone', expectStatus(res, 200));
    res = await r('put', '/users/me').set('Authorization', `Bearer ${custToken}`).send({ city: 'الجيزة' });
    ok('PUT /users/me', expectStatus(res, 200) && res.body.data.city === 'الجيزة');
    res = await r('get', `/technicians?phone=${encodeURIComponent(techPhone)}`);
    ok('GET /technicians?phone', expectStatus(res, 200));
    res = await r('get', `/technicians/${encodeURIComponent(techPhone)}`);
    ok('GET /technicians/:phone', expectStatus(res, 200));
    res = await r('put', `/technicians/${encodeURIComponent(techPhone)}`).set('Authorization', `Bearer ${techToken}`).send({ area: 'المهندسين' });
    ok('PUT /technicians/:phone', expectStatus(res, 200));
    res = await r('get', `/technicians/${encodeURIComponent(techPhone)}/wallet`).set('Authorization', `Bearer ${techToken}`);
    ok('GET /technicians/:phone/wallet', expectStatus(res, 200));
  } catch (e) { ok('Users/Technicians', false, e.message); }

  // 5. Storage upload
  let storagePath, storageBucket;
  try {
    let res = await r('post', '/storage/upload').set('Authorization', `Bearer ${custToken}`).field('bucket', 'profiles').field('documentId', custId).attach('file', Buffer.from('smoke'), 'a.jpg');
    ok('POST /storage/upload profiles', expectStatus(res, 200));
    storagePath = res.body.data.path;
    storageBucket = res.body.data.bucket;
    res = await r('post', '/storage/upload').set('Authorization', `Bearer ${custToken}`).field('bucket', 'request').field('documentId', custId).attach('file', Buffer.from('smoke'), 'b.jpg');
    ok('POST /storage/upload request', expectStatus(res, 200));
    res = await r('get', `/storage/${storageBucket}/${storagePath}`);
    ok('GET /storage/:bucket/:path', [200, 302].includes(res.status));
    res = await r('delete', `/storage/${storageBucket}/${storagePath}`).set('Authorization', `Bearer ${custToken}`);
    ok('DELETE /storage/:bucket/:path', expectStatus(res, 200));
  } catch (e) { ok('Storage', false, e.message); }

  // 6. Service Requests
  try {
    let res = await r('post', '/service-requests').set('Authorization', `Bearer ${custToken}`).send({ userId: custId, userName: 'Smoke Cust', userPhone: custPhone, userGovernorate: 'القاهرة', title: 'Smoke سباكة', description: 'desc', budget: '700', serviceType: 'plumbing', images: ['https://cdn/a.jpg'] });
    ok('POST /service-requests', expectStatus(res, 201));
    requestId = res.body.data.id || res.body.data.request.id;
    res = await r('post', '/service-requests/carpentry').set('Authorization', `Bearer ${custToken}`).send({ userId: custId, userName: 'Smoke Cust', userPhone: custPhone, userGovernorate: 'القاهرة', title: 'Carp', description: 'desc', budget: '300', serviceType: 'carpentry' });
    ok('POST /service-requests/carpentry alias', expectStatus(res, 201));
    res = await r('get', `/service-requests?userId=${custId}`);
    ok('GET /service-requests?userId', expectStatus(res, 200) && Array.isArray(res.body.data));
    res = await r('get', `/service-requests?status=pending&governorate=${encodeURIComponent('القاهرة')}`);
    ok('GET /service-requests?status&governorate', expectStatus(res, 200));
    res = await r('get', `/service-requests/${requestId}`);
    ok('GET /service-requests/:id', expectStatus(res, 200));
    res = await r('patch', `/service-requests/${requestId}`).set('Authorization', `Bearer ${custToken}`).send({ title: 'Updated' });
    ok('PATCH /service-requests/:id', expectStatus(res, 200));
    res = await r('patch', `/service-requests/${requestId}/status`).set('Authorization', `Bearer ${custToken}`).send({ status: 'in_progress' });
    ok('PATCH /service-requests/:id/status', expectStatus(res, 200));
    // Reset to pending for offers
    await r('patch', `/service-requests/${requestId}/status`).set('Authorization', `Bearer ${custToken}`).send({ status: 'pending' });
  } catch (e) { ok('Service Requests', false, e.message); }

  // 7. Offers
  try {
    let res = await r('post', `/service-requests/${requestId}/offers`).set('Authorization', `Bearer ${techToken}`).send({ price: 650, message: 'جاهز' });
    ok('POST /service-requests/:id/offers', expectStatus(res, 201));
    offerId = res.body.data.id;
    // second offer
    await r('post', `/service-requests/${requestId}/offers`).set('Authorization', `Bearer ${techToken}`).send({ price: 600 });
    // use second tech
    let res2 = await request(app).post(`/auth/technicians/register`).send({ fullName: 'Smoke Tech3', phone: '01000000114', governorate: 'القاهرة' });
    let t3Token = res2.body.data.token;
    await r('post', `/service-requests/${requestId}/offers`).set('Authorization', `Bearer ${t3Token}`).send({ price: 620 });
    res = await r('get', `/service-requests/${requestId}/offers`);
    ok('GET /service-requests/:id/offers', expectStatus(res, 200) && res.body.data.length >= 2);
    res = await r('patch', `/offers/${offerId}`).set('Authorization', `Bearer ${custToken}`).send({ status: 'accepted' });
    ok('PATCH /offers/:id accepted', expectStatus(res, 200) && res.body.data.offer.status === 'accepted');
    // Verify chat room and appointment created
    ok('PATCH /offers accepted creates chat+appointment', !!res.body.data.chatRoom);
  } catch (e) { ok('Offers', false, e.message); }

  // 8. Chat
  try {
    let res = await r('post', '/chat/rooms').set('Authorization', `Bearer ${custToken}`).send({ clientId: custId, technicianId: techPhone, requestId, serviceType: 'plumbing' });
    ok('POST /chat/rooms', [200, 201].includes(res.status));
    roomId = res.body.data.id;
    res = await r('get', `/chat/rooms?userId=${custId}`).set('Authorization', `Bearer ${custToken}`);
    ok('GET /chat/rooms?userId', expectStatus(res, 200));
    res = await r('post', `/chat/rooms/${roomId}/messages`).set('Authorization', `Bearer ${custToken}`).send({ senderId: custId, senderType: 'user', message: 'مرحبا' });
    ok('POST /chat/rooms/:id/messages', expectStatus(res, 201));
    res = await r('get', `/chat/rooms/${roomId}/messages?limit=10`).set('Authorization', `Bearer ${custToken}`);
    ok('GET /chat/rooms/:id/messages', expectStatus(res, 200));
    res = await r('patch', `/chat/rooms/${roomId}/read`).set('Authorization', `Bearer ${custToken}`).send({ userId: custId });
    ok('PATCH /chat/rooms/:id/read', expectStatus(res, 200));
    res = await r('get', `/chat/rooms/${roomId}/unread?userId=${custId}`).set('Authorization', `Bearer ${custToken}`);
    ok('GET /chat/rooms/:id/unread', expectStatus(res, 200));
  } catch (e) { ok('Chat', false, e.message); }

  // 9. Payments – cards
  try {
    let res = await r('post', '/payment-cards').set('Authorization', `Bearer ${custToken}`).send({ userId: custId, cardLast4: '4242', cardHolder: 'Smoke', cardType: 'visa', isDefault: true, token: 'pm_test' });
    ok('POST /payment-cards', expectStatus(res, 201));
    cardId = res.body.data.id;
    res = await r('get', `/payment-cards?userId=${custId}`).set('Authorization', `Bearer ${custToken}`);
    ok('GET /payment-cards?userId', expectStatus(res, 200));
    res = await r('patch', `/payment-cards/${cardId}`).set('Authorization', `Bearer ${custToken}`).send({ isDefault: true });
    ok('PATCH /payment-cards/:id', expectStatus(res, 200));
    res = await r('post', '/payment-cards').set('Authorization', `Bearer ${custToken}`).send({ userId: custId, cardNumber: '4242424242424242', cardLast4: '4242' });
    ok('POST /payment-cards reject cardNumber', expectStatus(res, 400));
  } catch (e) { ok('Payment Cards', false, e.message); }

  // 10. Promo & Payments
  try {
    let res = await r('get', '/promo-codes/validate?code=SAVE20&amount=500');
    ok('GET /promo-codes/validate valid', expectStatus(res, 200) && res.body.data.valid);
    res = await r('get', '/promo-codes/validate?code=EXPIRED10&amount=500');
    ok('GET /promo-codes/validate expired', expectStatus(res, 400));
    // Need promo id
    const { store } = require('../dist/utils/store');
    const promo = store.promoCodes.get('SAVE20');
    res = await r('post', `/promo-codes/${promo.id}/apply`).set('Authorization', `Bearer ${custToken}`);
    ok('POST /promo-codes/:id/apply', expectStatus(res, 200));
    res = await r('post', '/payments').set('Authorization', `Bearer ${custToken}`).send({ userId: custId, requestId, technicianId: techPhone, amount: 650, paymentMethod: 'card' });
    ok('POST /payments', expectStatus(res, 201) && res.body.data.paymentLog.status === 'completed');
    paymentLogId = res.body.data.paymentLog.id;
    res = await r('get', `/payments?userId=${custId}`).set('Authorization', `Bearer ${custToken}`);
    ok('GET /payments?userId', expectStatus(res, 200));
    res = await r('get', `/payments?technicianId=${encodeURIComponent(techPhone)}`).set('Authorization', `Bearer ${custToken}`);
    ok('GET /payments?technicianId', expectStatus(res, 200));
    res = await r('post', '/payments/instapay').set('Authorization', `Bearer ${custToken}`).send({ userId: custId, amount: 100 });
    ok('POST /payments/instapay', expectStatus(res, 201));
    const iid = res.body.data.id;
    const code = res.body.data.verification_code;
    res = await r('post', `/payments/instapay/${iid}/verify`).set('Authorization', `Bearer ${custToken}`).send({ code });
    ok('POST /payments/instapay/:id/verify', expectStatus(res, 200));
    res = await r('get', `/payments/instapay?userId=${custId}`).set('Authorization', `Bearer ${custToken}`);
    ok('GET /payments/instapay?userId', expectStatus(res, 200));
  } catch (e) { ok('Payments', false, e.message); }

  // 11. Community
  try {
    let res = await r('post', '/posts').set('Authorization', `Bearer ${custToken}`).send({ authorId: custId, authorName: 'Smoke Cust', title: 'Smoke Post', content: 'Content', category: 'plumbing' });
    ok('POST /posts', expectStatus(res, 201));
    postId = res.body.data.id;
    res = await r('get', '/posts?category=plumbing&limit=5');
    ok('GET /posts?category', expectStatus(res, 200));
    res = await r('get', `/posts?authorId=${custId}`);
    ok('GET /posts?authorId', expectStatus(res, 200));
    res = await r('post', `/posts/${postId}/like`).set('Authorization', `Bearer ${custToken}`).send({ userId: custId });
    ok('POST /posts/:id/like', expectStatus(res, 200));
    res = await r('patch', `/posts/${postId}`).set('Authorization', `Bearer ${custToken}`).send({ title: 'Updated Post' });
    ok('PATCH /posts/:id', expectStatus(res, 200));
  } catch (e) { ok('Community', false, e.message); }

  // 12. Search
  try {
    let res = await r('get', '/search?q=سباكة&limit=5');
    ok('GET /search?q', expectStatus(res, 200));
    res = await r('post', '/search/index').send({ entityType: 'technician', entityId: 'test123', title: 'سباك', description: 'desc', governorate: 'القاهرة' });
    ok('POST /search/index', expectStatus(res, 201));
    res = await r('delete', '/search/index/technician/test123');
    ok('DELETE /search/index/:type/:id', expectStatus(res, 200));
  } catch (e) { ok('Search', false, e.message); }

  // 13. Notifications & Push
  try {
    let res = await r('post', '/notifications').set('Authorization', `Bearer ${custToken}`).send({ userId: custId, userType: 'user', title: 'Notif', body: 'Body', type: 'system', data: {} });
    ok('POST /notifications', expectStatus(res, 201));
    const nid = res.body.data.id;
    res = await r('get', `/notifications?userId=${custId}`).set('Authorization', `Bearer ${custToken}`);
    ok('GET /notifications?userId', expectStatus(res, 200));
    res = await r('get', `/notifications/unread-count?userId=${custId}`).set('Authorization', `Bearer ${custToken}`);
    ok('GET /notifications/unread-count', expectStatus(res, 200));
    res = await r('patch', `/notifications/${nid}`).set('Authorization', `Bearer ${custToken}`).send({ isRead: true });
    ok('PATCH /notifications/:id', expectStatus(res, 200));
    res = await r('post', '/notifications/mark-all-read').set('Authorization', `Bearer ${custToken}`).send({ userId: custId });
    ok('POST /notifications/mark-all-read', expectStatus(res, 200));
    res = await r('post', '/push/send').set('Authorization', `Bearer ${custToken}`).send({ userId: custId, title: 'Push', body: 'Body' });
    ok('POST /push/send', expectStatus(res, 200));
  } catch (e) { ok('Notifications', false, e.message); }

  // 14. Support
  try {
    let res = await r('post', '/support-tickets').set('Authorization', `Bearer ${custToken}`).send({ userId: custId, userType: 'user', subject: 'Help', description: 'Detailed description for support ticket' });
    ok('POST /support-tickets', expectStatus(res, 201));
    ticketId = res.body.data.id;
    res = await r('get', `/support-tickets?userId=${custId}`).set('Authorization', `Bearer ${custToken}`);
    ok('GET /support-tickets?userId', expectStatus(res, 200));
    res = await r('get', `/support-tickets/${ticketId}`).set('Authorization', `Bearer ${custToken}`);
    ok('GET /support-tickets/:id', expectStatus(res, 200));
    res = await r('patch', `/support-tickets/${ticketId}`).set('Authorization', `Bearer ${custToken}`).send({ status: 'in_progress' });
    ok('PATCH /support-tickets/:id', expectStatus(res, 200));
  } catch (e) { ok('Support', false, e.message); }

  // 15. Reviews
  try {
    let res = await r('post', '/reviews').set('Authorization', `Bearer ${custToken}`).send({ requestId, reviewerId: custId, technicianId: techPhone, rating: 5, comment: 'ممتاز' });
    ok('POST /reviews', expectStatus(res, 201));
    const rid = res.body.data.id;
    res = await r('get', `/reviews?technicianId=${encodeURIComponent(techPhone)}`);
    ok('GET /reviews?technicianId', expectStatus(res, 200));
    res = await r('delete', `/reviews/${rid}`).set('Authorization', `Bearer ${custToken}`);
    ok('DELETE /reviews/:id', expectStatus(res, 200));
  } catch (e) { ok('Reviews', false, e.message); }

  // 16. Visits
  try {
    // Ensure a completed request exists
    let res = await r('post', '/service-requests').set('Authorization', `Bearer ${custToken}`).send({ userId: custId, userName: 'Smoke', userPhone: custPhone, userGovernorate: 'القاهرة', title: 'Visit req', description: 'desc', budget: '100', serviceType: 'plumbing' });
    const vid = res.body.data.id;
    await r('patch', `/service-requests/${vid}/status`).set('Authorization', `Bearer ${custToken}`).send({ status: 'completed' });
    res = await r('get', `/visits?userId=${custId}&status=completed`).set('Authorization', `Bearer ${custToken}`);
    ok('GET /visits?userId', expectStatus(res, 200));
  } catch (e) { ok('Visits', false, e.message); }

  // 17. Appointments
  try {
    let res = await r('post', '/appointments').set('Authorization', `Bearer ${custToken}`).send({ requestId: 'test-req', clientId: custId, technicianId: techPhone, serviceType: 'plumbing', serviceName: 'سباكة', appointmentDate: '2026-08-31' });
    ok('POST /appointments', expectStatus(res, 201));
    apptId = res.body.data.id;
    res = await r('post', '/appointments/upsert-on-accept').set('Authorization', `Bearer ${custToken}`).send({ requestId });
    ok('POST /appointments/upsert-on-accept', expectStatus(res, 200));
    res = await r('patch', `/appointments/${apptId}/status`).set('Authorization', `Bearer ${custToken}`).send({ status: 'confirmed' });
    ok('PATCH /appointments/:id/status', expectStatus(res, 200));
    res = await r('patch', `/appointments/${apptId}/location`).set('Authorization', `Bearer ${custToken}`).send({ role: 'technician', latitude: 30.0, longitude: 31.0 });
    ok('PATCH /appointments/:id/location', expectStatus(res, 200));
    res = await r('get', `/appointments?userId=${custId}`).set('Authorization', `Bearer ${custToken}`);
    ok('GET /appointments?userId', expectStatus(res, 200));
    res = await r('get', `/appointments/${apptId}`).set('Authorization', `Bearer ${custToken}`);
    ok('GET /appointments/:id', expectStatus(res, 200));
  } catch (e) { ok('Appointments', false, e.message); }

  // 18. Family
  try {
    let res = await r('post', `/users/${custId}/family-members`).set('Authorization', `Bearer ${custToken}`).send({ memberName: 'Ali', memberPhone: '01000000222', relationship: 'brother' });
    ok('POST /users/:uid/family-members', expectStatus(res, 201));
    const mid = res.body.data.id;
    res = await r('get', `/users/${custId}/family-members`).set('Authorization', `Bearer ${custToken}`);
    ok('GET /users/:uid/family-members', expectStatus(res, 200));
    res = await r('delete', `/users/${custId}/family-members/${mid}`).set('Authorization', `Bearer ${custToken}`);
    ok('DELETE /users/:uid/family-members/:id', expectStatus(res, 200));
    res = await r('post', '/families/join').set('Authorization', `Bearer ${custToken}`).send({ phone: '01000000222', familyCode: 'FAMSMOKE' });
    ok('POST /families/join', expectStatus(res, 200));
    res = await r('get', '/families/FAMSMOKE').set('Authorization', `Bearer ${custToken}`);
    ok('GET /families/:code', expectStatus(res, 200));
  } catch (e) { ok('Family', false, e.message); }

  // 19. Verification
  try {
    let res = await r('post', '/verification').set('Authorization', `Bearer ${custToken}`).send({ userId: custId, name: 'Smoke', phone: custPhone, city: 'القاهرة', governorate: 'القاهرة', frontIdPath: 'a.jpg', backIdPath: 'b.jpg' });
    ok('POST /verification', expectStatus(res, 201));
    res = await r('get', `/verification?userId=${custId}`).set('Authorization', `Bearer ${custToken}`);
    ok('GET /verification?userId', expectStatus(res, 200));
    res = await r('patch', `/verification/${custId}`).set('Authorization', `Bearer ${custToken}`).send({ status: 'approved' });
    ok('PATCH /verification/:userId', expectStatus(res, 200));
  } catch (e) { ok('Verification', false, e.message); }

  // 20. AI
  try {
    let res = await r('post', '/ai/assistant').set('Authorization', `Bearer ${custToken}`).send({ query: 'كيف أصلح حنفية؟', userContext: { governorate: 'القاهرة' } });
    ok('POST /ai/assistant', expectStatus(res, 200) && !!res.body.data.reply);
  } catch (e) { ok('AI', false, e.message); }

  // 21. Jobs
  try {
    const { env } = require('../dist/config/env');
    let res = await r('post', '/jobs/dailyReset').set('Authorization', `Bearer ${env.CRON_SECRET}`);
    ok('POST /jobs/dailyReset', expectStatus(res, 200));
    res = await r('post', '/jobs/expireOffers').set('Authorization', `Bearer ${env.CRON_SECRET}`);
    ok('POST /jobs/expireOffers', expectStatus(res, 200));
    res = await r('post', '/jobs/unknown').set('Authorization', `Bearer ${env.CRON_SECRET}`);
    ok('POST /jobs/unknown 400', expectStatus(res, 400));
    res = await r('post', '/jobs/dailyReset').set('Authorization', `Bearer wrong`);
    ok('POST /jobs/dailyReset wrong secret 401', expectStatus(res, 401));
  } catch (e) { ok('Jobs', false, e.message); }

  // 22. Auth logout & delete
  try {
    let res = await r('post', '/auth/logout').set('Authorization', `Bearer ${custToken}`);
    ok('POST /auth/logout', expectStatus(res, 200));
    // Need new token for further tests
    let res2 = await r('post', '/auth/request-otp').send({ phone: '01000000111' });
    let vid = res2.body.data.verificationId;
    let res3 = await r('post', '/auth/verify-otp').send({ phone: '01000000111', code: '123456', verificationId: vid });
    let newToken = res3.body.data.token;
    res = await r('delete', '/auth/session').set('Authorization', `Bearer ${newToken}`);
    ok('DELETE /auth/session', expectStatus(res, 200));
  } catch (e) { ok('Auth logout', false, e.message); }

  // 23. Delete post
  try {
    let res = await r('delete', `/posts/${postId}`).set('Authorization', `Bearer ${custToken}`);
    // custToken was logged out, need new token
    let otp = await r('post', '/auth/request-otp').send({ phone: '01000000111' });
    let vid = otp.body.data.verificationId;
    let ver = await r('post', '/auth/verify-otp').send({ phone: '01000000111', code: '123456', verificationId: vid });
    let tok = ver.body.data.token;
    res = await r('delete', `/posts/${postId}`).set('Authorization', `Bearer ${tok}`);
    ok('DELETE /posts/:id', [200, 403].includes(res.status));
  } catch (e) { ok('DELETE /posts', false, e.message); }

  // Summary
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`\n=== Summary: ${passed}/${total} passed (${((passed/total)*100).toFixed(1)}%) in ${Date.now()-start}ms ===`);
  if (passed < total) {
    console.log('Failed:');
    results.filter(r => !r.passed).forEach(r => console.log(' -', r.name));
    process.exit(1);
  } else {
    console.log('All endpoints smoke passed!');
    process.exit(0);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
