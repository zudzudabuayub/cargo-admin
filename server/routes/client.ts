// API для мобильного приложения клиента (iOS / Android / PWA).
// Авторизация по номеру телефона + SMS-код. Документация: docs/CLIENT_API.md
import { Router } from 'express';
import crypto from 'node:crypto';
import { all, get, insert, nowIso, run } from '../db.js';
import { calcPrice, chinaAddressFor, clientBalance, ensureConversation, notify, PARCEL_STATUS, postMessage, round2, SHIPMENT_STATUS, token, usdRate, type Tariff } from '../domain.js';
import { bad, h, HttpError, int, notFound, requireClient, str } from '../http.js';
import { subscribe } from '../realtime.js';
import { nextClientCode } from './crm.js';

const r = Router();
const isProd = process.env.NODE_ENV === 'production';
const normPhone = (p: string) => {
  const d = p.replace(/\D/g, '');
  const n = d.length === 9 ? `992${d}` : d;
  return `+${n.slice(0, 3)} ${n.slice(3, 5)} ${n.slice(5, 8)} ${n.slice(8, 10)} ${n.slice(10, 12)}`.trim();
};

// ---------- Авторизация ----------
r.post(
  '/auth/request-code',
  h((req) => {
    const raw = str(req.body?.phone);
    if (!raw || raw.replace(/\D/g, '').length < 9) throw bad('Введите номер телефона');
    const phone = normPhone(raw);
    const code = String(crypto.randomInt(1000, 9999));
    run(
      `INSERT INTO otp_codes (phone, code, expiresAt, attempts) VALUES (?, ?, ?, 0)
       ON CONFLICT(phone) DO UPDATE SET code = excluded.code, expiresAt = excluded.expiresAt, attempts = 0`,
      phone,
      code,
      new Date(Date.now() + 5 * 60000).toISOString(),
    );
    // TODO: отправка SMS через провайдера (например, OsonSMS) — см. docs/CLIENT_API.md
    const exists = !!get('SELECT id FROM clients WHERE phone = ?', phone);
    return { sent: true, phone, registered: exists, ...(isProd ? {} : { devCode: code }) };
  }),
);

r.post(
  '/auth/verify',
  h((req) => {
    const phone = normPhone(str(req.body?.phone) ?? '');
    const code = str(req.body?.code);
    const otp = get<any>('SELECT * FROM otp_codes WHERE phone = ?', phone);
    if (!otp || otp.expiresAt < nowIso()) throw bad('Код истёк, запросите новый');
    if (otp.attempts >= 5) throw bad('Слишком много попыток');
    if (otp.code !== code) {
      run('UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = ?', phone);
      throw bad('Неверный код');
    }
    let client = get<any>('SELECT * FROM clients WHERE phone = ?', phone);
    if (!client) {
      const name = str(req.body?.name);
      if (!name) throw new HttpError(404, 'needs_registration');
      const wh = get<any>('SELECT * FROM warehouses WHERE id = ? AND role = ?', int(req.body?.warehouseId), 'destination') ?? get<any>(`SELECT * FROM warehouses WHERE code = 'DU'`);
      const prefix = { DU: 'DSH', KH: 'KHJ', KL: 'KLB', BK: 'BKT' }[wh.code as string] ?? 'CL';
      const id = insert('clients', { code: nextClientCode(prefix), name, phone, cityId: wh.cityId, warehouseId: wh.id, type: 'individual', status: 'active', discount: 0, source: 'Приложение', color: '#6B4EFF', createdAt: nowIso() });
      client = get('SELECT * FROM clients WHERE id = ?', id);
      notify('client', 'Новый клиент из приложения', `${name} · ${phone} · ${client.code}`, `/clients/${id}`, 'success');
    }
    run('DELETE FROM otp_codes WHERE phone = ?', phone);
    const t = token();
    insert('sessions', { token: t, kind: 'client', subjectId: client.id, createdAt: nowIso() });
    return { token: t, client: { id: client.id, code: client.code, name: client.name, phone: client.phone } };
  }),
);

