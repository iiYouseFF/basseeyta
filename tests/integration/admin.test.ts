import request from 'supertest';
import { createApp } from '../../src/app';

describe('Admin API', () => {
  const app = createApp();
  let adminToken: string;

  it('POST /admin/api/auth/login — superadmin success', async () => {
    const res = await request(app).post('/admin/api/auth/login').send({ email: 'admin@basseeyta.com', password: 'basseytaAdmin123' });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.admin.email).toBe('admin@basseeyta.com');
    adminToken = res.body.data.token;
  });

  it('POST /admin/api/auth/login — wrong password 401', async () => {
    const res = await request(app).post('/admin/api/auth/login').send({ email: 'admin@basseeyta.com', password: 'wrongpass123' });
    expect(res.status).toBe(401);
  });

  it('GET /admin/api/auth/me — requires admin', async () => {
    const res = await request(app).get('/admin/api/auth/me').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('admin@basseeyta.com');
  });

  it('GET /admin/api/stats — admin only', async () => {
    const res = await request(app).get('/admin/api/stats').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('users');
    expect(res.body.data).toHaveProperty('requestsByStatus');
  });

  it('GET /admin/api/stats — non-admin 403', async () => {
    const reg = await request(app).post('/auth/register').send({ name: 'Norm', phone: '01077770001', governorate: 'القاهرة' });
    const token = reg.body.data.token;
    const res = await request(app).get('/admin/api/stats').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('Per-field whitelist — rejects non-whitelisted fields', async () => {
    const reg = await request(app).post('/auth/register').send({ name: 'WhitelistUser', phone: '01077770002', governorate: 'القاهرة' });
    const uid = reg.body.data.user.id;
    const res = await request(app)
      .patch(`/admin/api/users/${uid}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'UpdatedName', phone: '999', hacker: true, is_admin: true });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('UpdatedName');
    // phone should NOT be updated via whitelist (still original)
    expect(res.body.data.phone).not.toBe('999');
  });

  it('Audit log records actions', async () => {
    const res = await request(app).get('/admin/api/audit-logs').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('action');
    expect(res.body.data[0]).toHaveProperty('admin_email', 'admin@basseeyta.com');
  });

  it('Promo CRUD — create, patch, delete', async () => {
    const code = 'TEST' + Math.floor(Math.random() * 10000);
    let res = await request(app).post('/admin/api/promo-codes').set('Authorization', `Bearer ${adminToken}`).send({ code, discount_type: 'percentage', discount_value: 15, max_uses: 10 });
    expect(res.status).toBe(201);
    const id = res.body.data.id;
    res = await request(app).patch(`/admin/api/promo-codes/${id}`).set('Authorization', `Bearer ${adminToken}`).send({ discount_value: 20 });
    expect(res.status).toBe(200);
    expect(res.body.data.discount_value).toBe(20);
    res = await request(app).delete(`/admin/api/promo-codes/${id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('Verifications — admin approve via admin API', async () => {
    const u = await request(app).post('/auth/register').send({ name: 'VerUser', phone: '01077770003', governorate: 'القاهرة' });
    const uid = u.body.data.user.id;
    const token = u.body.data.token;
    await request(app)
      .post('/verification')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: uid, name: 'VerUser', phone: '+201077770003', frontIdPath: 'account_verification/a.jpg', backIdPath: 'account_verification/b.jpg' });
    const res = await request(app).patch(`/admin/api/verifications/${uid}`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
  });

  it('SPA fallback — GET /admin/users returns HTML', async () => {
    const res = await request(app).get('/admin/users');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('Basseeyta');
  });

  it('Jobs — list all cron jobs with status', async () => {
    const res = await request(app).get('/admin/api/jobs').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(5);
    const names = res.body.data.map((j: any) => j.name);
    expect(names).toContain('dailyReset');
    expect(res.body.data[0]).toHaveProperty('lastStatus');
  });

  it('Jobs — run in-memory job via admin endpoint', async () => {
    const res = await request(app).post('/admin/api/jobs/dailyReset/run').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('executed', 'dailyReset');
    const list = await request(app).get('/admin/api/jobs').set('Authorization', `Bearer ${adminToken}`);
    const job = list.body.data.find((j: any) => j.name === 'dailyReset');
    expect(job.lastStatus).toBe('ok');
    expect(job.runs).toBeGreaterThan(0);
  });

  it('Jobs — unknown job is rejected', async () => {
    const res = await request(app).post('/admin/api/jobs/bogus/run').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('Storage Browser — list + invalid bucket', async () => {
    const ok = await request(app).get('/admin/api/storage/profiles').set('Authorization', `Bearer ${adminToken}`);
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body.data)).toBe(true);
    expect(ok.body).toHaveProperty('bucket', 'profiles');
    const bad = await request(app).get('/admin/api/storage/nope').set('Authorization', `Bearer ${adminToken}`);
    expect(bad.status).toBe(400);
  });

  it('Push send — target all (broadcast)', async () => {
    const res = await request(app)
      .post('/admin/api/push/send')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ target: 'all', title: 'Test broadcast', body: 'hello wavelengths', type: 'admin_push' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('recipients');
    expect(typeof res.body.data.recipients).toBe('number');
    expect(res.body.data).toHaveProperty('fcm');
  });

  it('AI usage log — records assistant calls and exposes totals', async () => {
    const reg = await request(app).post('/auth/register').send({ name: 'AiUser', phone: '01077770004', governorate: 'القاهرة' });
    const token = reg.body.data.token;
    await request(app).post('/ai/assistant').set('Authorization', `Bearer ${token}`).send({ query: 'كمبريسر مكيف لا يعمل؟' });
    const res = await request(app).get('/admin/api/ai-usage').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('query');
    expect(res.body.totals.total).toBeGreaterThan(0);
  });

  it('InstaPay — list enriches with commission fields + confirm closes the transfer', async () => {
    const reg = await request(app).post('/auth/register').send({ name: 'PayUser', phone: '01077770005', governorate: 'القاهرة' });
    const uid = reg.body.data.user.id;
    const token = reg.body.data.token;
    const created = await request(app)
      .post('/payments/instapay')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: uid, amount: 7500, requestId: '' });
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    const list = await request(app).get('/admin/api/instapay').set('Authorization', `Bearer ${adminToken}`);
    const row = list.body.data.find((r: any) => r.id === id);
    expect(row).toBeDefined();
    expect(row).toHaveProperty('expectedCommission');
    expect(row).toHaveProperty('orderTotal');
    expect(row).toHaveProperty('mismatch');

    const confirm = await request(app).post(`/admin/api/instapay/${id}/confirm`).set('Authorization', `Bearer ${adminToken}`);
    expect(confirm.status).toBe(200);
    expect(confirm.body.data.status).toBe('verified');
  });
});
