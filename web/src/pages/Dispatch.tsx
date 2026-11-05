import clsx from 'clsx';
import { AlertTriangle, Check, CheckCircle2, Lock, Package, Plane, Plus, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView, splitPath } from '../components/MapView';
import { NewShipmentModal, RerouteModal } from '../components/modals';
import { Timeline } from '../components/Timeline';
import { Avatar, Badge, Button, Card, Modal, ModalHeader, Segmented, Skeleton } from '../components/ui';
import { post } from '../lib/api';
import { day, hoursLabel, kg, num, plural, time } from '../lib/format';
import { useApi, useLive, useLiveReload, useToast } from '../lib/hooks';

type F = 'all' | 'risk' | 'priority';

const PRIORITY = {
  high: { label: 'Высокий', cls: 'text-danger', bars: 3 },
  medium: { label: 'Средний', cls: 'text-[#C27C0E]', bars: 2 },
  low: { label: 'Низкий', cls: 'text-ok', bars: 1 },
} as const;

function StatusChip({ q }: { q: any }) {
  if (q.risk === 'delayed' && ['in_transit', 'border', 'customs'].includes(q.status))
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-danger">
        <span className="h-1.5 w-1.5 rounded-full bg-danger" /> Задержка
      </span>
    );
  if (q.risk === 'risk' && ['in_transit', 'border', 'customs'].includes(q.status))
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-warn-50 px-1.5 py-0.5 text-[11px] font-medium text-[#B26B00]">
        <AlertTriangle size={11} /> Под риском
      </span>
    );
  return <Badge tone={q.status === 'loading' ? 'blue' : q.status === 'planned' ? 'gray' : 'purple'}>{q.statusLabel}</Badge>;
}

