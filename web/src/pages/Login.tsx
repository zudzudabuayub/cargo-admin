import { Boxes, LogIn } from 'lucide-react';
import { useState } from 'react';
import { RouteProgress } from '../components/RouteProgress';
import { TruckArt } from '../components/TruckArt';
import { Button, Field } from '../components/ui';
import { useAuth } from '../lib/hooks';

const DEMO = [
  { email: 'admin@cargo.tj', password: 'admin123', role: 'Администратор' },
  { email: 'manager@cargo.tj', password: 'manager123', role: 'Менеджер' },
  { email: 'gz@cargo.tj', password: 'sklad123', role: 'Склад Гуанчжоу' },
];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@cargo.tj');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid min-h-full lg:grid-cols-[1fr_520px]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#EFEFEC] p-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-white">
            <Boxes size={18} />
          </span>
          <span className="text-[15px] font-semibold">Cargo Express</span>
        </div>
        <div>
          <div className="label mb-2">Китай → Таджикистан</div>
          <div className="h-display max-w-[560px] text-[40px] leading-[1.1]">Каждый груз под контролем — от склада в Гуанчжоу до выдачи в Душанбе.</div>
          <div className="mt-10 max-w-[640px]">
            <TruckArt className="w-full" />
            <RouteProgress
              compact
              progress={0.62}
              stops={[
                { code: 'CAN', name: 'Гуанчжоу', kind: 'hub', at: 0 },
                { code: 'URC', name: 'Урумчи', kind: 'hub', at: 0.45 },
                { code: 'KHG', name: 'Кашгар', kind: 'hub', at: 0.75 },
                { code: 'IRK', name: 'Иркештам', kind: 'border', at: 0.82 },
                { code: 'DYU', name: 'Душанбе', kind: 'hub', at: 1 },
              ]}
            />
          </div>
        </div>
        <div className="text-[11.5px] text-muted">Рейсы · посылки · склады · клиенты · чаты · финансы</div>
      </div>
      <div className="flex items-center justify-center bg-white p-8">
        <form onSubmit={submit} className="w-full max-w-[360px]">
          <div className="mb-8 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-white">
              <Boxes size={20} />
            </span>
          </div>
          <h1 className="h-display text-[30px]">Вход в панель</h1>
          <div className="mt-1 text-[12.5px] text-muted">Для сотрудников карго-компании</div>
          <div className="mt-8 space-y-4">
            <Field label="Email">
              <input className="field h-10" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            </Field>
            <Field label="Пароль">
              <input className="field h-10" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
            {error && <div className="rounded-lg bg-danger-50 px-3 py-2 text-[12px] text-danger">{error}</div>}
            <Button variant="dark" size="lg" className="w-full" loading={busy} icon={<LogIn size={15} />}>
              Войти
            </Button>
          </div>
          <div className="mt-8 rounded-xl bg-soft p-3">
            <div className="label mb-2">Демо-доступ</div>
            {DEMO.map((d) => (
              <button
                type="button"
                key={d.email}
                onClick={() => {
                  setEmail(d.email);
                  setPassword(d.password);
                }}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-white"
              >
                <span className="font-medium">{d.role}</span>
                <span className="font-mono text-[11px] text-muted">
                  {d.email} / {d.password}
                </span>
              </button>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}
