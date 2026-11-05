import clsx from 'clsx';
import {
  Bell,
  BadgePercent,
  Boxes,
  CircleHelp,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  LogOut,
  Map as MapIcon,
  MessageCircle,
  Navigation,
  Package,
  Plus,
  Radar,
  Route,
  Search,
  Send,
  Settings,
  Sparkles,
  Truck,
  UserRound,
  Users,
  Wallet,
  Warehouse,
} from 'lucide-react';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, post } from '../lib/api';
import { ago, PARCEL_STATUS, SHIPMENT_STATUS } from '../lib/format';
import { useApi, useAuth, useLive, useLiveStatus, useToast } from '../lib/hooks';
import { ReceiveParcelModal } from './modals';
import { Avatar, Badge, Button, IconButton, Menu, MenuItem, Modal } from './ui';

const NAV = [
  { group: 'Операции' },
  { to: '/', icon: LayoutGrid, label: 'Обзор', end: true },
  { to: '/dispatch', icon: Send, label: 'Диспетчерская' },
  { to: '/shipments', icon: Route, label: 'Рейсы' },
  { to: '/tracking', icon: MapIcon, label: 'Live-трекинг' },
  { group: 'Склад и клиенты' },
  { to: '/parcels', icon: Package, label: 'Посылки', badge: 'problems' },
  { to: '/clients', icon: Users, label: 'Клиенты' },
  { to: '/chats', icon: MessageCircle, label: 'Чаты', badge: 'chats' },
  { group: 'Сеть' },
  { to: '/warehouses', icon: Warehouse, label: 'Склады' },
  { to: '/fleet', icon: Truck, label: 'Транспорт' },
  { group: 'Деньги' },
  { to: '/finance', icon: Wallet, label: 'Финансы' },
  { to: '/tariffs', icon: BadgePercent, label: 'Тарифы' },
  { group: 'AI' },
  { to: '/agents', icon: Sparkles, label: 'AI-агенты', badge: 'agents' },
] as const;

const ROLE_LABEL: Record<string, string> = { admin: 'Администратор', manager: 'Менеджер', warehouse: 'Склад', accountant: 'Бухгалтер' };

