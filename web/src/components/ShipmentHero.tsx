import clsx from 'clsx';
import { Route } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ago, day, hoursLabel, kg, num, RISK } from '../lib/format';
import { RerouteModal } from './modals';
import { RouteProgress } from './RouteProgress';
import { TruckArt } from './TruckArt';
import { Avatar, Badge, Button, Card } from './ui';

export function ShipmentHero({ s, onChanged, footer = true }: { s: any; onChanged: () => void; footer?: boolean }) {
  const [reroute, setReroute] = useState(false);
  const nav = useNavigate();
  const risk = RISK[s.risk];
  const plannedMs = Date.parse(s.plannedArrival);
  const etaMs = Date.parse(s.etaAt);
  const lateH = (etaMs - plannedMs) / 3600000;
  const loadT = s.load.kg / (s.truck?.capacityKg || 20000);
  return (
    <Card className="relative overflow-hidden px-6 pb-2 pt-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {s.flaggedAt && (
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Ассистент отметил · {ago(s.flaggedAt)}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => nav(`/shipments/${s.id}`)} className="h-display text-[19px] hover:text-accent">
              {s.route.name}
            </button>
            <Badge tone={risk.tone} dot>
              {risk.label}
            </Badge>
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            {s.code} · {s.route.via} · {s.load.n} пос. · {s.load.clients} клиентов
          </div>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <div className="label">План</div>
            <div className="h-display num mt-1 text-[19px]">{day(s.plannedArrival)}</div>
            <div className="text-[10.5px] text-muted">срок по договору</div>
          </div>
          <div>
            <div className="label">ETA сейчас</div>
            <div className={clsx('h-display num mt-1 text-[19px]', lateH > 2 ? 'text-danger' : 'text-ink')}>{day(s.etaAt)}</div>
            <div className={clsx('text-[10.5px]', lateH > 2 ? 'text-danger' : 'text-muted')}>{lateH > 2 ? `+${hoursLabel(lateH)} к плану` : 'в срок'}</div>
          </div>
          {s.reroute && (
            <button onClick={() => setReroute(true)} className="rounded-xl px-1 text-right hover:bg-accent-50/60">
              <div className="label">Через Кульму</div>
              <div className="h-display num mt-1 text-[19px] text-accent">{day(s.reroute.proposedEta)}</div>
              <div className="text-[10.5px] text-accent">−{hoursLabel(s.reroute.savedHours)} · предложено</div>
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-[150px_minmax(0,1fr)_150px] items-center gap-3">
        <div className="space-y-4">
          {s.driver && (
            <div className="flex items-center gap-2">
              <Avatar name={s.driver.name} color={s.driver.color} size={30} />
              <div className="min-w-0">
                <div className="truncate text-[11.5px] font-medium">{s.driver.name}</div>
                <div className="truncate text-[10px] text-muted">{s.truck?.plate}</div>
              </div>
            </div>
          )}
          <div>
            <div className="label">Скорость</div>
            <div className="num mt-0.5 text-[12px] font-medium text-accent">{s.speed ?? 0} км/ч</div>
            <div className="text-[10.5px] text-muted">{s.status === 'border' ? 'стоит на КПП' : s.risk !== 'ok' ? 'медленнее плана' : 'по плану'}</div>
          </div>
          <div>
            <div className="label">Топливо · запас</div>
            <div className="num mt-0.5 text-[12px] font-medium">
              {s.truck?.fuel ?? '—'}% · {num(Math.round((s.truck?.fuel ?? 0) * 11))} км
            </div>
          </div>
        </div>
        <div className="relative">
          <TruckArt className="mx-auto w-full max-w-[470px]" kind={s.truck?.kind} />
        </div>
        <div className="space-y-4">
          <div className="rounded-xl bg-white px-3 py-2 shadow-card">
            <div className="label">Загрузка</div>
            <div className="num mt-0.5 text-[12px] font-medium">
              {kg(s.load.kg)} / {kg(s.truck?.capacityKg)}
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#EDEDEA]">
              <div className="h-full rounded-full bg-ink" style={{ width: `${Math.min(100, loadT * 100)}%` }} />
            </div>
          </div>
          <div className="rounded-xl bg-white px-3 py-2 shadow-card">
            <div className="label">Объём · мест</div>
            <div className="num mt-0.5 text-[12px] font-medium">
              {num(s.load.m3, 1)} / {s.truck?.capacityM3 ?? '—'} м³
            </div>
            <div className="text-[10.5px] text-muted">{num(s.load.places)} мест</div>
          </div>
          <div className="rounded-xl bg-white px-3 py-2 shadow-card">
            <div className="label">Осталось</div>
            <div className="num mt-0.5 text-[12px] font-medium">{num(s.remainingKm)} км</div>
            <div className="truncate text-[10.5px] text-muted">след.: {s.nextStop?.name ?? '—'}</div>
          </div>
        </div>
      </div>

      <RouteProgress
        stops={s.route.stops}
        progress={s.progress}
        risk={s.risk}
        departedAt={s.departedAt}
        etaAt={s.etaAt}
        detour={s.reroute ? { label: `${s.reroute.via.replace(' (Памир)', '')} −${hoursLabel(s.reroute.savedHours)}` } : null}
      />
      {footer && <div className="-mx-6 mt-1 flex flex-wrap items-center gap-3 border-t border-line px-6 py-3">
        <div className="min-w-0 flex-1 text-[11.5px]">
          <span className="text-muted">Причина: </span>
          <span className="font-medium">{s.delayReason ?? 'движение по графику'}</span>
        </div>
        {s.reroute && (
          <Button size="sm" variant="soft" icon={<Route size={13} />} onClick={() => setReroute(true)}>
            Сменить маршрут
          </Button>
        )}
        {s.driver && (
          <a href={`tel:${s.driver.phone.replace(/\s/g, '')}`}>
            <Button size="sm">Позвонить водителю</Button>
          </a>
        )}
        <Button size="sm" variant="dark" onClick={() => nav(`/shipments/${s.id}`)}>
          Открыть рейс
        </Button>
      </div>}
      <RerouteModal
        open={reroute}
        onClose={() => setReroute(false)}
        option={s.reroute}
        shipment={s}
        onApproved={onChanged}
      />
    </Card>
  );
}

