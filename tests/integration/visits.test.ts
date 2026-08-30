import request from 'supertest';
import { createApp } from '../../src/app';

describe('Visits Integration', () => {
  const app = createApp();
  let token: string;
  let userId: string;

  beforeAll(async () => {
    const reg = await request(app).post('/auth/register').send({
      name: 'Visits User',
      phone: '01090000004',
      governorate: 'القاهرة',
    });
    token = reg.body.data.token;
    userId = reg.body.data.user.id;

    // Create a completed request to appear in visits
    const reqRes = await request(app)
      .post('/service-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId,
        userName: 'Visits User',
        userPhone: '+201090000004',
        userGovernorate: 'القاهرة',
        title: 'visits req',
        description: 'desc',
        budget: '100',
        serviceType: 'plumbing',
      });
    const id = reqRes.body.data.id;
    await request(app)
      .patch(`/service-requests/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'completed' });
  });

  it('GET /visits?userId= returns visits', async () => {
    const res = await request(app)
      .get(`/visits?userId=${userId}&status=completed`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('GET /visits?userId= missing', async () => {
    const res = await request(app)
      .get('/visits')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('GET /visits without auth fails', async () => {
    const res = await request(app).get(`/visits?userId=${userId}`);
    expect(res.status).toBe(401);
  });
});
