// CRM: клиенты, посылки (приёмка/выдача), финансы, тарифы, настройки, поиск.
import { Router } from 'express';
import { all, get, getSetting, insert, nowIso, run, setSetting, tx, update } from '../db.js';
import {
  audit,
  calcPrice,
  chinaAddressFor,
  clientBalance,
  ensureConversation,
  hashPassword,
  messageClient,
  notify,
  PARCEL_STATUS,
  PAYMENT_METHODS,
  round2,
  setParcelStatus,
  usdRate,
  type ParcelStatus,
  type Tariff,
} from '../domain.js';
import { actorOf, bad, h, int, notFound, requireRole, str } from '../http.js';
import { publish } from '../realtime.js';

const r = Router();
const DAY = 86400000;

// ---------- Клиенты ----------
const PREFIX_BY_WH: Record<string, string> = { DU: 'DSH', KH: 'KHJ', KL: 'KLB', BK: 'BKT' };

r.get(
  '/clients',
  h((req) => {
    const where: string[] = [];
    const p: unknown[] = [];
    const q = str(req.query.q);
    if (q) {
      where.push('(c.name LIKE ? OR c.code LIKE ? OR c.phone LIKE ? OR c.company LIKE ? OR c.telegram LIKE ?)');
      p.push(...Array(5).fill(`%${q}%`));
    }
    const status = str(req.query.status);
    if (status === 'business') where.push(`c.type = 'business'`);
    else if (status) {
      where.push('c.status = ?');
      p.push(status);
    }
    const wh = int(req.query.warehouseId);
    if (wh) {
      where.push('c.warehouseId = ?');
      p.push(wh);
    }
    const rows = all<any>(
      `SELECT c.*, w.name warehouseName, ci.name cityName,
         (SELECT COUNT(*) FROM parcels p WHERE p.clientId = c.id) parcelsTotal,
         (SELECT COUNT(*) FROM parcels p WHERE p.clientId = c.id AND p.status NOT IN ('delivered')) parcelsActive,
         (SELECT COUNT(*) FROM parcels p WHERE p.clientId = c.id AND p.status = 'arrived') parcelsReady,
         (SELECT ROUND(COALESCE(SUM(weightKg),0),1) FROM parcels p WHERE p.clientId = c.id) kgTotal,
         (SELECT MAX(createdAt) FROM parcels p WHERE p.clientId = c.id) lastParcelAt
       FROM clients c LEFT JOIN warehouses w ON w.id = c.warehouseId LEFT JOIN cities ci ON ci.id = c.cityId
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY lastParcelAt DESC NULLS LAST, c.id DESC`,
      ...p,
    );
    const items = rows.map((c) => ({ ...c, balance: clientBalance(c.id) }));
    const totals = {
      all: get<{ n: number }>('SELECT COUNT(*) n FROM clients')!.n,
      vip: get<{ n: number }>(`SELECT COUNT(*) n FROM clients WHERE status = 'vip'`)!.n,
      business: get<{ n: number }>(`SELECT COUNT(*) n FROM clients WHERE type = 'business'`)!.n,
      blocked: get<{ n: number }>(`SELECT COUNT(*) n FROM clients WHERE status = 'blocked'`)!.n,
      newMonth: get<{ n: number }>('SELECT COUNT(*) n FROM clients WHERE createdAt > ?', new Date(Date.now() - 30 * DAY).toISOString())!.n,
    };
    return { items, totals };
  }),
);

r.get(
  '/clients/:id',
  h((req) => {
    const c = get<any>(
      `SELECT c.*, w.name warehouseName, w.address warehouseAddress, w.workHours warehouseHours, ci.name cityName
       FROM clients c LEFT JOIN warehouses w ON w.id = c.warehouseId LEFT JOIN cities ci ON ci.id = c.cityId WHERE c.id = ?`,
      int(req.params.id),
    );
    if (!c) throw notFound('Клиент');
    const origins = all<any>(`SELECT * FROM warehouses WHERE role = 'origin' AND active = 1`);
    const parcels = all(
      `SELECT p.*, s.code shipmentCode, w.name warehouseName FROM parcels p
       LEFT JOIN shipments s ON s.id = p.shipmentId LEFT JOIN warehouses w ON w.id = p.warehouseId
       WHERE p.clientId = ? ORDER BY p.createdAt DESC`,
      c.id,
    );
    const payments = all('SELECT * FROM payments WHERE clientId = ? ORDER BY createdAt DESC', c.id);
    const conversationId = get<{ id: number }>(`SELECT id FROM conversations WHERE kind = 'client' AND clientId = ?`, c.id)?.id ?? null;
    const charged = round2(all<any>(`SELECT price FROM parcels WHERE clientId = ? AND status IN ('arrived','delivered')`, c.id).reduce((a, p) => a + (p.price || 0), 0));
    const paid = round2(all<any>('SELECT amountUsd FROM payments WHERE clientId = ?', c.id).reduce((a, p) => a + p.amountUsd, 0));
    return {
      ...c,
      balance: round2(paid - charged),
      charged,
      paid,
      chinaAddresses: origins.map((w) => chinaAddressFor(c, w)),
      parcels,
      payments,
      conversationId,
    };
  }),
);

