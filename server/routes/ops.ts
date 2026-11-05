// Операции: дашборд, ассистент, рейсы, live-трекинг, склады, транспорт.
import { Router } from 'express';
import { all, get, insert, nowIso, update } from '../db.js';
import {
  audit,
  changeShipmentStatus,
  clearRouteCache,
  fmtDate,
  getRoute,
  insertEvent,
  messageClient,
  nextShipmentCode,
  notify,
  PARCEL_STATUS,
  round2,
  SHIPMENT_STATUS,
  shipmentView,
  token,
  type ShipmentStatus,
} from '../domain.js';
import { applyReroute, buildBrief, executeAction, rerouteOption } from '../assistant.js';
import { CITIES } from '../geo.js';
import { actorOf, bad, h, int, notFound, str } from '../http.js';

const r = Router();
const ACTIVE = `('in_transit','border','customs')`;
const DAY = 86400000;

// ---------- Дашборд ----------
r.get(
  '/dashboard',
  h(() => {
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();
    const weekAgo = new Date(now - 7 * DAY).toISOString();
    const n = (sql: string, ...p: unknown[]) => get<{ n: number }>(sql, ...p)!.n;

    const parcelsActive = n(`SELECT COUNT(*) n FROM parcels WHERE status NOT IN ('delivered')`);
    const parcelsActiveWeek = n(`SELECT COUNT(*) n FROM parcels WHERE status NOT IN ('delivered') AND createdAt < ?`, weekAgo);
    const inTransit = n(`SELECT COUNT(*) n FROM parcels WHERE status IN ('in_transit','customs')`);
    const trucksOnRoad = n(`SELECT COUNT(*) n FROM shipments WHERE status IN ${ACTIVE}`);
    const deliveredToday = n(`SELECT COUNT(*) n FROM parcels WHERE status = 'delivered' AND deliveredAt >= ?`, todayIso);
    const readyForPickup = n(`SELECT COUNT(*) n FROM parcels WHERE status = 'arrived'`);
    const delayed = n(`SELECT COUNT(*) n FROM shipments WHERE status IN ${ACTIVE} AND risk = 'delayed'`);
    const delayedParcels = n(`SELECT COUNT(*) n FROM parcels p JOIN shipments s ON s.id = p.shipmentId WHERE s.status IN ${ACTIVE} AND s.risk = 'delayed'`);
    const atRisk = n(`SELECT COUNT(*) n FROM shipments WHERE status IN ${ACTIVE} AND risk = 'risk'`);
    const problems = n(`SELECT COUNT(*) n FROM parcels WHERE status = 'problem' OR (clientId IS NULL AND status = 'received')`);
    const revenueWeek = get<{ s: number }>(`SELECT COALESCE(SUM(amountUsd),0) s FROM payments WHERE createdAt >= ?`, weekAgo)!.s;

    // Главный рейс для карточки: самый проблемный активный, иначе ближайший к прибытию
    const featuredRow =
      get<any>(`SELECT * FROM shipments WHERE status IN ${ACTIVE} AND transport = 'auto' AND risk != 'ok' ORDER BY risk = 'delayed' DESC, flaggedAt DESC LIMIT 1`) ??
      get<any>(`SELECT * FROM shipments WHERE status IN ${ACTIVE} ORDER BY etaAt LIMIT 1`);
    const featured = featuredRow ? { ...shipmentView(featuredRow, { withPath: true }), reroute: rerouteOption(featuredRow) } : null;

    // Мини-карта
    const live = all<any>(`SELECT * FROM shipments WHERE status IN ${ACTIVE}`).map((s) => {
      const v = shipmentView(s, { withPath: true });
      return { id: v.id, code: v.code, risk: v.risk, status: v.status, position: v.position, progress: v.progress, path: v.route.path, transport: v.transport };
    });

    // График рейсов (Gantt): 10 дней назад — 14 вперёд
    const from = new Date(now - 10 * DAY).toISOString();
    const timeline = all<any>(
      `SELECT s.*, t.plate, t.model, d.name driverName, d.color driverColor FROM shipments s
       LEFT JOIN trucks t ON t.id = s.truckId LEFT JOIN drivers d ON d.id = s.driverId
       WHERE s.status != 'completed' OR s.arrivedAt >= ? ORDER BY COALESCE(s.departedAt, s.plannedDeparture)`,
      from,
    ).map((s) => ({
      id: s.id,
      code: s.code,
      status: s.status,
      risk: s.risk,
      transport: s.transport,
      plate: s.plate,
      model: s.model,
      driverName: s.driverName,
      driverColor: s.driverColor,
      start: s.departedAt ?? s.plannedDeparture,
      plannedEnd: s.plannedArrival,
      end: s.arrivedAt ?? s.etaAt,
      route: getRoute(s.routeId).row.name,
    }));

    return {
      kpi: {
        parcelsActive,
        parcelsActiveDelta: parcelsActiveWeek ? Math.round(((parcelsActive - parcelsActiveWeek) / parcelsActiveWeek) * 1000) / 10 : 0,
        inTransit,
        trucksOnRoad,
        deliveredToday,
        readyForPickup,
        delayed,
        delayedParcels,
        atRisk,
        problems,
        revenueWeek: round2(revenueWeek),
      },
      featured,
      brief: buildBrief(),
      live,
      timeline,
      warehouses: all(`SELECT w.id, w.code, w.name, w.country, w.role, c.lat, c.lng FROM warehouses w JOIN cities c ON c.id = w.cityId`),
    };
  }),
);

