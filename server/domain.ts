// Бизнес-логика карго: статусы, тарифы, уведомления, чаты, представления рейсов.
import crypto from 'node:crypto';
import { all, get, getSetting, insert, nowIso, parseJson, run, tx, update } from './db.js';
import { pointAt, type LatLng } from './geo.js';
import { publish } from './realtime.js';

export const PARCEL_STATUS = {
  expected: 'Ожидается на складе',
  received: 'На складе в Китае',
  in_transit: 'В пути',
  customs: 'На таможне',
  arrived: 'Готов к выдаче',
  delivered: 'Выдан',
  problem: 'Проблема',
} as const;
export type ParcelStatus = keyof typeof PARCEL_STATUS;

export const SHIPMENT_STATUS = {
  planned: 'Запланирован',
  loading: 'Загрузка',
  in_transit: 'В пути',
  border: 'На границе',
  customs: 'Таможня',
  arrived: 'Прибыл',
  completed: 'Завершён',
} as const;
export type ShipmentStatus = keyof typeof SHIPMENT_STATUS;

export const PAYMENT_METHODS: Record<string, string> = {
  cash: 'Наличные',
  alif: 'Alif',
  dc: 'Душанбе Сити',
  card: 'Карта Корти Милли',
  transfer: 'Банковский перевод',
  wechat: 'WeChat Pay',
};

export const token = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');

export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
}
export function verifyPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(pw, salt, 32);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'hex'));
}

// ---------- Тарифы ----------
export interface Tariff {
  id: number;
  name: string;
  category: string;
  transport: string;
  pricePerKg: number;
  pricePerM3: number;
  minCharge: number;
  daysMin: number;
  daysMax: number;
}

export function calcPrice(weightKg: number, volumeM3: number, tariff: Tariff, discountPct = 0) {
  const byWeight = (weightKg || 0) * tariff.pricePerKg;
  const byVolume = (volumeM3 || 0) * tariff.pricePerM3;
  const base = Math.max(byWeight, byVolume, tariff.minCharge || 0);
  const total = base * (1 - (discountPct || 0) / 100);
  return {
    byWeight: round2(byWeight),
    byVolume: round2(byVolume),
    chargedBy: byVolume > byWeight ? 'volume' : 'weight',
    density: volumeM3 ? Math.round(weightKg / volumeM3) : null,
    total: round2(total),
  };
}
export const round2 = (n: number) => Math.round(n * 100) / 100;

export const usdRate = () => getSetting<number>('usdToTjs', 10.95);

// ---------- Аудит и уведомления ----------
export interface Actor {
  id?: number;
  name: string;
}

export function audit(actor: Actor | null, action: string, entity?: string, entityId?: number, details?: unknown) {
  insert('audit_log', {
    userId: actor?.id ?? null,
    userName: actor?.name ?? 'Система',
    action,
    entity,
    entityId,
    details: details === undefined ? null : typeof details === 'string' ? details : JSON.stringify(details),
    createdAt: nowIso(),
  });
}

export function notify(kind: string, title: string, body?: string, link?: string, level: 'info' | 'success' | 'warning' | 'danger' = 'info') {
  const id = insert('notifications', { kind, title, body, link, level, read: 0, createdAt: nowIso() });
  publish('admin', 'notification', { id, kind, title, body, link, level, read: 0, createdAt: nowIso() });
  return id;
}

// ---------- Чаты ----------
export function ensureConversation(kind: 'client' | 'driver' | 'warehouse' | 'team', refId: number | null, title?: string) {
  const col = kind === 'client' ? 'clientId' : kind === 'driver' ? 'driverId' : kind === 'warehouse' ? 'warehouseId' : null;
  if (col) {
    const ex = get<{ id: number }>(`SELECT id FROM conversations WHERE kind = ? AND ${col} = ?`, kind, refId);
    if (ex) return ex.id;
  } else {
    const ex = get<{ id: number }>(`SELECT id FROM conversations WHERE kind = 'team'`);
    if (ex) return ex.id;
  }
  let t = title;
  if (!t) {
    if (kind === 'client') t = get<{ name: string }>('SELECT name FROM clients WHERE id = ?', refId)?.name;
    if (kind === 'driver') t = get<{ name: string }>('SELECT name FROM drivers WHERE id = ?', refId)?.name;
    if (kind === 'warehouse') t = get<{ name: string }>('SELECT name FROM warehouses WHERE id = ?', refId)?.name;
  }
  return insert('conversations', {
    kind,
    clientId: kind === 'client' ? refId : null,
    driverId: kind === 'driver' ? refId : null,
    warehouseId: kind === 'warehouse' ? refId : null,
    title: t ?? 'Чат',
    status: 'open',
    createdAt: nowIso(),
  });
}