r.post(
  '/clients',
  h((req) => {
    const b = req.body ?? {};
    const name = str(b.name);
    const phone = str(b.phone);
    if (!name || !phone) throw bad('Укажите имя и телефон');
    if (get('SELECT id FROM clients WHERE phone = ?', phone)) throw bad('Клиент с таким телефоном уже есть');
    const whId = int(b.warehouseId) ?? get<{ id: number }>(`SELECT id FROM warehouses WHERE code = 'DU'`)!.id;
    const wh = get<any>('SELECT * FROM warehouses WHERE id = ?', whId);
    const code = str(b.code) ?? nextClientCode(PREFIX_BY_WH[wh?.code] ?? 'CL');
    const id = insert('clients', {
      code,
      name,
      phone,
      phone2: str(b.phone2),
      email: str(b.email),
      telegram: str(b.telegram),
      cityId: int(b.cityId) ?? wh?.cityId,
      warehouseId: whId,
      address: str(b.address),
      company: str(b.company),
      type: b.type === 'business' ? 'business' : 'individual',
      status: str(b.status) ?? 'active',
      discount: Number(b.discount) || 0,
      source: str(b.source),
      notes: str(b.notes),
      color: ['#6B4EFF', '#F0443A', '#22B25F', '#F5A524', '#0EA5E9', '#EC4899'][Math.floor(Math.random() * 6)],
      createdAt: nowIso(),
    });
    audit(actorOf(req), 'client.create', 'client', id);
    if (b.sendWelcome !== false) {
      const origins = all<any>(`SELECT * FROM warehouses WHERE role = 'origin' AND active = 1 LIMIT 1`);
      const addr = origins[0] ? chinaAddressFor({ code, name }, origins[0]) : null;
      messageClient(id, `Добро пожаловать! Ваш код клиента: ${code}. Указывайте его при каждом заказе.${addr ? `\n\nАдрес склада в Китае:\n${addr.copyText}` : ''}`, { kind: 'welcome' }, true);
    }
    return get('SELECT * FROM clients WHERE id = ?', id);
  }),
);

r.patch(
  '/clients/:id',
  h((req) => {
    const b = req.body ?? {};
    const fields = ['name', 'phone', 'phone2', 'email', 'telegram', 'cityId', 'warehouseId', 'address', 'company', 'type', 'status', 'discount', 'source', 'notes'];
    const patch = Object.fromEntries(fields.filter((f) => b[f] !== undefined).map((f) => [f, b[f] === '' ? null : b[f]]));
    update('clients', int(req.params.id)!, patch);
    audit(actorOf(req), 'client.update', 'client', int(req.params.id), patch);
    return get('SELECT * FROM clients WHERE id = ?', int(req.params.id));
  }),
);

export function nextClientCode(prefix: string) {
  const last = get<{ code: string }>(`SELECT code FROM clients WHERE code LIKE ? ORDER BY CAST(substr(code, ?) AS INTEGER) DESC LIMIT 1`, `${prefix}-%`, prefix.length + 2);
  const base = { DSH: 1000, KHJ: 2000, KLB: 3000, BKT: 4000 }[prefix] ?? 5000;
  const n = last ? parseInt(last.code.split('-')[1], 10) + 1 : base + 1;
  return `${prefix}-${n}`;
}

// ---------- Посылки ----------
const PARCEL_SELECT = `SELECT p.*, c.code clientCode, c.name clientName, c.phone clientPhone, c.color clientColor,
  s.code shipmentCode, s.status shipmentStatus, w.name warehouseName, w.country warehouseCountry, dw.name destWarehouseName
  FROM parcels p LEFT JOIN clients c ON c.id = p.clientId LEFT JOIN shipments s ON s.id = p.shipmentId
  LEFT JOIN warehouses w ON w.id = p.warehouseId LEFT JOIN warehouses dw ON dw.id = p.destWarehouseId`;

