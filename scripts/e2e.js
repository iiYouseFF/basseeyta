const { createApp } = require('../dist/app.js');
const request = require('supertest');
const app = createApp();

async function e2e() {
  console.log('=== E2E Happy Path (12 steps) ===');
  // 1. Customer registers → JWT
  const custReg = await request(app).post('/auth/register').send({ name: 'E2E Cust', phone: '01000000001', governorate: 'القاهرة', city: 'القاهرة', region: 'مصر الجديدة' });
  console.log('1. Customer register', custReg.status, custReg.body.success);
  const custToken = custReg.body.data.token;
  const custId = custReg.body.data.user.id;
  const custPhone = custReg.body.data.user.phone;

  // 2. Customer uploads image → Storage URL
  const upload = await request(app).post('/storage/upload').set('Authorization', `Bearer ${custToken}`).field('bucket', 'request').field('documentId', custId).attach('file', Buffer.from('fake image'), 'test.jpg');
  console.log('2. Upload', upload.status, upload.body.data?.url?.slice(0,50));
  const imageUrl = upload.body.data?.url || 'https://cdn.test/image.jpg';

  // 3. Customer creates service request with image
  const reqCreate = await request(app).post('/service-requests').set('Authorization', `Bearer ${custToken}`).send({
    userId: custId, userName: 'E2E Cust', userPhone: custPhone, userGovernorate: 'القاهرة', title: 'E2E سباكة', description: 'E2E desc', budget: '700', serviceType: 'plumbing', images: [imageUrl]
  });
  console.log('3. Create request', reqCreate.status, reqCreate.body.data?.id);
  const requestId = reqCreate.body.data.id;

  // 4. Technician registers → JWT
  const techReg = await request(app).post('/auth/technicians/register').send({ fullName: 'E2E Tech', phone: '01000000002', governorate: 'القاهرة', specialty: 'سباكة', area: 'مصر الجديدة' });
  console.log('4. Tech register', techReg.status);
  const techToken = techReg.body.data.token;
  const techPhone = techReg.body.data.technician.phone;

  // 5. Technician GETs pending requests in governorate
  const pending = await request(app).get('/service-requests?status=pending&governorate=القاهرة');
  console.log('5. Pending', pending.status, pending.body.data.length);

  // 6. Technician submits offer
  const offerRes = await request(app).post(`/service-requests/${requestId}/offers`).set('Authorization', `Bearer ${techToken}`).send({ price: 650, message: 'جاهز', arrivalTime: 'خلال ساعة' });
  console.log('6. Offer', offerRes.status, offerRes.body.data?.id);
  const offerId = offerRes.body.data.id;

  // 7. Customer GETs offers, accepts one → chat room created, appointment created, other offers rejected
  const offers = await request(app).get(`/service-requests/${requestId}/offers`);
  console.log('7a. Get offers', offers.status, offers.body.data.length);
  const accept = await request(app).patch(`/offers/${offerId}`).set('Authorization', `Bearer ${custToken}`).send({ status: 'accepted' });
  console.log('7b. Accept', accept.status, accept.body.data?.offer?.status, 'chatRoom', !!accept.body.data?.chatRoom);

  // 8. Chat messages sent (REST + Socket.io – we test REST)
  const rooms = await request(app).get(`/chat/rooms?userId=${custId}`).set('Authorization', `Bearer ${custToken}`);
  const roomId = rooms.body.data[0]?.id;
  console.log('8a. Chat rooms', rooms.status, roomId);
  const msg1 = await request(app).post(`/chat/rooms/${roomId}/messages`).set('Authorization', `Bearer ${custToken}`).send({ senderId: custId, senderType: 'user', message: 'مرحبا' });
  console.log('8b. Message 1', msg1.status);
  const msg2 = await request(app).post(`/chat/rooms/${roomId}/messages`).set('Authorization', `Bearer ${techToken}`).send({ senderId: techPhone, senderType: 'technician', message: 'أهلا' });
  console.log('8c. Message 2', msg2.status);

  // 9. Customer pays → payment_logs, transactions, wallet credited, request.isPaid = true
  const walletBefore = await request(app).get(`/technicians/${techPhone}/wallet`).set('Authorization', `Bearer ${custToken}`);
  console.log('9a. Wallet before', walletBefore.body.data.walletBalance);
  const pay = await request(app).post('/payments').set('Authorization', `Bearer ${custToken}`).send({ userId: custId, requestId, technicianId: techPhone, amount: 650, paymentMethod: 'card' });
  console.log('9b. Pay', pay.status, pay.body.data?.paymentLog?.status);
  const walletAfter = await request(app).get(`/technicians/${techPhone}/wallet`).set('Authorization', `Bearer ${custToken}`);
  console.log('9c. Wallet after', walletAfter.body.data.walletBalance);
  const reqAfter = await request(app).get(`/service-requests/${requestId}`);
  console.log('9d. Request isPaid', reqAfter.body.data.isPaid);

  // 10. Technician reviews completed → rating recalculates (we do customer reviews tech)
  const review = await request(app).post('/reviews').set('Authorization', `Bearer ${custToken}`).send({ requestId, reviewerId: custId, technicianId: techPhone, rating: 5, comment: 'ممتاز' });
  console.log('10. Review', review.status, review.body.data?.rating);
  const revGet = await request(app).get(`/reviews?technicianId=${encodeURIComponent(techPhone)}`);
  console.log('10b. Reviews avg', revGet.body.data.avg);

  // 11. Push notification received (check inbox)
  const notifs = await request(app).get(`/notifications?userId=${techPhone}`).set('Authorization', `Bearer ${techToken}`);
  console.log('11. Notifications for tech', notifs.status, notifs.body.data.length);

  // 12. Search returns the request/technician
  const search = await request(app).get(`/search?q=سباكة&governorate=القاهرة&limit=10`);
  console.log('12. Search', search.status, search.body.data.length);

  console.log('=== E2E Done ===');
  if (pay.status===201 && reqAfter.body.data.isPaid && walletAfter.body.data.walletBalance > walletBefore.body.data.walletBalance) {
    console.log('E2E PASSED');
    process.exit(0);
  } else {
    console.log('E2E FAILED');
    process.exit(1);
  }
}

e2e().catch(e=>{console.error(e); process.exit(1)});
