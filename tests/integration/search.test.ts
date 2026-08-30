import request from 'supertest';
import { createApp } from '../../src/app';

describe('Search Integration', () => {
  const app = createApp();

  it('Search for Arabic term', async () => {
    // Create a post to index
    const u = await request(app).post('/auth/register').send({
      name: 'Search User',
      phone: '01077777777',
      governorate: 'القاهرة',
    });
    const token = u.body.data.token;
    const uid = u.body.data.user.id;
    await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        authorId: uid,
        authorName: 'Search User',
        title: 'سباكة ممتازة',
        content: 'خدمة سباكة في القاهرة',
        category: 'plumbing',
      });

    const res = await request(app).get('/search?q=سباكة&limit=10');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
