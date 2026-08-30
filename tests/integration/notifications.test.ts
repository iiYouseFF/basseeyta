import request from 'supertest';
import { createApp } from '../../src/app';

describe('Notifications Integration', () => {
  const app = createApp();

  it('Mark all read, unread 0', async () => {
    const u = await request(app).post('/auth/register').send({
      name: 'Notif User',
      phone: '01088888899',
      governorate: 'القاهرة',
    });
    const token = u.body.data.token;
    const uid = u.body.data.user.id;

    // Create notifications via push
    await request(app)
      .post('/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: uid,
        userType: 'user',
        title: 'Test',
        body: 'Body',
        type: 'system',
        data: {},
      });

    const before = await request(app).get(`/notifications/unread-count?userId=${uid}`).set('Authorization', `Bearer ${token}`);
    expect(before.body.data.count).toBeGreaterThan(0);

    await request(app).post('/notifications/mark-all-read').set('Authorization', `Bearer ${token}`).send({ userId: uid });

    const after = await request(app).get(`/notifications/unread-count?userId=${uid}`).set('Authorization', `Bearer ${token}`);
    expect(after.body.data.count).toBe(0);
  });
});
