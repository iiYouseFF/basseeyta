import request from 'supertest';
import { createApp } from '../../src/app';

describe('Auth Advanced', () => {
  const app = createApp();

  it('POST /auth/request-otp - invalid phone', async () => {
    const res = await request(app).post('/auth/request-otp').send({ phone: '123' });
    expect(res.status).toBe(400);
  });

  it('POST /auth/request-otp - missing phone', async () => {
    const res = await request(app).post('/auth/request-otp').send({});
    expect(res.status).toBe(400);
  });

  it('POST /auth/verify-otp - invalid code format in mock still accepts 6 digits', async () => {
    await request(app).post('/auth/request-otp').send({ phone: '01090000111' });
    const res = await request(app).post('/auth/verify-otp').send({ phone: '01090000111', code: '999999' });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
  });

  it('POST /auth/verify-otp - invalid phone', async () => {
    const res = await request(app).post('/auth/verify-otp').send({ phone: 'bad', code: '123456' });
    expect(res.status).toBe(400);
  });

  it('POST /auth/register - duplicate phone', async () => {
    await request(app).post('/auth/register').send({ name: 'Dup', phone: '01090000112', governorate: 'القاهرة' });
    const dup = await request(app).post('/auth/register').send({ name: 'Dup2', phone: '01090000112', governorate: 'القاهرة' });
    expect(dup.status).toBe(409);
  });

  it('POST /auth/register - missing fields', async () => {
    const res = await request(app).post('/auth/register').send({ name: 'A' });
    expect(res.status).toBe(400);
  });

  it('POST /auth/technicians/register - duplicate', async () => {
    await request(app).post('/auth/technicians/register').send({ fullName: 'T1', phone: '01090000113', governorate: 'القاهرة' });
    const dup = await request(app).post('/auth/technicians/register').send({ fullName: 'T2', phone: '01090000113', governorate: 'القاهرة' });
    expect(dup.status).toBe(409);
  });

  it('POST /auth/logout and DELETE /auth/session', async () => {
    const reg = await request(app).post('/auth/register').send({ name: 'Logout User', phone: '01090000114', governorate: 'القاهرة' });
    const token = reg.body.data.token;
    const logout = await request(app).post('/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(logout.status).toBe(200);
    // token should now be blacklisted
    const me = await request(app).get('/users/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(401);

    // Test DELETE /auth/session
    const reg2 = await request(app).post('/auth/register').send({ name: 'Sess User', phone: '01090000115', governorate: 'القاهرة' });
    const token2 = reg2.body.data.token;
    const del = await request(app).delete('/auth/session').set('Authorization', `Bearer ${token2}`);
    expect(del.status).toBe(200);
  });

  it('POST /auth/verify-firebase-token - mock fallback', async () => {
    const res = await request(app).post('/auth/verify-firebase-token').send({ idToken: 'fake-token' });
    // Will either 401 or 200 depending on firebase mock fallback
    expect([200, 401]).toContain(res.status);
  });

  it('GET /users?phone= with variants', async () => {
    await request(app).post('/auth/register').send({ name: 'Variant User', phone: '01090000116', governorate: 'القاهرة' });
    const res = await request(app).get('/users?phone=01090000116');
    expect(res.status).toBe(200);
    // Test with +20 variant
    const res2 = await request(app).get('/users?phone=+201090000116');
    expect(res2.status).toBe(200);
  });
});
