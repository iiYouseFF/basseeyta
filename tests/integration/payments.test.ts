import request from 'supertest';
import { createApp } from '../../src/app';

describe('Payments Integration', () => {
  const app = createApp();
  let userToken: string;
  let userId: string;
  let techPhone: string;
  let requestId: string;

  beforeAll(async () => {
    const u = await request(app).post('/auth/register').send({
      name: 'Pay User',
      phone: '01055555555',
      governorate: 'القاهرة',
    });
    userToken = u.body.data.token;
    userId = u.body.data.user.id;

    const t = await request(app).post('/auth/technicians/register').send({
      fullName: 'Pay Tech',
      phone: '01055555566',
      governorate: 'القاهرة',
    });
    techPhone = t.body.data.technician.phone;

    const reqRes = await request(app)
      .post('/service-requests')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        userId,
        userName: 'Pay User',
        userPhone: '+201055555555',
        userGovernorate: 'القاهرة',
        title: 'pay req',
        description: 'desc',
        budget: '500',
        serviceType: 'plumbing',
      });
    requestId = reqRes.body.data.id;

    // Accept offer to set technicianId for payment flow
    const techToken = t.body.data.token;
    const offer = await request(app)
      .post(`/service-requests/${requestId}/offers`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ price: 400 });
    await request(app)
      .patch(`/offers/${offer.body.data.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: 'accepted' });
  });

  it('POST /payment-cards without full number', async () => {
    const res = await request(app)
      .post('/payment-cards')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ userId, cardLast4: '4242', cardHolder: 'Test', cardType: 'visa', isDefault: true, token: 'pm_mock' });
    expect(res.status).toBe(201);
    expect(res.body.data.cardLast4).toBe('4242');

    // Should reject full cardNumber
    const bad = await request(app)
      .post('/payment-cards')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ userId, cardLast4: '4242', cardNumber: '4242424242424242' } as any);
    expect(bad.status).toBe(400);
  });

  it('GET /promo-codes/validate valid', async () => {
    const res = await request(app).get('/promo-codes/validate?code=SAVE20&amount=500');
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
  });

  it('GET /promo-codes/validate expired -> 400', async () => {
    const res = await request(app).get('/promo-codes/validate?code=EXPIRED10&amount=500');
    expect(res.status).toBe(400);
  });

  it('POST /payments mock Stripe, wallet credited', async () => {
    const before = await request(app).get(`/technicians/${techPhone}/wallet`).set('Authorization', `Bearer ${userToken}`);
    const beforeBalance = before.body.data.walletBalance;

    const pay = await request(app)
      .post('/payments')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        userId,
        requestId,
        technicianId: techPhone,
        amount: 400,
        paymentMethod: 'card',
        promoCode: 'SAVE20',
      });
    expect(pay.status).toBe(201);
    expect(pay.body.data.paymentLog.amount).toBe(320); // 400 - 20%

    const after = await request(app).get(`/technicians/${techPhone}/wallet`).set('Authorization', `Bearer ${userToken}`);
    expect(after.body.data.walletBalance).toBe(beforeBalance + 320);
  });
});
