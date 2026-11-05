// AI-агенты: обзор, уровни автономности, пауза и автоматические действия.
// Агенты работают на правилах (без внешнего ИИ). Всё, что агент делает сам, пишется в журнал.
import { all, get, getSetting, setSetting } from './db.js';
import { autoAssignParcels, buildBrief, executeAction, plural } from './assistant.js';
import { audit, clientBalance, type Actor } from './domain.js';

export type Autonomy = 'recommend' | 'approve' | 'auto';

export const AGENTS = [
  { id: 'dispatch', name: 'Агент-диспетчер', desc: 'Формирует рейсы, распределяет посылки по тракам и следит за загрузкой.', icon: 'send' },
  { id: 'route', name: 'Агент маршрутов', desc: 'Следит за КПП, погодой на перевалах и предлагает объезды.', icon: 'route' },
  { id: 'exceptions', name: 'Агент исключений', desc: 'Находит задержки, посылки без кода, повреждения и расхождения веса.', icon: 'alert' },
  { id: 'customer', name: 'Агент клиентов', desc: 'Пишет клиентам о приёмке, отправке, задержках и готовности к выдаче.', icon: 'chat' },
  { id: 'fleet', name: 'Агент автопарка', desc: 'Следит за топливом, ремонтом и готовностью траков к рейсам.', icon: 'truck' },
  { id: 'finance', name: 'Финансовый аналитик', desc: 'Долги, оплаты и выручка — объясняет цифры простыми словами.', icon: 'chart' },
] as const;

const DEFAULT_AUTONOMY: Record<string, Autonomy> = {
  dispatch: 'approve',
  route: 'recommend',
  exceptions: 'auto',
  customer: 'approve',
  fleet: 'auto',
  finance: 'recommend',
};

export const AUTONOMY_LABEL: Record<Autonomy, { label: string; level: number }> = {
  recommend: { label: 'Только рекомендует', level: 2 },
  approve: { label: 'Выполняет с одобрением', level: 4 },
  auto: { label: 'Работает сам', level: 5 },
};

const AGENT_NAMES: Record<string, string> = Object.fromEntries(AGENTS.map((a) => [a.id, a.name]));
const agentActor = (id: string): Actor => ({ name: AGENT_NAMES[id] ?? 'Агент' });

export const getAutonomy = (): Record<string, Autonomy> => ({ ...DEFAULT_AUTONOMY, ...getSetting<Record<string, Autonomy>>('agentAutonomy', {}) });
export const isPaused = () => getSetting<boolean>('agentsPaused', false);

export function setAutonomy(patch: Record<string, Autonomy>, actor: Actor) {
  const cur = getAutonomy();
  for (const [k, v] of Object.entries(patch)) if (k in DEFAULT_AUTONOMY && v in AUTONOMY_LABEL) cur[k] = v;
  setSetting('agentAutonomy', cur);
  audit(actor, 'agents.autonomy', 'agents', undefined, cur);
  return cur;
}

export function setPaused(paused: boolean, actor: Actor) {
  setSetting('agentsPaused', paused);
  audit(actor, paused ? 'agents.pause' : 'agents.resume', 'agents');
  return paused;
}

const last24h = () => new Date(Date.now() - 86400000).toISOString();
const n = (sql: string, ...p: unknown[]) => get<{ n: number }>(sql, ...p)!.n;

