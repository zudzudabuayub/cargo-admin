import clsx from 'clsx';
import {
  Bell,
  BadgePercent,
  Boxes,
  CircleHelp,
  LayoutGrid,
  LogOut,
  MessageCircle,
  Navigation,
  Package,
  Plus,
  Radar,
  Search,
  Settings,
  Truck,
  Users,
  Wallet,
  Warehouse,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, post } from '../lib/api';
import { ago, PARCEL_STATUS, SHIPMENT_STATUS } from '../lib/format';
import { useApi, useAuth, useLive, useLiveStatus, useToast } from '../lib/hooks';
import { ReceiveParcelModal } from './modals';
import { Avatar, Badge, Button, IconButton, Menu, MenuItem, Modal } from './ui';

const NAV = [
  { to: '/', icon: LayoutGrid, label: 'Обзор', end: true },
  { to: '/shipments', icon: Navigation, label: 'Рейсы' },
  { to: '/tracking', icon: Radar, label: 'Live-трекинг' },
  { to: '/parcels', icon: Package, label: 'Посылки', badge: 'problems' },
  { to: '/clients', icon: Users, label: 'Клиенты' },
  { to: '/chats', icon: MessageCircle, label: 'Чаты', badge: 'chats' },
  { sep: true },
  { to: '/warehouses', icon: Warehouse, label: 'Склады' },
  { to: '/fleet', icon: Truck, label: 'Транспорт' },
  { to: '/finance', icon: Wallet, label: 'Финансы' },
  { to: '/tariffs', icon: BadgePercent, label: 'Тарифы' },
] as const;

const CRUMBS: [RegExp, string][] = [
  [/^\/$/, 'Операции · Обзор'],
  [/^\/shipments\/\d+/, 'Операции · Рейс'],
  [/^\/shipments/, 'Операции · Рейсы'],
  [/^\/tracking/, 'Операции · Live-трекинг'],
  [/^\/parcels/, 'Склад · Посылки'],
  [/^\/clients\/\d+/, 'CRM · Карточка клиента'],
  [/^\/clients/, 'CRM · Клиенты'],
  [/^\/chats/, 'CRM · Чаты'],
  [/^\/warehouses/, 'Сеть · Склады'],
  [/^\/fleet/, 'Сеть · Транспорт и водители'],
  [/^\/finance/, 'Финансы'],
  [/^\/tariffs/, 'Финансы · Тарифы и калькулятор'],
  [/^\/settings/, 'Настройки'],
];

