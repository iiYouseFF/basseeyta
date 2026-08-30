import request from 'supertest';
import { createApp } from '../../src/app';

describe('Auth Integration', () => {
  const app = createApp();

  it('POST /auth/request-otp (mock mode) returns verificationId', async () => {
    const res = await request(app).post('/auth/request-otp').send({ phone: '01012345678' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.verificationId).toBeDefined();
    expect(res.body.data.mock).toBe(true);
  });

  it('POST /auth/verify-otp with mock code returns JWT', async () => {
    const reqRes = await request(app).post('/auth/request-otp').send({ phone: '01012345678' });
    const verificationId = reqRes.body.data.verificationId;
    const res = await request(app).post('/auth/verify-otp').send({ phone: '01012345678', code: '123456', verificationId });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user).toBeDefined();
  });

  it('GET /users/me with valid JWT returns user (after register)', async () => {
    // Register first
    const reg = await request(app).post('/auth/register').send({
      name: 'Test User',
      phone: '01099999999',
      governorate: 'القاهرة',
    });
    expect(reg.status).toBe(201);
    const token = reg.body.data.token;
    const res = await request(app).get('/users/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Test User');
  });

  it('GET /users/me with expired/invalid JWT -> 401', async () => {
    const res = await request(app).get('/users/me').set('Authorization', `Bearer invalid.token.here`);
    expect(res.status).toBe(401);
  });

  it('POST /auth/technicians/register and GET wallet', async () => {
    const reg = await request(app).post('/auth/technicians/register').send({
      fullName: 'Tech Test',
      phone: '01088888888',
      governorate: 'الجيزة',
      specialty: 'سباكة',
    });
    expect(reg.status).toBe(201);
    const token = reg.body.data.token;
    const wallet = await request(app).get('/technicians/01088888888/wallet').set('Authorization', `Bearer ${token}`);
    expect(wallet.status).toBe(200);
    expect(wallet.body.data.walletBalance).toBe(0);
  });
});
