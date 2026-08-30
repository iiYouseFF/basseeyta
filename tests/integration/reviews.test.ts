import request from 'supertest';
import { createApp } from '../../src/app';

describe('Reviews Integration', () => {
  const app = createApp();

  it('Create review, technician rating recalculates', async () => {
    const cust = await request(app).post('/auth/register').send({
      name: 'Review Cust',
      phone: '01022233344',
      governorate: 'القاهرة',
    });
    const tech = await request(app).post('/auth/technicians/register').send({
      fullName: 'Review Tech',
      phone: '01022233355',
      governorate: 'القاهرة',
    });
    const custToken = cust.body.data.token;
    const custId = cust.body.data.user.id;
    const techPhone = tech.body.data.technician.phone;

    // Create request id for review
    const reqRes = await request(app)
      .post('/service-requests')
      .set('Authorization', `Bearer ${custToken}`)
      .send({
        userId: custId,
        userName: 'Review Cust',
        userPhone: '+201022233344',
        userGovernorate: 'القاهرة',
        title: 'review req',
        description: 'desc',
        budget: '100',
        serviceType: 'plumbing',
      });
    const requestId = reqRes.body.data.id;

    const rev1 = await request(app)
      .post('/reviews')
      .set('Authorization', `Bearer ${custToken}`)
      .send({ requestId, reviewerId: custId, technicianId: techPhone, rating: 5, comment: 'ممتاز' });
    expect(rev1.status).toBe(201);

    const rev2 = await request(app)
      .post('/reviews')
      .set('Authorization', `Bearer ${custToken}`)
      .send({ requestId, reviewerId: custId, technicianId: techPhone, rating: 3, comment: 'جيد' });
    expect(rev2.status).toBe(201);

    const get = await request(app).get(`/reviews?technicianId=${techPhone}`);
    expect(get.body.data.avg).toBe(4);
  });
});
