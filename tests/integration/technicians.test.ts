import request from 'supertest';
import { createApp } from '../../src/app';

describe('Technicians Integration', () => {
  const app = createApp();
  let token: string;
  let techPhone: string;

  beforeAll(async () => {
    const reg = await request(app).post('/auth/technicians/register').send({
      fullName: 'Tech Coverage',
      phone: '01090000005',
      governorate: 'الجيزة',
      specialty: 'كهرباء',
      area: 'الدقي',
    });
    token = reg.body.data.token;
    techPhone = reg.body.data.technician.phone;
  });

  it('GET /technicians?phone= - found', async () => {
    const res = await request(app).get(`/technicians?phone=${techPhone}`);
    expect(res.status).toBe(200);
    expect(res.body.data.fullName).toBe('Tech Coverage');
  });

  it('GET /technicians?phone= - variants', async () => {
    const res = await request(app).get('/technicians?phone=01090000005');
    expect(res.status).toBe(200);
  });

  it('GET /technicians?phone= - not found', async () => {
    const res = await request(app).get('/technicians?phone=01000000000');
    expect(res.status).toBe(404);
  });

  it('GET /technicians - list all', async () => {
    const res = await request(app).get('/technicians');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /technicians/:phone - success', async () => {
    const res = await request(app).get(`/technicians/${techPhone}`);
    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe(techPhone);
  });

  it('GET /technicians/:phone - not found', async () => {
    const res = await request(app).get('/technicians/+201000000099');
    expect(res.status).toBe(404);
  });

  it('PUT /technicians/:phone - owner update', async () => {
    const res = await request(app)
      .put(`/technicians/${techPhone}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ area: 'المهندسين' });
    expect(res.status).toBe(200);
    expect(res.body.data.area).toBe('المهندسين');
  });

  it('PUT /technicians/:phone - forbidden for other user', async () => {
    const other = await request(app).post('/auth/register').send({
      name: 'Other',
      phone: '01090000006',
      governorate: 'القاهرة',
    });
    const otherToken = other.body.data.token;
    const res = await request(app)
      .put(`/technicians/${techPhone}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ area: 'x' });
    expect(res.status).toBe(403);
  });

  it('GET /technicians/:phone/wallet', async () => {
    const res = await request(app)
      .get(`/technicians/${techPhone}/wallet`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.walletBalance).toBeDefined();
  });
});