export default function Dispatch() {
  const nav = useNavigate();
  const toast = useToast();
  const { data, reload, setData } = useApi<any>('/dispatch');
  useLiveReload(['shipment', 'parcel'], reload, 1200);
  useLive('positions', (ps: any[]) =>
    setData((d: any) => {
      if (!d) return d;
      const by = new Map(ps.map((p) => [p.shipmentId, p]));
      return { ...d, live: d.live.map((s: any) => (by.has(s.id) ? { ...s, position: { lat: by.get(s.id).lat, lng: by.get(s.id).lng }, progress: by.get(s.id).progress } : s)) };
    }),
  );
  const [filter, setFilter] = useState<F>('all');
  const [selected, setSelected] = useState<number | null>(null);
  const [layers, setLayers] = useState({ trucks: true, delayed: true, risk: true, warehouses: true });
  const [reroute, setReroute] = useState<any>(null);
  const [confirm, setConfirm] = useState<any>(null);
  const [create, setCreate] = useState(false);
  const { data: detail } = useApi<any>(selected ? `/shipments/${selected}` : null, [selected]);

  const queue: any[] = data?.queue ?? [];
  const list = useMemo(
    () => (filter === 'risk' ? queue.filter((q) => q.risk !== 'ok' && ['in_transit', 'border', 'customs'].includes(q.status)) : filter === 'priority' ? queue.filter((q) => q.priority === 'high') : queue),
    [queue, filter],
  );
  useEffect(() => {
    if (!selected && queue.length) setSelected(queue[0].id);
  }, [queue, selected]);

  const shipments = useMemo(
    () =>
      (data?.live ?? []).filter((s: any) => (s.risk === 'delayed' ? layers.delayed : s.risk === 'risk' ? layers.risk : layers.trucks)).map((s: any) => ({ ...s, label: s.risk === 'delayed' ? 'задержка' : undefined })),
    [data?.live, layers],
  );
  const places = useMemo(() => (layers.warehouses ? (data?.warehouses ?? []).map((w: any) => ({ name: w.name, lat: w.lat, lng: w.lng, kind: w.country === 'CN' ? 'warehouse-cn' : 'warehouse-tj', label: w.address })) : []), [data?.warehouses, layers.warehouses]) as any[];
  const altPath = useMemo(() => (detail?.reroute?.path ? splitPath(detail.reroute.path, detail.reroute.newProgress)[1] : null), [detail?.reroute]);
  const actions: any[] = data?.brief?.actions ?? [];
  const live = data?.live ?? [];

  const approve = async (a: any) => {
    if (a.id === 'reroute') return setReroute(a.reroute);
    if (a.link) return nav(a.link);
    setConfirm(a);
  };
  const dismiss = async (a: any) => {
    await post('/assistant/dismiss', { key: a.key });
    toast('Скрыто на 24 часа', 'info', a.title);
    reload();
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-display text-[26px] leading-tight">Диспетчерская</h1>
          <div className="mt-1 text-[11.5px] text-muted">Рейсы, которым нужно решение, карта сети и предложения агента — на одном экране.</div>
        </div>
        <div className="flex gap-2">
          {(data?.brief?.stats?.unassigned ?? 0) > 0 && (
            <Button
              icon={<Package size={14} />}
              onClick={async () => {
                const r = await post('/assistant/actions/auto_assign');
                toast(r.message);
                reload();
              }}
            >
              Автозагрузка {data.brief.stats.unassigned}
            </Button>
          )}
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreate(true)}>
            Новый рейс
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)_330px]">
        {/* Очередь */}
        <div className="flex min-h-0 flex-col lg:h-[calc(100vh-140px)]">
          <div className="mb-2 flex items-start justify-between">
            <div>
              <div className="text-[13px] font-medium">Очередь рейсов</div>
              <div className="text-[11px] text-muted">
                {data?.counts?.all ?? '—'} рейсов · {data?.counts?.decisions ?? '—'} требуют решения
              </div>
            </div>
          </div>
          <Segmented
            size="sm"
            className="mb-2 self-start"
            value={filter}
            onChange={setFilter}
            items={[
              { value: 'all', label: 'Все', count: data?.counts?.all },
              { value: 'risk', label: 'Под риском', count: data?.counts?.risk },
              { value: 'priority', label: 'Приоритет', count: data?.counts?.priority },
            ]}
          />
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-2 pr-1 scroll-thin">
            {!data && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[150px]" />)}
            {list.map((q) => {
              const late = (Date.parse(q.to.at) - Date.parse(q.to.planned)) / 3600000;
              const pr = PRIORITY[q.priority as keyof typeof PRIORITY];
              return (
                <button
                  key={q.id}
                  onClick={() => setSelected(q.id)}
                  className={clsx('w-full rounded-2xl border bg-white p-3 text-left transition', q.id === selected ? 'border-accent shadow-[0_0_0_3px_rgba(106,76,255,.12)]' : 'border-transparent shadow-card hover:border-line-2')}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold">{q.code}</span>
                    <StatusChip q={q} />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-lg text-white" style={{ background: q.topClient?.color ?? '#6A4CFF' }}>
                      {q.transport === 'air' ? <Plane size={12} /> : <Package size={12} />}
                    </span>
                    <span className="truncate text-[12px] font-medium">{q.topClient?.company ?? q.topClient?.name ?? q.route.name}</span>
                    <span className="shrink-0 text-[10.5px] text-muted">· {num(q.load.places)} мест</span>
                  </div>
                  <div className="mt-2 rounded-xl bg-soft px-2.5 py-2">
                    <div className="flex items-center justify-between text-[11.5px]">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-ink" />
                        {q.from.name}
                      </span>
                      <span className="num text-muted">{day(q.from.at)}</span>
                    </div>
                    <div className="ml-[2.5px] h-2.5 w-px bg-line-2" />
                    <div className="flex items-center justify-between text-[11.5px]">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full border border-accent" />
                        {q.to.name}
                      </span>
                      <span className={clsx('num', late > 2 ? 'font-medium text-danger' : 'text-accent')}>{day(q.to.at)}</span>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    {q.driver ? (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Avatar name={q.driver.name} color={q.driver.color} size={20} />
                        <span className="truncate text-[11px] text-ink-2">{q.driver.name}</span>
                      </span>
                    ) : q.transport === 'air' ? (
                      <span className="text-[11px] text-ink-2">Авиа-партия</span>
                    ) : (
                      <span className="text-[11px] font-medium text-accent">Нет трака · назначить</span>
                    )}
                    <span className={clsx('flex shrink-0 items-center gap-1 text-[10.5px] font-medium', pr.cls)}>
                      <span className="flex items-end gap-[2px]">
                        {[1, 2, 3].map((b) => (
                          <span key={b} className={clsx('w-[3px] rounded-sm', b <= pr.bars ? 'bg-current' : 'bg-[#E0E0DC]')} style={{ height: 4 + b * 3 }} />
                        ))}
                      </span>
                      {pr.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Карта + график */}
        <div className="grid min-w-0 gap-3">
          <Card className="relative h-[460px] overflow-hidden">
            {data && <MapView className="h-full w-full" shipments={shipments} places={places} selectedId={selected} onSelect={setSelected} altPath={altPath} fitKey="dispatch" />}
            <div className="absolute left-3 top-3 z-[500] flex flex-wrap gap-1.5">
              {(
                [
                  ['trucks', 'Траки', live.length],
                  ['delayed', 'Задержки', live.filter((s: any) => s.risk === 'delayed').length],
                  ['risk', 'Под риском', live.filter((s: any) => s.risk === 'risk').length],
                  ['warehouses', 'Склады', data?.warehouses?.length ?? 0],
                ] as const
              ).map(([k, label, count]) => (
                <button
                  key={k}
                  onClick={() => setLayers((l) => ({ ...l, [k]: !l[k] }))}
                  className={clsx('inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium shadow-card', layers[k] ? 'bg-ink text-white' : 'bg-white text-ink-2')}
                >
                  {layers[k] && <Check size={11} />}
                  {label}
                  <span className={layers[k] ? 'text-white/60' : 'text-muted'}>{count}</span>
                </button>
              ))}
            </div>
            <div className="absolute bottom-3 left-3 z-[500] flex items-center gap-3 rounded-full bg-white/95 px-3 py-1.5 text-[10.5px] shadow-card">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-ink" /> По графику
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-danger" /> Задержка
              </span>
              <span className="flex items-center gap-1.5">
                <span className="tracking-[-1px] text-accent">•••</span> Предложено
              </span>
            </div>
            {detail && (
              <div className="absolute bottom-3 right-3 z-[500] w-[290px] rounded-2xl bg-white p-3.5 shadow-pop">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-accent">
                  <span className="h-2 w-2 rounded-full bg-accent" />
                  {detail.reroute ? 'Агент маршрутов' : 'Рейс'} · {detail.code}
                </div>
                {detail.reroute ? (
                  <>
                    <div className="mt-2 flex items-center justify-between rounded-xl bg-soft px-3 py-2">
                      <div>
                        <div className="text-[11px] text-ink-2">{detail.reroute.currentVia.replace('через ', '')} · сейчас</div>
                        <div className="text-[10.5px] text-danger">+{hoursLabel(detail.delayHours)}</div>
                      </div>
                      <div className="h-display num text-[19px]">{day(detail.reroute.currentEta)}</div>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between rounded-xl bg-accent-50 px-3 py-2">
                      <div>
                        <div className="text-[11px] text-ink-2">{detail.reroute.via.replace('через ', '').replace(' (Памир)', '')} · предложено</div>
                        <div className="text-[10.5px] text-accent">−{hoursLabel(detail.reroute.savedHours)}</div>
                      </div>
                      <div className="h-display num text-[19px] text-accent">{day(detail.reroute.proposedEta)}</div>
                    </div>
                    <div className="mt-2.5 flex gap-1.5">
                      <Button size="sm" variant="dark" icon={<Check size={12} />} onClick={() => setReroute(detail.reroute)}>
                        Одобрить объезд
                      </Button>
                      <Button size="sm" onClick={() => nav(`/shipments/${detail.id}`)}>
                        Сравнить
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mt-1.5 text-[12.5px] font-medium">
                      {detail.route.name} <span className="font-normal text-muted">{detail.route.via}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                      {[
                        ['Груз', kg(detail.load.kg)],
                        ['Скорость', `${detail.speed ?? 0} км/ч`],
                        ['ETA', day(detail.etaAt)],
                      ].map(([k, v]) => (
                        <div key={k} className="rounded-lg bg-soft px-1.5 py-1.5">
                          <div className="label">{k}</div>
                          <div className="num text-[12px] font-medium">{v}</div>
                        </div>
                      ))}
                    </div>
                    <Button size="sm" variant="dark" className="mt-2.5 w-full" onClick={() => nav(`/shipments/${detail.id}`)}>
                      Открыть рейс
                    </Button>
                  </>
                )}
              </div>
            )}
          </Card>
          <Card className="px-5 pb-3 pt-4">
            <div className="mb-2 flex items-start justify-between">
              <div>
                <div className="text-[13px] font-medium">График водителей</div>
                <div className="text-[11px] text-muted">Пунктиром — загрузка и планы · красным — опоздание к сроку</div>
              </div>
              <button onClick={() => setCreate(true)} className="flex items-center gap-1 text-[11.5px] font-medium text-accent">
                <Plus size={13} /> Назначить рейс
              </button>
            </div>
            {data ? <Timeline items={data.timeline} maxRows={6} /> : <Skeleton className="h-[220px]" />}
          </Card>
        </div>

        {/* Агент */}
        <div className="min-h-0 lg:col-span-2 xl:col-span-1 xl:h-[calc(100vh-140px)]">
          <div className="flex h-full flex-col rounded-xl2 bg-[#F3F0FF] p-3 ring-1 ring-accent-100">
            <div className="flex items-start justify-between px-1.5 pb-2 pt-1">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#2B2B33] to-[#4B3BB8] text-white">
                  <Truck size={14} />
                </span>
                <div>
                  <div className="text-[13px] font-medium">Агент-диспетчер</div>
                  <div className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.06em] text-accent">
                    {actions.length} {plural(actions.length, ['действие ждёт', 'действия ждут', 'действий ждут'])} вас
                  </div>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-white px-2 py-1 text-[10px] font-medium text-ink-2" title="Действия выполняются только после одобрения">
                <Lock size={10} /> Одобрение
              </span>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5 scroll-thin">
              {data?.paused && <div className="rounded-xl bg-white px-3 py-2 text-[11.5px] text-[#B26B00]">Агенты на паузе — предложения не выполняются автоматически.</div>}
              {actions.map((a, i) => (
                <div key={a.key} className="rounded-2xl bg-white p-3.5">
                  <div className="flex items-start gap-2">
                    <span className="num grid h-6 w-7 shrink-0 place-items-center rounded-lg bg-accent text-[10.5px] font-semibold text-white">{String(i + 1).padStart(2, '0')}</span>
                    <div className="text-[12.5px] font-semibold leading-snug">{a.title}</div>
                  </div>
                  <div className="mt-1.5 text-[11.5px] leading-relaxed text-ink-2">{a.desc}</div>
                  {a.impact && <div className={clsx('mt-2 inline-flex rounded-lg px-2 py-1 text-[11px] font-medium', a.id === 'reroute' ? 'bg-ok-50 text-ok' : 'bg-accent-50 text-accent')}>{a.impact}</div>}
                  <div className="mt-2.5 flex items-center gap-1.5">
                    <Button size="sm" variant="dark" onClick={() => approve(a)}>
                      {a.link ? 'Открыть' : 'Одобрить'}
                    </Button>
                    {a.shipmentId && (
                      <Button size="sm" onClick={() => nav(`/shipments/${a.shipmentId}`)}>
                        Подробнее
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => dismiss(a)}>
                      Скрыть
                    </Button>
                  </div>
                </div>
              ))}
              {data && actions.length === 0 && <div className="rounded-2xl bg-white p-4 text-[12px] text-muted">Все решения приняты. Агент продолжает наблюдать за сетью.</div>}
              {data?.autoHandled?.length > 0 && (
                <div className="rounded-2xl bg-white/60 p-3.5">
                  <div className="label mb-2">Автоматически · без одобрения</div>
                  <div className="space-y-2">
                    {data.autoHandled.map((e: any) => (
                      <div key={e.id} className="flex gap-2 text-[11.5px]">
                        <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-ok" />
                        <span className="flex-1 leading-snug text-ink-2">{e.details ?? e.action}</span>
                        <span className="num shrink-0 text-[10.5px] text-muted">{time(e.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <RerouteModal open={!!reroute} onClose={() => setReroute(null)} option={reroute} shipment={detail?.id === reroute?.shipmentId ? detail : null} onApproved={reload} />
      <NewShipmentModal open={create} onClose={() => setCreate(false)} />
      <Modal open={!!confirm} onClose={() => setConfirm(null)} width={440}>
        <ModalHeader onClose={() => setConfirm(null)} title={confirm?.title} sub={confirm?.desc} />
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button onClick={() => setConfirm(null)}>Отмена</Button>
          <Button
            variant="dark"
            icon={<Check size={14} />}
            onClick={async () => {
              const r = await post(`/assistant/actions/${confirm.id}`, confirm.shipmentIds ? { shipmentIds: confirm.shipmentIds } : {});
              toast(r.message, 'ok', 'Записано в журнал действий');
              setConfirm(null);
              reload();
            }}
          >
            Одобрить
          </Button>
        </div>
      </Modal>
    </div>
  );
}
