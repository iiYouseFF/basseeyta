import { Request, Response } from 'express';
import { z } from 'zod';
import axios from 'axios';
import { sendSuccess, sendError } from '../../utils/response';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

const N8N_BASE = env.N8N_BASE_URL;
const TIMEOUT = env.N8N_TIMEOUT_MS;

// ── Validation Schemas ─────────────────────────────────────────────

const technicianReportSchema = z.object({
  technician_name: z.string().min(1, 'technician_name is required'),
  appliance_type: z.string().min(1, 'appliance_type must not be empty'),
  model: z.string().min(1, 'model must not be empty'),
  problem_description: z.string().min(1, 'problem_description is required'),
  solution_notes: z.string().min(1, 'solution_notes is required'),
  cost: z
    .number({ invalid_type_error: 'cost must be a number' })
    .nonnegative('cost must be non-negative'),
});

const chatSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
  chatInput: z.string().min(1, 'chatInput must not be empty'),
});

// ── Handlers ───────────────────────────────────────────────────────

export async function submitTechnicianReport(req: Request, res: Response) {
  const parsed = technicianReportSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', parsed.error.errors);
  }

  try {
    const { data } = await axios.post(
      `${N8N_BASE}${env.N8N_TECHNICIAN_WEBHOOK}`,
      parsed.data,
      { timeout: TIMEOUT },
    );

    if (data?.status === 'success') {
      return sendSuccess(res, data, 'Report submitted successfully', 201);
    }

    return sendSuccess(res, data);
  } catch (err: any) {
    return handleProxyError(err, res, 'technician-report');
  }
}

export async function chatWithUncleBaseet(req: Request, res: Response) {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', parsed.error.errors);
  }

  try {
    const { data } = await axios.post(
      `${N8N_BASE}${env.N8N_CHAT_WEBHOOK}`,
      parsed.data,
      { timeout: TIMEOUT },
    );

    const output = data?.output ?? data?.text ?? data?.message ?? data;
    return sendSuccess(res, { output });
  } catch (err: any) {
    return handleProxyError(err, res, 'chat');
  }
}

// ── Shared Error Mapper ────────────────────────────────────────────

function handleProxyError(err: any, res: Response, context: string) {
  logger.error(`n8n proxy error [${context}]`, {
    message: err.message,
    code: err.code,
    status: err.response?.status,
  });

  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
    return sendError(res, 504, 'GATEWAY_TIMEOUT', {
      code: 'GATEWAY_TIMEOUT',
      message: `n8n workflow for "${context}" did not respond in time`,
    });
  }

  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    return sendError(res, 502, 'BAD_GATEWAY', {
      code: 'BAD_GATEWAY',
      message: `n8n backend unreachable for "${context}"`,
    });
  }

  const upstreamStatus = err.response?.status;
  if (upstreamStatus) {
    return sendError(res, upstreamStatus, 'UPSTREAM_ERROR', {
      code: 'UPSTREAM_ERROR',
      message: `n8n returned HTTP ${upstreamStatus}`,
      detail: err.response?.data,
    });
  }

  return sendError(res, 502, 'BAD_GATEWAY', {
    code: 'BAD_GATEWAY',
    message: err.message || 'Unknown proxy error',
  });
}
