import clsx from 'clsx';
import { ArrowRight, Check, ChevronRight, MoreHorizontal, Package, Route, Search, Send, Sparkles, Truck, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapView } from '../components/MapView';
import { RerouteModal } from '../components/modals';
import { ShipmentHero } from '../components/ShipmentHero';
import { Timeline } from '../components/Timeline';
import { Avatar, Badge, Button, Card, Kpi, Modal, ModalHeader, Skeleton } from '../components/ui';
import { post } from '../lib/api';
import { ago, day, greeting, hoursLabel, kg, num, plural, RISK, time, weekdayLine } from '../lib/format';
import { useApi, useAuth, useLive, useLiveReload, useToast } from '../lib/hooks';

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { data, reload, setData } = useApi<any>('/dashboard');
  useLiveReload(['shipment', 'parcel'], reload, 1500);
  useLive('positions', (ps: any[]) =>
    setData((d: any) => {
      if (!d) return d;
      const by = new Map(ps.map((p) => [p.shipmentId, p]));
      const live = d.live.map((s: any) => (by.has(s.id) ? { ...s, position: { lat: by.get(s.id).lat, lng: by.get(s.id).lng }, progress: by.get(s.id).progress } : s));
      const f = d.featured && by.has(d.featured.id) ? { ...d.featured, progress: by.get(d.featured.id).progress, speed: by.get(d.featured.id).speed } : d.featured;
      return { ...d, live, featured: f };
    }),
  );

  const k = data?.kpi;
  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="mb-6">
        <div className="label mb-1.5">{weekdayLine()}</div>
        <h1 className="h-display text-[32px] leading-tight">
          {greeting()}, {user?.name.split(' ')[0]}
        </h1>
        <div className="mt-1 text-[12.5px] text-muted">Вот что требует вашего внимания в сети Китай → Таджикистан сегодня.</div>
      </div>

      {/* KPI */}
      <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3 xl:grid-cols-6">
        {!k ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)
        ) : (
          <>
            <Kpi label="Посылок в работе" value={num(k.parcelsActive)} badge={<Badge tone="lime">{k.parcelsActiveDelta >= 0 ? '+' : ''}{k.parcelsActiveDelta}%</Badge>} sub="к прошлой неделе" onClick={() => nav('/parcels')} />
            <Kpi label="В пути" value={num(k.inTransit)} badge={<Badge>{k.trucksOnRoad} {plural(k.trucksOnRoad, ['рейс', 'рейса', 'рейсов'])}</Badge>} sub="на трассе Китай → ТДЖ" onClick={() => nav('/tracking')} />
            <Kpi label="Выдано сегодня" value={num(k.deliveredToday)} badge={<Badge tone="green">{k.readyForPickup} ждут</Badge>} sub={`готовы к выдаче: ${k.readyForPickup}`} onClick={() => nav('/parcels?status=arrived')} />
            <Kpi label="Задержки" value={num(k.delayed)} badge={<Badge tone="red">{k.delayedParcels} пос.</Badge>} sub="рейсы опаздывают к сроку" onClick={() => nav('/shipments?tab=risk')} />
            <Kpi label="Под риском" value={num(k.atRisk)} badge={<Badge tone="purple">Ассистент следит</Badge>} sub="могут не успеть к сроку" onClick={() => nav('/shipments?tab=risk')} />
            <Kpi label="Проблемы" value={num(k.problems)} badge={<span className="text-[11px] font-medium text-danger">{data.brief.stats.unidentified} без кода</span>} sub="повреждения и без кода" onClick={() => nav('/parcels?filter=unidentified')} />
          </>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        {data?.featured ? <ShipmentHero s={data.featured} onChanged={reload} /> : <Skeleton className="h-[360px]" />}
        {data ? <Brief brief={data.brief} featured={data.featured} onDone={reload} /> : <Skeleton className="h-[360px]" />}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
        <Card className="relative h-[330px] overflow-hidden">
          {data && (
            <MapView
              className="h-full w-full"
              interactive
              tiles
              shipments={data.live.map((s: any) => ({ ...s, label: RISK[s.risk]?.label }))}
              places={data.warehouses.map((w: any) => ({ name: w.name, lat: w.lat, lng: w.lng, kind: w.country === 'CN' ? 'warehouse-cn' : 'warehouse-tj' }))}
              onSelect={(id) => nav(`/tracking?id=${id}`)}
              fitKey="dash"
            />
          )}
          <div className="pointer-events-none absolute left-3 top-3 z-[500] flex items-center gap-2 rounded-full bg-white/95 px-2.5 py-1 text-[11.5px] shadow-card">
            <span className="h-2 w-2 rounded-full bg-ok" />
            <b className="font-medium">Live-сеть</b>
            <span className="text-muted">{data?.live.length ?? '—'} в пути</span>
          </div>
          <Link to="/tracking" className="absolute bottom-3 right-3 z-[500] rounded-full bg-ink px-3 py-1.5 text-[11.5px] font-medium text-white shadow-pop">
            Открыть трекинг →
          </Link>
        </Card>
        <Card className="px-5 pb-4 pt-4">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <div className="text-[13.5px] font-medium">График рейсов</div>
              <div className="text-[11.5px] text-muted">
                {data?.timeline.filter((t: any) => ['in_transit', 'border', 'customs'].includes(t.status)).length ?? '—'} в пути · пунктиром — загрузка и планы · красным — опоздание к сроку
              </div>
            </div>
            <Link to="/shipments" className="flex items-center gap-1 text-[12px] font-medium text-accent">
              Все рейсы <ArrowRight size={13} />
            </Link>
          </div>
          {data ? <Timeline items={data.timeline} /> : <Skeleton className="h-[260px]" />}
        </Card>
      </div>
    </div>
  );
}

