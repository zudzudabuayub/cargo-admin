// «Ассистент операций»: анализирует рейсы, склады и финансы, предлагает действия.
// Все действия выполняются только после подтверждения сотрудником и пишутся в журнал.
import { all, get, getSetting, insert, nowIso, run, setSetting, tx, update } from './db.js';
import { audit, clearRouteCache, clientBalance, fmtDate, getRoute, insertEvent, messageClient, notify, type Actor } from './domain.js';
import { publish } from './realtime.js';

export const plural = (n: number, forms: [string, string, string]) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
};

const ACTIVE = `('in_transit','border','customs')`;
const DAY = 86400000;

export interface RerouteOption {
  shipmentId: number;
  code: string;
  fromRouteId: number;
  toRouteId: number;
  toRouteName: string;
  via: string;
  currentEta: string;
  proposedEta: string;
  savedHours: number;
  extraKm: number;
  newProgress: number;
  currentVia: string;
}

/** Альтернативный маршрут через Кульму для рейсов, которые ещё не прошли Кашгар. */
export function rerouteOption(s: any): RerouteOption | null {
  const route = getRoute(s.routeId);
  if (!route.row.code.includes('-IRK') || !['in_transit', 'loading', 'planned'].includes(s.status)) return null;
  const altCode = route.row.code.replace('-IRK', '-KUL');
  const alt = get<any>('SELECT * FROM routes WHERE code = ?', altCode);
  if (!alt) return null;
  const khg = route.stops.find((st) => st.code === 'KHG');
  if (!khg || s.progress >= khg.at - 0.005) return null;
  const altRoute = getRoute(alt.id);
  const traveled = s.progress * route.row.distanceKm;
  const newProgress = traveled / altRoute.row.distanceKm;
  const kmPerDay = route.row.distanceKm / route.row.days;
  const now = Date.now();
  const proposed = now + ((altRoute.row.distanceKm - traveled) / kmPerDay) * DAY + 5 * 3600000;
  const current = Date.parse(s.etaAt);
  const savedHours = Math.round((current - proposed) / 3600000);
  if (savedHours < 4) return null;
  return {
    shipmentId: s.id,
    code: s.code,
    fromRouteId: s.routeId,
    toRouteId: alt.id,
    toRouteName: alt.name,
    via: alt.via,
    currentVia: route.row.via,
    currentEta: s.etaAt,
    proposedEta: new Date(proposed).toISOString(),
    savedHours,
    extraKm: Math.round(altRoute.row.distanceKm - route.row.distanceKm),
    newProgress,
  };
}

const recently = (action: string, hours = 20) =>
  !!get(`SELECT id FROM audit_log WHERE action = ? AND createdAt > ?`, action, new Date(Date.now() - hours * 3600000).toISOString());

