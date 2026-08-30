import { createApp } from '../../src/app';
import request from 'supertest';

describe('Middleware', () => {
  const app = createApp();

  it('global rate limit headers', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['ratelimit-limit'] || res.headers['x-ratelimit-limit'] || res.headers['rate-limit']).toBeDefined();
  });

  it('helmet headers', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-dns-prefetch-control']).toBeDefined();
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('X-Request-Id header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('X-Request-Id passthrough', async () => {
    const res = await request(app).get('/health').set('X-Request-Id', 'test-123');
    expect(res.headers['x-request-id']).toBe('test-123');
  });

  it('cors header', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://example.com');
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  it('error handler - invalid json', async () => {
    const res = await request(app)
      .post('/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"invalid": json}');
    expect([400, 500]).toContain(res.status);
  });

  it('auth middleware - missing header', async () => {
    const res = await request(app).get('/users/me');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Missing/i);
  });

  it('auth middleware - malformed header', async () => {
    const res = await request(app).get('/users/me').set('Authorization', 'NotBearer token');
    expect(res.status).toBe(401);
  });
});
