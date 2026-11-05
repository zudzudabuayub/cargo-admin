import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Flag,
  MapPin,
  MoreHorizontal,
  Phone,
  Route,
  Send,
  Share2,
  Sparkles,
  Truck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MapView, splitPath } from '../components/MapView';
import { RerouteModal, ShareTrackingModal } from '../components/modals';
import { ShipmentHero } from '../components/ShipmentHero';
import { Avatar, Badge, Button, Card, CardHeader, Field, Menu, MenuItem, Modal, ModalHeader, Skeleton, Table, Tabs, Td, Th } from '../components/ui';
import { api, getToken, patch, post } from '../lib/api';
import { ago, dateTime, hoursLabel, kg, money, num, PARCEL_STATUS, RISK, SHIPMENT_STATUS, time } from '../lib/format';
import { useApi, useLive, useLiveReload, useToast } from '../lib/hooks';

const NEXT: Record<string, { status: string; label: string }[]> = {
  planned: [{ status: 'loading', label: 'Начать загрузку' }],
  loading: [{ status: 'in_transit', label: 'Отправить рейс' }],
  in_transit: [
    { status: 'border', label: 'Прибыл на КПП' },
    { status: 'customs', label: 'На таможне' },
    { status: 'arrived', label: 'Принять на склад' },
  ],
  border: [{ status: 'in_transit', label: 'Граница пройдена' }],
  customs: [{ status: 'arrived', label: 'Выпущен — принять на склад' }],
  arrived: [{ status: 'completed', label: 'Завершить рейс' }],
  completed: [],
};

const EVENT_STYLE: Record<string, { icon: any; cls: string }> = {
  planned: { icon: Flag, cls: 'bg-[#F1F1EF] text-ink-2' },
  loading: { icon: Truck, cls: 'bg-[#EAF3FF] text-[#2563C9]' },
  in_transit: { icon: Truck, cls: 'bg-ok-50 text-ok' },
  checkpoint: { icon: MapPin, cls: 'bg-[#F1F1EF] text-ink-2' },
  border: { icon: Flag, cls: 'bg-warn-50 text-[#B26B00]' },
  delay: { icon: AlertTriangle, cls: 'bg-danger-50 text-danger' },
  reroute: { icon: Route, cls: 'bg-accent-50 text-accent' },
  customs: { icon: FileText, cls: 'bg-warn-50 text-[#B26B00]' },
  arrived: { icon: CheckCircle2, cls: 'bg-ok-50 text-ok' },
  completed: { icon: Check, cls: 'bg-ink text-white' },
  note: { icon: Send, cls: 'bg-accent-50 text-accent' },
  share: { icon: Share2, cls: 'bg-accent-50 text-accent' },
  resolved: { icon: Check, cls: 'bg-ok-50 text-ok' },
};