const ICONS: Record<string, any> = { send: Send, route: Route, package: Package, wallet: Wallet, search: Search, truck: Truck };

function Brief({ brief, featured, onDone }: { brief: any; featured: any; onDone: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const [reroute, setReroute] = useState<any>(null);
  const [confirm, setConfirm] = useState<any>(null);
  const [review, setReview] = useState(false);
  const run = async (a: any) => {
    const r = await post(`/assistant/actions/${a.id}`, a.shipmentIds ? { shipmentIds: a.shipmentIds } : {});
    toast(r.message, 'ok', 'Записано в журнал действий');
  };
  const click = (a: any) => {
    if (a.link) return nav(a.link);
    if (a.id === 'reroute') return setReroute(a.reroute);
    setConfirm(a);
  };
  const executable = brief.actions.filter((a: any) => !a.link && a.id !== 'reroute');
  return (
    <div className="flex flex-col rounded-xl2 bg-[#F3F0FF] p-5 ring-1 ring-accent-100">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#2B2B33] to-[#4B3BB8] text-white">
            <Sparkles size={15} />
          </span>
          <div>
            <div className="text-[13px] font-medium">Сводка операций</div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-accent">
              {brief.agents} агента · уверенность {brief.confidence}% · {time(brief.generatedAt)}
            </div>
          </div>
        </div>
        <button className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-white/70" onClick={() => nav('/settings#audit')}>
          <MoreHorizontal size={16} />
        </button>
      </div>
      <div className="h-display mt-3 text-[18px] leading-snug">{brief.headline}</div>

      {brief.signals.length > 0 && (
        <>
          <div className="label mb-1.5 mt-4">Почему · основные причины</div>
          <div className="space-y-1">
            {brief.signals.map((s: any) => (
              <div key={s.label} className="flex items-center gap-2.5 text-[12px]">
                <span className="num w-5 text-right font-medium text-accent">{String(s.value).padStart(2, '0')}</span>
                <span className="flex-1 truncate">{s.label}</span>
                <span className="h-[3px] w-16 overflow-hidden rounded-full bg-accent-100">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(12, s.share * 100)}%` }} />
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="label mb-1.5 mt-4">Предложено · нужно ваше решение</div>
      <div className="space-y-1.5">
        {brief.actions.slice(0, 4).map((a: any, i: number) => {
          const Icon = ICONS[a.icon] ?? ChevronRight;
          return (
            <button key={i} onClick={() => click(a)} className="flex w-full items-center gap-2.5 rounded-xl bg-white/80 px-3 py-2 text-left transition hover:bg-white">
              <Icon size={14} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{a.title}</span>
              <span className="shrink-0 text-[11px] text-muted">{a.hint}</span>
              <ChevronRight size={14} className="shrink-0 text-muted" />
            </button>
          );
        })}
        {brief.actions.length === 0 && <div className="rounded-xl bg-white/70 px-3 py-3 text-[12px] text-muted">Нет действий, требующих подтверждения 🎉</div>}
      </div>
      <div className="mt-auto flex items-center gap-3 pt-4">
        <Button variant="primary" icon={<Check size={14} />} onClick={() => setReview(true)} disabled={!executable.length && !brief.actions.some((a: any) => a.id === 'reroute')}>
          Проверить рекомендации
        </Button>
        <Link to="/settings#audit" className="text-[12px] font-medium text-ink-2 hover:text-ink">
          Журнал действий
        </Link>
      </div>

      <RerouteModal open={!!reroute} onClose={() => setReroute(null)} option={reroute} shipment={featured?.id === reroute?.shipmentId ? featured : null} onApproved={onDone} />
      <Modal open={!!confirm} onClose={() => setConfirm(null)} width={460}>
        <ModalHeader onClose={() => setConfirm(null)} title={confirm?.title} sub="Сообщения уйдут в чат клиентского приложения. Клиенты увидят их как уведомления." />
        <div className="mx-6 mb-2 rounded-xl bg-soft p-3 text-[12px] leading-relaxed text-ink-2">
          {confirm?.id === 'notify_delays' && '«Рейс TJ-… с вашими посылками задерживается: очередь на КПП. Новая ориентировочная дата прибытия — … Приносим извинения, будем держать вас в курсе.»'}
          {confirm?.id === 'pickup_reminder' && '«Напоминаем: посылки ждут вас на складе. К оплате: $… Бесплатное хранение — 5 дней. Режим работы: …»'}
          {confirm?.id === 'debt_reminder' && '«Здравствуйте! За вами числится задолженность за доставку: $… Оплатить можно на складе, через Alif, Душанбе Сити или переводом.»'}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button onClick={() => setConfirm(null)}>Отмена</Button>
          <Button
            variant="dark"
            icon={<Check size={14} />}
            onClick={async () => {
              await run(confirm);
              setConfirm(null);
              onDone();
            }}
          >
            Подтвердить и отправить
          </Button>
        </div>
      </Modal>
      <ReviewAll open={review} onClose={() => setReview(false)} actions={brief.actions} onReroute={(r) => setReroute(r)} onDone={onDone} />
    </div>
  );
}

function ReviewAll({ open, onClose, actions, onReroute, onDone }: { open: boolean; onClose: () => void; actions: any[]; onReroute: (r: any) => void; onDone: () => void }) {
  const toast = useToast();
  const exec = actions.filter((a) => !a.link && a.id !== 'reroute');
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const reroutes = actions.filter((a) => a.id === 'reroute');
  return (
    <Modal open={open} onClose={onClose} width={520}>
      <ModalHeader onClose={onClose} title="Рекомендации ассистента" sub="Отметьте, что применить. Смена маршрута подтверждается отдельно — с расчётом сроков." />
      <div className="space-y-2 px-6 py-3">
        {exec.map((a) => (
          <label key={a.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2.5 hover:bg-soft">
            <input type="checkbox" className="h-4 w-4 accent-[#6A4CFF]" checked={sel.includes(a.id)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id)))} />
            <span className="flex-1 text-[12.5px] font-medium">{a.title}</span>
            <span className="text-[11px] text-muted">{a.hint}</span>
          </label>
        ))}
        {reroutes.map((a) => (
          <button
            key={a.reroute.shipmentId}
            onClick={() => {
              onClose();
              onReroute(a.reroute);
            }}
            className="flex w-full items-center gap-3 rounded-xl border border-accent-200 bg-accent-50/60 px-3 py-2.5 text-left"
          >
            <Route size={15} className="text-accent" />
            <span className="flex-1 text-[12.5px] font-medium">{a.title}</span>
            <span className="text-[11px] text-accent">{a.hint} →</span>
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button onClick={onClose}>Закрыть</Button>
        <Button
          variant="primary"
          loading={busy}
          disabled={!sel.length}
          icon={<Check size={14} />}
          onClick={async () => {
            setBusy(true);
            for (const id of sel) {
              const a = exec.find((x) => x.id === id);
              const r = await post(`/assistant/actions/${id}`, a?.shipmentIds ? { shipmentIds: a.shipmentIds } : {});
              toast(r.message, 'ok');
            }
            setBusy(false);
            setSel([]);
            onClose();
            onDone();
          }}
        >
          Применить выбранные ({sel.length})
        </Button>
      </div>
    </Modal>
  );
}
