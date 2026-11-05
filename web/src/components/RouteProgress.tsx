import clsx from 'clsx';
import { Truck } from 'lucide-react';
import { day, time } from '../lib/format';

export interface Stop {
  code: string;
  name: string;
  kind: string;
  at: number;
}

/** Схематичная линия маршрута: остановки распределены равномерно, трак — между ними. */
export function RouteProgress({
  stops,
  progress,
  risk = 'ok',
  departedAt,
  etaAt,
  detour,
  compact,
  events = [],
}: {
  stops: Stop[];
  progress: number;
  risk?: string;
  departedAt?: string | null;
  etaAt?: string | null;
  detour?: { label: string; fromAt?: number } | null;
  compact?: boolean;
  events?: { title: string; at: string; cityName?: string }[];
}) {
  // Оставляем ключевые точки: начало, конец, хабы и КПП
  const key = stops.filter((s, i) => i === 0 || i === stops.length - 1 || s.kind === 'hub' || s.kind === 'border');
  const shown = key.length > 7 ? key.filter((s, i) => i === 0 || i === key.length - 1 || s.kind === 'border' || i % 2 === 0) : key;
  const n = shown.length;
  const pos = (i: number) => (n === 1 ? 0 : i / (n - 1));
  // позиция трака на схеме
  let truckX = 0;
  for (let i = 0; i < n - 1; i++) {
    const a = shown[i].at;
    const b = shown[i + 1].at;
    if (progress >= a && progress <= b) {
      truckX = pos(i) + ((progress - a) / Math.max(1e-6, b - a)) * (pos(i + 1) - pos(i));
      break;
    }
    if (progress > b) truckX = pos(i + 1);
  }
  const lateLen = risk === 'delayed' ? 0.16 : risk === 'risk' ? 0.1 : 0;
  const passedTime = (s: Stop) => events.find((e) => e.cityName === s.name)?.at;

  return (
    <div className={clsx('relative select-none', compact ? 'pb-8 pt-7' : 'pb-11 pt-10')}>
      <div className="relative mx-3 h-[2px]">
        <div className="absolute inset-0 rounded bg-[#DCDCD8]" />
        <div className="absolute inset-y-0 left-0 rounded bg-ink" style={{ width: `${truckX * 100}%` }} />
        {lateLen > 0 && (
          <div
            className={clsx('absolute -top-[1px] h-[4px] rounded-full', risk === 'delayed' ? 'bg-danger' : 'bg-warn')}
            style={{ left: `${truckX * 100}%`, width: `${Math.min(lateLen, 1 - truckX) * 100}%` }}
          />
        )}
        {detour && (
          <svg className="pointer-events-none absolute -top-[34px] h-[36px] overflow-visible" style={{ left: `${truckX * 100}%`, width: `${Math.max(0.12, 1 - truckX - 0.02) * 100}%` }} preserveAspectRatio="none" viewBox="0 0 100 36">
            <path d="M0 35 C 20 2, 80 2, 100 35" fill="none" stroke="#6A4CFF" strokeWidth="1.6" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        {shown.map((s, i) => {
          const passed = progress >= s.at - 1e-6;
          return (
            <div key={s.code + i} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${pos(i) * 100}%` }}>
              <div
                className={clsx(
                  'rounded-full',
                  s.kind === 'border' ? 'h-[9px] w-[9px] border-2 bg-white' : i === n - 1 ? 'h-[11px] w-[11px] border-[2.5px] bg-white' : 'h-[7px] w-[7px]',
                  s.kind === 'border' ? (passed ? 'border-ink' : 'border-[#BDBDB8]') : i === n - 1 ? 'border-ink' : passed ? 'bg-ink' : 'bg-[#C9C9C4]',
                )}
              />
              <div className={clsx('absolute left-1/2 top-3 whitespace-nowrap text-center', i === 0 ? 'translate-x-[-10%]' : i === n - 1 ? 'translate-x-[-90%]' : '-translate-x-1/2')}>
                <div className={clsx('text-[11px] leading-tight', passed ? 'text-ink' : 'text-muted')}>{s.kind === 'border' ? `КПП ${s.name}` : s.name}</div>
                {!compact && (
                  <div className={clsx('num text-[10.5px] leading-tight', i === n - 1 ? (risk === 'delayed' ? 'text-danger' : 'text-accent') : 'text-muted')}>
                    {i === 0 && departedAt ? day(departedAt) : i === n - 1 && etaAt ? `ETA ${day(etaAt)}` : passed && passedTime(s) ? day(passedTime(s)) : ''}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 transition-all duration-1000" style={{ left: `${truckX * 100}%` }}>
          <div className={clsx('relative grid place-items-center rounded-full bg-ink text-white ring-4', compact ? 'h-6 w-6 ring-white' : 'h-8 w-8 ring-white shadow-lg')}>
            {risk !== 'ok' && <span className={clsx('pulse-ring absolute inset-0 rounded-full', risk === 'delayed' ? 'bg-danger/50' : 'bg-warn/50')} />}
            <Truck size={compact ? 11 : 14} strokeWidth={2.2} className="relative" />
          </div>
          {detour && !compact && (
            <div className="absolute bottom-full left-1/2 mb-3 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[10.5px] font-medium shadow-pop">
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />
              {detour.label}
            </div>
          )}
        </div>
      </div>
      {!compact && departedAt && <div className="sr-only">{time(departedAt)}</div>}
    </div>
  );
}
