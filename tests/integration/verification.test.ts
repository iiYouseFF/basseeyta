import request from 'supertest';
import { createApp } from '../../src/app';

describe('Verification Integration', () => {
  const app = createApp();

  it('Submit verification, status pending', async () => {
    const u = await request(app).post('/auth/register').send({
      name: 'Verify User',
      phone: '01033322211',
      governorate: 'القاهرة',
    });
    const token = u.body.data.token;
    const uid = u.body.data.user.id;

    const ver = await request(app)
      .post('/verification')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: uid,
        name: 'Verify User',
        phone: '+201033322211',
        city: 'القاهرة',
        governorate: 'القاهرة',
        frontIdPath: 'account_verification/front.jpg',
        backIdPath: 'account_verification/back.jpg',
      });
    expect(ver.status).toBe(201);
    expect(ver.body.data.status).toBe('pending');

    const get = await request(app).get(`/verification?userId=${uid}`).set('Authorization', `Bearer ${token}`);
    expect(get.body.data.status).toBe('pending');
  });
});
