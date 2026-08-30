import request from 'supertest';
import { createApp } from '../../src/app';

describe('Health', () => {
  const app = createApp();

  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe('1.0.0');
    expect(res.body.uptime).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });

  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET unknown route returns 404', async () => {
    const res = await request(app).get('/unknown-route-xyz');
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  it('POST /jobs/:name without auth fails', async () => {
    const res = await request(app).post('/jobs/dailyReset');
    expect(res.status).toBe(401);
  });

  it('POST /jobs/:name with invalid cron secret fails', async () => {
    const res = await request(app)
      .post('/jobs/dailyReset')
      .set('Authorization', 'Bearer wrong_secret');
    expect(res.status).toBe(401);
  });

  it('POST /jobs/:name with valid secret', async () => {
    const { env } = require('../../src/config/env');
    const res = await request(app)
      .post('/jobs/dailyReset')
      .set('Authorization', `Bearer ${env.CRON_SECRET}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /jobs/:name unknown job', async () => {
    const { env } = require('../../src/config/env');
    const res = await request(app)
      .post('/jobs/unknownJob')
      .set('Authorization', `Bearer ${env.CRON_SECRET}`);
    expect(res.status).toBe(400);
  });

  it('POST /jobs/expireOffers', async () => {
    const { env } = require('../../src/config/env');
    const res = await request(app)
      .post('/jobs/expireOffers')
      .set('Authorization', `Bearer ${env.CRON_SECRET}`);
    expect(res.status).toBe(200);
  });
});