// ---------- Ассистент ----------
r.get('/assistant/brief', h(() => buildBrief()));
r.post('/assistant/actions/:kind', h((req) => executeAction(req.params.kind, req.body ?? {}, actorOf(req))));

// ---------- Справочники ----------
r.get('/cities', h(() => all('SELECT * FROM cities ORDER BY country, name')));
r.get('/routes', h(() => all('SELECT id, code, name, via, transport, distanceKm, days, stops FROM routes WHERE active = 1').map((x: any) => ({ ...x, stops: JSON.parse(x.stops) }))));
r.get('/meta', h(() => ({ parcelStatus: PARCEL_STATUS, shipmentStatus: SHIPMENT_STATUS, cities: CITIES })));

// ---------- Рейсы ----------
r.get(
  '/shipments',
  h((req) => {
    const where: string[] = [];
    const p: unknown[] = [];
    const status = str(req.query.status);
    if (status === 'active') where.push(`s.status IN ${ACTIVE}`);
    else if (status === 'risk') where.push(`s.status IN ${ACTIVE} AND s.risk != 'ok'`);
    else if (status === 'upcoming') where.push(`s.status IN ('planned','loading')`);
    else if (status === 'done') where.push(`s.status IN ('arrived','completed')`);
    else if (status) {
      where.push('s.status = ?');
      p.push(status);
    }
    const q = str(req.query.q);
    if (q) {
      where.push(`(s.code LIKE ? OR t.plate LIKE ? OR d.name LIKE ?)`);
      p.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const rows = all<any>(
      `SELECT s.* FROM shipments s LEFT JOIN trucks t ON t.id = s.truckId LEFT JOIN drivers d ON d.id = s.driverId
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY CASE s.status WHEN 'border' THEN 0 WHEN 'customs' THEN 1 WHEN 'in_transit' THEN 2 WHEN 'loading' THEN 3 WHEN 'planned' THEN 4 WHEN 'arrived' THEN 5 ELSE 6 END,
                s.risk = 'delayed' DESC, s.risk = 'risk' DESC, s.id DESC`,
      ...p,
    );
    const counts = Object.fromEntries(
      all<{ k: string; n: number }>(
        `SELECT CASE WHEN status IN ${ACTIVE} THEN 'active' WHEN status IN ('planned','loading') THEN 'upcoming' ELSE 'done' END k, COUNT(*) n FROM shipments GROUP BY k`,
      ).map((x) => [x.k, x.n]),
    );
    counts.risk = get<{ n: number }>(`SELECT COUNT(*) n FROM shipments WHERE status IN ${ACTIVE} AND risk != 'ok'`)!.n;
    return { items: rows.map((s) => shipmentView(s)), counts };
  }),
);

r.get(
  '/shipments/:id',
  h((req) => {
    const s = get<any>('SELECT * FROM shipments WHERE id = ?', int(req.params.id));
    if (!s) throw notFound('Рейс');
    const view = shipmentView(s, { withPath: true });
    const events = all(`SELECT e.*, c.name cityName FROM shipment_events e LEFT JOIN cities c ON c.id = e.cityId WHERE shipmentId = ? ORDER BY at DESC, id DESC`, s.id);
    const parcels = all(
      `SELECT p.id, p.trackNumber, p.description, p.category, p.places, p.weightKg, p.volumeM3, p.status, p.price, p.paid,
              c.id clientId, c.code clientCode, c.name clientName, c.phone clientPhone
       FROM parcels p LEFT JOIN clients c ON c.id = p.clientId WHERE p.shipmentId = ? ORDER BY p.weightKg DESC`,
      s.id,
    );
    const clients = all(
      `SELECT c.id, c.code, c.name, c.phone, c.telegram, c.email, c.color, COUNT(p.id) parcels, ROUND(SUM(p.weightKg),1) kg
       FROM parcels p JOIN clients c ON c.id = p.clientId WHERE p.shipmentId = ? GROUP BY c.id ORDER BY kg DESC`,
      s.id,
    );
    const shares = all('SELECT * FROM shares WHERE shipmentId = ? AND active = 1 ORDER BY createdAt DESC', s.id);
    const altRoutes = all<any>(`SELECT id, code, name, via, distanceKm, days FROM routes WHERE active = 1 AND transport = ? AND id != ?`, s.transport, s.routeId);
    const opt = rerouteOption(s);
    return { ...view, events, parcels, clients, shares, reroute: opt ? { ...opt, path: getRoute(opt.toRouteId).path } : null, altRoutes };
  }),
);

r.post(
  '/shipments',
  h((req) => {
    const b = req.body ?? {};
    const routeId = int(b.routeId);
    if (!routeId) throw bad('Выберите маршрут');
    const route = getRoute(routeId);
    const originWh =
      int(b.originWarehouseId) ??
      get<{ id: number }>(`SELECT w.id FROM warehouses w JOIN cities c ON c.id = w.cityId WHERE c.code = ?`, route.stops[0].code)?.id;
    const destWh =
      int(b.destWarehouseId) ??
      get<{ id: number }>(`SELECT w.id FROM warehouses w JOIN cities c ON c.id = w.cityId WHERE c.code = ?`, route.stops[route.stops.length - 1].code)?.id;
    const plannedDeparture = str(b.plannedDeparture) ?? new Date(Date.now() + DAY).toISOString();
    const truckId = int(b.truckId) ?? null;
    const truck = truckId ? get<any>('SELECT * FROM trucks WHERE id = ?', truckId) : null;
    const id = insert('shipments', {
      code: nextShipmentCode(),
      routeId,
      truckId,
      driverId: int(b.driverId) ?? truck?.driverId ?? null,
      originWarehouseId: originWh,
      destWarehouseId: destWh,
      status: b.status === 'loading' ? 'loading' : 'planned',
      transport: route.row.transport,
      plannedDeparture,
      plannedArrival: new Date(Date.parse(plannedDeparture) + route.row.days * DAY).toISOString(),
      etaAt: new Date(Date.parse(plannedDeparture) + route.row.days * DAY).toISOString(),
      progress: 0,
      risk: 'ok',
      trackingToken: token(9),
      notes: str(b.notes) ?? null,
      createdAt: nowIso(),
    });
    insertEvent(id, 'planned', 'Рейс запланирован', route.row.name + ' ' + route.row.via, req.user!.name);
    audit(actorOf(req), 'shipment.create', 'shipment', id);
    return shipmentView(get('SELECT * FROM shipments WHERE id = ?', id));
  }),
);

r.patch(
  '/shipments/:id',
  h((req) => {
    const id = int(req.params.id)!;
    const s = get<any>('SELECT * FROM shipments WHERE id = ?', id);
    if (!s) throw notFound('Рейс');
    const b = req.body ?? {};
    const patch: Record<string, unknown> = {};
    if (b.truckId !== undefined) {
      patch.truckId = b.truckId ? int(b.truckId) : null;
      const truck = patch.truckId ? get<any>('SELECT * FROM trucks WHERE id = ?', patch.truckId) : null;
      if (truck?.driverId && b.driverId === undefined) patch.driverId = truck.driverId;
    }
    if (b.driverId !== undefined) patch.driverId = b.driverId ? int(b.driverId) : null;
    for (const k of ['notes', 'sealNumber', 'declaration', 'plannedDeparture', 'etaAt']) if (b[k] !== undefined) patch[k] = b[k] || null;
    update('shipments', id, patch);
    audit(actorOf(req), 'shipment.update', 'shipment', id, patch);
    return shipmentView(get('SELECT * FROM shipments WHERE id = ?', id));
  }),
);

r.post(
  '/shipments/:id/status',
  h((req) => {
    const status = str(req.body?.status) as ShipmentStatus;
    if (!status || !(status in SHIPMENT_STATUS)) throw bad('Неверный статус');
    changeShipmentStatus(int(req.params.id)!, status, actorOf(req), str(req.body?.note));
    return shipmentView(get('SELECT * FROM shipments WHERE id = ?', int(req.params.id)));
  }),
);

r.post(
  '/shipments/:id/events',
  h((req) => {
    const id = int(req.params.id)!;
    const s = get<any>('SELECT * FROM shipments WHERE id = ?', id);
    if (!s) throw notFound('Рейс');
    const b = req.body ?? {};
    const type = str(b.type) ?? 'note';
    const title = str(b.title) ?? (type === 'delay' ? 'Задержка' : 'Заметка');
    insertEvent(id, type, title, str(b.description), req.user!.name, int(b.cityId));
    if (type === 'delay') {
      const hours = Number(b.delayHours) || 0;
      const eta = new Date(Date.parse(s.etaAt) + hours * 3600000).toISOString();
      update('shipments', id, { risk: 'delayed', delayReason: str(b.description) ?? title, delayHours: (s.delayHours || 0) + hours, etaAt: eta, flaggedAt: nowIso(), delayNotifiedAt: null });
      notify('risk', `Рейс ${s.code}: задержка`, str(b.description) ?? title, `/shipments/${id}`, 'danger');
    }
    if (type === 'resolved') update('shipments', id, { risk: 'ok', delayReason: null });
    audit(actorOf(req), `shipment.event.${type}`, 'shipment', id, title);
    return { ok: true };
  }),
);

r.post(
  '/shipments/:id/reroute',
  h((req) => {
    const s = get<any>('SELECT * FROM shipments WHERE id = ?', int(req.params.id));
    if (!s) throw notFound('Рейс');
    const toRouteId = int(req.body?.routeId);
    if (!toRouteId) throw bad('Укажите маршрут');
    const opt = rerouteOption(s);
    applyReroute(s, toRouteId, actorOf(req), opt && opt.toRouteId === toRouteId ? opt.proposedEta : undefined);
    clearRouteCache();
    return shipmentView(get('SELECT * FROM shipments WHERE id = ?', s.id));
  }),
);

r.post(
  '/shipments/:id/share',
  h((req) => {
    const s = get<any>('SELECT * FROM shipments WHERE id = ?', int(req.params.id));
    if (!s) throw notFound('Рейс');
    const b = req.body ?? {};
    const flags = { showMap: b.showMap !== false, showDriver: !!b.showDriver, showCargo: b.showCargo !== false, expires: str(b.expires) ?? 'after_delivery_24h' };
    const existing = str(b.token) ? get<any>('SELECT token FROM shares WHERE token = ? AND shipmentId = ?', str(b.token), s.id) : undefined;
    const t = existing?.token ?? token(8);
    if (existing) update('shares', t, { ...flags, active: 1 }, 'token');
    else insert('shares', { token: t, shipmentId: s.id, ...flags, createdAt: nowIso(), active: 1 });
    const origin = str(b.origin) ?? '';
    const url = `${origin}/t/${t}`;
    const ids: number[] = Array.isArray(b.clientIds) ? b.clientIds.map(Number).filter(Boolean) : [];
    for (const cid of ids) messageClient(cid, `Отслеживайте рейс ${s.code} с вашими посылками в реальном времени: ${url}`, { shipmentId: s.id, share: t });
    if (ids.length || !existing) insertEvent(s.id, 'share', ids.length ? 'Ссылка на трекинг отправлена' : 'Создана ссылка на трекинг', ids.length ? `${ids.length} клиентам` : null, req.user!.name);
    audit(actorOf(req), 'shipment.share', 'shipment', s.id, { token: t, clients: ids.length });
    return { token: t, url, sent: ids.length };
  }),
);

r.delete(
  '/shares/:token',
  h((req) => {
    update('shares', req.params.token, { active: 0 }, 'token');
    return { ok: true };
  }),
);

r.get('/shipments/:id/manifest.csv', (req, res) => {
  const s = get<any>('SELECT * FROM shipments WHERE id = ?', int(req.params.id));
  if (!s) return res.status(404).end();
  const rows = all<any>(
    `SELECT p.trackNumber, c.code, c.name, c.phone, p.description, p.places, p.weightKg, p.volumeM3, p.price, p.paid
     FROM parcels p LEFT JOIN clients c ON c.id = p.clientId WHERE p.shipmentId = ? ORDER BY c.code`,
    s.id,
  );
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Трек-номер', 'Код клиента', 'Клиент', 'Телефон', 'Товар', 'Мест', 'Вес, кг', 'Объём, м³', 'Сумма, $', 'Оплачено'];
  const csv = '﻿' + [head, ...rows.map((r) => [r.trackNumber, r.code, r.name, r.phone, r.description, r.places, r.weightKg, r.volumeM3, r.price, r.paid ? 'да' : 'нет'])].map((l) => l.map(esc).join(';')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="manifest-${s.code}.csv"`);
  res.send(csv);
});

// ---------- Live-трекинг ----------
r.get(
  '/live',
  h(() => {
    const ships = all<any>(`SELECT * FROM shipments WHERE status IN ${ACTIVE} OR status IN ('loading','planned') ORDER BY risk = 'delayed' DESC, risk = 'risk' DESC, etaAt`).map((s) => shipmentView(s, { withPath: true }));
    const warehouses = all(`SELECT w.*, c.lat, c.lng, c.name cityName FROM warehouses w JOIN cities c ON c.id = w.cityId`);
    const borders = all(`SELECT * FROM cities WHERE kind = 'border'`);
    const idleTrucks = all(`SELECT t.*, d.name driverName FROM trucks t LEFT JOIN drivers d ON d.id = t.driverId WHERE t.status != 'on_trip'`);
    return { shipments: ships, warehouses, borders, idleTrucks };
  }),
);

// ---------- Склады ----------
const warehouseStats = (id: number) =>
  get<any>(
    `SELECT
      SUM(CASE WHEN status IN ('received','arrived','problem') AND warehouseId = ? THEN 1 ELSE 0 END) onHand,
      ROUND(SUM(CASE WHEN status IN ('received','arrived','problem') AND warehouseId = ? THEN weightKg ELSE 0 END),1) kg,
      ROUND(SUM(CASE WHEN status IN ('received','arrived','problem') AND warehouseId = ? THEN volumeM3 ELSE 0 END),2) m3,
      SUM(CASE WHEN status = 'arrived' AND warehouseId = ? THEN 1 ELSE 0 END) readyForPickup,
      SUM(CASE WHEN status = 'received' AND warehouseId = ? AND shipmentId IS NULL THEN 1 ELSE 0 END) awaitingShipment,
      SUM(CASE WHEN status IN ('in_transit','customs') AND destWarehouseId = ? THEN 1 ELSE 0 END) incoming,
      SUM(CASE WHEN status = 'expected' AND destWarehouseId = ? THEN 1 ELSE 0 END) expected,
      SUM(CASE WHEN clientId IS NULL AND warehouseId = ? AND status = 'received' THEN 1 ELSE 0 END) unidentified
     FROM parcels`,
    id, id, id, id, id, id, id, id,
  );

r.get(
  '/warehouses',
  h(() =>
    all<any>(`SELECT w.*, c.name cityName, c.nameLocal cityLocal, c.lat, c.lng FROM warehouses w JOIN cities c ON c.id = w.cityId ORDER BY w.country, w.id`).map((w) => ({
      ...w,
      stats: warehouseStats(w.id),
      outbound: all(`SELECT id, code, status, plannedDeparture FROM shipments WHERE originWarehouseId = ? AND status IN ('planned','loading')`, w.id),
      inbound: all(`SELECT id, code, status, etaAt, risk FROM shipments WHERE destWarehouseId = ? AND status IN ${ACTIVE}`, w.id),
    })),
  ),
);
r.post(
  '/warehouses',
  h((req) => {
    const b = req.body ?? {};
    if (!str(b.name) || !str(b.code) || !int(b.cityId)) throw bad('Заполните код, название и город');
    const city = get<any>('SELECT * FROM cities WHERE id = ?', int(b.cityId));
    const id = insert('warehouses', {
      code: str(b.code)!.toUpperCase(),
      name: str(b.name),
      country: city.country,
      cityId: city.id,
      role: str(b.role) ?? (city.country === 'CN' ? 'origin' : 'destination'),
      address: str(b.address) ?? '',
      addressLocal: str(b.addressLocal),
      receiverName: str(b.receiverName),
      receiverPhone: str(b.receiverPhone),
      zip: str(b.zip),
      phone: str(b.phone),
      manager: str(b.manager),
      managerPhone: str(b.managerPhone),
      workHours: str(b.workHours),
      capacityM3: Number(b.capacityM3) || null,
      notes: str(b.notes),
      active: 1,
    });
    audit(actorOf(req), 'warehouse.create', 'warehouse', id);
    return get('SELECT * FROM warehouses WHERE id = ?', id);
  }),
);
r.patch(
  '/warehouses/:id',
  h((req) => {
    const b = req.body ?? {};
    const fields = ['name', 'address', 'addressLocal', 'receiverName', 'receiverPhone', 'zip', 'phone', 'manager', 'managerPhone', 'workHours', 'capacityM3', 'notes', 'active'];
    const patch = Object.fromEntries(fields.filter((f) => b[f] !== undefined).map((f) => [f, b[f]]));
    update('warehouses', int(req.params.id)!, patch);
    audit(actorOf(req), 'warehouse.update', 'warehouse', int(req.params.id), patch);
    return get('SELECT * FROM warehouses WHERE id = ?', int(req.params.id));
  }),
);

// ---------- Транспорт и водители ----------
r.get(
  '/trucks',
  h(() =>
    all<any>(
      `SELECT t.*, d.name driverName, d.phone driverPhone, d.color driverColor,
        (SELECT id FROM shipments s WHERE s.truckId = t.id AND s.status NOT IN ('arrived','completed') ORDER BY s.id DESC LIMIT 1) shipmentId,
        (SELECT code FROM shipments s WHERE s.truckId = t.id AND s.status NOT IN ('arrived','completed') ORDER BY s.id DESC LIMIT 1) shipmentCode,
        (SELECT COUNT(*) FROM shipments s WHERE s.truckId = t.id) trips
       FROM trucks t LEFT JOIN drivers d ON d.id = t.driverId ORDER BY t.status = 'on_trip' DESC, t.id`,
    ),
  ),
);
r.post(
  '/trucks',
  h((req) => {
    const b = req.body ?? {};
    if (!str(b.plate) || !str(b.model)) throw bad('Укажите госномер и модель');
    const id = insert('trucks', {
      plate: str(b.plate),
      trailerPlate: str(b.trailerPlate),
      model: str(b.model),
      kind: str(b.kind) ?? 'Тент',
      capacityKg: Number(b.capacityKg) || 20000,
      capacityM3: Number(b.capacityM3) || 82,
      year: int(b.year),
      status: 'available',
      driverId: int(b.driverId) ?? null,
      fuel: 100,
      odometer: Number(b.odometer) || 0,
    });
    audit(actorOf(req), 'truck.create', 'truck', id);
    return get('SELECT * FROM trucks WHERE id = ?', id);
  }),
);
r.patch(
  '/trucks/:id',
  h((req) => {
    const b = req.body ?? {};
    const fields = ['plate', 'trailerPlate', 'model', 'kind', 'capacityKg', 'capacityM3', 'year', 'status', 'driverId', 'notes', 'odometer'];
    const patch = Object.fromEntries(fields.filter((f) => b[f] !== undefined).map((f) => [f, b[f]]));
    update('trucks', int(req.params.id)!, patch);
    audit(actorOf(req), 'truck.update', 'truck', int(req.params.id), patch);
    return get('SELECT * FROM trucks WHERE id = ?', int(req.params.id));
  }),
);
r.get(
  '/drivers',
  h(() =>
    all(
      `SELECT d.*, t.id truckId, t.plate, t.model,
        (SELECT code FROM shipments s WHERE s.driverId = d.id AND s.status IN ${ACTIVE} LIMIT 1) shipmentCode,
        (SELECT id FROM shipments s WHERE s.driverId = d.id AND s.status IN ${ACTIVE} LIMIT 1) shipmentId,
        (SELECT COUNT(*) FROM shipments s WHERE s.driverId = d.id) trips,
        (SELECT id FROM conversations c WHERE c.driverId = d.id LIMIT 1) conversationId
       FROM drivers d LEFT JOIN trucks t ON t.driverId = d.id ORDER BY d.status = 'on_trip' DESC, d.name`,
    ),
  ),
);
r.post(
  '/drivers',
  h((req) => {
    const b = req.body ?? {};
    if (!str(b.name) || !str(b.phone)) throw bad('Укажите имя и телефон');
    const id = insert('drivers', {
      name: str(b.name),
      phone: str(b.phone),
      license: str(b.license),
      citizenship: str(b.citizenship) ?? 'Таджикистан',
      experienceYears: int(b.experienceYears),
      status: 'available',
      rating: 5,
      color: '#6B4EFF',
      notes: str(b.notes),
    });
    audit(actorOf(req), 'driver.create', 'driver', id);
    return get('SELECT * FROM drivers WHERE id = ?', id);
  }),
);
r.patch(
  '/drivers/:id',
  h((req) => {
    const b = req.body ?? {};
    const fields = ['name', 'phone', 'license', 'citizenship', 'experienceYears', 'status', 'notes'];
    const patch = Object.fromEntries(fields.filter((f) => b[f] !== undefined).map((f) => [f, b[f]]));
    update('drivers', int(req.params.id)!, patch);
    return get('SELECT * FROM drivers WHERE id = ?', int(req.params.id));
  }),
);

export default r;
export { fmtDate };