export function buildBrief() {
  const now = Date.now();
  const atRisk = all<any>(`SELECT * FROM shipments WHERE status IN ${ACTIVE} AND risk != 'ok' ORDER BY risk = 'delayed' DESC, delayHours DESC`);
  const active = get<{ n: number }>(`SELECT COUNT(*) n FROM shipments WHERE status IN ${ACTIVE}`)!.n;

  // Причины
  const causeDefs: [string, RegExp][] = [
    ['Очередь на КПП Иркештам', /иркештам|кпп|границ/i],
    ['Погода на перевалах', /снег|перевал|погод|лавин/i],
    ['Таможенный досмотр', /тамож|досмотр/i],
    ['Техника и водители', /полом|ремонт|водител/i],
  ];
  const causes = causeDefs
    .map(([label, re]) => ({ label, count: atRisk.filter((s) => re.test(s.delayReason ?? '')).length }))
    .filter((c) => c.count > 0);
  const other = atRisk.length - causes.reduce((a, c) => a + c.count, 0);
  if (other > 0) causes.push({ label: 'Медленнее графика', count: other });

  const waitingPickup = get<{ n: number; c: number }>(
    `SELECT COUNT(*) n, COUNT(DISTINCT clientId) c FROM parcels WHERE status = 'arrived' AND arrivedAt < ?`,
    new Date(now - 3 * DAY).toISOString(),
  )!;
  const unidentified = get<{ n: number }>(`SELECT COUNT(*) n FROM parcels WHERE clientId IS NULL AND status IN ('received','problem')`)!.n;
  const problems = get<{ n: number }>(`SELECT COUNT(*) n FROM parcels WHERE status = 'problem'`)!.n;
  const debtors = all<{ id: number; name: string }>(`SELECT id, name FROM clients WHERE status != 'blocked'`)
    .map((c) => ({ ...c, balance: clientBalance(c.id) }))
    .filter((c) => c.balance < -20);

  const signals = [
    ...causes.map((c) => ({ label: c.label, value: c.count, unit: plural(c.count, ['рейс', 'рейса', 'рейсов']) })),
    ...(waitingPickup.n ? [{ label: 'Ждут выдачи более 3 дней', value: waitingPickup.n, unit: 'пос.' }] : []),
    ...(unidentified ? [{ label: 'Посылки без кода клиента', value: unidentified, unit: 'пос.' }] : []),
  ];
  const maxSignal = Math.max(1, ...signals.map((s) => s.value));

  // Предложения (каждое — с описанием, эффектом и агентом-автором)
  const actions: any[] = [];
  const toNotify = atRisk.filter((s) => !s.delayNotifiedAt);
  if (toNotify.length) {
    const clients = get<{ n: number }>(
      `SELECT COUNT(DISTINCT clientId) n FROM parcels WHERE shipmentId IN (${toNotify.map(() => '?').join(',')}) AND clientId IS NOT NULL`,
      ...toNotify.map((s) => s.id),
    )!.n;
    actions.push({
      id: 'notify_delays',
      agent: 'customer',
      icon: 'send',
      title: `Уведомить ${clients} ${plural(clients, ['клиента', 'клиентов', 'клиентов'])} о задержке`,
      desc: `Рейсы ${toNotify.map((s) => s.code).join(', ')} опаздывают к сроку. Клиенты ещё не знают о новой дате прибытия.`,
      impact: 'Черновики готовы',
      hint: 'черновики готовы',
      shipmentIds: toNotify.map((s) => s.id),
    });
  }
  const reroutes = atRisk.map(rerouteOption).filter(Boolean) as RerouteOption[];
  for (const r of reroutes.slice(0, 2)) {
    const sh = atRisk.find((x) => x.id === r.shipmentId);
    actions.push({
      id: 'reroute',
      agent: 'route',
      icon: 'route',
      title: `Перенаправить ${r.code} ${r.via.replace(' (Памир)', '')}`,
      desc: `${sh?.delayReason ?? 'Задержка на маршруте'}. Объезд ${r.via}: ${r.extraKm >= 0 ? '+' : ''}${r.extraKm} км, но прибытие раньше.`,
      impact: `ETA −${r.savedHours} ч`,
      hint: `экономия ${r.savedHours} ч`,
      reroute: r,
      shipmentId: r.shipmentId,
    });
  }
  if (waitingPickup.c && !recently('assistant.pickup_reminder')) {
    actions.push({
      id: 'pickup_reminder',
      agent: 'customer',
      icon: 'package',
      title: `Напомнить ${waitingPickup.c} ${plural(waitingPickup.c, ['клиенту', 'клиентам', 'клиентам'])} забрать посылки`,
      desc: `${waitingPickup.n} ${plural(waitingPickup.n, ['посылка лежит', 'посылки лежат', 'посылок лежат'])} на складах выдачи больше 3 дней.`,
      impact: 'Освободит склад',
      hint: `${waitingPickup.n} пос. на складах`,
    });
  }
  if (debtors.length && !recently('assistant.debt_reminder')) {
    const sum = Math.round(-debtors.reduce((a, d) => a + d.balance, 0));
    const top = [...debtors].sort((a, b) => a.balance - b.balance)[0];
    actions.push({
      id: 'debt_reminder',
      agent: 'finance',
      icon: 'wallet',
      title: `Напомнить ${debtors.length} ${plural(debtors.length, ['должнику', 'должникам', 'должникам'])} об оплате`,
      desc: `Посылки выданы или ждут выдачи, оплата не поступила. Самый крупный долг — ${top.name}.`,
      impact: `$${sum.toLocaleString('ru-RU')}`,
      hint: `$${sum.toLocaleString('ru-RU')}`,
    });
  }
  if (unidentified)
    actions.push({
      id: 'open_unidentified',
      agent: 'exceptions',
      icon: 'search',
      title: `Разобрать ${unidentified} ${plural(unidentified, ['посылку', 'посылки', 'посылок'])} без кода`,
      desc: 'На складах в Китае лежат посылки без кода клиента. Найдите владельцев по трек-номеру или фото.',
      impact: 'Склады Китая',
      hint: 'склады Китая',
      link: '/parcels?filter=unidentified',
    });
  const noTruck = all<any>(`SELECT id, code FROM shipments WHERE status IN ('planned','loading') AND truckId IS NULL`);
  const freeTrucks = get<{ n: number }>(`SELECT COUNT(*) n FROM trucks WHERE status = 'available'`)!.n;
  for (const sh of noTruck)
    actions.push({
      id: 'open_shipment',
      agent: 'dispatch',
      icon: 'truck',
      title: `Назначить трак на ${sh.code}`,
      desc: `Рейс запланирован без транспорта. Свободно ${freeTrucks} ${plural(freeTrucks, ['трак', 'трака', 'траков'])}.`,
      impact: 'Нет транспорта',
      hint: 'нет транспорта',
      link: `/shipments/${sh.id}`,
      shipmentId: sh.id,
    });
  const unassigned = get<{ n: number }>(`SELECT COUNT(*) n FROM parcels WHERE status = 'received' AND shipmentId IS NULL AND clientId IS NOT NULL`)!.n;
  if (unassigned)
    actions.push({
      id: 'auto_assign',
      agent: 'dispatch',
      icon: 'package',
      title: `Распределить ${unassigned} ${plural(unassigned, ['посылку', 'посылки', 'посылок'])} по рейсам`,
      desc: 'Посылки на складах в Китае ещё не включены в рейс. Агент загрузит их в ближайшие рейсы со свободным местом.',
      impact: 'Загрузка траков',
      hint: 'автозагрузка',
    });

  // Скрытые сотрудником предложения (на 24 часа)
  const dismissed = getSetting<Record<string, string>>('dismissedActions', {});
  const nowStr = nowIso();
  for (const a of actions) a.key = `${a.id}:${a.shipmentId ?? ''}`;
  const visible = actions.filter((a) => !(dismissed[a.key] && dismissed[a.key] > nowStr));

  const n = atRisk.length;
  const headline = n
    ? `${n} ${plural(n, ['рейс может', 'рейса могут', 'рейсов могут'])} опоздать. Остальная сеть идёт по плану.`
    : 'Все рейсы идут по плану. Срочных действий не требуется.';

  return {
    generatedAt: nowIso(),
    agents: 4,
    confidence: n ? 92 : 97,
    headline,
    activeShipments: active,
    atRisk: atRisk.map((s) => ({ id: s.id, code: s.code, risk: s.risk, delayReason: s.delayReason, delayHours: s.delayHours })),
    signals: signals.map((s) => ({ ...s, share: s.value / maxSignal })),
    actions: visible,
    stats: { waitingPickup: waitingPickup.n, unidentified, problems, debtors: debtors.length, unassigned },
  };
}

