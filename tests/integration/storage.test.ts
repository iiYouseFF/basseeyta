import request from 'supertest';
import { createApp } from '../../src/app';

describe('Storage Integration', () => {
  const app = createApp();
  let token: string;
  let userId: string;
  let uploadedPath: string;
  let uploadedBucket: string;

  beforeAll(async () => {
    const reg = await request(app).post('/auth/register').send({
      name: 'Storage User',
      phone: '01090000001',
      governorate: 'القاهرة',
    });
    token = reg.body.data.token;
    userId = reg.body.data.user.id;
  });

  it('POST /storage/upload - profiles public', async () => {
    const res = await request(app)
      .post('/storage/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('bucket', 'profiles')
      .field('documentId', userId)
      .attach('file', Buffer.from('fake-image-data'), 'avatar.jpg');
    expect(res.status).toBe(200);
    expect(res.body.data.url).toContain('profiles');
    expect(res.body.data.path).toBeDefined();
    uploadedPath = res.body.data.path;
    uploadedBucket = res.body.data.bucket;
  });

  it('POST /storage/upload - private bucket (request)', async () => {
    const res = await request(app)
      .post('/storage/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('bucket', 'request')
      .field('documentId', userId)
      .attach('file', Buffer.from('private data'), 'doc.png');
    expect(res.status).toBe(200);
    expect(res.body.data.bucket).toBe('request');
  });

  it('POST /storage/upload - invalid bucket', async () => {
    const res = await request(app)
      .post('/storage/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('bucket', 'invalid_bucket')
      .field('documentId', userId)
      .attach('file', Buffer.from('x'), 'x.jpg');
    expect(res.status).toBe(400);
  });

  it('POST /storage/upload - missing file', async () => {
    const res = await request(app)
      .post('/storage/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('bucket', 'profiles')
      .field('documentId', userId);
    expect(res.status).toBe(400);
  });

  it('POST /storage/upload - missing documentId', async () => {
    const res = await request(app)
      .post('/storage/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('bucket', 'profiles')
      .attach('file', Buffer.from('x'), 'x.jpg');
    expect(res.status).toBe(400);
  });

  it('GET /storage/:bucket/:path - memory fallback', async () => {
    expect(uploadedPath).toBeDefined();
    const res = await request(app).get(`/storage/${uploadedBucket}/${uploadedPath}`);
    expect([200, 302]).toContain(res.status);
    if (res.status === 200) {
      expect(res.headers['content-type']).toMatch(/image/);
    }
  });

  it('GET /storage/:bucket/:path - invalid bucket', async () => {
    const res = await request(app).get('/storage/invalid_bucket/some/path.jpg');
    expect(res.status).toBe(400);
  });

  it('GET /storage/:bucket/:path - not found', async () => {
    const res = await request(app).get('/storage/profiles/nonexistent/123.jpg');
    // With Supabase configured, public buckets redirect (302) even if file missing (mock), else 404
    expect([302, 404]).toContain(res.status);
  });

  it('DELETE /storage/:bucket/:path - success', async () => {
    const upload = await request(app)
      .post('/storage/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('bucket', 'task_images')
      .field('documentId', userId)
      .attach('file', Buffer.from('to delete'), 'todelete.jpg');
    const path = upload.body.data.path;
    const del = await request(app)
      .delete(`/storage/task_images/${path}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    expect(del.body.data.deleted).toBe(true);
  });

  it('DELETE /storage/:bucket/:path - not found', async () => {
    const res = await request(app)
      .delete('/storage/profiles/nonexistent.jpg')
      .set('Authorization', `Bearer ${token}`);
    // With Supabase fallback, delete may return 200 even if not found (supabase returns success)
    expect([200, 404]).toContain(res.status);
  });

  it('POST /storage/upload - without auth fails', async () => {
    const res = await request(app)
      .post('/storage/upload')
      .field('bucket', 'profiles')
      .field('documentId', 'x')
      .attach('file', Buffer.from('x'), 'x.jpg');
    expect(res.status).toBe(401);
  });
});