r.get(
  '/parcels',
  h((req) => {
    const where: string[] = [];
    const p: unknown[] = [];
    const status = str(req.query.status);
    if (status) {
      where.push('p.status = ?');
      p.push(status);
    }
    const filter = str(req.query.filter);
    if (filter === 'unidentified') where.push(`p.clientId IS NULL`);
    if (filter === 'waiting') where.push(`p.status = 'arrived' AND p.arrivedAt < '${new Date(Date.now() - 3 * DAY).toISOString()}'`);
    if (filter === 'unpaid') where.push(`p.paid = 0 AND p.status IN ('arrived','delivered')`);
    if (filter === 'unassigned') where.push(`p.status = 'received' AND p.shipmentId IS NULL`);
    for (const k of ['warehouseId', 'shipmentId', 'clientId', 'destWarehouseId'] as const) {
      const v = int(req.query[k]);
      if (v) {
        where.push(`p.${k} = ?`);
        p.push(v);
      }
    }
    const q = str(req.query.q);
    if (q) {
      where.push('(p.trackNumber LIKE ? OR c.code LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR p.description LIKE ?)');
      p.push(...Array(5).fill(`%${q}%`));
    }
    const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const limit = Math.min(int(req.query.limit) ?? 50, 500);
    const offset = int(req.query.offset) ?? 0;
    const total = get<{ n: number }>(`SELECT COUNT(*) n FROM parcels p LEFT JOIN clients c ON c.id = p.clientId ${W}`, ...p)!.n;
    const sum = get<{ kg: number; m3: number; price: number }>(
      `SELECT ROUND(COALESCE(SUM(p.weightKg),0),1) kg, ROUND(COALESCE(SUM(p.volumeM3),0),2) m3, ROUND(COALESCE(SUM(p.price),0),2) price FROM parcels p LEFT JOIN clients c ON c.id = p.clientId ${W}`,
      ...p,
    );
    const items = all(`${PARCEL_SELECT} ${W} ORDER BY COALESCE(p.receivedAt, p.createdAt) DESC, p.id DESC LIMIT ? OFFSET ?`, ...p, limit, offset);
    const counts = Object.fromEntries(all<{ status: string; n: number }>('SELECT status, COUNT(*) n FROM parcels GROUP BY status').map((x) => [x.status, x.n]));
    counts.unidentified = get<{ n: number }>(`SELECT COUNT(*) n FROM parcels WHERE clientId IS NULL`)!.n;
    counts.all = Object.entries(counts).reduce((a, [k, v]) => (k === 'unidentified' ? a : a + (v as number)), 0);
    return { items, total, sum, counts };
  }),
);

r.get(
  '/parcels/lookup',
  h((req) => {
    const track = str(req.query.track);
    if (!track) throw bad('Укажите трек-номер');
    return get(`${PARCEL_SELECT} WHERE p.trackNumber = ? COLLATE NOCASE`, track) ?? null;
  }),
);

r.get(
  '/parcels/:id',
  h((req) => {
    const p = get<any>(`${PARCEL_SELECT} WHERE p.id = ?`, int(req.params.id));
    if (!p) throw notFound('Посылка');
    const events = all(`SELECT e.*, w.name warehouseName FROM parcel_events e LEFT JOIN warehouses w ON w.id = e.warehouseId WHERE parcelId = ? ORDER BY at DESC, id DESC`, p.id);
    const tariff = p.tariffId ? get('SELECT * FROM tariffs WHERE id = ?', p.tariffId) : null;
    return { ...p, events, tariff };
  }),
);

function resolveClient(b: any) {
  if (int(b.clientId)) return get<any>('SELECT * FROM clients WHERE id = ?', int(b.clientId));
  const code = str(b.clientCode);
  if (code) return get<any>('SELECT * FROM clients WHERE code = ? COLLATE NOCASE', code.toUpperCase());
  return undefined;
}

function volumeFrom(b: any) {
  if (Number(b.volumeM3)) return Number(b.volumeM3);
  const [l, w, hgt] = [Number(b.lengthCm), Number(b.widthCm), Number(b.heightCm)];
  if (l && w && hgt) return Math.round((l * w * hgt) / 1000) / 1000 || 0.001;
  return null;
}

