import { Router } from 'express';
import { submitTechnicianReport, chatWithUncleBaseet } from './n8n.handlers';

const router = Router();

// POST /api/technician/report  →  n8n /webhook/technician-report
router.post('/technician/report', submitTechnicianReport);

// POST /api/chat              →  n8n /webhook/chat
router.post('/chat', chatWithUncleBaseet);

export default router;
