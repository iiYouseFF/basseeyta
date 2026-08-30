import request from 'supertest';
import { createApp } from '../../src/app';

describe('Service Requests Integration', () => {
  const app = createApp();
  let customerToken: string;
  let customerId: string;
  let requestId: string;

  beforeAll(async () => {
    const reg = await request(app).post('/auth/register').send({
      name: 'Req Customer',
      phone: '01011111111',
      governorate: 'القاهرة',
    });
    customerToken = reg.body.data.token;
    customerId = reg.body.data.user.id;
  });

  it('POST /service-requests creates request', async () => {
    const res = await request(app)
      .post('/service-requests')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        userId: customerId,
        userName: 'Req Customer',
        userPhone: '+201011111111',
        userGovernorate: 'القاهرة',
        title: 'تصليح حنفية',
        description: 'حنفية المطبخ تنقط',
        budget: '500',
        serviceType: 'plumbing',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.request.id).toBeDefined();
    requestId = res.body.data.id;
  });

  it('GET /service-requests?userId= returns customer view', async () => {
    const res = await request(app).get(`/service-requests?userId=${customerId}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('GET /service-requests?status=pending&governorate=القاهرة returns technician view', async () => {
    const res = await request(app).get('/service-requests?status=pending&governorate=القاهرة');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('PATCH /service-requests/:id/status updates', async () => {
    const res = await request(app)
      .patch(`/service-requests/${requestId}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'in_progress' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('in_progress');
  });

  it('DELETE /service-requests/:id owner can delete if pending, else fail', async () => {
    // Create new pending request
    const create = await request(app)
      .post('/service-requests')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        userId: customerId,
        userName: 'Req Customer',
        userPhone: '+201011111111',
        userGovernorate: 'القاهرة',
        title: 'دهان',
        description: 'دهان غرفة',
        budget: '300',
        serviceType: 'painting',
      });
    const newId = create.body.data.id;
    const delOwn = await request(app).delete(`/service-requests/${newId}`).set('Authorization', `Bearer ${customerToken}`);
    expect(delOwn.status).toBe(200);

    // Other user cannot delete
    const reg2 = await request(app).post('/auth/register').send({
      name: 'Other',
      phone: '01022222222',
      governorate: 'القاهرة',
    });
    const otherToken = reg2.body.data.token;
    // Recreate pending then try other delete
    const create2 = await request(app)
      .post('/service-requests')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        userId: customerId,
        userName: 'Req Customer',
        userPhone: '+201011111111',
        userGovernorate: 'القاهرة',
        title: 'نجارة',
        description: 'باب',
        budget: '400',
        serviceType: 'carpentry',
      });
    const id2 = create2.body.data.id;
    const delOther = await request(app).delete(`/service-requests/${id2}`).set('Authorization', `Bearer ${otherToken}`);
    expect(delOther.status).toBe(403);
  });
});