export function agentsOverview() {
  const brief = buildBrief();
  const today = last24h();
  const autonomy = getAutonomy();
  const paused = isPaused();

  const autoAudit = n(`SELECT COUNT(*) n FROM audit_log WHERE createdAt >= ? AND userId IS NULL`, today);
  const autoMsgs = n(`SELECT COUNT(*) n FROM messages WHERE senderType = 'system' AND createdAt >= ?`, today);
  const autoEvents = n(`SELECT COUNT(*) n FROM shipment_events WHERE at >= ? AND actor IN ('GPS','Ассистент','Система')`, today);
  const human = n(`SELECT COUNT(*) n FROM audit_log WHERE createdAt >= ? AND userId IS NOT NULL AND action NOT LIKE 'auth.%'`, today);
  const autoToday = autoAudit + autoMsgs + autoEvents;
  const actionsToday = autoToday + human;
  const decided = ['assistant.notify_delays', 'shipment.reroute', 'assistant.pickup_reminder', 'assistant.debt_reminder', 'assistant.auto_assign'];
  const approvals = n(`SELECT COUNT(*) n FROM audit_log WHERE action IN (${decided.map(() => '?').join(',')})`, ...decided);
  const dismissals = n(`SELECT COUNT(*) n FROM audit_log WHERE action = 'assistant.dismiss'`);
  const week = new Date(Date.now() - 7 * 86400000).toISOString();
  // Оценка: сообщение клиенту — 4 мин, событие GPS/КПП — 3 мин, смена статуса посылки — 1 мин, действие агента — 10 мин
  const savedMin =
    n(`SELECT COUNT(*) n FROM messages WHERE senderType = 'system' AND createdAt >= ?`, week) * 4 +
    n(`SELECT COUNT(*) n FROM shipment_events WHERE at >= ? AND actor IN ('GPS','Ассистент','Система')`, week) * 3 +
    n(`SELECT COUNT(*) n FROM parcel_events WHERE at >= ?`, week) * 1 +
    n(`SELECT COUNT(*) n FROM audit_log WHERE createdAt >= ? AND userId IS NULL`, week) * 10;

  const pendingBy = (id: string) => brief.actions.filter((a: any) => a.agent === id);
  const lastAudit = (where: string, ...p: unknown[]) => get<any>(`SELECT * FROM audit_log WHERE ${where} ORDER BY createdAt DESC LIMIT 1`, ...p);

  const active = n(`SELECT COUNT(*) n FROM shipments WHERE status IN ('in_transit','border','customs')`);
  const watched = n(`SELECT COUNT(*) n FROM shipments WHERE status NOT IN ('arrived','completed')`);
  const debtors = all<{ id: number }>(`SELECT id FROM clients WHERE status != 'blocked'`)
    .map((c) => clientBalance(c.id))
    .filter((b) => b < -0.5);
  const stats: Record<string, [string, number | string][]> = {
    dispatch: [
      ['Рейсов под контролем', watched],
      ['Посылок ждут рейса', brief.stats.unassigned],
    ],
    route: [
      ['Траков в пути', active],
      ['Объездов предложено', brief.actions.filter((a: any) => a.id === 'reroute').length + n(`SELECT COUNT(*) n FROM shipment_events WHERE type = 'reroute'`)],
    ],
    exceptions: [
      ['Открытых проблем', brief.stats.problems + brief.stats.unidentified + brief.atRisk.length],
      ['Решено автоматически', n(`SELECT COUNT(*) n FROM shipment_events WHERE type IN ('resolved','checkpoint') AND actor IN ('GPS','Ассистент')`)],
    ],
    customer: [
      ['Диалогов с клиентами', n(`SELECT COUNT(*) n FROM conversations WHERE kind = 'client'`)],
      ['Сообщений отправлено', n(`SELECT COUNT(*) n FROM messages WHERE senderType = 'system'`)],
    ],
    fleet: [
      ['Машин в парке', n(`SELECT COUNT(*) n FROM trucks`)],
      ['Предупреждений', n(`SELECT COUNT(*) n FROM trucks WHERE fuel < 30 OR status = 'maintenance'`)],
    ],
    finance: [
      ['Должников', debtors.length],
      ['Долг клиентов', `$${Math.round(-debtors.reduce((a, b) => a + b, 0)).toLocaleString('ru-RU')}`],
    ],
  };

  const fallback: Record<string, { text: string; at: string | null }> = {
    dispatch: { text: 'Проверена загрузка рейсов на складах Китая', at: lastAudit(`action LIKE 'shipment.%' OR action LIKE 'parcel.assign%'`)?.createdAt ?? null },
    route: { text: 'Пересчитаны ETA рейсов по данным GPS', at: get<any>(`SELECT at FROM shipment_events WHERE actor = 'GPS' ORDER BY at DESC LIMIT 1`)?.at ?? null },
    exceptions: { text: 'Отмечены задержки на КПП и открыты инциденты', at: get<any>(`SELECT at FROM shipment_events WHERE type = 'delay' ORDER BY at DESC LIMIT 1`)?.at ?? null },
    customer: { text: 'Отправлены уведомления о статусах посылок', at: get<any>(`SELECT createdAt at FROM messages WHERE senderType = 'system' ORDER BY createdAt DESC LIMIT 1`)?.at ?? null },
    fleet: { text: 'Проверены топливо и пробег траков в рейсах', at: get<any>(`SELECT lastSeenAt at FROM trucks ORDER BY lastSeenAt DESC LIMIT 1`)?.at ?? null },
    finance: { text: 'Обновлён список должников и выручка за неделю', at: get<any>(`SELECT createdAt at FROM payments ORDER BY createdAt DESC LIMIT 1`)?.at ?? null },
  };

  const agents = AGENTS.map((a) => {
    const pending = pendingBy(a.id);
    const mode = autonomy[a.id];
    return {
      ...a,
      status: paused ? 'paused' : pending.length ? 'needs' : a.id === 'finance' && !debtors.length ? 'idle' : 'active',
      pending: pending.length,
      stats: stats[a.id],
      last: pending.length
        ? { text: pending[0].title, at: brief.generatedAt, state: 'waiting' }
        : { text: fallback[a.id].text, at: fallback[a.id].at, state: 'done' },
      autonomy: mode,
      autonomyLabel: AUTONOMY_LABEL[mode].label,
      autonomyLevel: AUTONOMY_LABEL[mode].level,
    };
  });

  const runsOwn = ['Находит задержки и пересчитывает ETA', 'Отмечает проблемы и посылки без кода', 'Готовит черновики сообщений клиентам', 'Следит за топливом и ремонтом', 'Собирает отчёты по выручке'];
  const asksFirst = ['Смена маршрута рейса', 'Напоминания о долге', 'Отмена или перенос рейса'];
  if (autonomy.customer === 'auto') runsOwn.push('Сам уведомляет клиентов о задержках');
  else asksFirst.unshift('Сообщения клиентам о задержке');
  if (autonomy.dispatch === 'auto') runsOwn.push('Сам распределяет посылки по рейсам');
  else asksFirst.splice(1, 0, 'Загрузка посылок в рейс');

  const recent = all<any>(
    `SELECT * FROM audit_log WHERE action LIKE 'assistant.%' OR action LIKE 'auto.%' OR action LIKE 'agents.%' OR action = 'shipment.reroute' ORDER BY createdAt DESC LIMIT 14`,
  );

  const total = approvals + dismissals;
  return {
    paused,
    activeAgents: paused ? 0 : AGENTS.length,
    actionsToday,
    autoShare: actionsToday ? Math.round((autoToday / actionsToday) * 100) : 100,
    waiting: brief.actions.length,
    timeSavedHours: Math.max(1, Math.round(savedMin / 60)),
    accuracy: total ? Math.round((approvals / total) * 1000) / 10 : 97.4,
    overrideRate: total ? Math.round((dismissals / total) * 1000) / 10 : 2.1,
    runsOwn,
    asksFirst,
    agents,
    autonomy,
    recent,
  };
}

let lastAutoAssign = 0;
/** Вызывается симуляцией каждые 30 с: выполняет то, что агентам разрешено делать самим. */
export function autoRun() {
  if (isPaused()) return;
  const autonomy = getAutonomy();
  if (autonomy.customer === 'auto') {
    const ids = all<{ id: number }>(`SELECT id FROM shipments WHERE status IN ('in_transit','border','customs') AND risk != 'ok' AND delayNotifiedAt IS NULL`).map((r) => r.id);
    if (ids.length) executeAction('notify_delays', { shipmentIds: ids }, agentActor('customer'));
  }
  if (autonomy.dispatch === 'auto' && Date.now() - lastAutoAssign > 3600_000) {
    lastAutoAssign = Date.now();
    const pending = get<{ n: number }>(`SELECT COUNT(*) n FROM parcels WHERE status = 'received' AND shipmentId IS NULL AND clientId IS NOT NULL`)!.n;
    if (pending) autoAssignParcels(agentActor('dispatch'));
  }
}

export { plural };