export function executeAction(kind: string, body: any, actor: Actor) {
  if (kind === 'notify_delays') {
    const ids: number[] = body.shipmentIds?.length
      ? body.shipmentIds
      : all<{ id: number }>(`SELECT id FROM shipments WHERE status IN ${ACTIVE} AND risk != 'ok' AND delayNotifiedAt IS NULL`).map((r) => r.id);
    let sent = 0;
    tx(() => {
      for (const id of ids) {
        const s = get<any>('SELECT * FROM shipments WHERE id = ?', id);
        if (!s) continue;
        const clients = all<{ clientId: number; n: number }>(
          'SELECT clientId, COUNT(*) n FROM parcels WHERE shipmentId = ? AND clientId IS NOT NULL GROUP BY clientId',
          id,
        );
        for (const c of clients) {
          messageClient(
            c.clientId,
            `Рейс ${s.code} с вашими посылками (${c.n} шт.) задерживается${s.delayReason ? `: ${s.delayReason.toLowerCase()}` : ''}. Новая ориентировочная дата прибытия — ${fmtDate(s.etaAt)}. Приносим извинения, будем держать вас в курсе.`,
            { shipmentId: id, kind: 'delay' },
          );
          sent++;
        }
        update('shipments', id, { delayNotifiedAt: nowIso() });
        insertEvent(id, 'note', 'Клиенты уведомлены о задержке', `${clients.length} клиентов`, actor.name);
      }
    });
    audit(actor, 'assistant.notify_delays', 'shipment', undefined, { ids, sent });
    return { ok: true, message: `Отправлено ${sent} ${plural(sent, ['сообщение', 'сообщения', 'сообщений'])} клиентам` };
  }

  if (kind === 'reroute') {
    const s = get<any>('SELECT * FROM shipments WHERE id = ?', body.shipmentId);
    if (!s) throw new Error('Рейс не найден');
    const opt = rerouteOption(s);
    if (!opt) throw new Error('Для этого рейса нет выгодного альтернативного маршрута');
    applyReroute(s, opt.toRouteId, actor, opt.proposedEta);
    return { ok: true, message: `Рейс ${s.code} перенаправлен ${opt.via}. Новый ETA — ${fmtDate(opt.proposedEta)}` };
  }

  if (kind === 'pickup_reminder') {
    const rows = all<{ clientId: number; n: number; sum: number; wh: string; addr: string; hours: string }>(
      `SELECT p.clientId, COUNT(*) n, ROUND(SUM(p.price),2) sum, w.name wh, w.address addr, w.workHours hours
       FROM parcels p JOIN warehouses w ON w.id = p.warehouseId
       WHERE p.status = 'arrived' AND p.arrivedAt < ? AND p.clientId IS NOT NULL GROUP BY p.clientId`,
      new Date(Date.now() - 3 * DAY).toISOString(),
    );
    const free = getSetting<number>('pickupFreeDays', 5);
    tx(() => {
      for (const r of rows)
        messageClient(r.clientId, `Напоминаем: ${r.n} ${plural(r.n, ['посылка ждёт', 'посылки ждут', 'посылок ждут'])} вас на складе «${r.wh}» (${r.addr}). К оплате: $${r.sum}. Бесплатное хранение — ${free} дней. Режим работы: ${r.hours}.`, { kind: 'pickup' });
    });
    audit(actor, 'assistant.pickup_reminder', 'client', undefined, { clients: rows.length });
    return { ok: true, message: `Напоминания отправлены ${rows.length} ${plural(rows.length, ['клиенту', 'клиентам', 'клиентам'])}` };
  }

  if (kind === 'debt_reminder') {
    const debtors = all<{ id: number; name: string }>(`SELECT id, name FROM clients WHERE status != 'blocked'`)
      .map((c) => ({ ...c, balance: clientBalance(c.id) }))
      .filter((c) => c.balance < -20);
    tx(() => {
      for (const d of debtors)
        messageClient(d.id, `Здравствуйте! За вами числится задолженность за доставку: $${(-d.balance).toFixed(2)}. Оплатить можно на складе, через Alif, Душанбе Сити или переводом. Спасибо, что вы с нами!`, { kind: 'debt' });
    });
    audit(actor, 'assistant.debt_reminder', 'client', undefined, { clients: debtors.length });
    return { ok: true, message: `Напоминания об оплате отправлены ${debtors.length} ${plural(debtors.length, ['клиенту', 'клиентам', 'клиентам'])}` };
  }

  if (kind === 'auto_assign') {
    const r = autoAssignParcels(actor);
    return {
      ok: true,
      message: r.assigned ? `Распределено ${r.assigned} ${plural(r.assigned, ['посылка', 'посылки', 'посылок'])} по ${r.shipments} ${plural(r.shipments, ['рейсу', 'рейсам', 'рейсам'])}` : 'Нет рейсов со свободным местом',
    };
  }

  throw new Error('Неизвестное действие');
}

