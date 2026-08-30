import request from 'supertest';
import { createApp } from '../../src/app';

describe('Users Integration', () => {
  const app = createApp();
  let token: string;
  let userId: string;
  let phone: string;

  beforeAll(async () => {
    const reg = await request(app).post('/auth/register').send({
      name: 'Users Test',
      phone: '01090000007',
      governorate: 'الإسكندرية',
      city: 'الإسكندرية',
      email: 'test@example.com',
    });
    token = reg.body.data.token;
    userId = reg.body.data.user.id;
    phone = reg.body.data.user.phone;
  });

  it('GET /users?phone= - found', async () => {
    const res = await request(app).get(`/users?phone=${phone}`);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Users Test');
  });

  it('GET /users?phone= - variant', async () => {
    const res = await request(app).get('/users?phone=01090000007');
    expect(res.status).toBe(200);
  });

  it('GET /users?phone= - not found', async () => {
    const res = await request(app).get('/users?phone=01000000099');
    expect(res.status).toBe(404);
  });

  it('GET /users?phone= missing', async () => {
    const res = await request(app).get('/users');
    expect(res.status).toBe(400);
  });

  it('PUT /users/me - update', async () => {
    const res = await request(app)
      .put('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ city: 'منتزه', governorate: 'الإسكندرية' });
    expect(res.status).toBe(200);
    expect(res.body.data.city).toBe('منتزه');
  });

  it('PUT /users/me - invalid data', async () => {
    const res = await request(app)
      .put('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'invalid-email' });
    expect(res.status).toBe(400);
  });

  it('GET /users/me without auth fails', async () => {
    const res = await request(app).get('/users/me');
    expect(res.status).toBe(401);
  });

  it('GET /users/me with invalid token', async () => {
    const res = await request(app).get('/users/me').set('Authorization', 'Bearer invalid');
    expect(res.status).toBe(401);
  });
});
