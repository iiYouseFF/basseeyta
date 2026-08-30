import request from 'supertest';
import { createApp } from '../../src/app';

describe('Push Integration', () => {
  const app = createApp();
  let token: string;
  let userId: string;

  beforeAll(async () => {
    const reg = await request(app).post('/auth/register').send({
      name: 'Push User',
      phone: '01090000009',
      governorate: 'القاهرة',
    });
    token = reg.body.data.token;
    userId = reg.body.data.user.id;
  });

  it('POST /push/send - success', async () => {
    const res = await request(app)
      .post('/push/send')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId,
        title: 'Test Push',
        body: 'Body of push',
        type: 'system',
        data: { foo: 'bar' },
      });
    expect(res.status).toBe(200);
    expect(res.body.data.notification).toBeDefined();
    expect(res.body.data.notification.title).toBe('Test Push');
  });

  it('POST /push/send - with topic', async () => {
    const res = await request(app)
      .post('/push/send')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId,
        title: 'Topic',
        body: 'Body',
        topic: 'user_' + userId,
      });
    expect(res.status).toBe(200);
  });

  it('POST /push/send - invalid data', async () => {
    const res = await request(app)
      .post('/push/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId });
    expect(res.status).toBe(400);
  });

  it('POST /push/send - without auth', async () => {
    const res = await request(app).post('/push/send').send({ userId, title: 'x', body: 'y' });
    expect(res.status).toBe(401);
  });

  it('GET /notifications after push', async () => {
    await request(app)
      .post('/push/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId, title: 'For notif list', body: 'b' });
    const list = await request(app)
      .get(`/notifications?userId=${userId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThan(0);
  });
});