/** Загружает посылки со склада в ближайший рейс (planned/loading) того же склада, пока есть место. */
export function autoAssignParcels(actor: Actor) {
  const ships = all<any>(
    `SELECT s.*, t.capacityKg, t.capacityM3 FROM shipments s LEFT JOIN trucks t ON t.id = s.truckId
     WHERE s.status IN ('planned','loading') ORDER BY COALESCE(s.plannedDeparture, s.createdAt)`,
  );
  let assigned = 0;
  const touched = new Set<number>();
  tx(() => {
    for (const sh of ships) {
      const load = get<{ kg: number; m3: number }>('SELECT COALESCE(SUM(weightKg),0) kg, COALESCE(SUM(volumeM3),0) m3 FROM parcels WHERE shipmentId = ?', sh.id)!;
      let kg = load.kg;
      let m3 = load.m3;
      const capKg = (sh.capacityKg ?? 20000) * 0.95;
      const capM3 = (sh.capacityM3 ?? 86) * 0.92;
      const parcels = all<any>(
        `SELECT id, weightKg, volumeM3 FROM parcels WHERE status = 'received' AND shipmentId IS NULL AND clientId IS NOT NULL AND warehouseId = ? ORDER BY receivedAt`,
        sh.originWarehouseId,
      );
      for (const p of parcels) {
        if (kg + (p.weightKg ?? 0) > capKg || m3 + (p.volumeM3 ?? 0) > capM3) continue;
        update('parcels', p.id, { shipmentId: sh.id });
        insert('parcel_events', { parcelId: p.id, status: 'received', note: `Включено в рейс ${sh.code} (автозагрузка)`, at: nowIso() });
        kg += p.weightKg ?? 0;
        m3 += p.volumeM3 ?? 0;
        assigned++;
        touched.add(sh.id);
      }
      if (touched.has(sh.id) && sh.status === 'planned') update('shipments', sh.id, { status: 'loading' });
    }
  });
  audit(actor, 'assistant.auto_assign', 'shipment', undefined, `Распределено ${assigned} посылок по ${touched.size} рейсам`);
  for (const id of touched) publish('admin', 'shipment', { id });
  return { assigned, shipments: touched.size };
}

