// Публичный трекинг (без входа): по ссылке «Поделиться», по трек-номеру посылки или коду рейса.
import { Router } from 'express';
import { all, get, getSetting } from '../db.js';
import { PARCEL_STATUS, shipmentView } from '../domain.js';
import { h, notFound } from '../http.js';

const r = Router();

function publicShipment(s: any, opts: { showMap: boolean; showDriver: boolean; showCargo: boolean }) {
  const v = shipmentView(s, { withPath: opts.showMap });
  return {
    code: v.code,
    status: v.status,
    statusLabel: v.statusLabel,
    transport: v.transport,
    risk: v.risk,
    delayReason: v.risk !== 'ok' ? v.delayReason : null,
    departedAt: v.departedAt,
    plannedArrival: v.plannedArrival,
    etaAt: v.etaAt,
    arrivedAt: v.arrivedAt,
    progress: v.progress,
    remainingKm: v.remainingKm,
    route: { name: v.route.name, via: v.route.via, stops: v.route.stops, path: opts.showMap ? (v.route as any).path : undefined, distanceKm: v.route.distanceKm },
    position: opts.showMap ? v.position : null,
    origin: v.origin?.name,
    dest: v.dest?.name,
    driver: opts.showDriver && v.driver ? { name: (v.driver as any).name, phone: (v.driver as any).phone } : null,
    truck: v.truck ? { model: (v.truck as any).model, kind: (v.truck as any).kind } : null,
    cargo: opts.showCargo ? { parcels: v.load.n, places: v.load.places, kg: v.load.kg } : null,
    events: all(`SELECT e.type, e.title, e.at, c.name city FROM shipment_events e LEFT JOIN cities c ON c.id = e.cityId WHERE shipmentId = ? AND e.type NOT IN ('note','share','planned') ORDER BY at DESC`, s.id),
  };
}

r.get(
  '/track/:q',
  h((req) => {
    const q = req.params.q.trim();
    const company = getSetting<any>('company', {});
    const share = get<any>('SELECT * FROM shares WHERE token = ? AND active = 1', q);
    if (share?.shipmentId) {
      const s = get<any>('SELECT * FROM shipments WHERE id = ?', share.shipmentId);
      if (s.arrivedAt && share.expires === 'after_delivery_24h' && Date.now() - Date.parse(s.arrivedAt) > 86400000) throw notFound('Ссылка');
      return { kind: 'shipment', company: { name: company.name, phone: company.phone }, shipment: publicShipment(s, { showMap: !!share.showMap, showDriver: !!share.showDriver, showCargo: !!share.showCargo }) };
    }
    const byToken = get<any>('SELECT * FROM shipments WHERE trackingToken = ?', q);
    if (byToken) return { kind: 'shipment', company: { name: company.name, phone: company.phone }, shipment: publicShipment(byToken, { showMap: true, showDriver: false, showCargo: false }) };
    const p = get<any>(`SELECT p.*, dw.name destName, dw.address destAddress, dw.workHours destHours FROM parcels p LEFT JOIN warehouses dw ON dw.id = p.destWarehouseId WHERE p.trackNumber = ? COLLATE NOCASE`, q);
    if (p) {
      const s = p.shipmentId ? get<any>('SELECT * FROM shipments WHERE id = ?', p.shipmentId) : null;
      return {
        kind: 'parcel',
        company: { name: company.name, phone: company.phone },
        parcel: {
          trackNumber: p.trackNumber,
          status: p.status,
          statusLabel: PARCEL_STATUS[p.status as keyof typeof PARCEL_STATUS],
          places: p.places,
          weightKg: p.weightKg,
          dest: p.destName,
          destAddress: p.status === 'arrived' ? p.destAddress : null,
          destHours: p.status === 'arrived' ? p.destHours : null,
          events: all('SELECT status, note, at FROM parcel_events WHERE parcelId = ? ORDER BY at DESC', p.id),
        },
        shipment: s ? publicShipment(s, { showMap: true, showDriver: false, showCargo: false }) : null,
      };
    }
    throw notFound('Отправление');
  }),
);

r.get('/company', h(() => getSetting('company', {})));

export default r;
