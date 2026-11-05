import clsx from 'clsx';
import { Plane } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { day, hoursLabel } from '../lib/format';
import { Avatar } from './ui';

export interface TimelineItem {
  id: number;
  code: string;
  status: string;
  risk: string;
  transport: string;
  plate?: string | null;
  model?: string | null;
  driverName?: string | null;
  driverColor?: string | null;
  start: string;
  plannedEnd: string;
  end: string;
  route: string;
}

const DAY = 86400000;

export function Timeline({ items, daysBack = 8, daysAhead = 14, maxRows = 9 }: { items: TimelineItem[]; daysBack?: number; daysAhead?: number; maxRows?: number }) {
  const nav = useNavigate();
  const now = Date.now();
  const start = new Date(now - daysBack * DAY);
  start.setHours(0, 0, 0, 0);
  const from = start.getTime();
  const to = from + (daysBack + daysAhead) * DAY;
  const x = (t: number) => ((Math.max(from, Math.min(to, t)) - from) / (to - from)) * 100;
  const ticks = Array.from({ length: daysBack + daysAhead + 1 }, (_, i) => from + i * DAY).filter((_, i) => i % 3 === 0);
  const order = (s: string) => ({ border: 0, customs: 1, in_transit: 2, loading: 3, planned: 4, arrived: 5, completed: 6 })[s] ?? 9;
  const rows = [...items].filter((i) => Date.parse(i.end) > from && Date.parse(i.start) < to).sort((a, b) => order(a.status) - order(b.status) || (a.risk === 'ok' ? 1 : 0) - (b.risk === 'ok' ? 1 : 0)).slice(0, maxRows);

  return (
    <div className="relative">
      <div className="grid grid-cols-[150px_1fr] items-end gap-3 pb-2">
        <div className="label">Водитель · трак</div>
        <div className="relative h-4">
          {ticks.filter((t) => Math.abs(t - now) > 1.3 * DAY).map((t) => (
            <div key={t} className="label absolute -translate-x-1/2 whitespace-nowrap normal-case tracking-normal" style={{ left: `${x(t)}%` }}>
              {day(new Date(t).toISOString())}
            </div>
          ))}
        </div>
      </div>
      <div className="relative">
        {/* сетка и «сегодня» */}
        <div className="pointer-events-none absolute inset-y-0 left-[162px] right-0">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-y-0 w-px bg-line/70" style={{ left: `${x(t)}%` }} />
          ))}
          <div className="absolute -bottom-1 -top-6 z-10 w-[1.5px] bg-accent" style={{ left: `${x(now)}%` }}>
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-2 py-[2px] text-[9.5px] font-semibold text-white">Сегодня</div>
          </div>
        </div>
        {rows.map((r) => {
          const s = Date.parse(r.start);
          const pe = Date.parse(r.plannedEnd);
          const e = Date.parse(r.end);
          const late = e - pe;
          const upcoming = r.status === 'planned' || r.status === 'loading';
          const done = r.status === 'arrived' || r.status === 'completed';
          return (
            <div key={r.id} className="grid h-[42px] grid-cols-[150px_1fr] items-center gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {r.transport === 'air' ? (
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-50 text-accent">
                    <Plane size={12} />
                  </span>
                ) : (
                  <Avatar name={r.driverName ?? '—'} color={r.driverColor} size={24} />
                )}
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-medium">{r.transport === 'air' ? 'Авиа-партия' : r.driverName ?? 'Без водителя'}</div>
                  <div className="truncate text-[10px] text-muted">{r.plate ?? r.route}</div>
                </div>
              </div>
              <div className="relative h-full">
                <button
                  onClick={() => nav(`/shipments/${r.id}`)}
                  title={`${r.code} · ${r.route}`}
                  className={clsx(
                    'absolute top-1/2 flex h-[20px] -translate-y-1/2 items-center overflow-hidden rounded-full px-2 text-[10px] font-semibold transition hover:brightness-110',
                    upcoming && 'border border-dashed border-[#BDBDB8] bg-[#F4F4F1] text-ink-2',
                    done && 'bg-[#E9E9E6] text-ink-2',
                    !upcoming && !done && 'bg-accent text-white',
                  )}
                  style={{ left: `${x(s)}%`, width: `max(${x(Math.min(pe, e)) - x(s)}%, 44px)` }}
                >
                  <span className="truncate">{r.code}</span>
                </button>
                {late > 3600000 && !done && (
                  <>
                    <div className={clsx('absolute top-1/2 h-[20px] -translate-y-1/2 rounded-r-full', r.risk === 'delayed' ? 'bg-danger' : 'bg-warn')} style={{ left: `${x(pe)}%`, width: `${x(e) - x(pe)}%` }} />
                    <div className={clsx('absolute top-1/2 ml-1.5 -translate-y-1/2 whitespace-nowrap rounded-full px-1.5 py-[1px] text-[9.5px] font-semibold', r.risk === 'delayed' ? 'bg-danger-50 text-danger' : 'bg-warn-50 text-[#B26B00]')} style={{ left: `${x(e)}%` }}>
                      +{hoursLabel(late / 3600000)}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
