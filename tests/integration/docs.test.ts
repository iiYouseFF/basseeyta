import request from 'supertest';
import { createApp } from '../../src/app';

describe('Docs', () => {
  const app = createApp();

  it('GET /api-docs.json returns 88 endpoints', async () => {
    const res = await request(app).get('/api-docs.json');
    expect(res.status).toBe(200);
    expect(res.body.totalEndpoints).toBe(88);
    expect(res.body.groups.length).toBeGreaterThan(10);
    expect(res.body.version).toBe('1.0.0');
  });

  it('GET /api returns summary', async () => {
    const res = await request(app).get('/api');
    expect(res.status).toBe(200);
    expect(res.body.docs).toBe('/api-docs');
    expect(res.body.totalEndpoints).toBe(88);
  });

  it('GET / returns HTML docs', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Basita');
    expect(res.text).toContain('/health');
  });

  it('GET /api-docs returns HTML', async () => {
    const res = await request(app).get('/api-docs');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Basita');
  });
});
