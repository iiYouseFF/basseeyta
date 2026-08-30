import request from 'supertest';
import { createApp } from '../../src/app';

describe('Appointments Integration', () => {
  const app = createApp();

  it('Create appointment, update status lifecycle', async () => {
    const cust = await request(app).post('/auth/register').send({
      name: 'Appt Cust',
      phone: '01099988877',
      governorate: 'القاهرة',
    });
    const tech = await request(app).post('/auth/technicians/register').send({
      fullName: 'Appt Tech',
      phone: '01099988888',
      governorate: 'القاهرة',
    });
    const custToken = cust.body.data.token;
    const custId = cust.body.data.user.id;
    const techPhone = tech.body.data.technician.phone;

    const create = await request(app)
      .post('/appointments')
      .set('Authorization', `Bearer ${custToken}`)
      .send({
        requestId: 'req-123',
        clientId: custId,
        technicianId: techPhone,
        serviceType: 'plumbing',
        serviceName: 'سباكة',
        appointmentDate: '2026-08-30',
      });
    expect(create.status).toBe(201);
    const apptId = create.body.data.id;

    const patch = await request(app)
      .patch(`/appointments/${apptId}/status`)
      .set('Authorization', `Bearer ${custToken}`)
      .send({ status: 'confirmed' });
    expect(patch.body.data.status).toBe('confirmed');

    const loc = await request(app)
      .patch(`/appointments/${apptId}/location`)
      .set('Authorization', `Bearer ${custToken}`)
      .send({ role: 'technician', latitude: 30.0, longitude: 31.0 });
    expect(loc.body.data.technicianLatitude).toBe(30.0);
  });
});