/** Приёмка посылки на складе (или регистрация ожидаемой). */
r.post(
  '/parcels',
  h((req) => {
    const b = req.body ?? {};
    const track = str(b.trackNumber)?.toUpperCase();
    if (!track) throw bad('Укажите трек-номер');
    const picked = resolveClient(b);
    if ((b.clientCode || b.clientId) && !picked) throw bad('Клиент с таким кодом не найден');
    // Если клиент заранее добавил трек в приложении — берём владельца оттуда
    const expectedOwner = !picked ? get<{ clientId: number | null }>(`SELECT clientId FROM parcels WHERE trackNumber = ? COLLATE NOCASE AND status = 'expected'`, track)?.clientId : null;
    const client = picked ?? (expectedOwner ? get<any>('SELECT * FROM clients WHERE id = ?', expectedOwner) : undefined);
    const status: ParcelStatus = b.status === 'expected' ? 'expected' : 'received';
    const weight = Number(b.weightKg) || null;
    if (status === 'received' && !weight) throw bad('Укажите вес');
    const volume = volumeFrom(b);
    const category = str(b.category) ?? 'general';
    const tariff = get<Tariff>(`SELECT * FROM tariffs WHERE ${int(b.tariffId) ? 'id = ?' : 'category = ?'} AND active = 1`, int(b.tariffId) ?? category);
    const price = status === 'received' && tariff && weight ? calcPrice(weight, volume ?? 0, tariff, client?.discount ?? 0).total : null;
    const warehouseId = int(b.warehouseId) ?? req.user?.warehouseId ?? get<{ id: number }>(`SELECT id FROM warehouses WHERE code = 'GZ'`)!.id;
    const wh = get<any>('SELECT * FROM warehouses WHERE id = ?', warehouseId);

    return tx(() => {
      const existing = get<any>(`SELECT * FROM parcels WHERE trackNumber = ? COLLATE NOCASE AND status = 'expected'`, track);
      let id: number;
      if (existing && status === 'received') {
        id = existing.id;
        update('parcels', id, {
          clientId: client?.id ?? existing.clientId,
          description: str(b.description) ?? existing.description,
          category,
          places: int(b.places) ?? 1,
          weightKg: weight,
          volumeM3: volume,
          tariffId: tariff?.id,
          price,
          warehouseId,
          shelf: str(b.shelf),
          notes: str(b.notes),
        });
        setParcelStatus(id, 'received', `Принято на складе «${wh.name}», вес ${weight} кг`, { warehouseId });
      } else {
        if (get(`SELECT id FROM parcels WHERE trackNumber = ? COLLATE NOCASE`, track) && !b.allowDuplicate) throw bad('Посылка с таким трек-номером уже есть');
        id = insert('parcels', {
          trackNumber: track,
          carrier: str(b.carrier),
          clientId: client?.id ?? null,
          description: str(b.description),
          category,
          places: int(b.places) ?? 1,
          weightKg: weight,
          volumeM3: volume,
          declaredValue: Number(b.declaredValue) || null,
          status,
          warehouseId: status === 'received' ? warehouseId : null,
          destWarehouseId: client?.warehouseId ?? get<{ id: number }>(`SELECT id FROM warehouses WHERE code = 'DU'`)!.id,
          tariffId: tariff?.id,
          price,
          paid: 0,
          shelf: str(b.shelf),
          receivedAt: status === 'received' ? nowIso() : null,
          createdAt: nowIso(),
          notes: str(b.notes),
        });
        insert('parcel_events', { parcelId: id, status, note: status === 'received' ? `Принято на складе «${wh.name}», вес ${weight} кг` : 'Трек-номер зарегистрирован', warehouseId: status === 'received' ? warehouseId : null, at: nowIso() });
      }
      if (client && status === 'received' && b.notify !== false) {
        messageClient(client.id, `📦 Посылка ${track} принята на складе «${wh.name}». Вес: ${weight} кг${volume ? `, объём: ${volume} м³` : ''}. Стоимость доставки: $${price}. Отправим ближайшим рейсом.`, { parcelId: id, kind: 'received' });
      }
      if (!client && status === 'received') notify('parcel', 'Посылка без кода клиента', `${track} на складе «${wh.name}»`, '/parcels?filter=unidentified', 'warning');
      audit(actorOf(req), `parcel.${status}`, 'parcel', id, { track });
      publish('admin', 'parcel', { id });
      return get(`${PARCEL_SELECT} WHERE p.id = ?`, id);
    });
  }),
);

