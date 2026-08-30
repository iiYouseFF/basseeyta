import request from 'supertest';
import { createApp } from '../../src/app';

describe('Offers Integration', () => {
  const app = createApp();
  let customerToken: string;
  let customerId: string;
  let techToken: string;
  let techPhone = '+201033333333';
  let requestId: string;

  beforeAll(async () => {
    const cust = await request(app).post('/auth/register').send({
      name: 'Offer Customer',
      phone: '01033333333',
      governorate: 'القاهرة',
    });
    customerToken = cust.body.data.token;
    customerId = cust.body.data.user.id;

    const tech = await request(app).post('/auth/technicians/register').send({
      fullName: 'Offer Tech',
      phone: '01033333344',
      governorate: 'القاهرة',
      specialty: 'سباكة',
    });
    techToken = tech.body.data.token;
    techPhone = tech.body.data.technician.phone;

    const reqRes = await request(app)
      .post('/service-requests')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        userId: customerId,
        userName: 'Offer Customer',
        userPhone: '+201033333333',
        userGovernorate: 'القاهرة',
        title: 'سباكة',
        description: 'مواسير',
        budget: '600',
        serviceType: 'plumbing',
      });
    requestId = reqRes.body.data.id;
  });

  it('POST offer -> request.hasOffers becomes true', async () => {
    const res = await request(app)
      .post(`/service-requests/${requestId}/offers`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ price: 450, message: 'متاح غدا' });
    expect(res.status).toBe(201);
    expect(res.body.data.price).toBe(450);

    const reqCheck = await request(app).get(`/service-requests/${requestId}`);
    expect(reqCheck.body.data.hasOffers).toBe(true);
  });

  it('Accept offer -> siblings rejected, chat room created', async () => {
    // Create second tech and offer
    const tech2 = await request(app).post('/auth/technicians/register').send({
      fullName: 'Tech 2',
      phone: '01033333355',
      governorate: 'القاهرة',
      specialty: 'سباكة',
    });
    const tech2Token = tech2.body.data.token;
    await request(app)
      .post(`/service-requests/${requestId}/offers`)
      .set('Authorization', `Bearer ${tech2Token}`)
      .send({ price: 500 });

    const offersBefore = await request(app).get(`/service-requests/${requestId}/offers`);
    expect(offersBefore.body.data.length).toBe(2);
    const firstOfferId = offersBefore.body.data[0].id;

    const accept = await request(app)
      .patch(`/offers/${firstOfferId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'accepted' });
    expect(accept.status).toBe(200);
    expect(accept.body.data.offer.status).toBe('accepted');

    const offersAfter = await request(app).get(`/service-requests/${requestId}/offers`);
    const pending = offersAfter.body.data.filter((o: any) => o.status === 'pending');
    expect(pending.length).toBe(0);

    // Check chat room exists
    const rooms = await request(app).get(`/chat/rooms?userId=${customerId}`).set('Authorization', `Bearer ${customerToken}`);
    expect(rooms.body.data.length).toBeGreaterThan(0);
  });

  it('Reject offer', async () => {
    // Create new request and offer
    const newReq = await request(app)
      .post('/service-requests')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        userId: customerId,
        userName: 'Offer Customer',
        userPhone: '+201033333333',
        userGovernorate: 'القاهرة',
        title: 'كهرباء',
        description: 'سلك',
        budget: '200',
        serviceType: 'electrical',
      });
    const newReqId = newReq.body.data.id;
    const offer = await request(app)
      .post(`/service-requests/${newReqId}/offers`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ price: 150 });
    const reject = await request(app)
      .patch(`/offers/${offer.body.data.id}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'rejected' });
    expect(reject.body.data.status).toBe('rejected');
  });
});
