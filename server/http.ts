import type { NextFunction, Request, Response } from 'express';
import { get } from './db.js';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export const bad = (msg: string) => new HttpError(400, msg);
export const notFound = (what = 'Запись') => new HttpError(404, `${what} не найдена`);

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
  color: string;
  warehouseId: number | null;
  phone: string | null;
}
export interface ClientUser {
  id: number;
  code: string;
  name: string;
  phone: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AdminUser;
    client?: ClientUser;
  }
}

/** Оборачивает синхронный обработчик: возвращённое значение отправляется как JSON. */
export const h =
  (fn: (req: Request, res: Response) => unknown) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const r = fn(req, res);
      if (r !== undefined && !res.headersSent) res.json(r);
    } catch (e) {
      next(e);
    }
  };

function tokenFrom(req: Request) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  if (typeof req.query.token === 'string') return req.query.token;
  return null;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const t = tokenFrom(req);
  const s = t ? get<{ subjectId: number }>(`SELECT subjectId FROM sessions WHERE token = ? AND kind = 'admin'`, t) : undefined;
  const user = s ? get<AdminUser>('SELECT id, name, email, role, color, warehouseId, phone FROM users WHERE id = ?', s.subjectId) : undefined;
  if (!user) return res.status(401).json({ error: 'Требуется вход в систему' });
  req.user = user;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Недостаточно прав' });
    next();
  };
}

export function requireClient(req: Request, res: Response, next: NextFunction) {
  const t = tokenFrom(req);
  const s = t ? get<{ subjectId: number }>(`SELECT subjectId FROM sessions WHERE token = ? AND kind = 'client'`, t) : undefined;
  const client = s ? get<ClientUser>('SELECT id, code, name, phone FROM clients WHERE id = ?', s.subjectId) : undefined;
  if (!client) return res.status(401).json({ error: 'Требуется вход' });
  req.client = client;
  next();
}

export const int = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
};
export const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
export const actorOf = (req: Request) => ({ id: req.user?.id, name: req.user?.name ?? 'Система' });
