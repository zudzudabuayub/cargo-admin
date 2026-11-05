import clsx from 'clsx';
import { MessageCircle, Phone, Plane, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MapView } from '../components/MapView';
import { TruckArt } from '../components/TruckArt';
import { Avatar, Badge, Button, Card, Segmented, Skeleton, Stat } from '../components/ui';
import { post } from '../lib/api';
import { ago, dateTime, day, hoursLabel, kg, num, RISK, SHIPMENT_STATUS, time } from '../lib/format';
import { useApi, useLive, useLiveReload, useNow } from '../lib/hooks';

type F = 'all' | 'moving' | 'stopped' | 'alerts';

export default function Tracking() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const { data, setData, reload } = useApi<any>('/live');
  const [filter, setFilter] = useState<F>('all');
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  useNow(5000);
  useLiveReload(['shipment'], reload, 1200);
  useLive('positions', (ps: any[]) => {
    setLastUpdate(Date.now());
    setData((d: any) => {
      if (!d) return d;
      const by = new Map(ps.map((p) => [p.shipmentId, p]));
      return { ...d, shipments: d.shipments.map((s: any) => (by.has(s.id) ? { ...s, position: { lat: by.get(s.id).lat, lng: by.get(s.id).lng }, progress: by.get(s.id).progress, speed: by.get(s.id).speed, etaAt: by.get(s.id).etaAt } : s)) };
    });
  });
  const selectedId = params.get('id') ? Number(params.get('id')) : null;
  const moving = (data?.shipments ?? []).filter((s: any) => ['in_transit', 'border', 'customs'].includes(s.status));
  const list = useMemo(() => {
    const all = moving;
    if (filter === 'moving') return all.filter((s: any) => (s.speed ?? 0) > 0);
    if (filter === 'stopped') return all.filter((s: any) => !s.speed);
    if (filter === 'alerts') return all.filter((s: any) => s.risk !== 'ok');
    return all;
  }, [moving, filter]);
  const sel = moving.find((s: any) => s.id === selectedId) ?? null;
  useEffect(() => {
    if (!selectedId && moving.length) setParams({ id: String(moving[0].id) }, { replace: true });
  }, [selectedId, moving, setParams]);

  const places = useMemo(
    () => [
      ...(data?.warehouses ?? []).map((w: any) => ({ name: w.name, lat: w.lat, lng: w.lng, kind: w.country === 'CN' ? 'warehouse-cn' : 'warehouse-tj', label: w.address })),
      ...(data?.borders ?? []).map((b: any) => ({ name: `КПП ${b.name}`, lat: b.lat, lng: b.lng, kind: 'border', label: b.nameLocal })),
    ],
    [data?.warehouses, data?.borders],
  ) as any[];
  const mapShipments = useMemo(() => moving.map((s: any) => ({ ...s, path: s.route.path, label: `${SHIPMENT_STATUS[s.status].label} · ${s.speed ?? 0} км/ч` })), [moving]);

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-display text-[30px] leading-tight">Live-трекинг</h1>
          <div className="mt-1 text-[12.5px] text-muted">
            {moving.length} в пути · обновлено {Math.max(0, Math.round((Date.now() - lastUpdate) / 1000))} сек назад
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11.5px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-ink ring-2 ring-white" /> По графику
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-warn" /> Под риском
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-danger" /> Задержка
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-[3px] w-4 rounded bg-accent" /> Пройдено
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] border-[1.5px] border-danger bg-white" /> Склад КНР
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] border-[1.5px] border-accent bg-white" /> Склад ТДЖ
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-warn bg-white" /> КПП
          </span>
        </div>
      </div>
      <div className="grid h-[calc(100vh-150px)] min-h-[620px] gap-3 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_330px]">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="px-4 pb-2 pt-3">
            <div className="text-[13px] font-medium">На трассе</div>
            <div className="mb-2 text-[11px] text-muted">GPS каждые 30 сек</div>
            <Segmented
              size="sm"
              value={filter}
              onChange={setFilter}
              items={[
                { value: 'all', label: 'Все', count: moving.length },
                { value: 'moving', label: 'Едут' },
                { value: 'stopped', label: 'Стоят' },
                { value: 'alerts', label: 'Тревоги', count: moving.filter((s: any) => s.risk !== 'ok').length },
              ]}
            />
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 pb-2 scroll-thin">
            {!data && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[92px]" />)}
            {list.map((s: any) => {
              const late = (Date.parse(s.etaAt) - Date.parse(s.plannedArrival)) / 3600000;
              return (
                <button
                  key={s.id}
                  onClick={() => setParams({ id: String(s.id) })}
                  className={clsx('w-full rounded-xl border px-3 py-2.5 text-left transition', s.id === selectedId ? 'border-accent bg-white shadow-[0_0_0_3px_rgba(106,76,255,.12)]' : 'border-transparent hover:bg-soft')}
                >
                  <div className="flex items-center gap-2">
                    {s.transport === 'air' ? (
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-accent-50 text-accent">
                        <Plane size={13} />
                      </span>
                    ) : (
                      <Avatar name={s.driver?.name} color={s.driver?.color} size={28} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium">{s.driver?.name ?? 'Авиа-партия'}</div>
                      <div className="truncate text-[10.5px] text-muted">
                        {s.truck?.plate ?? 'Урумчи — Душанбе'} · {s.code}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="num text-[12px] font-medium">{s.speed ?? 0} км/ч</div>
                      <div className={clsx('text-[10.5px]', s.risk === 'delayed' ? 'text-danger' : s.risk === 'risk' ? 'text-[#B26B00]' : 'text-ok')}>
                        {s.status === 'border' ? 'стоит на КПП' : s.status === 'customs' ? 'таможня' : late > 2 ? `+${hoursLabel(late)}` : 'по плану'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[10.5px]">
                    <Badge tone={s.risk === 'ok' ? SHIPMENT_STATUS[s.status].tone : RISK[s.risk].tone} dot>
                      {s.risk === 'ok' ? SHIPMENT_STATUS[s.status].label : RISK[s.risk].label}
                    </Badge>
                    <span className="truncate text-muted">{s.nextStop ? `→ ${s.nextStop.kind === 'border' ? 'КПП ' : ''}${s.nextStop.name}` : s.dest?.name}</span>
                  </div>
                  <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-[#EDEDEA]">
                    <div className={clsx('h-full rounded-full', s.risk === 'delayed' ? 'bg-danger' : 'bg-accent')} style={{ width: `${s.progress * 100}%` }} />
                  </div>
                </button>
              );
            })}
            {data?.idleTrucks?.length > 0 && (
              <div className="px-2 pb-1 pt-3">
                <div className="label mb-1.5">На стоянке · {data.idleTrucks.length}</div>
                {data.idleTrucks.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between py-1 text-[11.5px]">
                    <span className="text-ink-2">
                      {t.model} · {t.plate}
                    </span>
                    <span className="text-muted">{t.status === 'maintenance' ? 'ремонт' : 'свободен'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
        <Card className="relative min-h-0 overflow-hidden">
          {data && <MapView className="h-full w-full" shipments={mapShipments} places={places} selectedId={selectedId} onSelect={(id) => setParams({ id: String(id) })} fitKey="tracking" />}
        </Card>
        <div className="min-h-0 overflow-y-auto scroll-thin lg:col-span-2 xl:col-span-1">{sel ? <TruckPanel s={sel} onClose={() => setParams({})} nav={nav} /> : <Card className="h-full" />}</div>
      </div>
    </div>
  );
}

function TruckPanel({ s, onClose, nav }: { s: any; onClose: () => void; nav: (to: string) => void }) {
  const late = (Date.parse(s.etaAt) - Date.parse(s.plannedArrival)) / 3600000;
  const last = s.prevStop;
  return (
    <Card className="px-4 pb-4 pt-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ok">
            <span className="relative flex h-2 w-2">
              <span className="pulse-ring absolute inset-0 rounded-full bg-ok" />
              <span className="relative h-2 w-2 rounded-full bg-ok" />
            </span>
            Live · {s.code} · {ago(s.truck?.lastSeenAt ?? new Date().toISOString())}
          </div>
          <div className="h-display mt-1 text-[19px]">{s.transport === 'air' ? 'Авиа-партия' : `${s.truck?.model ?? '—'}`}</div>
          <div className="text-[11.5px] text-muted">
            {s.truck ? `${s.truck.kind} · ${s.truck.plate}` : 'Урумчи → Душанбе'} · {s.route.name}
          </div>
        </div>
        <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-soft">
          <X size={15} />
        </button>
      </div>
      <div className="mt-3 rounded-2xl bg-soft px-3 pb-1 pt-3">
        <Badge tone={SHIPMENT_STATUS[s.status].tone}>{SHIPMENT_STATUS[s.status].label}</Badge>
        {s.transport === 'air' ? (
          <div className="grid h-[120px] place-items-center text-accent">
            <Plane size={56} strokeWidth={1.2} />
          </div>
        ) : (
          <TruckArt className="mx-auto w-full max-w-[360px]" kind={s.truck?.kind} />
        )}
      </div>
      {s.driver && (
        <div className="mt-3 flex items-center gap-2.5">
          <Avatar name={s.driver.name} color={s.driver.color} size={34} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium">{s.driver.name}</div>
            <div className="text-[11px] text-muted">
              Стаж {s.driver.experienceYears} лет · ★ {s.driver.rating}
            </div>
          </div>
          <button
            onClick={async () => {
              const r = await post('/conversations', { kind: 'driver', driverId: s.driver.id });
              nav(`/chats/${r.id}`);
            }}
            className="grid h-8 w-8 place-items-center rounded-full bg-soft hover:bg-accent-50 hover:text-accent"
          >
            <MessageCircle size={14} />
          </button>
          <a href={`tel:${s.driver.phone.replace(/\s/g, '')}`} className="grid h-8 w-8 place-items-center rounded-full bg-soft hover:bg-accent-50 hover:text-accent">
            <Phone size={14} />
          </a>
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="Скорость" value={`${s.speed ?? 0} км/ч`} sub={s.status === 'border' ? 'стоит на КПП' : s.risk !== 'ok' ? 'ниже плана' : 'в норме'} tone={s.risk !== 'ok' ? 'red' : undefined} />
        <Stat label={s.truck?.kind === 'Рефрижератор' ? 'Кузов' : 'Груз'} value={s.truck?.kind === 'Рефрижератор' ? '+9 °C' : kg(s.load.kg)} sub={s.truck?.kind === 'Рефрижератор' ? 'норма +5…+15' : `${s.load.n} пос.`} />
        <Stat label="Топливо" value={s.truck ? `${s.truck.fuel}%` : '—'} sub={s.truck ? `≈ ${num(s.truck.fuel * 11)} км` : ''} />
        <Stat label="Осталось" value={`${num(s.remainingKm)} км`} sub={s.nextStop ? `→ ${s.nextStop.name}` : ''} />
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-[11px]">
          <span className="text-ink-2">
            {s.origin?.name} · {day(s.departedAt)}
          </span>
          <span className={clsx('font-medium', late > 2 ? 'text-danger' : 'text-accent')}>ETA {dateTime(s.etaAt)}</span>
        </div>
        <div className="mt-1.5 h-[4px] overflow-hidden rounded-full bg-[#EDEDEA]">
          <div className={clsx('h-full rounded-full', s.risk === 'delayed' ? 'bg-danger' : 'bg-accent')} style={{ width: `${s.progress * 100}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[10.5px] text-muted">
          <span>
            {num(s.route.distanceKm - s.remainingKm)} из {num(s.route.distanceKm)} км
          </span>
          <span>последний пункт: {last?.name}</span>
        </div>
      </div>
      {s.risk !== 'ok' && (
        <div className="mt-3 rounded-xl bg-[#F3F0FF] px-3 py-2.5 ring-1 ring-accent-100">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-accent">
            <Sparkles size={12} /> Ассистент · 92% уверенность
          </div>
          <div className="mt-1 text-[12px] font-medium">{s.delayReason}</div>
          <div className="mt-0.5 text-[11.5px] text-ink-2">
            Прогноз: +{hoursLabel(late)} к сроку. Новый ETA {time(s.etaAt)}, {day(s.etaAt)}.
          </div>
        </div>
      )}
      <Link to={`/shipments/${s.id}`}>
        <Button variant="dark" className="mt-3 w-full">
          Открыть рейс {s.code}
        </Button>
      </Link>
    </Card>
  );
}