r.patch(
  '/parcels/:id',
  h((req) => {
    const id = int(req.params.id)!;
    const p = get<any>('SELECT * FROM parcels WHERE id = ?', id);
    if (!p) throw notFound('Посылка');
    const b = req.body ?? {};
    const patch: Record<string, unknown> = {};
    for (const f of ['description', 'category', 'places', 'weightKg', 'shelf', 'notes', 'declaredValue', 'warehouseId', 'destWarehouseId', 'trackNumber']) if (b[f] !== undefined) patch[f] = b[f] === '' ? null : b[f];
    const vol = volumeFrom(b);
    if (vol) patch.volumeM3 = vol;
    if (b.clientCode !== undefined || b.clientId !== undefined) {
      const client = resolveClient(b);
      if (!client) throw bad('Клиент не найден');
      patch.clientId = client.id;
      patch.destWarehouseId = client.warehouseId;
      if (!p.clientId) {
        insert('parcel_events', { parcelId: id, status: p.status, note: `Посылка привязана к клиенту ${client.code}`, at: nowIso() });
        if (p.status === 'received') messageClient(client.id, `📦 Посылка ${p.trackNumber} найдена на складе и привязана к вашему коду ${client.code}.`, { parcelId: id });
      }
    }
    if (b.price !== undefined) patch.price = Number(b.price);
    else if (patch.weightKg !== undefined || patch.volumeM3 !== undefined || patch.category !== undefined || patch.clientId !== undefined) {
      const tariff = get<Tariff>('SELECT * FROM tariffs WHERE category = ? AND active = 1', (patch.category as string) ?? p.category) ?? get<Tariff>('SELECT * FROM tariffs WHERE id = ?', p.tariffId);
      const client = get<any>('SELECT * FROM clients WHERE id = ?', (patch.clientId as number) ?? p.clientId);
      const w = Number(patch.weightKg ?? p.weightKg);
      if (tariff && w) {
        patch.tariffId = tariff.id;
        patch.price = calcPrice(w, Number(patch.volumeM3 ?? p.volumeM3) || 0, tariff, client?.discount ?? 0).total;
      }
    }
    if (b.status && b.status !== p.status) {
      if (!(b.status in PARCEL_STATUS)) throw bad('Неверный статус');
      setParcelStatus(id, b.status, str(b.note));
    }
    update('parcels', id, patch);
    audit(actorOf(req), 'parcel.update', 'parcel', id, patch);
    publish('admin', 'parcel', { id });
    return get(`${PARCEL_SELECT} WHERE p.id = ?`, id);
  }),
);

