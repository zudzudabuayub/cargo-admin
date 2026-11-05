import clsx from 'clsx';
import { Bot, MessageCircle, Phone, Pin, Search, Send, Truck, Users, Warehouse, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Avatar, Badge, Card, Empty, Menu, MenuItem, Segmented, Skeleton } from '../components/ui';
import { patch, post } from '../lib/api';
import { day, money, PARCEL_STATUS, time } from '../lib/format';
import { useApi, useLive, useToast } from '../lib/hooks';

type K = '' | 'client' | 'driver' | 'warehouse' | 'unread';

export default function Chats() {
  const { id } = useParams();
  const nav = useNavigate();
  const [kind, setKind] = useState<K>('');
  const [q, setQ] = useState('');
  const { data: list, reload: reloadList } = useApi<any>(`/conversations?kind=${kind}&q=${encodeURIComponent(q)}`);
  const convId = id ? Number(id) : list?.items?.[0]?.id;
  const { data: conv, setData: setConv, reload: reloadConv } = useApi<any>(convId ? `/conversations/${convId}` : null, [convId]);
  const { data: templates } = useApi<any[]>('/chat/templates');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (!convId) return;
    post(`/conversations/${convId}/read`).then(reloadList);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [conv?.messages?.length, convId]);
  useLive('message', (m) => {
    reloadList();
    if (m.conversationId === convId) {
      setConv((c: any) => (c && !c.messages.some((x: any) => x.id === m.id) ? { ...c, messages: [...c.messages, m] } : c));
      post(`/conversations/${convId}/read`);
    }
  });

  const send = async (t = text) => {
    if (!t.trim() || !convId) return;
    setSending(true);
    try {
      const m = await post(`/conversations/${convId}/messages`, { text: t.trim() });
      setConv((c: any) => (c && !c.messages.some((x: any) => x.id === m.id) ? { ...c, messages: [...c.messages, m] } : c));
      setText('');
      reloadList();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSending(false);
    }
  };
  const c = list?.counts ?? {};
  const kindIcon = (k: string) => (k === 'driver' ? Truck : k === 'warehouse' ? Warehouse : k === 'team' ? Users : MessageCircle);

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-display text-[26px] leading-tight">Чаты</h1>
          <div className="mt-1 text-[11.5px] text-muted">Клиенты пишут из приложения, водители и склады — из своих чатов. Сообщения приходят в реальном времени.</div>
        </div>
      </div>
      <div className="grid h-[calc(100vh-150px)] min-h-[600px] gap-3 lg:grid-cols-[310px_minmax(0,1fr)] xl:grid-cols-[310px_minmax(0,1fr)_300px]">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="space-y-2 p-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="field rounded-full pl-8" placeholder="Имя, код, телефон" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="-mx-1 overflow-x-auto px-1 scroll-thin">
            <Segmented
              size="sm"
              value={kind}
              onChange={setKind}
              items={[
                { value: '', label: 'Все' },
                { value: 'unread', label: 'Новые', count: c.unread },
                { value: 'client', label: 'Клиенты' },
                { value: 'driver', label: 'Водители' },
                { value: 'warehouse', label: 'Склады' },
              ]}
            />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 scroll-thin">
            {!list && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="m-1.5 h-14" />)}
            {list?.items.map((cv: any) => {
              const Icon = kindIcon(cv.kind);
              return (
                <button key={cv.id} onClick={() => nav(`/chats/${cv.id}`)} className={clsx('flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition', cv.id === convId ? 'bg-accent-50' : 'hover:bg-soft')}>
                  <div className="relative">
                    {cv.kind === 'client' ? (
                      <Avatar name={cv.title} color={cv.clientColor} size={38} />
                    ) : (
                      <span className={clsx('grid h-[38px] w-[38px] place-items-center rounded-full', cv.kind === 'driver' ? 'bg-ink text-white' : cv.kind === 'warehouse' ? 'bg-[#FFF1E6] text-[#D9630B]' : 'bg-accent-50 text-accent')}>
                        <Icon size={16} />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[11.5px] font-medium">{cv.title}</span>
                      {cv.pinned ? <Pin size={11} className="shrink-0 text-muted" /> : null}
                      <span className="ml-auto shrink-0 text-[10px] text-muted">{cv.lastMessageAt ? (Date.now() - Date.parse(cv.lastMessageAt) < 86400000 ? time(cv.lastMessageAt) : day(cv.lastMessageAt)) : ''}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={clsx('truncate text-[11px]', cv.unreadAdmin ? 'font-medium text-ink' : 'text-muted')}>
                        {cv.clientCode && <span className="text-accent">{cv.clientCode} · </span>}
                        {cv.lastMessage ?? 'Нет сообщений'}
                      </span>
                      {cv.unreadAdmin > 0 && <span className="ml-auto grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-accent px-1 text-[9.5px] font-semibold text-white">{cv.unreadAdmin}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden">
          {!conv ? (
            <Empty icon={<MessageCircle size={20} />} title="Выберите чат" />
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-line px-5 py-3">
                {conv.kind === 'client' ? <Avatar name={conv.title} color={conv.context?.client?.color} size={34} /> : <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-ink text-white">{(() => { const I = kindIcon(conv.kind); return <I size={15} />; })()}</span>}
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium">{conv.title}</div>
                  <div className="text-[10.5px] text-muted">
                    {conv.kind === 'client' && `Клиент ${conv.context?.client?.code} · ${conv.context?.client?.phone} · через приложение`}
                    {conv.kind === 'driver' && `Водитель · ${conv.context?.driver?.phone}`}
                    {conv.kind === 'warehouse' && `${conv.context?.warehouse?.manager} · ${conv.context?.warehouse?.phone}`}
                    {conv.kind === 'team' && 'Внутренний чат сотрудников'}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    await patch(`/conversations/${conv.id}`, { pinned: !conv.pinned });
                    reloadConv();
                    reloadList();
                  }}
                  className={clsx('grid h-8 w-8 place-items-center rounded-full hover:bg-soft', conv.pinned ? 'text-accent' : 'text-muted')}
                >
                  <Pin size={15} />
                </button>
                {(conv.context?.client?.phone || conv.context?.driver?.phone) && (
                  <a href={`tel:${(conv.context?.client?.phone ?? conv.context?.driver?.phone).replace(/\s/g, '')}`} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-soft">
                    <Phone size={15} />
                  </a>
                )}
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#FAFAF8] px-5 py-4 scroll-thin">
                {conv.messages.map((m: any, i: number) => {
                  const mine = m.senderType === 'admin';
                  const sys = m.senderType === 'system';
                  const prev = conv.messages[i - 1];
                  const showDay = !prev || day(prev.createdAt) !== day(m.createdAt);
                  return (
                    <div key={m.id}>
                      {showDay && (
                        <div className="my-3 text-center">
                          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] text-muted shadow-card">{day(m.createdAt)}</span>
                        </div>
                      )}
                      <div className={clsx('flex', mine || sys ? 'justify-end' : 'justify-start')}>
                        <div
                          className={clsx(
                            'max-w-[72%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-[11.5px] leading-relaxed',
                            mine && 'rounded-br-md bg-ink text-white',
                            sys && 'rounded-br-md bg-accent-50 text-ink ring-1 ring-accent-100',
                            !mine && !sys && 'rounded-bl-md bg-white shadow-card',
                          )}
                        >
                          {sys && (
                            <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold text-accent">
                              <Bot size={11} /> Автоуведомление
                            </div>
                          )}
                          {m.text}
                          <div className={clsx('mt-0.5 text-right text-[9.5px]', mine ? 'text-white/50' : 'text-muted')}>
                            {mine && m.senderName ? `${m.senderName.split(' ')[0]} · ` : ''}
                            {time(m.createdAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottom} />
              </div>
              <div className="border-t border-line p-3">
                <div className="mb-2 flex gap-1.5 overflow-x-auto scroll-thin">
                  {templates?.map((t) => (
                    <button key={t.title} onClick={() => setText(t.text)} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-soft px-2.5 text-[11px] text-ink-2 hover:bg-accent-50 hover:text-accent">
                      <Zap size={11} /> {t.title}
                    </button>
                  ))}
                </div>
                <div className="flex items-end gap-2">
                  <textarea
                    className="field max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl"
                    rows={1}
                    placeholder="Сообщение… (Enter — отправить, Shift+Enter — новая строка)"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                  />
                  <button onClick={() => send()} disabled={!text.trim() || sending} className="grid h-10 w-10 place-items-center rounded-full bg-accent text-white transition hover:bg-accent-600 disabled:opacity-40">
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </Card>

        <div className="hidden min-h-0 overflow-y-auto scroll-thin xl:block">{conv && <Context conv={conv} onInsert={(t) => setText((x) => (x ? x + '\n' : '') + t)} />}</div>
      </div>
    </div>
  );
}

function Context({ conv, onInsert }: { conv: any; onInsert: (t: string) => void }) {
  const ctx = conv.context;
  if (!ctx) return <Card className="p-5 text-[11.5px] text-muted">Внутренний чат команды</Card>;
  if (ctx.type === 'client') {
    const c = ctx.client;
    return (
      <Card className="px-4 py-4">
        <div className="flex items-center gap-3">
          <Avatar name={c.name} color={c.color} size={40} />
          <div>
            <Link to={`/clients/${c.id}`} className="text-[12px] font-medium hover:text-accent">
              {c.name}
            </Link>
            <div className="text-[11px] text-muted">
              {c.code} · {c.warehouseName}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-soft px-3 py-2">
            <div className="label">Баланс</div>
            <div className={clsx('num mt-0.5 text-[13px] font-medium', c.balance < -0.5 ? 'text-danger' : '')}>{money(c.balance)}</div>
          </div>
          <div className="rounded-xl bg-soft px-3 py-2">
            <div className="label">В работе</div>
            <div className="num mt-0.5 text-[13px] font-medium">{ctx.parcels.length}</div>
          </div>
        </div>
        <div className="label mb-1.5 mt-4">Активные посылки</div>
        <div className="space-y-1.5">
          {ctx.parcels.length === 0 && <div className="text-[11.5px] text-muted">Нет активных посылок</div>}
          {ctx.parcels.map((p: any) => (
            <div key={p.id} className="rounded-xl border border-line px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[10.5px]">{p.trackNumber}</span>
                <Badge tone={PARCEL_STATUS[p.status].tone}>{PARCEL_STATUS[p.status].label}</Badge>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10.5px] text-muted">
                <span className="truncate">
                  {p.description}
                  {p.shipmentCode ? ` · ${p.shipmentCode}` : ''}
                </span>
                <Menu
                  trigger={(t) => (
                    <button onClick={t} className="shrink-0 whitespace-nowrap text-accent">
                      Вставить ↵
                    </button>
                  )}
                >
                  {(close) => (
                    <>
                      <MenuItem
                        onClick={() => {
                          close();
                          onInsert(`Ваша посылка ${p.trackNumber}: ${PARCEL_STATUS[p.status].label.toLowerCase()}${p.shipmentCode ? `, рейс ${p.shipmentCode}` : ''}${p.etaAt && p.status === 'in_transit' ? `, ориентировочно ${day(p.etaAt)}` : ''}.`);
                        }}
                      >
                        Статус посылки
                      </MenuItem>
                      {p.price && (
                        <MenuItem
                          onClick={() => {
                            close();
                            onInsert(`Стоимость доставки ${p.trackNumber}: ${money(p.price)} (${p.weightKg} кг).`);
                          }}
                        >
                          Стоимость доставки
                        </MenuItem>
                      )}
                    </>
                  )}
                </Menu>
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }
  if (ctx.type === 'driver') {
    const s = ctx.shipment;
    return (
      <Card className="px-4 py-4">
        <div className="text-[12px] font-medium">{ctx.driver.name}</div>
        <div className="text-[11px] text-muted">
          {ctx.driver.phone} · стаж {ctx.driver.experienceYears} лет
        </div>
        {s && (
          <Link to={`/shipments/${s.id}`} className="mt-3 block rounded-xl bg-soft px-3 py-2.5 hover:bg-[#F1F1EE]">
            <div className="label">Текущий рейс</div>
            <div className="mt-0.5 text-[12px] font-medium">{s.code}</div>
            <div className="text-[11px] text-muted">
              {s.model} · {s.plate}
            </div>
            <div className="mt-1 text-[11px] text-accent">ETA {day(s.etaAt)} →</div>
          </Link>
        )}
      </Card>
    );
  }
  return (
    <Card className="px-4 py-4 text-[11.5px]">
      <div className="text-[12px] font-medium">{ctx.warehouse.name}</div>
      <div className="mt-1 text-muted">{ctx.warehouse.address}</div>
      <div className="mt-3 rounded-xl bg-soft px-3 py-2">
        <div className="label">Менеджер</div>
        <div className="mt-0.5 font-medium">{ctx.warehouse.manager}</div>
        <div className="text-muted">{ctx.warehouse.managerPhone}</div>
      </div>
      <div className="mt-2 text-muted">{ctx.warehouse.workHours}</div>
    </Card>
  );
}