r.get(
  '/warehouses',
  h(() => all(`SELECT w.id, w.code, w.name, w.country, w.role, w.address, w.phone, w.workHours, c.name city, c.lat, c.lng FROM warehouses w JOIN cities c ON c.id = w.cityId WHERE w.active = 1`)),
);
r.get('/tariffs', h(() => all('SELECT id, name, category, transport, pricePerKg, pricePerM3, minCharge, daysMin, daysMax, description FROM tariffs WHERE active = 1')));
r.post(
  '/calculate',
  h((req) => {
    const t = get<Tariff>('SELECT * FROM tariffs WHERE id = ?', int(req.body?.tariffId));
    if (!t) throw bad('Выберите тариф');
    const b = req.body ?? {};
    const vol = Number(b.volumeM3) || (Number(b.lengthCm) * Number(b.widthCm) * Number(b.heightCm)) / 1e6 || 0;
    const res = calcPrice(Number(b.weightKg) || 0, vol, t);
    return { ...res, tjs: round2(res.total * usdRate()), days: [t.daysMin, t.daysMax] };
  }),
);

// ---------- Всё ниже — только для авторизованного клиента ----------
r.use(requireClient);

r.get(
  '/me',
  h((req) => {
    const c = get<any>(`SELECT c.*, w.name warehouseName, w.address warehouseAddress, w.workHours warehouseHours, w.phone warehousePhone FROM clients c LEFT JOIN warehouses w ON w.id = c.warehouseId WHERE c.id = ?`, req.client!.id);
    const origins = all<any>(`SELECT * FROM warehouses WHERE role = 'origin' AND active = 1`);
    const counts = Object.fromEntries(all<{ status: string; n: number }>('SELECT status, COUNT(*) n FROM parcels WHERE clientId = ? GROUP BY status', c.id).map((x) => [x.status, x.n]));
    const { notes, ...pub } = c;
    void notes;
    return { ...pub, balance: clientBalance(c.id), counts, chinaAddresses: origins.map((w) => chinaAddressFor(c, w)) };
  }),
);

r.patch(
  '/me',
  h((req) => {
    const b = req.body ?? {};
    for (const f of ['name', 'email', 'telegram', 'address', 'phone2']) if (b[f] !== undefined) run(`UPDATE clients SET ${f} = ? WHERE id = ?`, str(b[f]) ?? null, req.client!.id);
    if (int(b.warehouseId)) run('UPDATE clients SET warehouseId = ? WHERE id = ?', int(b.warehouseId), req.client!.id);
    return { ok: true };
  }),
);

const parcelPublic = (p: any) => ({
  id: p.id,
  trackNumber: p.trackNumber,
  description: p.description,
  category: p.category,
  places: p.places,
  weightKg: p.weightKg,
  volumeM3: p.volumeM3,
  status: p.status,
  statusLabel: PARCEL_STATUS[p.status as keyof typeof PARCEL_STATUS],
  price: p.price,
  paid: !!p.paid,
  warehouse: p.warehouseName ?? null,
  destWarehouse: p.destWarehouseName ?? null,
  shipment: p.shipmentCode ? { id: p.shipmentId, code: p.shipmentCode, etaAt: p.etaAt, status: p.shipmentStatus } : null,
  createdAt: p.createdAt,
  receivedAt: p.receivedAt,
  arrivedAt: p.arrivedAt,
  deliveredAt: p.deliveredAt,
});
const CLIENT_PARCELS = `SELECT p.*, w.name warehouseName, dw.name destWarehouseName, s.code shipmentCode, s.etaAt, s.status shipmentStatus
  FROM parcels p LEFT JOIN warehouses w ON w.id = p.warehouseId LEFT JOIN warehouses dw ON dw.id = p.destWarehouseId LEFT JOIN shipments s ON s.id = p.shipmentId`;

r.get(
  '/parcels',
  h((req) => {
    const status = str(req.query.status);
    const rows = status
      ? all(`${CLIENT_PARCELS} WHERE p.clientId = ? AND p.status = ? ORDER BY p.createdAt DESC`, req.client!.id, status)
      : all(`${CLIENT_PARCELS} WHERE p.clientId = ? ORDER BY p.createdAt DESC`, req.client!.id);
    return rows.map(parcelPublic);
  }),
);

