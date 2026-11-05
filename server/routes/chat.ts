// Чаты: клиенты, водители, склады, команда. Real-time через SSE (/api/stream).
import { Router } from 'express';
import { all, get, getSetting, run } from '../db.js';
import { clientBalance, ensureConversation, postMessage } from '../domain.js';
import { bad, h, int, notFound, str } from '../http.js';
import { publish, subscribe } from '../realtime.js';

const r = Router();

const DEFAULT_TEMPLATES = [
  { title: 'Адрес склада', text: 'Адрес склада в Китае указан в вашем профиле в приложении. Обязательно добавляйте ваш код клиента к имени получателя.' },
  { title: 'Сроки', text: 'Срок доставки автотранспортом — 14–20 дней с момента отправки со склада в Китае. Авиа — 4–7 дней.' },
  { title: 'Тарифы', text: 'Обычный товар — $2.8/кг, электроника — $3.6/кг, косметика — $3.9/кг. Лёгкие объёмные грузы считаем по объёму.' },
  { title: 'Готово к выдаче', text: 'Ваша посылка готова к выдаче. Склад работает Пн–Сб 09:00–18:00, Вс 10:00–15:00.' },
  { title: 'Запрет', text: 'Не принимаем: жидкости в стекле, аккумуляторы отдельно, оружие, лекарства без документов, легковоспламеняющиеся вещества.' },
  { title: 'Приветствие', text: 'Ассалому алейкум! Чем можем помочь?' },
];

r.get('/stream', (req, res) => subscribe(res, 'admin'));

r.get(
  '/conversations',
  h((req) => {
    const where: string[] = [];
    const p: unknown[] = [];
    const kind = str(req.query.kind);
    if (kind === 'unread') where.push('cv.unreadAdmin > 0');
    else if (kind) {
      where.push('cv.kind = ?');
      p.push(kind);
    }
    const q = str(req.query.q);
    if (q) {
      where.push('(cv.title LIKE ? OR c.code LIKE ? OR c.phone LIKE ?)');
      p.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const items = all(
      `SELECT cv.*, c.code clientCode, c.phone clientPhone, c.color clientColor, d.phone driverPhone, d.color driverColor, w.code warehouseCode
       FROM conversations cv LEFT JOIN clients c ON c.id = cv.clientId LEFT JOIN drivers d ON d.id = cv.driverId LEFT JOIN warehouses w ON w.id = cv.warehouseId
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY cv.pinned DESC, cv.lastMessageAt DESC NULLS LAST LIMIT 200`,
      ...p,
    );
    const counts = Object.fromEntries(all<{ kind: string; n: number }>('SELECT kind, COUNT(*) n FROM conversations GROUP BY kind').map((x) => [x.kind, x.n]));
    counts.unread = get<{ n: number }>('SELECT COUNT(*) n FROM conversations WHERE unreadAdmin > 0')!.n;
    return { items, counts };
  }),
);

r.post(
  '/conversations',
  h((req) => {
    const b = req.body ?? {};
    const kind = str(b.kind) as 'client' | 'driver' | 'warehouse' | 'team';
    if (!kind) throw bad('Укажите тип чата');
    const ref = int(b.clientId) ?? int(b.driverId) ?? int(b.warehouseId) ?? null;
    return { id: ensureConversation(kind, ref) };
  }),
);

r.get(
  '/conversations/:id',
  h((req) => {
    const cv = get<any>('SELECT * FROM conversations WHERE id = ?', int(req.params.id));
    if (!cv) throw notFound('Чат');
    const messages = all('SELECT * FROM messages WHERE conversationId = ? ORDER BY createdAt, id', cv.id);
    let context: any = null;
    if (cv.clientId) {
      const c = get<any>(`SELECT c.*, w.name warehouseName FROM clients c LEFT JOIN warehouses w ON w.id = c.warehouseId WHERE c.id = ?`, cv.clientId);
      const parcels = all(
        `SELECT p.id, p.trackNumber, p.status, p.description, p.weightKg, p.price, p.paid, s.code shipmentCode, s.id shipmentId, s.etaAt
         FROM parcels p LEFT JOIN shipments s ON s.id = p.shipmentId WHERE p.clientId = ? AND p.status != 'delivered' ORDER BY p.createdAt DESC LIMIT 12`,
        cv.clientId,
      );
      context = { type: 'client', client: { ...c, balance: clientBalance(c.id) }, parcels };
    } else if (cv.driverId) {
      const d = get<any>('SELECT * FROM drivers WHERE id = ?', cv.driverId);
      const s = get<any>(`SELECT s.*, t.plate, t.model FROM shipments s LEFT JOIN trucks t ON t.id = s.truckId WHERE s.driverId = ? AND s.status NOT IN ('completed') ORDER BY s.id DESC LIMIT 1`, cv.driverId);
      context = { type: 'driver', driver: d, shipment: s };
    } else if (cv.warehouseId) {
      context = { type: 'warehouse', warehouse: get('SELECT * FROM warehouses WHERE id = ?', cv.warehouseId) };
    }
    return { ...cv, messages, context };
  }),
);

r.post(
  '/conversations/:id/messages',
  h((req) => {
    const id = int(req.params.id)!;
    const cv = get('SELECT id FROM conversations WHERE id = ?', id);
    if (!cv) throw notFound('Чат');
    const text = str(req.body?.text);
    if (!text) throw bad('Пустое сообщение');
    const msg = postMessage(id, text, { senderType: 'admin', senderId: req.user!.id, senderName: req.user!.name, meta: req.body?.meta });
    run('UPDATE conversations SET unreadAdmin = 0 WHERE id = ?', id);
    return msg;
  }),
);

r.post(
  '/conversations/:id/read',
  h((req) => {
    run('UPDATE conversations SET unreadAdmin = 0 WHERE id = ?', int(req.params.id));
    publish('admin', 'read', { conversationId: int(req.params.id) });
    return { ok: true };
  }),
);

r.patch(
  '/conversations/:id',
  h((req) => {
    const b = req.body ?? {};
    if (b.pinned !== undefined) run('UPDATE conversations SET pinned = ? WHERE id = ?', b.pinned ? 1 : 0, int(req.params.id));
    if (b.status !== undefined) run('UPDATE conversations SET status = ? WHERE id = ?', b.status, int(req.params.id));
    return { ok: true };
  }),
);

r.get('/chat/templates', h(() => getSetting('chatTemplates', DEFAULT_TEMPLATES)));

export default r;
