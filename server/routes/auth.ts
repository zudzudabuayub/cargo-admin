import { Router } from 'express';
import { get, insert, nowIso, run } from '../db.js';
import { audit, token, verifyPassword } from '../domain.js';
import { bad, h, requireAdmin, str } from '../http.js';

const r = Router();

r.post(
  '/login',
  h((req) => {
    const email = str(req.body?.email)?.toLowerCase();
    const password = str(req.body?.password);
    const u = email ? get<any>('SELECT * FROM users WHERE email = ?', email) : undefined;
    if (!u || !password || !verifyPassword(password, u.passwordHash)) throw bad('Неверный email или пароль');
    const t = token();
    insert('sessions', { token: t, kind: 'admin', subjectId: u.id, createdAt: nowIso() });
    audit({ id: u.id, name: u.name }, 'auth.login');
    return { token: t, user: { id: u.id, name: u.name, email: u.email, role: u.role, color: u.color, warehouseId: u.warehouseId } };
  }),
);

r.get('/me', requireAdmin, h((req) => req.user));

r.post(
  '/logout',
  requireAdmin,
  h((req) => {
    const t = req.headers.authorization?.slice(7);
    if (t) run('DELETE FROM sessions WHERE token = ?', t);
    return { ok: true };
  }),
);

export default r;