export interface PostOpts {
  senderType: 'admin' | 'client' | 'driver' | 'warehouse' | 'system';
  senderId?: number | null;
  senderName?: string;
  meta?: unknown;
  at?: string;
  silent?: boolean;
}

export function postMessage(conversationId: number, text: string, o: PostOpts) {
  const at = o.at ?? nowIso();
  const id = insert('messages', {
    conversationId,
    senderType: o.senderType,
    senderId: o.senderId ?? null,
    senderName: o.senderName ?? null,
    text,
    meta: o.meta ?? null,
    createdAt: at,
  });
  const fromStaff = o.senderType === 'admin' || o.senderType === 'system';
  run(
    `UPDATE conversations SET lastMessageAt = ?, lastMessage = ?, status = 'open',
       unreadAdmin = unreadAdmin + ?, unreadOther = unreadOther + ? WHERE id = ?`,
    at,
    text.slice(0, 160),
    fromStaff ? 0 : 1,
    fromStaff ? 1 : 0,
    conversationId,
  );
  const msg = { id, conversationId, senderType: o.senderType, senderId: o.senderId ?? null, senderName: o.senderName ?? null, text, meta: o.meta ?? null, createdAt: at };
  if (!o.silent) {
    publish('admin', 'message', msg);
    const conv = get<{ kind: string; clientId: number | null; driverId: number | null }>('SELECT kind, clientId, driverId FROM conversations WHERE id = ?', conversationId);
    if (conv?.clientId) publish(`client:${conv.clientId}`, 'message', msg);
    if (conv?.driverId) publish(`driver:${conv.driverId}`, 'message', msg);
  }
  return msg;
}

/** Системное сообщение клиенту в его чат (видно в приложении клиента). */
export function messageClient(clientId: number, text: string, meta?: unknown, silent = false) {
  const conv = ensureConversation('client', clientId);
  return postMessage(conv, text, { senderType: 'system', senderName: 'Карго', meta, silent });
}

// ---------- Посылки ----------
export function setParcelStatus(parcelId: number, status: ParcelStatus, note?: string, extra: Record<string, unknown> = {}, at = nowIso()) {
  const stamp: Record<string, unknown> = {};
  if (status === 'received') stamp.receivedAt = at;
  if (status === 'in_transit') stamp.shippedAt = at;
  if (status === 'arrived') stamp.arrivedAt = at;
  if (status === 'delivered') stamp.deliveredAt = at;
  update('parcels', parcelId, { status, ...stamp, ...extra });
  insert('parcel_events', { parcelId, status, note: note ?? PARCEL_STATUS[status], warehouseId: (extra.warehouseId as number) ?? null, at });
}

export function clientBalance(clientId: number) {
  const charged = get<{ s: number }>(`SELECT COALESCE(SUM(price),0) s FROM parcels WHERE clientId = ? AND status IN ('arrived','delivered')`, clientId)!.s;
  const paid = get<{ s: number }>('SELECT COALESCE(SUM(amountUsd),0) s FROM payments WHERE clientId = ?', clientId)!.s;
  return round2(paid - charged);
}

// ---------- Рейсы ----------
export interface RouteRow {
  id: number;
  code: string;
  name: string;
  via: string;
  transport: string;
  distanceKm: number;
  days: number;
  path: string;
  stops: string;
}
export type Stop = { code: string; name: string; kind: string; country: string; index: number; at: number };

