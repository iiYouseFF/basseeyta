import request from 'supertest';
import { createApp } from '../../src/app';

describe('Family Integration', () => {
  const app = createApp();
  let token: string;
  let userId: string;

  beforeAll(async () => {
    const reg = await request(app).post('/auth/register').send({
      name: 'Family User',
      phone: '01090000002',
      governorate: 'القاهرة',
    });
    token = reg.body.data.token;
    userId = reg.body.data.user.id;
  });

  it('GET /users/:uid/family-members initially empty', async () => {
    const res = await request(app)
      .get(`/users/${userId}/family-members`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /users/:uid/family-members - add member', async () => {
    const res = await request(app)
      .post(`/users/${userId}/family-members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ memberName: 'Ahmed', memberPhone: '01011112222', relationship: 'brother' });
    expect(res.status).toBe(201);
    expect(res.body.data.memberName).toBe('Ahmed');
  });

  it('POST /users/:uid/family-members - invalid data', async () => {
    const res = await request(app)
      .post(`/users/${userId}/family-members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ memberPhone: '010' });
    expect(res.status).toBe(400);
  });

  it('GET /users/:uid/family-members after add', async () => {
    const res = await request(app)
      .get(`/users/${userId}/family-members`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.length).toBe(1);
  });

  it('DELETE /users/:uid/family-members/:id', async () => {
    const list = await request(app)
      .get(`/users/${userId}/family-members`)
      .set('Authorization', `Bearer ${token}`);
    const id = list.body.data[0].id;
    const del = await request(app)
      .delete(`/users/${userId}/family-members/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    expect(del.body.data.deleted).toBe(true);
  });

  it('DELETE /users/:uid/family-members/:id - not found', async () => {
    const res = await request(app)
      .delete(`/users/${userId}/family-members/nonexistent`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('POST /families/join - create new family', async () => {
    const res = await request(app)
      .post('/families/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '01090000002', familyCode: 'FAM123' });
    expect(res.status).toBe(200);
    expect(res.body.data.family.code).toBe('FAM123');
  });

  it('POST /families/join - invalid data', async () => {
    const res = await request(app)
      .post('/families/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '010' });
    expect(res.status).toBe(400);
  });

  it('GET /families/:code - exists', async () => {
    const res = await request(app)
      .get('/families/FAM123')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.family.code).toBe('FAM123');
  });

  it('GET /families/:code - not found', async () => {
    const res = await request(app)
      .get('/families/NONEXIST')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('POST /families/join - add member to existing family', async () => {
    const res = await request(app)
      .post('/families/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '01099998888', familyCode: 'FAM123' });
    expect(res.status).toBe(200);
    expect(res.body.data.members.length).toBeGreaterThan(0);
  });
});