const CRUMBS: [RegExp, string][] = [
  [/^\/$/, 'Операции · Обзор'],
  [/^\/dispatch/, 'Операции · Диспетчерская'],
  [/^\/agents/, 'AI · Агенты'],
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
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('cargo_sidebar') === 'open';
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setOpen((o) => {
      try {
        localStorage.setItem('cargo_sidebar', o ? 'closed' : 'open');
      } catch {
        /* noop */
      }
      return !o;
    });
  const sideW = open ? 228 : 64;
  const { data: settings } = useApi<any>('/settings');
  const company = settings?.company;
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
  const badgeOf = (item: any) =>
    item.badge === 'chats' ? unreadChats : item.badge === 'problems' ? (brief?.stats?.unidentified ?? 0) + (brief?.stats?.problems ?? 0) : item.badge === 'actions' || item.badge === 'agents' ? actions : 0;

  return (
    <div className="min-h-full">
      {/* Боковая панель: закреплена, раскрывается кнопкой */}
      <aside
        className="fixed inset-y-0 left-0 z-50 flex flex-col border-r border-line bg-white transition-[width] duration-200 ease-out"
        style={{ width: sideW }}
      >
        <div className={clsx('relative flex h-14 shrink-0 items-center gap-2.5', open ? 'px-4' : 'justify-center')}>
          <button onClick={() => nav('/')} className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-ink text-white">
            <Boxes size={16} strokeWidth={2.2} />
          </button>
          {open && (
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-semibold leading-tight">{company?.name ?? 'Cargo'}</div>
              <div className="truncate text-[10px] text-muted">Китай → Таджикистан</div>
            </div>
          )}
          <button
            onClick={toggle}
            title={open ? 'Свернуть меню' : 'Развернуть меню'}
            className="absolute -right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-line-2 bg-white text-muted shadow-sm transition hover:text-ink"
          >
            {open ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
          </button>
        </div>
        <nav className={clsx('flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden pb-2 scroll-thin', open ? 'px-3' : 'items-center px-2')}>
          {NAV.map((item, i) =>
            'group' in item ? (
              open ? (
                <div key={i} className="label px-2.5 pb-1 pt-3">
                  {item.group}
                </div>
              ) : (
                <div key={i} className={clsx('mx-auto h-px w-6 bg-line', i === 0 ? 'mb-1 mt-0' : 'my-2')} />
              )
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={'end' in item ? item.end : false}
                className={({ isActive }) =>
                  clsx(
                    'group relative flex h-9 shrink-0 items-center rounded-[10px] transition',
                    open ? 'w-full gap-2.5 px-2.5' : 'w-9 justify-center',
                    isActive ? 'bg-accent-50 font-medium text-accent' : 'text-[#7E7E85] hover:bg-soft hover:text-ink',
                  )
                }
              >
                <item.icon size={17} strokeWidth={1.9} className="shrink-0" />
                {open && <span className="flex-1 truncate text-[12.5px]">{item.label}</span>}
                {badgeOf(item) > 0 &&
                  (open ? (
                    <span className="grid h-[17px] min-w-[17px] place-items-center rounded-full bg-danger px-1 text-[9.5px] font-semibold text-white">{badgeOf(item)}</span>
                  ) : (
                    <span className="absolute -right-0.5 -top-0.5 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-danger px-1 text-[9px] font-semibold text-white ring-2 ring-white">{badgeOf(item)}</span>
                  ))}
                {!open && <span className="pointer-events-none absolute left-full z-50 ml-3 hidden whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11px] text-white group-hover:block">{item.label}</span>}
              </NavLink>
            ),
          )}
        </nav>
        <div className={clsx('shrink-0 border-t border-line py-2', open ? 'px-3' : 'flex flex-col items-center px-2')}>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              clsx('group relative mb-1 flex h-9 items-center rounded-[10px] transition', open ? 'w-full gap-2.5 px-2.5' : 'w-9 justify-center', isActive ? 'bg-accent-50 text-accent' : 'text-[#7E7E85] hover:bg-soft hover:text-ink')
            }
          >
            <Settings size={17} strokeWidth={1.9} />
            {open && <span className="text-[12.5px]">Настройки</span>}
          </NavLink>
          <Menu
            align="left"
            placement="top"
            trigger={(t) => (
              <button onClick={t} className={clsx('flex items-center gap-2.5 rounded-[10px] text-left hover:bg-soft', open ? 'w-full p-1.5' : 'p-0.5')}>
                <Avatar name={user?.name} color={user?.color} size={30} />
                {open && (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium">{user?.name}</span>
                    <span className="block truncate text-[10.5px] text-muted">{ROLE_LABEL[user?.role ?? ''] ?? user?.role}</span>
                  </span>
                )}
              </button>
            )}
          >
            {(close) => (
              <div>
                <div className="px-2.5 py-2">
                  <div className="text-[12px] font-medium">{user?.name}</div>
                  <div className="text-[10.5px] text-muted">{user?.email}</div>
                </div>
                <MenuItem
                  icon={<UserRound size={14} />}
                  onClick={() => {
                    close();
                    nav('/settings');
                  }}
                >
                  Профиль и настройки
                </MenuItem>
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
        </div>
      </aside>

      {/* Контент */}
      <div className="min-w-0 transition-[padding] duration-200 ease-out" style={{ paddingLeft: sideW }}>
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 bg-canvas/85 px-6 backdrop-blur-md">
          <div className="label hidden min-w-0 flex-1 truncate sm:block">{crumb}</div>
          <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
            <button onClick={() => setSearch(true)} className="hidden h-9 w-[260px] items-center gap-2 rounded-full border border-line-2 bg-white px-3 text-[11.5px] text-muted hover:border-[#d0d0cc] lg:flex">
              <Search size={14} />
              <span className="flex-1 text-left">Поиск: трек, клиент, рейс…</span>
              <kbd className="rounded-md bg-soft px-1.5 py-0.5 text-[9.5px] font-medium text-muted">⌘K</kbd>
            </button>
            <button onClick={() => nav('/')} className="hidden h-9 items-center gap-2 rounded-full bg-white pl-1.5 pr-3 text-[11.5px] shadow-card md:flex">
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
                    <div className="text-[12px] font-medium">Уведомления</div>
                    <button
                      className="text-[11px] text-accent"
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
                          <span className="block text-[11.5px] font-medium">{n.title}</span>
                          {n.body && <span className="block text-[11px] text-muted">{n.body}</span>}
                          <span className="mt-0.5 block text-[10px] text-muted-2">{ago(n.createdAt)}</span>
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
          <Suspense fallback={<div className="grid h-[50vh] place-items-center"><span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" /></div>}>
            <Outlet />
          </Suspense>
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
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Трек-номер, код клиента, телефон, рейс TJ-…" className="flex-1 bg-transparent text-[14px]" />
        <kbd className="rounded-md bg-soft px-1.5 py-0.5 text-[9.5px] text-muted">Esc</kbd>
      </div>
      <div className="max-h-[420px] overflow-y-auto p-2 scroll-thin">
        {!res && <div className="px-3 py-8 text-center text-[11.5px] text-muted">Начните вводить — найдём клиентов, посылки и рейсы</div>}
        {res && total === 0 && <div className="px-3 py-8 text-center text-[11.5px] text-muted">Ничего не найдено</div>}
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
            <span className="font-mono text-[11.5px]">{p.trackNumber}</span>
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
