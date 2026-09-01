import { Request, Response, NextFunction } from 'express';
import { verifyJwt } from '../utils/jwt';
import { redisExists } from '../config/redis';
import { sendError } from '../utils/response';

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 401, 'Missing or invalid Authorization header');
  }
  const token = authHeader.slice(7);
  if (!token) return sendError(res, 401, 'Missing token');

  try {
    const payload = verifyJwt(token);
    // Check blacklist
    const blacklisted = await redisExists(`blacklist:${payload.jti}`);
    if (blacklisted) {
      return sendError(res, 401, 'Token revoked');
    }
    req.user = {
      id: payload.sub,
      phone: payload.phone,
      userType: payload.userType,
      jti: payload.jti,
      email: (payload as any).email,
      isAdmin: payload.userType === 'admin' || !!(payload as any).isAdmin,
    };
    next();
  } catch (e: any) {
    if (e.name === 'TokenExpiredError') {
      return sendError(res, 401, 'Token expired');
    }
    return sendError(res, 401, 'Invalid token');
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = verifyJwt(token);
      req.user = {
        id: payload.sub,
        phone: payload.phone,
        userType: payload.userType,
        jti: payload.jti,
        email: (payload as any).email,
        isAdmin: payload.userType === 'admin' || !!(payload as any).isAdmin,
      };
    } catch {}
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return sendError(res, 401, 'Not authenticated');
  const isAdmin = req.user.userType === 'admin' || !!req.user.isAdmin;
  if (!isAdmin) return sendError(res, 403, 'Admin access required');
  next();
}