export function Layout() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const toast = useToast();
  const live = useLiveStatus();
  const [receive, setReceive] = useState(false);
  const [search, setSearch] = useState(false);
  const { data: notif, reload: reloadNotif } = useApi<{ items: any[]; unread: number }>('/notifications');
  const { data: conv, reload: reloadConv } = useApi<{ counts: Record<string, number> }>('/conversations?kind=unread');
  const { data: brief } = useApi<any>('/assistant/brief', [loc.pathname]);

  useLive('notification', (n) => {
    reloadNotif();
    toast(n.title, n.level === 'danger' ? 'error' : n.level === 'success' ? 'ok' : 'info', n.body);
  });
  useLive('message', (m) => {
    reloadConv();
    if (m.senderType !== 'admin' && m.senderType !== 'system' && !loc.pathname.startsWith('/chats')) toast(`Новое сообщение: ${m.senderName ?? ''}`, 'info', m.text.slice(0, 80));
  });
  useLive('read', reloadConv);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const crumb = CRUMBS.find(([re]) => re.test(loc.pathname))?.[1] ?? '';
  const unreadChats = conv?.counts?.unread ?? 0;
  const actions = brief?.actions?.length ?? 0;

  return (
    <div className="flex h-full">
      {/* Боковая панель */}
      <aside className="sticky top-0 flex h-screen w-[64px] shrink-0 flex-col items-center border-r border-line bg-white py-3">
        <button onClick={() => nav('/')} className="mb-4 grid h-9 w-9 place-items-center rounded-xl bg-ink text-white">
          <Boxes size={18} strokeWidth={2.2} />
        </button>
        <nav className="flex flex-1 flex-col items-center gap-1">
          {NAV.map((item, i) =>
            'sep' in item ? (
              <div key={i} className="my-2 h-px w-6 bg-line" />
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={'end' in item ? item.end : false}
                className={({ isActive }) =>
                  clsx('group relative grid h-10 w-10 place-items-center rounded-xl transition', isActive ? 'bg-accent-50 text-accent' : 'text-[#8E8E94] hover:bg-soft hover:text-ink')
                }
              >
                <item.icon size={18} strokeWidth={1.9} />
                {'badge' in item && item.badge === 'chats' && unreadChats > 0 && (
                  <span className="absolute right-1 top-1 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-danger px-1 text-[9px] font-semibold text-white ring-2 ring-white">{unreadChats}</span>
                )}
                {'badge' in item && item.badge === 'problems' && (brief?.stats?.unidentified ?? 0) + (brief?.stats?.problems ?? 0) > 0 && (
                  <span className="absolute right-1 top-1 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-danger px-1 text-[9px] font-semibold text-white ring-2 ring-white">
                    {(brief?.stats?.unidentified ?? 0) + (brief?.stats?.problems ?? 0)}
                  </span>
                )}
                <span className="pointer-events-none absolute left-full z-50 ml-3 hidden whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11.5px] text-white group-hover:block">{item.label}</span>
              </NavLink>
            ),
          )}
        </nav>
        <NavLink to="/settings" className={({ isActive }) => clsx('mb-2 grid h-10 w-10 place-items-center rounded-xl', isActive ? 'bg-accent-50 text-accent' : 'text-[#8E8E94] hover:bg-soft')}>
          <Settings size={18} strokeWidth={1.9} />
        </NavLink>
        <Menu
          align="left"
          placement="top"
          trigger={(t) => (
            <button onClick={t} className="rounded-full">
              <Avatar name={user?.name} color={user?.color} size={32} />
            </button>
          )}
        >
          {(close) => (
            <div>
              <div className="px-2.5 py-2">
                <div className="text-[12.5px] font-medium">{user?.name}</div>
                <div className="text-[11px] text-muted">{user?.email}</div>
              </div>
              <MenuItem
                icon={<LogOut size={14} />}
                onClick={() => {
                  close();
                  logout();
                }}
              >
                Выйти
              </MenuItem>
            </div>
          )}
        </Menu>
      </aside>

      {/* Контент */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 bg-canvas/85 px-6 backdrop-blur-md">
          <div className="label hidden min-w-0 flex-1 truncate sm:block">{crumb}</div>
          <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
            <button onClick={() => setSearch(true)} className="hidden h-9 w-[260px] items-center gap-2 rounded-full border border-line-2 bg-white px-3 text-[12.5px] text-muted hover:border-[#d0d0cc] lg:flex">
              <Search size={14} />
              <span className="flex-1 text-left">Поиск: трек, клиент, рейс…</span>
              <kbd className="rounded-md bg-soft px-1.5 py-0.5 text-[10px] font-medium text-muted">⌘K</kbd>
            </button>
            <button onClick={() => nav('/')} className="hidden h-9 items-center gap-2 rounded-full bg-white pl-1.5 pr-3 text-[12px] shadow-card md:flex">
              <span className="relative grid h-6 w-6 place-items-center rounded-full bg-ink text-white">
                <Radar size={12} />
                <span className={clsx('absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-white', live ? 'bg-ok' : 'bg-muted-2')} />
              </span>
              <span className="font-medium">Мониторинг {brief?.activeShipments ?? '—'}</span>
              {actions > 0 && <span className="text-accent">{actions} действий</span>}
            </button>
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setReceive(true)}>
              Принять посылку
            </Button>
            <Menu
              trigger={(t) => (
                <IconButton onClick={t} badge={notif?.unread || undefined}>
                  <Bell size={17} />
                </IconButton>
              )}
            >
              {(close) => (
                <div className="w-[340px]">
                  <div className="flex items-center justify-between px-2.5 py-2">
                    <div className="text-[13px] font-medium">Уведомления</div>
                    <button
                      className="text-[11.5px] text-accent"
                      onClick={async () => {
                        await post('/notifications/read-all');
                        reloadNotif();
                      }}
                    >
                      Прочитать все
                    </button>
                  </div>
                  <div className="max-h-[420px] overflow-y-auto scroll-thin">
                    {notif?.items.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          close();
                          post(`/notifications/${n.id}/read`).then(reloadNotif);
                          if (n.link) nav(n.link);
                        }}
                        className={clsx('flex w-full gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-soft', !n.read && 'bg-accent-50/50')}
                      >
                        <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', { danger: 'bg-danger', warning: 'bg-warn', success: 'bg-ok', info: 'bg-accent' }[n.level as string] ?? 'bg-muted')} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] font-medium">{n.title}</span>
                          {n.body && <span className="block text-[11.5px] text-muted">{n.body}</span>}
                          <span className="mt-0.5 block text-[10.5px] text-muted-2">{ago(n.createdAt)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Menu>
            <IconButton onClick={() => nav('/settings#api')} className="hidden sm:grid">
              <CircleHelp size={17} />
            </IconButton>
          </div>
        </header>
        <main className="px-6 pb-12 pt-1">
          <Outlet />
        </main>
      </div>
      <ReceiveParcelModal open={receive} onClose={() => setReceive(false)} />
      <CommandSearch open={search} onClose={() => setSearch(false)} />
    </div>
  );
}

function CommandSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<any>(null);
  const nav = useNavigate();
  useEffect(() => {
    if (!open) {
      setQ('');
      setRes(null);
    }
  }, [open]);
  useEffect(() => {
    if (q.length < 2) return setRes(null);
    const t = setTimeout(() => api(`/search?q=${encodeURIComponent(q)}`).then(setRes), 180);
    return () => clearTimeout(t);
  }, [q]);
  const go = useCallback(
    (to: string) => {
      onClose();
      nav(to);
    },
    [nav, onClose],
  );
  const total = res ? res.clients.length + res.parcels.length + res.shipments.length : 0;
  return (
    <Modal open={open} onClose={onClose} width={560}>
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <Search size={16} className="text-muted" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Трек-номер, код клиента, телефон, рейс TJ-…" className="flex-1 bg-transparent text-[15px]" />
        <kbd className="rounded-md bg-soft px-1.5 py-0.5 text-[10px] text-muted">Esc</kbd>
      </div>
      <div className="max-h-[420px] overflow-y-auto p-2 scroll-thin">
        {!res && <div className="px-3 py-8 text-center text-[12px] text-muted">Начните вводить — найдём клиентов, посылки и рейсы</div>}
        {res && total === 0 && <div className="px-3 py-8 text-center text-[12px] text-muted">Ничего не найдено</div>}
        {res?.shipments.length > 0 && <div className="label px-3 pb-1 pt-2">Рейсы</div>}
        {res?.shipments.map((s: any) => (
          <button key={s.id} onClick={() => go(`/shipments/${s.id}`)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-soft">
            <Navigation size={14} className="text-muted" />
            <span className="font-medium">{s.code}</span>
            <span className="text-muted">{s.plate}</span>
            <Badge tone={SHIPMENT_STATUS[s.status]?.tone} className="ml-auto">
              {SHIPMENT_STATUS[s.status]?.label}
            </Badge>
          </button>
        ))}
        {res?.clients.length > 0 && <div className="label px-3 pb-1 pt-2">Клиенты</div>}
        {res?.clients.map((c: any) => (
          <button key={c.id} onClick={() => go(`/clients/${c.id}`)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-soft">
            <Avatar name={c.name} color={c.color} size={22} />
            <span className="font-medium">{c.name}</span>
            <span className="text-muted">{c.code}</span>
            <span className="ml-auto text-muted">{c.phone}</span>
          </button>
        ))}
        {res?.parcels.length > 0 && <div className="label px-3 pb-1 pt-2">Посылки</div>}
        {res?.parcels.map((p: any) => (
          <button key={p.id} onClick={() => go(`/parcels?open=${p.id}`)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-soft">
            <Package size={14} className="text-muted" />
            <span className="font-mono text-[12px]">{p.trackNumber}</span>
            <span className="text-muted">{p.clientCode ?? 'без кода'}</span>
            <Badge tone={PARCEL_STATUS[p.status]?.tone} className="ml-auto">
              {PARCEL_STATUS[p.status]?.label}
            </Badge>
          </button>
        ))}
      </div>
    </Modal>
  );
}