export function dismissAction(key: string, actor: Actor) {
  const d = getSetting<Record<string, string>>('dismissedActions', {});
  d[key] = new Date(Date.now() + 24 * 3600000).toISOString();
  setSetting('dismissedActions', d);
  audit(actor, 'assistant.dismiss', 'assistant', undefined, key);
}

export function applyReroute(s: any, toRouteId: number, actor: Actor, etaOverride?: string) {
  const from = getRoute(s.routeId);
  const to = getRoute(toRouteId);
  const traveled = s.progress * from.row.distanceKm;
  const progress = Math.min(0.99, traveled / to.row.distanceKm);
  const kmPerDay = from.row.distanceKm / from.row.days;
  const eta = etaOverride ?? new Date(Date.now() + ((to.row.distanceKm - traveled) / kmPerDay) * DAY + 5 * 3600000).toISOString();
  const plannedMs = Date.parse(s.plannedArrival ?? s.etaAt);
  const delayHours = Math.max(0, Math.round((Date.parse(eta) - plannedMs) / 3600000));
  tx(() => {
    update('shipments', s.id, {
      routeId: toRouteId,
      progress,
      etaAt: eta,
      delayHours,
      risk: delayHours > 12 ? 'risk' : 'ok',
      delayReason: delayHours > 12 ? `Изменён маршрут ${to.row.via}` : null,
      delayNotifiedAt: null,
    });
    insertEvent(s.id, 'reroute', `Маршрут изменён ${to.row.via}`, `Было: ${from.row.via}. Новый ETA — ${fmtDate(eta)}. Подтвердил: ${actor.name}`, actor.name);
  });
  clearRouteCache();
  audit(actor, 'shipment.reroute', 'shipment', s.id, { from: from.row.code, to: to.row.code, eta });
  notify('shipment', `Рейс ${s.code} перенаправлен`, `${to.row.via}. Новый ETA ${fmtDate(eta)}.`, `/shipments/${s.id}`, 'success');
  publish('admin', 'shipment', { id: s.id });
  run('UPDATE shipments SET flaggedAt = ? WHERE id = ?', nowIso(), s.id);
}
