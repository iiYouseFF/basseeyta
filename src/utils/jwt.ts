import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import crypto from 'crypto';

export interface JwtPayload {
  sub: string; // userId or adminId
  phone: string; // phone or email for admin
  userType: 'user' | 'technician' | 'admin';
  jti: string;
  email?: string;
  isAdmin?: boolean;
  iat?: number;
  exp?: number;
}

export function signJwt(payload: Omit<JwtPayload, 'jti' | 'iat' | 'exp'>): { token: string; jti: string } {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ ...payload, jti }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as any,
  });
  return { token, jti };
}

export function verifyJwt(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

export function decodeJwt(token: string): JwtPayload | null {
  try {
    return jwt.decode(token) as JwtPayload;
  } catch {
    return null;
  }
}
