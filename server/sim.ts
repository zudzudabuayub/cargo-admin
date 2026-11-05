// Симуляция GPS: двигает траки по маршрутам, отмечает пройденные города и КПП.
// В реальной работе сюда подключается GPS-трекер (Wialon, GPS-Trace и т.п.) или приложение водителя.
import { all, insert, nowIso, update } from './db.js';
import { getRoute, notify } from './domain.js';
import { pointAt } from './geo.js';
import { publish } from './realtime.js';
import { autoRun } from './agents.js';

const TICK_MS = 30_000;
const lastTick = new Map<number, number>();
const arrivalNotified = new Set<number>();

export function simulateTick() {
  const now = Date.now();
  const rows = all<any>(`SELECT * FROM shipments WHERE status = 'in_transit' AND departedAt IS NOT NULL`);
  const positions: unknown[] = [];
  for (const s of rows) {
    const route = getRoute(s.routeId);
    const prev = lastTick.get(s.id) ?? now - TICK_MS;
    lastTick.set(s.id, now);
    const dt = Math.max(0, now - prev);
    let eta = Date.parse(s.etaAt);
    let progress: number = s.progress;
    const patch: Record<string, unknown> = {};

    if (progress < 0.999) {
      if (eta <= now + 3600_000) {
        // Опаздывает относительно прогноза — пересчитываем ETA
        const extra = Math.max(4 * 3600_000, (1 - progress) * route.row.days * 86400_000);
        eta = now + extra;
        patch.etaAt = new Date(eta).toISOString();
        patch.delayHours = Math.round((eta - Date.parse(s.plannedArrival ?? s.etaAt)) / 3600_000);
        if (s.risk === 'ok') {
          patch.risk = 'risk';
          patch.flaggedAt = nowIso();
          patch.delayReason = s.delayReason ?? 'Движение медленнее графика';
          notify('risk', `Рейс ${s.code}: ETA пересчитан`, `Новый прогноз — ${new Date(eta).toLocaleString('ru-RU', { timeZone: 'Asia/Dushanbe' })}`, `/shipments/${s.id}`, 'warning');
        }
      }
      const rate = (1 - progress) / Math.max(eta - now, dt || 1);
      const next = Math.min(0.999, progress + rate * dt);
      // Пройденные остановки
      for (const st of route.stops) {
        if (st.at > progress && st.at <= next && st.at < 1) {
          insert('shipment_events', {
            shipmentId: s.id,
            type: 'checkpoint',
            title: st.kind === 'border' ? `КПП ${st.name}` : `Прошёл ${st.name}`,
            description: st.kind === 'border' ? 'Граница пройдена' : null,
            actor: 'GPS',
            at: nowIso(),
          });
        }
      }
      progress = next;
    } else if (!arrivalNotified.has(s.id)) {
      arrivalNotified.add(s.id);
      notify('shipment', `Рейс ${s.code} подъезжает к складу`, 'Подтвердите приёмку рейса, чтобы клиенты получили уведомления.', `/shipments/${s.id}`, 'info');
    }

    const [lat, lng] = pointAt(route.path, progress);
    const speed = s.transport === 'air' ? 780 : progress >= 0.999 ? 0 : Math.round(45 + Math.random() * 35 - (s.risk !== 'ok' ? 20 : 0));
    update('shipments', s.id, { ...patch, progress, speed });
    if (s.truckId) {
      update('trucks', s.truckId, { lat, lng, speed, lastSeenAt: nowIso() });
    }
    positions.push({ shipmentId: s.id, truckId: s.truckId, lat, lng, progress, speed, etaAt: patch.etaAt ?? s.etaAt });
  }
  if (positions.length) publish('admin', 'positions', positions);
}

export function startSimulation() {
  simulateTick();
  return setInterval(() => {
    try {
      simulateTick();
      autoRun();
    } catch (e) {
      console.error('[sim]', e);
    }
  }, TICK_MS);
}