r.get(
  '/parcels/:id',
  h((req) => {
    const p = get<any>(`${CLIENT_PARCELS} WHERE p.id = ? AND p.clientId = ?`, int(req.params.id), req.client!.id);
    if (!p) throw notFound('Посылка');
    const events = all('SELECT status, note, at FROM parcel_events WHERE parcelId = ? ORDER BY at', p.id);
    let route = null;
    if (p.shipmentId) {
      const s = get<any>('SELECT s.progress, s.status, r.stops FROM shipments s JOIN routes r ON r.id = s.routeId WHERE s.id = ?', p.shipmentId);
      route = { progress: s.progress, status: s.status, statusLabel: SHIPMENT_STATUS[s.status as keyof typeof SHIPMENT_STATUS], stops: JSON.parse(s.stops).map((x: any) => ({ name: x.name, at: x.at, kind: x.kind })) };
    }
    return { ...parcelPublic(p), events, route };
  }),
);

/** Клиент заранее регистрирует трек-номер заказа (Taobao, 1688, Pinduoduo…). */
r.post(
  '/parcels',
  h((req) => {
    const track = str(req.body?.trackNumber)?.toUpperCase().replace(/\s/g, '');
    if (!track || track.length < 6) throw bad('Введите трек-номер');
    const ex = get<any>('SELECT id, clientId FROM parcels WHERE trackNumber = ? COLLATE NOCASE', track);
    if (ex && ex.clientId && ex.clientId !== req.client!.id) throw bad('Этот трек-номер уже зарегистрирован другим клиентом');
    if (ex && !ex.clientId) {
      run('UPDATE parcels SET clientId = ?, description = COALESCE(description, ?) WHERE id = ?', req.client!.id, str(req.body?.description) ?? null, ex.id);
      insert('parcel_events', { parcelId: ex.id, status: 'received', note: `Клиент ${req.client!.code} опознал посылку`, at: nowIso() });
      notify('parcel', 'Клиент опознал посылку', `${track} → ${req.client!.code}`, '/parcels', 'info');
      return { id: ex.id, matched: true };
    }
    if (ex) return { id: ex.id, matched: false };
    const c = get<any>('SELECT warehouseId FROM clients WHERE id = ?', req.client!.id);
    const id = insert('parcels', { trackNumber: track, clientId: req.client!.id, description: str(req.body?.description) ?? null, category: str(req.body?.category) ?? 'general', places: 1, status: 'expected', destWarehouseId: c.warehouseId, paid: 0, createdAt: nowIso() });
    insert('parcel_events', { parcelId: id, status: 'expected', note: 'Трек-номер добавлен в приложении', at: nowIso() });
    return { id, matched: false };
  }),
);

r.delete(
  '/parcels/:id',
  h((req) => {
    const p = get<any>('SELECT * FROM parcels WHERE id = ? AND clientId = ?', int(req.params.id), req.client!.id);
    if (!p) throw notFound('Посылка');
    if (p.status !== 'expected') throw bad('Удалить можно только ожидаемую посылку');
    run('DELETE FROM parcels WHERE id = ?', p.id);
    return { ok: true };
  }),
);

r.get('/payments', h((req) => all('SELECT id, amount, currency, amountUsd, method, note, createdAt FROM payments WHERE clientId = ? ORDER BY createdAt DESC', req.client!.id)));

// ---------- Чат с поддержкой ----------
r.get(
  '/chat',
  h((req) => {
    const id = ensureConversation('client', req.client!.id);
    run('UPDATE conversations SET unreadOther = 0 WHERE id = ?', id);
    return { conversationId: id, messages: all('SELECT id, senderType, senderName, text, meta, createdAt FROM messages WHERE conversationId = ? ORDER BY createdAt, id', id) };
  }),
);
r.post(
  '/chat/messages',
  h((req) => {
    const text = str(req.body?.text);
    if (!text) throw bad('Пустое сообщение');
    const id = ensureConversation('client', req.client!.id);
    return postMessage(id, text, { senderType: 'client', senderId: req.client!.id, senderName: req.client!.name });
  }),
);
r.get('/stream', (req, res) => subscribe(res, `client:${req.client!.id}`));

r.post(
  '/auth/logout',
  h((req) => {
    const t = req.headers.authorization?.slice(7);
    if (t) run('DELETE FROM sessions WHERE token = ?', t);
    return { ok: true };
  }),
);

export default r;