const routeCache = new Map<number, { row: RouteRow; path: LatLng[]; stops: Stop[] }>();
export function getRoute(id: number) {
  let r = routeCache.get(id);
  if (!r) {
    const row = get<RouteRow>('SELECT * FROM routes WHERE id = ?', id);
    if (!row) throw new Error('Маршрут не найден');
    r = { row, path: parseJson<LatLng[]>(row.path, []), stops: parseJson<Stop[]>(row.stops, []) };
    routeCache.set(id, r);
  }
  return r;
}
export const clearRouteCache = () => routeCache.clear();

export function shipmentView(s: any, opts: { withPath?: boolean } = {}) {
  const route = getRoute(s.routeId);
  const pos = pointAt(route.path, s.progress);
  const truck = s.truckId ? get('SELECT * FROM trucks WHERE id = ?', s.truckId) : null;
  const driver = s.driverId ? get('SELECT * FROM drivers WHERE id = ?', s.driverId) : null;
  const origin = s.originWarehouseId ? get('SELECT id, code, name, cityId FROM warehouses WHERE id = ?', s.originWarehouseId) : null;
  const dest = s.destWarehouseId ? get('SELECT id, code, name, cityId FROM warehouses WHERE id = ?', s.destWarehouseId) : null;
  const load = get<{ n: number; places: number; kg: number; m3: number; clients: number; value: number }>(
    `SELECT COUNT(*) n, COALESCE(SUM(places),0) places, COALESCE(SUM(weightKg),0) kg, COALESCE(SUM(volumeM3),0) m3,
            COUNT(DISTINCT clientId) clients, COALESCE(SUM(price),0) value FROM parcels WHERE shipmentId = ?`,
    s.id,
  )!;
  const nextStop = route.stops.find((st) => st.at > s.progress + 1e-6) ?? null;
  const prevStop = [...route.stops].reverse().find((st) => st.at <= s.progress + 1e-6) ?? route.stops[0];
  const remainingKm = Math.round(route.row.distanceKm * (1 - s.progress));
  return {
    ...s,
    statusLabel: SHIPMENT_STATUS[s.status as ShipmentStatus] ?? s.status,
    route: {
      id: route.row.id,
      code: route.row.code,
      name: route.row.name,
      via: route.row.via,
      transport: route.row.transport,
      distanceKm: route.row.distanceKm,
      days: route.row.days,
      stops: route.stops,
      ...(opts.withPath ? { path: route.path } : {}),
    },
    position: { lat: pos[0], lng: pos[1] },
    prevStop,
    nextStop,
    remainingKm,
    truck,
    driver,
    origin,
    dest,
    load: { ...load, kg: Math.round(load.kg), m3: round2(load.m3), value: round2(load.value) },
  };
}

