import request from 'supertest';
import { createApp } from '../../src/app';

describe('AI Integration', () => {
  const app = createApp();
  let token: string;

  beforeAll(async () => {
    const reg = await request(app).post('/auth/register').send({
      name: 'AI User',
      phone: '01090000008',
      governorate: 'القاهرة',
    });
    token = reg.body.data.token;
  });

  it('POST /ai/assistant - mock fallback', async () => {
    const res = await request(app)
      .post('/ai/assistant')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'كيف أصلح حنفية؟', userContext: { governorate: 'القاهرة' } });
    expect(res.status).toBe(200);
    expect(res.body.data.reply).toBeDefined();
    expect(typeof res.body.data.reply).toBe('string');
  });

  it('POST /ai/assistant - missing query', async () => {
    const res = await request(app)
      .post('/ai/assistant')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('POST /ai/assistant - without auth', async () => {
    const res = await request(app).post('/ai/assistant').send({ query: 'test' });
    expect(res.status).toBe(401);
  });

  it('POST /ai/assistant - handles english', async () => {
    const res = await request(app)
      .post('/ai/assistant')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'How to fix AC?' });
    expect(res.status).toBe(200);
    expect(res.body.data.reply).toBeDefined();
  });
});
