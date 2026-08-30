import request from 'supertest';
import { createApp } from '../../src/app';

describe('Chat Integration', () => {
  const app = createApp();
  let custToken: string;
  let custId: string;
  let techToken: string;
  let techPhone: string;
  let requestId: string;
  let roomId: string;

  beforeAll(async () => {
    const cust = await request(app).post('/auth/register').send({
      name: 'Chat Cust',
      phone: '01044444444',
      governorate: 'القاهرة',
    });
    custToken = cust.body.data.token;
    custId = cust.body.data.user.id;

    const tech = await request(app).post('/auth/technicians/register').send({
      fullName: 'Chat Tech',
      phone: '01044444455',
      governorate: 'القاهرة',
    });
    techToken = tech.body.data.token;
    techPhone = tech.body.data.technician.phone;

    const reqRes = await request(app)
      .post('/service-requests')
      .set('Authorization', `Bearer ${custToken}`)
      .send({
        userId: custId,
        userName: 'Chat Cust',
        userPhone: '+201044444444',
        userGovernorate: 'القاهرة',
        title: 'chat test',
        description: 'desc',
        budget: '100',
        serviceType: 'plumbing',
      });
    requestId = reqRes.body.data.id;
  });

  it('POST /chat/rooms idempotent', async () => {
    const r1 = await request(app)
      .post('/chat/rooms')
      .set('Authorization', `Bearer ${custToken}`)
      .send({ clientId: custId, technicianId: techPhone, requestId, serviceType: 'plumbing' });
    expect(r1.status).toBe(201);
    roomId = r1.body.data.id;

    const r2 = await request(app)
      .post('/chat/rooms')
      .set('Authorization', `Bearer ${custToken}`)
      .send({ clientId: custId, technicianId: techPhone, requestId, serviceType: 'plumbing' });
    expect(r2.body.data.id).toBe(roomId);
  });

  it('POST message -> GET messages includes it', async () => {
    const msg = await request(app)
      .post(`/chat/rooms/${roomId}/messages`)
      .set('Authorization', `Bearer ${custToken}`)
      .send({ senderId: custId, senderType: 'user', message: 'hello' });
    expect(msg.status).toBe(201);

    const msgs = await request(app)
      .get(`/chat/rooms/${roomId}/messages?limit=50`)
      .set('Authorization', `Bearer ${custToken}`);
    expect(msgs.body.data.length).toBeGreaterThan(0);
    expect(msgs.body.data[0].message).toBeDefined();
  });

  it('PATCH read -> unread 0', async () => {
    await request(app)
      .post(`/chat/rooms/${roomId}/messages`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ senderId: techPhone, senderType: 'technician', message: 'hi cust' });

    const unreadBefore = await request(app)
      .get(`/chat/rooms/${roomId}/unread?userId=${custId}`)
      .set('Authorization', `Bearer ${custToken}`);
    expect(unreadBefore.body.data.count).toBeGreaterThan(0);

    await request(app)
      .patch(`/chat/rooms/${roomId}/read`)
      .set('Authorization', `Bearer ${custToken}`)
      .send({ userId: custId });

    const unreadAfter = await request(app)
      .get(`/chat/rooms/${roomId}/unread?userId=${custId}`)
      .set('Authorization', `Bearer ${custToken}`);
    expect(unreadAfter.body.data.count).toBe(0);
  });
});