/** Массовые операции: загрузка в рейс, выдача, оплата, смена статуса. */
r.post(
  '/parcels/bulk',
  h((req) => {
    const b = req.body ?? {};
    const ids: number[] = (b.ids ?? []).map(Number).filter(Boolean);
    if (!ids.length) throw bad('Не выбраны посылки');
    const action = str(b.action);
    const actor = actorOf(req);
    const parcels = all<any>(`SELECT * FROM parcels WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
    return tx(() => {
      if (action === 'assign_shipment') {
        const s = get<any>('SELECT * FROM shipments WHERE id = ?', int(b.shipmentId));
        if (!s) throw bad('Рейс не найден');
        if (!['planned', 'loading'].includes(s.status)) throw bad('Загружать можно только в рейс со статусом «Запланирован» или «Загрузка»');
        for (const p of parcels) {
          if (p.status !== 'received') continue;
          update('parcels', p.id, { shipmentId: s.id });
          insert('parcel_events', { parcelId: p.id, status: 'received', note: `Включено в рейс ${s.code}`, at: nowIso() });
        }
        if (s.status === 'planned') update('shipments', s.id, { status: 'loading' });
        audit(actor, 'parcel.assign', 'shipment', s.id, { ids });
        return { ok: true, message: `${parcels.filter((p) => p.status === 'received').length} посылок добавлено в рейс ${s.code}` };
      }
      if (action === 'unassign') {
        for (const p of parcels) if (p.status === 'received') update('parcels', p.id, { shipmentId: null });
        return { ok: true, message: 'Посылки убраны из рейса' };
      }
      if (action === 'deliver') {
        const byClient = new Map<number, any[]>();
        for (const p of parcels) {
          if (p.status !== 'arrived') continue;
          setParcelStatus(p.id, 'delivered', str(b.note) ?? 'Выдано клиенту', { warehouseId: p.warehouseId });
          if (p.clientId) byClient.set(p.clientId, [...(byClient.get(p.clientId) ?? []), p]);
        }
        if (b.withPayment) {
          for (const [cid, ps] of byClient) {
            const unpaid = ps.filter((p) => !p.paid);
            const sum = round2(unpaid.reduce((a, p) => a + (p.price || 0), 0));
            if (sum > 0) {
              const method = str(b.method) ?? 'cash';
              const currency = str(b.currency) ?? 'USD';
              insert('payments', { clientId: cid, amount: currency === 'TJS' ? round2(sum * usdRate()) : sum, currency, amountUsd: sum, method, note: 'Оплата при выдаче', parcelIds: unpaid.map((p) => p.id), userId: actor.id, createdAt: nowIso() });
              for (const p of unpaid) update('parcels', p.id, { paid: 1 });
            }
          }
        }
        for (const [cid, ps] of byClient) messageClient(cid, `✅ Выдано ${ps.length} ${ps.length === 1 ? 'посылка' : 'посылок'}. Спасибо, что выбираете нас!`, { kind: 'delivered', parcelIds: ps.map((p) => p.id) });
        audit(actor, 'parcel.deliver', 'parcel', undefined, { ids });
        return { ok: true, message: `Выдано: ${[...byClient.values()].flat().length}` };
      }
      if (action === 'mark_paid') {
        for (const p of parcels) update('parcels', p.id, { paid: 1 });
        audit(actor, 'parcel.mark_paid', 'parcel', undefined, { ids });
        return { ok: true, message: 'Отмечено как оплачено' };
      }
      if (action === 'set_status') {
        const st = str(b.status) as ParcelStatus;
        if (!st || !(st in PARCEL_STATUS)) throw bad('Неверный статус');
        for (const p of parcels) setParcelStatus(p.id, st, str(b.note));
        audit(actor, 'parcel.set_status', 'parcel', undefined, { ids, st });
        return { ok: true, message: `Статус: ${PARCEL_STATUS[st]}` };
      }
      if (action === 'notify') {
        const text = str(b.text);
        if (!text) throw bad('Введите текст сообщения');
        const clients = [...new Set(parcels.map((p) => p.clientId).filter(Boolean))];
        for (const cid of clients) messageClient(cid, text, { kind: 'broadcast' });
        return { ok: true, message: `Сообщение отправлено ${clients.length} клиентам` };
      }
      throw bad('Неизвестное действие');
    });
  }),
);

// ---------- Тарифы и калькулятор ----------
r.get('/tariffs', h(() => all('SELECT * FROM tariffs ORDER BY transport, pricePerKg')));
r.post(
  '/tariffs',
  requireRole('admin', 'manager'),
  h((req) => {
    const b = req.body ?? {};
    if (!str(b.name) || !Number(b.pricePerKg)) throw bad('Укажите название и цену за кг');
    const id = insert('tariffs', { name: str(b.name), category: str(b.category) ?? `custom_${Date.now()}`, transport: str(b.transport) ?? 'auto', pricePerKg: Number(b.pricePerKg), pricePerM3: Number(b.pricePerM3) || 0, minCharge: Number(b.minCharge) || 0, daysMin: int(b.daysMin), daysMax: int(b.daysMax), description: str(b.description), active: 1 });
    audit(actorOf(req), 'tariff.create', 'tariff', id);
    return get('SELECT * FROM tariffs WHERE id = ?', id);
  }),
);
r.patch(
  '/tariffs/:id',
  requireRole('admin', 'manager'),
  h((req) => {
    const b = req.body ?? {};
    const fields = ['name', 'transport', 'pricePerKg', 'pricePerM3', 'minCharge', 'daysMin', 'daysMax', 'description', 'active'];
    const patch = Object.fromEntries(fields.filter((f) => b[f] !== undefined).map((f) => [f, b[f]]));
    update('tariffs', int(req.params.id)!, patch);
    audit(actorOf(req), 'tariff.update', 'tariff', int(req.params.id), patch);
    return get('SELECT * FROM tariffs WHERE id = ?', int(req.params.id));
  }),
);
r.post(
  '/calculate',
  h((req) => {
    const b = req.body ?? {};
    const t = get<Tariff>('SELECT * FROM tariffs WHERE id = ?', int(b.tariffId));
    if (!t) throw bad('Выберите тариф');
    const client = int(b.clientId) ? get<any>('SELECT discount FROM clients WHERE id = ?', int(b.clientId)) : null;
    const vol = volumeFrom(b) ?? 0;
    const res = calcPrice(Number(b.weightKg) || 0, vol, t, client?.discount ?? Number(b.discount) ?? 0);
    return { ...res, volumeM3: vol, tjs: round2(res.total * usdRate()), tariff: t };
  }),
);

// ---------- Финансы ----------
r.get(
  '/finance',
  h((req) => {
    const days = int(req.query.days) ?? 56;
    const since = new Date(Date.now() - days * DAY).toISOString();
    const payments = all(
      `SELECT pay.*, c.name clientName, c.code clientCode, c.color clientColor, u.name userName FROM payments pay
       JOIN clients c ON c.id = pay.clientId LEFT JOIN users u ON u.id = pay.userId ORDER BY pay.createdAt DESC LIMIT 200`,
    );
    const weekly = all<{ wk: string; s: number; n: number }>(
      `SELECT strftime('%Y-%W', createdAt) wk, ROUND(SUM(amountUsd),2) s, COUNT(*) n FROM payments WHERE createdAt >= ? GROUP BY wk ORDER BY wk`,
      since,
    );
    // Заполняем недели без платежей нулями, чтобы на графике не было «дыр»
    const wkKey = (d: Date) => get<{ k: string }>(`SELECT strftime('%Y-%W', ?) k`, d.toISOString())!.k;
    const filled: { wk: string; s: number; n: number }[] = [];
    for (let i = Math.floor(days / 7) - 1; i >= 0; i--) {
      const k = wkKey(new Date(Date.now() - i * 7 * DAY));
      if (!filled.some((f) => f.wk === k)) filled.push(weekly.find((w) => w.wk === k) ?? { wk: k, s: 0, n: 0 });
    }
    weekly.splice(0, weekly.length, ...filled);
    const byMethod = all(`SELECT method, ROUND(SUM(amountUsd),2) s, COUNT(*) n FROM payments WHERE createdAt >= ? GROUP BY method ORDER BY s DESC`, since);
    const debtors = all<any>(`SELECT id, code, name, phone, color, company FROM clients`)
      .map((c) => ({ ...c, balance: clientBalance(c.id) }))
      .filter((c) => c.balance < -0.5)
      .sort((a, b) => a.balance - b.balance);
    const receivable = round2(-debtors.reduce((a, d) => a + d.balance, 0));
    const inTransitValue = get<{ s: number }>(`SELECT ROUND(COALESCE(SUM(price),0),2) s FROM parcels WHERE status IN ('received','in_transit','customs') AND paid = 0`)!.s;
    const revenue = get<{ s: number }>('SELECT ROUND(COALESCE(SUM(amountUsd),0),2) s FROM payments WHERE createdAt >= ?', since)!.s;
    const revenue30 = get<{ s: number }>('SELECT ROUND(COALESCE(SUM(amountUsd),0),2) s FROM payments WHERE createdAt >= ?', new Date(Date.now() - 30 * DAY).toISOString())!.s;
    const kgDelivered30 = get<{ s: number }>(`SELECT ROUND(COALESCE(SUM(weightKg),0)) s FROM parcels WHERE status = 'delivered' AND deliveredAt >= ?`, new Date(Date.now() - 30 * DAY).toISOString())!.s;
    return { payments, weekly, byMethod, debtors, receivable, inTransitValue, revenue, revenue30, kgDelivered30, usdRate: usdRate(), methods: PAYMENT_METHODS };
  }),
);

r.post(
  '/payments',
  h((req) => {
    const b = req.body ?? {};
    const clientId = int(b.clientId);
    const amount = Number(b.amount);
    if (!clientId || !amount) throw bad('Укажите клиента и сумму');
    const currency = b.currency === 'TJS' ? 'TJS' : b.currency === 'CNY' ? 'CNY' : 'USD';
    const amountUsd = currency === 'TJS' ? round2(amount / usdRate()) : currency === 'CNY' ? round2(amount * getSetting<number>('cnyToUsd', 0.14)) : amount;
    const parcelIds: number[] = (b.parcelIds ?? []).map(Number).filter(Boolean);
    const id = tx(() => {
      const id = insert('payments', { clientId, amount, currency, amountUsd, method: str(b.method) ?? 'cash', note: str(b.note), parcelIds, userId: req.user!.id, createdAt: nowIso() });
      for (const pid of parcelIds) update('parcels', pid, { paid: 1 });
      return id;
    });
    const c = get<any>('SELECT name FROM clients WHERE id = ?', clientId);
    notify('payment', `Платёж $${amountUsd}`, `${c?.name ?? ''} · ${PAYMENT_METHODS[str(b.method) ?? 'cash'] ?? ''}`, `/clients/${clientId}`, 'success');
    if (b.notifyClient !== false) messageClient(clientId, `💳 Оплата получена: ${amount} ${currency}. Спасибо!`, { kind: 'payment', paymentId: id });
    audit(actorOf(req), 'payment.create', 'payment', id, { clientId, amount, currency });
    return get('SELECT * FROM payments WHERE id = ?', id);
  }),
);

// ---------- Уведомления ----------
r.get('/notifications', h(() => ({ items: all('SELECT * FROM notifications ORDER BY createdAt DESC LIMIT 40'), unread: get<{ n: number }>('SELECT COUNT(*) n FROM notifications WHERE read = 0')!.n })));
r.post('/notifications/read-all', h(() => (run('UPDATE notifications SET read = 1'), { ok: true })));
r.post('/notifications/:id/read', h((req) => (run('UPDATE notifications SET read = 1 WHERE id = ?', int(req.params.id)), { ok: true })));

// ---------- Настройки и сотрудники ----------
r.get(
  '/settings',
  h(() => ({
    company: getSetting('company', {}),
    usdToTjs: getSetting('usdToTjs', 10.95),
    cnyToUsd: getSetting('cnyToUsd', 0.14),
    pickupFreeDays: getSetting('pickupFreeDays', 5),
    storageFeePerDay: getSetting('storageFeePerDay', 0.5),
  })),
);
r.put(
  '/settings',
  requireRole('admin'),
  h((req) => {
    const b = req.body ?? {};
    for (const k of ['company', 'usdToTjs', 'cnyToUsd', 'pickupFreeDays', 'storageFeePerDay']) if (b[k] !== undefined) setSetting(k, b[k]);
    audit(actorOf(req), 'settings.update', 'settings', undefined, Object.keys(b));
    return { ok: true };
  }),
);
r.get('/users', h(() => all('SELECT u.id, u.name, u.email, u.phone, u.role, u.color, u.warehouseId, w.name warehouseName, u.createdAt FROM users u LEFT JOIN warehouses w ON w.id = u.warehouseId ORDER BY u.id')));
r.post(
  '/users',
  requireRole('admin'),
  h((req) => {
    const b = req.body ?? {};
    if (!str(b.name) || !str(b.email) || !str(b.password)) throw bad('Имя, email и пароль обязательны');
    if (get('SELECT id FROM users WHERE email = ?', str(b.email)!.toLowerCase())) throw bad('Email уже используется');
    const id = insert('users', { name: str(b.name), email: str(b.email)!.toLowerCase(), phone: str(b.phone), role: str(b.role) ?? 'manager', passwordHash: hashPassword(str(b.password)!), warehouseId: int(b.warehouseId) ?? null, color: '#6B4EFF', createdAt: nowIso() });
    audit(actorOf(req), 'user.create', 'user', id);
    return get('SELECT id, name, email, role FROM users WHERE id = ?', id);
  }),
);
r.get('/audit', h(() => all('SELECT * FROM audit_log ORDER BY createdAt DESC LIMIT 100')));

// ---------- Глобальный поиск ----------
r.get(
  '/search',
  h((req) => {
    const q = str(req.query.q);
    if (!q || q.length < 2) return { clients: [], parcels: [], shipments: [] };
    const like = `%${q}%`;
    return {
      clients: all('SELECT id, code, name, phone, color FROM clients WHERE name LIKE ? OR code LIKE ? OR phone LIKE ? OR company LIKE ? LIMIT 6', like, like, like, like),
      parcels: all(`SELECT p.id, p.trackNumber, p.status, p.description, c.code clientCode FROM parcels p LEFT JOIN clients c ON c.id = p.clientId WHERE p.trackNumber LIKE ? LIMIT 6`, like),
      shipments: all(`SELECT s.id, s.code, s.status, t.plate FROM shipments s LEFT JOIN trucks t ON t.id = s.truckId WHERE s.code LIKE ? OR t.plate LIKE ? LIMIT 6`, like, like),
    };
  }),
);

export default r;
export { ensureConversation };
