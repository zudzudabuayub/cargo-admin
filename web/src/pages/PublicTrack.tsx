import clsx from 'clsx';
import { Boxes, MapPin, Phone, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapView } from '../components/MapView';
import { RouteProgress } from '../components/RouteProgress';
import { Badge } from '../components/ui';
import { dateTime, day, kg, num, PARCEL_STATUS, SHIPMENT_STATUS, time } from '../lib/format';

/** Публичная страница отслеживания — открывается клиентом по ссылке без входа. */
export default function PublicTrack() {
  const { token } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/public/track/${encodeURIComponent(token ?? '')}`)
        .then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error);
          if (alive) setData(j);
        })
        .catch((e) => alive && setError(e.message));
    load();
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [token]);
  const s = data?.shipment;
  const p = data?.parcel;
  const late = s ? (Date.parse(s.etaAt) - Date.parse(s.plannedArrival)) / 3600000 : 0;
  return (
    <div className="min-h-full bg-canvas">
      <div className="mx-auto max-w-[760px] px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-white">
              <Boxes size={16} />
            </span>
            <span className="text-[14px] font-semibold">{data?.company?.name ?? 'Cargo'}</span>
          </div>
          {data?.company?.phone && (
            <a href={`tel:${data.company.phone.replace(/\s/g, '')}`} className="flex items-center gap-1.5 text-[12px] text-ink-2">
              <Phone size={13} /> {data.company.phone}
            </a>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) nav(`/t/${q.trim()}`);
          }}
          className="relative mb-5"
        >
          <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input className="field h-11 rounded-full pl-10 text-[14px]" placeholder="Введите трек-номер посылки" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        {error && <div className="card p-8 text-center text-[13px] text-muted">Отправление не найдено. Проверьте трек-номер или ссылку.</div>}
        {!data && !error && <div className="skeleton h-[400px]" />}
        {p && (
          <div className="card mb-4 px-5 py-4">
            <div className="label">Посылка</div>
            <div className="mt-1 font-mono text-[18px]">{p.trackNumber}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={PARCEL_STATUS[p.status].tone}>{p.statusLabel}</Badge>
              <span className="text-[12px] text-muted">
                {p.places} мест{p.weightKg ? ` · ${kg(p.weightKg)}` : ''} · пункт выдачи: {p.dest}
              </span>
            </div>
            {p.destAddress && (
              <div className="mt-3 flex gap-2 rounded-xl bg-ok-50 px-3 py-2.5 text-[12.5px] text-ok">
                <MapPin size={15} className="mt-0.5 shrink-0" />
                <div>
                  <b>Готова к выдаче:</b> {p.destAddress}
                  <div className="text-[11.5px]">{p.destHours}</div>
                </div>
              </div>
            )}
            <div className="mt-4 space-y-2.5">
              {p.events.map((e: any, i: number) => (
                <div key={i} className="flex gap-3">
                  <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', i === 0 ? 'bg-accent' : 'bg-[#CFCFCA]')} />
                  <div>
                    <div className={clsx('text-[12.5px]', i === 0 && 'font-medium')}>{e.note}</div>
                    <div className="text-[11px] text-muted">{dateTime(e.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {s && (
          <div className="card overflow-hidden">
            <div className="px-5 pt-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="label">Рейс {s.code}</div>
                  <div className="h-display mt-1 text-[22px]">
                    {s.route.name}
                  </div>
                  <div className="text-[12px] text-muted">{s.route.via}</div>
                </div>
                <div className="text-right">
                  <div className="label">{s.arrivedAt ? 'Прибыл' : 'Ожидаемое прибытие'}</div>
                  <div className={clsx('h-display num mt-1 text-[26px]', late > 2 && !s.arrivedAt ? 'text-danger' : 'text-accent')}>{day(s.arrivedAt ?? s.etaAt)}</div>
                  <div className="text-[11.5px] text-muted">около {time(s.arrivedAt ?? s.etaAt)}</div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone={SHIPMENT_STATUS[s.status].tone}>{s.statusLabel}</Badge>
                {s.delayReason && <Badge tone="amber">{s.delayReason}</Badge>}
                {s.cargo && (
                  <span className="text-[12px] text-muted">
                    {num(s.cargo.places)} мест · {kg(s.cargo.kg)}
                  </span>
                )}
              </div>
              <RouteProgress stops={s.route.stops} progress={s.progress} risk={s.risk} departedAt={s.departedAt} etaAt={s.etaAt} />
            </div>
            {s.route.path && (
              <div className="h-[300px] border-t border-line">
                <MapView className="h-full w-full" shipments={[{ id: 1, code: s.code, risk: s.risk, status: s.status, transport: s.transport, progress: s.progress, position: s.position, path: s.route.path }]} selectedId={1} fitKey="public" />
              </div>
            )}
            {s.driver && (
              <div className="border-t border-line px-5 py-3 text-[12.5px]">
                Водитель: <b className="font-medium">{s.driver.name}</b> · {s.driver.phone}
              </div>
            )}
            <div className="border-t border-line px-5 py-4">
              <div className="label mb-2">События</div>
              <div className="space-y-2">
                {s.events.slice(0, 8).map((e: any, i: number) => (
                  <div key={i} className="flex justify-between gap-3 text-[12.5px]">
                    <span className={clsx(i === 0 && 'font-medium')}>
                      {e.title}
                      {e.city && !e.title.includes(e.city) ? ` · ${e.city}` : ''}
                    </span>
                    <span className="num shrink-0 text-muted">{dateTime(e.at)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="mt-6 text-center text-[11px] text-muted">Обновляется автоматически каждые 30 секунд</div>
      </div>
    </div>
  );
}
