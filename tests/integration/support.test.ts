import request from 'supertest';
import { createApp } from '../../src/app';

describe('Support Integration', () => {
  const app = createApp();
  let token: string;
  let adminToken: string;
  let userId: string;
  let ticketId: string;

  beforeAll(async () => {
    const reg = await request(app).post('/auth/register').send({
      name: 'Support User',
      phone: '01090000003',
      governorate: 'القاهرة',
    });
    token = reg.body.data.token;
    userId = reg.body.data.user.id;
    // Admin login for privileged PATCH
    const adminLogin = await request(app).post('/admin/api/auth/login').send({ email: 'admin@basseeyta.com', password: 'basseytaAdmin123' });
    adminToken = adminLogin.body.data?.token || token;
  });

  it('POST /support-tickets - create', async () => {
    const res = await request(app)
      .post('/support-tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId,
        userType: 'user',
        subject: 'Help needed',
        description: 'Detailed description of issue for support ticket',
        priority: 'high',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.subject).toBe('Help needed');
    ticketId = res.body.data.id;
  });

  it('POST /support-tickets - invalid', async () => {
    const res = await request(app)
      .post('/support-tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId, subject: 'Hi' });
    expect(res.status).toBe(400);
  });

  it('GET /support-tickets?userId=', async () => {
    const res = await request(app)
      .get(`/support-tickets?userId=${userId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('GET /support-tickets?userId= missing', async () => {
    const res = await request(app)
      .get('/support-tickets')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('GET /support-tickets/:id', async () => {
    const res = await request(app)
      .get(`/support-tickets/${ticketId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(ticketId);
  });

  it('GET /support-tickets/:id - not found', async () => {
    const res = await request(app)
      .get('/support-tickets/nonexistent')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('PATCH /support-tickets/:id - update status (admin)', async () => {
    const res = await request(app)
      .patch(`/support-tickets/${ticketId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'in_progress', adminReply: 'We are checking' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('in_progress');
  });

  it('PATCH /support-tickets/:id - invalid status', async () => {
    const res = await request(app)
      .patch(`/support-tickets/${ticketId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('PATCH /support-tickets/:id - non-admin forbidden for adminReply', async () => {
    const res = await request(app)
      .patch(`/support-tickets/${ticketId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'in_progress', adminReply: 'hacker' });
    expect(res.status).toBe(403);
  });
});