/** Перевод рейса в новый статус с каскадом на посылки и уведомлениями клиентов. */
export function changeShipmentStatus(shipmentId: number, status: ShipmentStatus, actor: Actor | null, note?: string) {
  return tx(() => {
    const s = get<any>('SELECT * FROM shipments WHERE id = ?', shipmentId);
    if (!s) throw new Error('Рейс не найден');
    const at = nowIso();
    const patch: Record<string, unknown> = { status };
    const route = getRoute(s.routeId);
    const destWh = get<any>('SELECT * FROM warehouses WHERE id = ?', s.destWarehouseId);
    if (status === 'in_transit' && !s.departedAt) {
      patch.departedAt = at;
      const eta = new Date(Date.now() + route.row.days * 86400000).toISOString();
      patch.plannedArrival = s.plannedArrival ?? eta;
      patch.etaAt = eta;
    }
    if (status === 'arrived') {
      patch.arrivedAt = at;
      patch.progress = 1;
      patch.risk = 'ok';
      patch.speed = 0;
    }
    update('shipments', shipmentId, patch);
    if (s.truckId) {
      const truckStatus = status === 'arrived' || status === 'completed' ? 'available' : status === 'planned' || status === 'loading' ? 'available' : 'on_trip';
      update('trucks', s.truckId, { status: truckStatus });
      if (s.driverId) update('drivers', s.driverId, { status: truckStatus === 'on_trip' ? 'on_trip' : 'available' });
    }
    const titles: Record<string, string> = {
      in_transit: s.status === 'loading' || s.status === 'planned' ? 'Рейс отправлен' : 'Движение продолжено',
      border: 'Прибыл на пограничный переход',
      customs: 'Таможенное оформление',
      arrived: `Прибыл на ${destWh?.name ?? 'склад'}`,
      completed: 'Рейс завершён',
      loading: 'Загрузка на складе',
      planned: 'Рейс запланирован',
    };
    insert('shipment_events', { shipmentId, type: status, title: titles[status] ?? status, description: note ?? null, actor: actor?.name ?? 'Система', at });

    // Каскад на посылки
    const parcels = all<{ id: number; clientId: number | null; trackNumber: string; price: number; status: string }>(
      'SELECT id, clientId, trackNumber, price, status FROM parcels WHERE shipmentId = ?',
      shipmentId,
    );
    const pStatus: Partial<Record<ShipmentStatus, ParcelStatus>> = { in_transit: 'in_transit', border: 'in_transit', customs: 'customs', arrived: 'arrived' };
    const target = pStatus[status];
    const byClient = new Map<number, typeof parcels>();
    if (target) {
      for (const p of parcels) {
        if (p.status === 'delivered' || p.status === target) continue;
        setParcelStatus(p.id, target, undefined, target === 'arrived' ? { warehouseId: s.destWarehouseId } : {}, at);
        if (p.clientId) byClient.set(p.clientId, [...(byClient.get(p.clientId) ?? []), p]);
      }
    }
    // Сообщения клиентам о ключевых этапах
    if (status === 'in_transit' && (s.status === 'loading' || s.status === 'planned')) {
      for (const [cid, ps] of byClient)
        messageClient(cid, `Ваши посылки (${ps.length} шт.) отправлены рейсом ${s.code}. Ориентировочная дата прибытия — ${fmtDate(patch.etaAt as string)}.`, { shipmentId, parcelIds: ps.map((p) => p.id) });
    }
    if (status === 'arrived') {
      for (const [cid, ps] of byClient) {
        const sum = round2(ps.reduce((a, p) => a + (p.price || 0), 0));
        messageClient(
          cid,
          `Ваши посылки прибыли на ${destWh?.name ?? 'склад'} (${destWh?.address ?? ''}). Количество: ${ps.length}. К оплате: $${sum}. Время работы: ${destWh?.workHours ?? ''}.`,
          { shipmentId, parcelIds: ps.map((p) => p.id), kind: 'arrived' },
        );
      }
      notify('shipment', `Рейс ${s.code} прибыл`, `${parcels.length} посылок на ${destWh?.name ?? 'складе'}. Клиенты уведомлены.`, `/shipments/${shipmentId}`, 'success');
    }
    audit(actor, `shipment.${status}`, 'shipment', shipmentId, note);
    publish('admin', 'shipment', { id: shipmentId, status });
    return get('SELECT * FROM shipments WHERE id = ?', shipmentId);
  });
}

export function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Asia/Dushanbe' });
}

export function nextShipmentCode() {
  const last = get<{ code: string }>(`SELECT code FROM shipments WHERE code LIKE 'TJ-%' ORDER BY id DESC LIMIT 1`);
  const n = last ? parseInt(last.code.slice(3), 10) + 1 : 1001;
  return `TJ-${n}`;
}

export function chinaAddressFor(client: { code: string; name: string }, wh: any) {
  return {
    warehouseId: wh.id,
    warehouse: wh.name,
    receiver: `${wh.receiverName} ${client.code}`,
    phone: wh.receiverPhone,
    zip: wh.zip,
    addressLocal: `${wh.addressLocal} (${client.code})`,
    addressRu: wh.address,
    copyText: `收货人: ${wh.receiverName} ${client.code}\n电话: ${wh.receiverPhone}\n地址: ${wh.addressLocal} (${client.code})\n邮编: ${wh.zip}`,
  };
}

export function insertEvent(shipmentId: number, type: string, title: string, description?: string | null, actor = 'Система', cityId?: number | null) {
  const id = insert('shipment_events', { shipmentId, type, title, description: description ?? null, cityId: cityId ?? null, actor, at: nowIso() });
  publish('admin', 'shipment', { id: shipmentId });
  return id;
}
