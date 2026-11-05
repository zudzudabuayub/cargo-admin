import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, getToken, post, setToken, setUnauthorizedHandler } from './api';

// ---------- Загрузка данных ----------
export function useApi<T = any>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [tick, setTick] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (!path) return;
    const ctrl = new AbortController();
    if (first.current) setLoading(true);
    api<T>(path, { signal: ctrl.signal })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        setLoading(false);
        first.current = false;
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

// ---------- Авторизация ----------
export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  color: string;
  warehouseId: number | null;
}
interface AuthCtx {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}
const AuthContext = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const logout = useCallback(() => {
    post('/auth/logout').catch(() => {});
    setToken(null);
    setUser(null);
  }, []);
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
    });
    if (!getToken()) return setReady(true);
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);
  const login = useCallback(async (email: string, password: string) => {
    const r = await post<{ token: string; user: User }>('/auth/login', { email, password });
    setToken(r.token);
    setUser(r.user);
  }, []);
  return <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>;
}

// ---------- Real-time события (SSE) ----------
type Handler = (data: any) => void;
const LiveContext = createContext<{ on: (ev: string, fn: Handler) => () => void; connected: boolean }>(null!);

export function LiveProvider({ children }: { children: ReactNode }) {
  const handlers = useRef(new Map<string, Set<Handler>>());
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const t = getToken();
    if (!t) return;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      es = new EventSource(`/api/stream?token=${encodeURIComponent(t)}`);
      es.addEventListener('ready', () => setConnected(true));
      es.onerror = () => {
        setConnected(false);
        es?.close();
        retry = setTimeout(connect, 4000);
      };
      for (const ev of ['message', 'notification', 'positions', 'shipment', 'parcel', 'read']) {
        es.addEventListener(ev, (e) => {
          const data = JSON.parse((e as MessageEvent).data);
          handlers.current.get(ev)?.forEach((fn) => fn(data));
        });
      }
    };
    connect();
    return () => {
      clearTimeout(retry);
      es?.close();
    };
  }, []);
  const on = useCallback((ev: string, fn: Handler) => {
    if (!handlers.current.has(ev)) handlers.current.set(ev, new Set());
    handlers.current.get(ev)!.add(fn);
    return () => {
      handlers.current.get(ev)!.delete(fn);
    };
  }, []);
  const value = useMemo(() => ({ on, connected }), [on, connected]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(event: string, fn: Handler) {
  const ctx = useContext(LiveContext);
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => ctx?.on(event, (d) => ref.current(d)), [ctx, event]);
}
export const useLiveStatus = () => useContext(LiveContext)?.connected ?? false;

/** Перезагрузка данных при событиях с дебаунсом */
export function useLiveReload(events: string[], reload: () => void, delay = 600) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const fn = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(reload, delay);
  }, [reload, delay]);
  for (const ev of events) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useLive(ev, fn);
  }
}

// ---------- Тосты ----------
interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error' | 'info';
  sub?: string;
}
const ToastContext = createContext<(text: string, tone?: Toast['tone'], sub?: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'ok', sub?: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone, sub }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[2000] flex -translate-x-1/2 flex-col items-center gap-2">
        {items.map((t) => (
          <div key={t.id} className="fade-up pointer-events-auto flex items-center gap-2.5 rounded-xl bg-ink px-4 py-2.5 text-[11.5px] text-white shadow-pop">
            <span className={`grid h-5 w-5 place-items-center rounded-full text-[10.5px] ${t.tone === 'error' ? 'bg-danger' : t.tone === 'info' ? 'bg-accent' : 'bg-lime text-lime-ink'}`}>
              {t.tone === 'error' ? '!' : t.tone === 'info' ? 'i' : '✓'}
            </span>
            <div>
              <div className="font-medium">{t.text}</div>
              {t.sub && <div className="text-[10.5px] text-white/60">{t.sub}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useInterval(fn: () => void, ms: number) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useInterval(() => setNow(Date.now()), ms);
  return now;
}
