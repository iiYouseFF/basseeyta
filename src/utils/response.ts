import { Response } from 'express';

export function sendSuccess(res: Response, data: any, message?: string, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    message: message || undefined,
  });
}

export function sendError(res: Response, statusCode: number, message: string, errors?: any) {
  return res.status(statusCode).json({
    success: false,
    message,
    errors: errors || undefined,
  });
}

export function sendPaginated(res: Response, data: any[], total: number, page: number, limit: number) {
  return res.json({
    success: true,
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
}