export default function ShipmentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data: s, reload, setData } = useApi<any>(`/shipments/${id}`);
  useLiveReload(['shipment'], reload, 800);
  useLive('positions', (ps: any[]) => {
    const p = ps.find((x) => x.shipmentId === Number(id));
    if (p) setData((d: any) => d && { ...d, progress: p.progress, position: { lat: p.lat, lng: p.lng }, speed: p.speed });
  });
  const [share, setShare] = useState(false);
  const [reroute, setReroute] = useState(false);
  const [event, setEvent] = useState<null | 'delay' | 'checkpoint' | 'note'>(null);
  const [tab, setTab] = useState<'clients' | 'parcels'>('clients');
  const [truckPick, setTruckPick] = useState(false);
  const [busy, setBusy] = useState(false);

  const altPath = useMemo(() => (s?.reroute?.path ? splitPath(s.reroute.path, s.reroute.newProgress)[1] : null), [s?.reroute?.path, s?.reroute?.newProgress]);
  if (!s) return <Skeleton className="h-[600px]" />;

  const st = SHIPMENT_STATUS[s.status];
  const next = NEXT[s.status] ?? [];
  const approved = s.events.find((e: any) => e.type === 'reroute');
  const setStatus = async (status: string, label: string) => {
    setBusy(true);
    try {
      await post(`/shipments/${s.id}/status`, { status });
      toast(`${s.code}: ${label}`, 'ok', status === 'arrived' ? 'Клиенты получили уведомления о готовности' : status === 'in_transit' && s.status === 'loading' ? 'Клиенты уведомлены об отправке' : undefined);
      reload();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const paidShare = s.parcels.length ? s.parcels.filter((p: any) => p.paid).length / s.parcels.length : 0;
  const cells = 26;
  const filled = Math.round(Math.min(1, s.load.m3 / (s.truck?.capacityM3 || 86)) * cells);

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => nav(-1)} className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-card hover:bg-soft">
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="label mb-1">
              Рейсы / {s.route.name} / {s.code}
            </div>
            <div className="flex items-center gap-2.5">
              <h1 className="h-display text-[30px] leading-none">Рейс {s.code}</h1>
              <Badge tone={st.tone}>{st.label}</Badge>
              {s.risk !== 'ok' && ['in_transit', 'border', 'customs'].includes(s.status) && (
                <Badge tone={RISK[s.risk].tone} dot>
                  {RISK[s.risk].label}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={<Share2 size={14} />} onClick={() => setShare(true)}>
            Поделиться трекингом
          </Button>
          {s.driver && (
            <a href={`tel:${s.driver.phone.replace(/\s/g, '')}`}>
              <Button icon={<Phone size={14} />}>Позвонить водителю</Button>
            </a>
          )}
          {approved && (
            <Button variant="soft" icon={<Check size={14} />}>
              Маршрут изменён
            </Button>
          )}
          {next.map((n, i) => (
            <Button key={n.status} variant={i === 0 ? 'dark' : 'outline'} loading={busy} onClick={() => setStatus(n.status, n.label)}>
              {n.label}
            </Button>
          ))}
          <Menu
            trigger={(t) => (
              <button onClick={t} className="grid h-9 w-9 place-items-center rounded-full border border-line-2 bg-white hover:bg-soft">
                <MoreHorizontal size={16} />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem icon={<MapPin size={14} />} onClick={() => (close(), setEvent('checkpoint'))}>
                  Отметить событие / КПП
                </MenuItem>
                <MenuItem icon={<AlertTriangle size={14} />} onClick={() => (close(), setEvent('delay'))}>
                  Сообщить о задержке
                </MenuItem>
                {s.risk !== 'ok' && (
                  <MenuItem
                    icon={<Check size={14} />}
                    onClick={async () => {
                      close();
                      await post(`/shipments/${s.id}/events`, { type: 'resolved', title: 'Задержка устранена' });
                      reload();
                    }}
                  >
                    Задержка устранена
                  </MenuItem>
                )}
                <MenuItem icon={<Send size={14} />} onClick={() => (close(), setEvent('note'))}>
                  Заметка в истории
                </MenuItem>
                <MenuItem icon={<Truck size={14} />} onClick={() => (close(), setTruckPick(true))}>
                  Назначить трак и водителя
                </MenuItem>
                <MenuItem
                  icon={<Download size={14} />}
                  onClick={async () => {
                    close();
                    const res = await fetch(`/api/shipments/${s.id}/manifest.csv`, { headers: { Authorization: `Bearer ${getToken()}` } });
                    const blob = await res.blob();
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `manifest-${s.code}.csv`;
                    a.click();
                  }}
                >
                  Скачать манифест (CSV)
                </MenuItem>
                <MenuItem icon={<Eye size={14} />} onClick={() => (close(), window.open(`/t/${s.trackingToken}`, '_blank'))}>
                  Публичная страница трекинга
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <ShipmentHero s={s} onChanged={reload} footer={false} />
        <AssistantCard s={s} approved={approved} onReroute={() => setReroute(true)} onDone={reload} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <Card className="px-5 pb-5 pt-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[13.5px] font-medium">
                    План загрузки · {s.truck ? `${s.truck.kind} ${s.truck.capacityM3} м³` : 'авиа-партия'}
                  </div>
                  <div className="text-[11.5px] text-muted">
                    {num(s.load.places)} мест · {kg(s.load.kg)} из {kg(s.truck?.capacityKg)} · пломба {s.sealNumber ?? '—'}
                  </div>
                </div>
                <Badge tone="purple">{Math.round((s.load.m3 / (s.truck?.capacityM3 || 86)) * 100)}% объёма</Badge>
              </div>
              <div className="mt-4 grid grid-cols-[repeat(13,minmax(0,1fr))] gap-1.5">
                {Array.from({ length: cells }).map((_, i) => (
                  <div key={i} className={clsx('grid aspect-[1/1.1] place-items-center rounded-md text-[9.5px] font-medium', i < filled ? (i === filled - 1 ? 'bg-accent text-white' : 'bg-ink text-white') : 'bg-[#F0F0ED] text-muted')}>
                    <span className="num leading-none">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-4 text-[11px] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-ink" /> Загружено
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-accent" /> Последняя загрузка
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-[#E4E4E0]" /> Свободно
                </span>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-3 border-t border-line pt-3">
                {[
                  ['Посылок', num(s.load.n)],
                  ['Клиентов', num(s.load.clients)],
                  ['К оплате', money(s.load.value, 0)],
                  ['Оплачено', `${Math.round(paidShare * 100)}%`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="label">{k}</div>
                    <div className="num mt-0.5 text-[15px] font-medium">{v}</div>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="px-5 py-4">
              <div className="text-[13.5px] font-medium">Документы</div>
              <div className="mt-3 space-y-3 text-[12px]">
                {[
                  ['Пломба', s.sealNumber],
                  ['Декларация', s.declaration],
                  ['Отправка', dateTime(s.departedAt ?? s.plannedDeparture)],
                  ['Склад отправки', s.origin?.name],
                  ['Склад назначения', s.dest?.name],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="label">{k}</div>
                    <div className="mt-0.5 font-medium">{v ?? <span className="text-muted">не заполнено</span>}</div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {['CMR', 'TIR Carnet', 'Инвойс', 'Манифест'].map((d) => (
                    <span key={d} className="inline-flex items-center gap-1 rounded-md bg-soft px-2 py-1 text-[11px]">
                      <FileText size={11} className="text-muted" /> {d}
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          </div>
          <Card className="h-[340px] overflow-hidden">
            <MapView className="h-full w-full" shipments={[{ ...s, path: s.route.path, label: s.nextStop ? `→ ${s.nextStop.name}` : undefined }]} selectedId={s.id} altPath={altPath} fitKey={`detail-${s.id}-${s.routeId}`} />
          </Card>
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-3">
              <Tabs
                value={tab}
                onChange={setTab}
                items={[
                  { value: 'clients', label: 'Клиенты', count: s.clients.length },
                  { value: 'parcels', label: 'Посылки', count: s.parcels.length },
                ]}
              />
              <Link to={`/parcels?shipmentId=${s.id}`} className="text-[12px] font-medium text-accent">
                Открыть в посылках →
              </Link>
            </div>
            <div className="max-h-[420px] overflow-y-auto scroll-thin">
              {tab === 'clients' ? (
                <Table>
                  <thead>
                    <tr>
                      <Th>Клиент</Th>
                      <Th>Телефон</Th>
                      <Th>Посылок</Th>
                      <Th className="text-right">Вес</Th>
                      <Th className="text-right" />
                    </tr>
                  </thead>
                  <tbody>
                    {s.clients.map((c: any) => (
                      <tr key={c.id} className="hover:bg-soft/70">
                        <Td>
                          <Link to={`/clients/${c.id}`} className="flex items-center gap-2">
                            <Avatar name={c.name} color={c.color} size={24} />
                            <span className="font-medium">{c.name}</span>
                            <span className="text-[11.5px] text-accent">{c.code}</span>
                          </Link>
                        </Td>
                        <Td className="num text-ink-2">{c.phone}</Td>
                        <Td className="num">{c.parcels}</Td>
                        <Td className="num text-right">{kg(c.kg)}</Td>
                        <Td className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              const r = await post('/conversations', { kind: 'client', clientId: c.id });
                              nav(`/chats/${r.id}`);
                            }}
                          >
                            Написать
                          </Button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Трек-номер</Th>
                      <Th>Клиент</Th>
                      <Th>Содержимое</Th>
                      <Th>Статус</Th>
                      <Th className="text-right">Вес</Th>
                      <Th className="text-right">Сумма</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.parcels.map((p: any) => (
                      <tr key={p.id} className="hover:bg-soft/70">
                        <Td className="font-mono text-[11.5px]">{p.trackNumber}</Td>
                        <Td>
                          <span className="text-accent">{p.clientCode}</span> <span className="text-ink-2">{p.clientName}</span>
                        </Td>
                        <Td className="text-ink-2">
                          {p.description} {p.places > 1 && <span className="text-muted">· {p.places} мест</span>}
                        </Td>
                        <Td>
                          <Badge tone={PARCEL_STATUS[p.status].tone}>{PARCEL_STATUS[p.status].label}</Badge>
                        </Td>
                        <Td className="num text-right">{kg(p.weightKg)}</Td>
                        <Td className="num text-right">
                          {money(p.price)} {p.paid ? <span className="text-ok">✓</span> : null}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          </Card>
        </div>
        <Card className="self-start px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="text-[13.5px] font-medium">История рейса</div>
            <span className="label">время Душанбе</span>
          </div>
          <div className="relative mt-3">
            <div className="absolute bottom-3 left-[13px] top-3 w-px bg-line" />
            {s.events.map((e: any) => {
              const sty = EVENT_STYLE[e.type] ?? EVENT_STYLE.note;
              const Icon = sty.icon;
              return (
                <div key={e.id} className="relative flex gap-3 pb-4">
                  <span className={clsx('relative z-[1] grid h-7 w-7 shrink-0 place-items-center rounded-full ring-4 ring-white', sty.cls)}>
                    <Icon size={13} />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <div className="num text-[11px] text-muted">
                      {dateTime(e.at)} {e.actor && <>· {e.actor}</>}
                    </div>
                    <div className="text-[12.5px] font-medium">{e.title}</div>
                    {e.description && <div className="text-[11.5px] leading-snug text-ink-2">{e.description}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <ShareTrackingModal open={share} onClose={() => setShare(false)} shipment={s} />
      <RerouteModal open={reroute} onClose={() => setReroute(false)} option={s.reroute} shipment={s} onApproved={reload} />
      <EventModal kind={event} onClose={() => setEvent(null)} shipment={s} onDone={reload} />
      <TruckModal open={truckPick} onClose={() => setTruckPick(false)} shipment={s} onDone={reload} />
    </div>
  );
}

function AssistantCard({ s, approved, onReroute, onDone }: { s: any; approved: any; onReroute: () => void; onDone: () => void }) {
  const toast = useToast();
  const lateH = (Date.parse(s.etaAt) - Date.parse(s.plannedArrival)) / 3600000;
  const active = ['in_transit', 'border', 'customs'].includes(s.status);
  if (!active && !approved) {
    return (
      <Card className="px-5 py-4">
        <div className="flex items-center gap-2 text-[12px] font-medium text-accent">
          <Sparkles size={14} /> Ассистент
        </div>
        <div className="h-display mt-2 text-[17px]">{s.status === 'loading' || s.status === 'planned' ? 'Рейс формируется на складе' : 'Рейс завершён без замечаний'}</div>
        <div className="mt-2 text-[12px] leading-relaxed text-ink-2">
          {s.status === 'loading' || s.status === 'planned'
            ? `Загружено ${kg(s.load.kg)} — ${Math.round((s.load.kg / (s.truck?.capacityKg || 20000)) * 100)}% грузоподъёмности. Добавьте посылки со склада «${s.origin?.name}» в разделе «Посылки → На складе в Китае».`
            : `Прибыл ${dateTime(s.arrivedAt)}. Клиенты получили уведомления о готовности к выдаче.`}
        </div>
        {(s.status === 'loading' || s.status === 'planned') && (
          <Link to={`/parcels?status=received&warehouseId=${s.originWarehouseId}`}>
            <Button className="mt-4" variant="soft">
              Добавить посылки в рейс
            </Button>
          </Link>
        )}
      </Card>
    );
  }
  return (
    <div className="flex flex-col rounded-xl2 bg-[#F3F0FF] p-5 ring-1 ring-accent-100">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-accent">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-[#2B2B33] to-[#4B3BB8] text-white">
            <Sparkles size={12} />
          </span>
          Ассистент маршрутов
        </span>
        <span className="text-[11px] text-muted">92% уверенность · {ago(s.flaggedAt ?? s.departedAt)}</span>
      </div>
      <div className="h-display mt-3 text-[17px] leading-snug">{s.risk === 'ok' ? 'Рейс идёт по графику' : s.reroute ? 'Риск опоздания · смена маршрута' : 'Риск опоздания · уведомить клиентов'}</div>
      <div className="mt-3 space-y-2.5 text-[12px]">
        <div className="grid grid-cols-[96px_1fr] gap-2">
          <span className="label pt-0.5">Что случилось</span>
          <span className="text-ink-2">{s.risk === 'ok' ? 'Отклонений не обнаружено.' : `Рейс отстаёт от плана на ${hoursLabel(lateH)} и прибудет ${dateTime(s.etaAt)}.`}</span>
        </div>
        {s.delayReason && (
          <div className="grid grid-cols-[96px_1fr] gap-2">
            <span className="label pt-0.5">Почему</span>
            <span className="text-ink-2">{s.delayReason}</span>
          </div>
        )}
        {s.risk !== 'ok' && (
          <div className="grid grid-cols-[96px_1fr] gap-2">
            <span className="label pt-0.5">Рекомендация</span>
            <span className="text-ink-2">
              {s.reroute
                ? `Перенаправить ${s.reroute.via} и уведомить ${s.load.clients} клиентов о новом сроке.`
                : s.delayNotifiedAt
                  ? 'Клиенты уже уведомлены. Держать связь с водителем.'
                  : `Уведомить ${s.load.clients} клиентов о новом сроке прибытия.`}
            </span>
          </div>
        )}
      </div>
      {s.reroute && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-white/80 px-3 py-2">
            <div className="num text-[16px] font-medium text-accent">−{hoursLabel(s.reroute.savedHours)}</div>
            <div className="text-[10.5px] text-muted">экономия</div>
          </div>
          <div className="rounded-xl bg-white/80 px-3 py-2">
            <div className="num text-[16px] font-medium">
              {s.reroute.extraKm >= 0 ? '+' : ''}
              {num(s.reroute.extraKm)}
            </div>
            <div className="text-[10.5px] text-muted">км к маршруту</div>
          </div>
          <div className="rounded-xl bg-white/80 px-3 py-2">
            <div className="num text-[16px] font-medium">{time(s.reroute.proposedEta)}</div>
            <div className="text-[10.5px] text-muted">новый ETA</div>
          </div>
        </div>
      )}
      {approved ? (
        <div className="mt-4 rounded-xl bg-white/80 px-3 py-2.5 text-[12px]">
          <div className="flex items-center gap-1.5 font-medium text-ok">
            <Check size={14} /> {approved.title}
          </div>
          <div className="mt-0.5 text-muted">{approved.description}</div>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {s.reroute && (
          <Button variant="dark" icon={<Check size={14} />} onClick={onReroute}>
            Одобрить маршрут
          </Button>
        )}
        {s.risk !== 'ok' && !s.delayNotifiedAt && (
          <Button
            variant={s.reroute ? 'outline' : 'dark'}
            icon={<Send size={14} />}
            onClick={async () => {
              const r = await post('/assistant/actions/notify_delays', { shipmentIds: [s.id] });
              toast(r.message, 'ok');
              onDone();
            }}
          >
            Уведомить клиентов
          </Button>
        )}
        {s.delayNotifiedAt && (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-ok">
            <Check size={14} /> Клиенты уведомлены {ago(s.delayNotifiedAt)}
          </span>
        )}
      </div>
    </div>
  );
}

function EventModal({ kind, onClose, shipment, onDone }: { kind: null | 'delay' | 'checkpoint' | 'note'; onClose: () => void; shipment: any; onDone: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [hours, setHours] = useState('12');
  const presets = kind === 'delay' ? ['Очередь на КПП Иркештам', 'Снегопад на перевале', 'Таможенный досмотр', 'Поломка, ремонт в пути', 'Закрытие границы (праздник)'] : kind === 'checkpoint' ? ['КПП Иркештам пройден', 'КПП Карамык пройден', 'Прибыл в Кашгар', 'Перегруз в Кашгаре', 'Заправка / отдых водителя'] : [];
  const submit = async () => {
    await post(`/shipments/${shipment.id}/events`, { type: kind, title: kind === 'delay' ? 'Задержка' : title, description: kind === 'delay' ? title || desc : desc, delayHours: Number(hours) });
    toast(kind === 'delay' ? 'Задержка зафиксирована' : 'Событие добавлено', 'ok', kind === 'delay' ? 'Ассистент предложит уведомить клиентов' : undefined);
    setTitle('');
    setDesc('');
    onDone();
    onClose();
  };
  return (
    <Modal open={!!kind} onClose={onClose} width={480}>
      <ModalHeader onClose={onClose} title={kind === 'delay' ? 'Сообщить о задержке' : kind === 'checkpoint' ? 'Отметить событие' : 'Заметка'} sub={`Рейс ${shipment.code}`} />
      <div className="grid gap-3 px-6 py-3">
        {presets.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button key={p} onClick={() => setTitle(p)} className={clsx('rounded-full border px-2.5 py-1 text-[11.5px]', title === p ? 'border-ink bg-ink text-white' : 'border-line-2 hover:bg-soft')}>
                {p}
              </button>
            ))}
          </div>
        )}
        {kind !== 'note' && (
          <Field label={kind === 'delay' ? 'Причина' : 'Событие'}>
            <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        )}
        {kind === 'delay' && (
          <Field label="Задержка, часов">
            <input className="field num" value={hours} onChange={(e) => setHours(e.target.value)} />
          </Field>
        )}
        <Field label="Комментарий">
          <textarea className="field" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="dark" onClick={submit} disabled={kind === 'note' ? !desc : !title}>
          Сохранить
        </Button>
      </div>
    </Modal>
  );
}

function TruckModal({ open, onClose, shipment, onDone }: { open: boolean; onClose: () => void; shipment: any; onDone: () => void }) {
  const { data: trucks } = useApi<any[]>(open ? '/trucks' : null);
  const toast = useToast();
  return (
    <Modal open={open} onClose={onClose} width={520}>
      <ModalHeader onClose={onClose} title="Назначить трак" sub="Водитель назначается вместе с траком" />
      <div className="max-h-[420px] space-y-1.5 overflow-y-auto px-6 py-3 scroll-thin">
        {trucks?.map((t) => (
          <button
            key={t.id}
            disabled={t.status === 'on_trip' && t.id !== shipment.truckId}
            onClick={async () => {
              await patch(`/shipments/${shipment.id}`, { truckId: t.id });
              toast(`Назначен ${t.model} · ${t.plate}`);
              onDone();
              onClose();
            }}
            className={clsx('flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left disabled:opacity-40', t.id === shipment.truckId ? 'border-accent bg-accent-50/60' : 'border-line hover:bg-soft')}
          >
            <Truck size={15} className="text-muted" />
            <div className="flex-1">
              <div className="text-[12.5px] font-medium">
                {t.model} · {t.plate}
              </div>
              <div className="text-[11px] text-muted">
                {t.kind} · {kg(t.capacityKg)} · {t.capacityM3} м³ · {t.driverName ?? 'без водителя'}
              </div>
            </div>
            <Badge tone={t.status === 'available' ? 'green' : t.status === 'maintenance' ? 'amber' : 'purple'}>{t.status === 'available' ? 'Свободен' : t.status === 'maintenance' ? 'Ремонт' : 'В рейсе'}</Badge>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export { api };
