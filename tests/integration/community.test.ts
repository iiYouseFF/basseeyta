import request from 'supertest';
import { createApp } from '../../src/app';

describe('Community Integration', () => {
  const app = createApp();
  let token: string;
  let userId: string;

  beforeAll(async () => {
    const u = await request(app).post('/auth/register').send({
      name: 'Community User',
      phone: '01066666666',
      governorate: 'القاهرة',
    });
    token = u.body.data.token;
    userId = u.body.data.user.id;
  });

  it('Create post, like/unlike toggle, delete author vs non-author', async () => {
    const post = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        authorId: userId,
        authorName: 'Community User',
        title: 'عنوان',
        content: 'محتوى',
        category: 'plumbing',
      });
    expect(post.status).toBe(201);
    const postId = post.body.data.id;

    const like1 = await request(app).post(`/posts/${postId}/like`).set('Authorization', `Bearer ${token}`).send({ userId });
    expect(like1.body.data.liked).toBe(true);
    expect(like1.body.data.likes).toBe(1);

    const like2 = await request(app).post(`/posts/${postId}/like`).set('Authorization', `Bearer ${token}`).send({ userId });
    expect(like2.body.data.liked).toBe(false);
    expect(like2.body.data.likes).toBe(0);

    // Non-author cannot delete
    const other = await request(app).post('/auth/register').send({
      name: 'Other',
      phone: '01066666677',
      governorate: 'القاهرة',
    });
    const otherToken = other.body.data.token;
    const delFail = await request(app).delete(`/posts/${postId}`).set('Authorization', `Bearer ${otherToken}`);
    expect(delFail.status).toBe(403);

    const delOk = await request(app).delete(`/posts/${postId}`).set('Authorization', `Bearer ${token}`);
    expect(delOk.status).toBe(200);
  });
});
