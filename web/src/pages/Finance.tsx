import clsx from 'clsx';
import { CreditCard, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PaymentModal } from '../components/modals';
import { Avatar, Button, Card, Kpi, PageHeader, Segmented, Skeleton, Table, Td, Th } from '../components/ui';
import { post } from '../lib/api';
import { dateTime, day, kg, money, num, PAYMENT_METHODS } from '../lib/format';
import { useApi, useToast } from '../lib/hooks';

/** ISO-неделя «YYYY-WW» (как strftime %W в SQLite) → дата понедельника */
function weekStart(wk: string) {
  const [y, w] = wk.split('-').map(Number);
  const jan1 = new Date(Date.UTC(y, 0, 1));
  const firstMon = new Date(jan1);
  firstMon.setUTCDate(jan1.getUTCDate() + ((8 - (jan1.getUTCDay() || 7)) % 7));
  const d = new Date(firstMon);
  d.setUTCDate(firstMon.getUTCDate() + (w - 1) * 7);
  return d;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
const compact = (v: number) => (v >= 10000 ? `$${Math.round(v / 1000)}K` : `$${num(v)}`);

function RevenueChart({ weeks }: { weeks: { wk: string; s: number; n: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 220;
  const pad = { l: 44, r: 8, t: 18, b: 24 };
  const step = niceMax(Math.max(...weeks.map((w) => w.s), 1) / 4);
  const max = Math.ceil(Math.max(...weeks.map((w) => w.s), 1) / step) * step;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const band = (W - pad.l - pad.r) / Math.max(1, weeks.length);
  const bw = Math.min(24, band * 0.56);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const maxIdx = weeks.reduce((a, w, i) => (w.s > weeks[a].s ? i : a), 0);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Выручка по неделям">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#ECECEA" strokeWidth={1} />
            <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#8A8A91">
              {compact(t)}
            </text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const x = pad.l + band * i + (band - bw) / 2;
          const top = y(w.s);
          const h = Math.max(0, H - pad.b - top);
          const r = Math.min(4, h);
          return (
            <g key={w.wk} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + band * i} y={pad.t} width={band} height={H - pad.t - pad.b} fill="transparent" />
              <path
                d={`M${x},${H - pad.b} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + bw - r},${top} Q${x + bw},${top} ${x + bw},${top + r} L${x + bw},${H - pad.b} Z`}
                fill="#6A4CFF"
                opacity={hover == null || hover === i ? 1 : 0.45}
              />
              <text x={x + bw / 2} y={H - pad.b + 15} textAnchor="middle" fontSize="10" fill="#8A8A91">
                {day(weekStart(w.wk).toISOString())}
              </text>
              {i === maxIdx && hover == null && (
                <text x={x + bw / 2} y={top - 6} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#111113">
                  {compact(w.s)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="#D9D9D5" strokeWidth={1} />
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute top-0 rounded-xl bg-white px-3 py-2 text-[11.5px] shadow-pop" style={{ left: `${((44 + ((640 - 52) / weeks.length) * (hover + 0.5)) / 640) * 100}%`, transform: 'translateX(-50%)' }}>
          <div className="text-muted">Неделя с {day(weekStart(weeks[hover].wk).toISOString())}</div>
          <div className="num text-[13px] font-medium">{money(weeks[hover].s, 0)}</div>
          <div className="text-muted">{weeks[hover].n} платежей</div>
        </div>
      )}
    </div>
  );
}

export default function Finance() {
  const { data, reload } = useApi<any>('/finance');
  const [pay, setPay] = useState<any>(null);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const toast = useToast();
  const maxMethod = useMemo(() => Math.max(1, ...(data?.byMethod ?? []).map((m: any) => m.s)), [data]);
  if (!data) return <Skeleton className="h-[600px]" />;
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Финансы"
        sub={`Курс: 1 USD = ${data.usdRate} сомони · расчёты с клиентами в USD и TJS`}
        right={
          <Button variant="primary" icon={<CreditCard size={15} />} onClick={() => setPay({})}>
            Принять оплату
          </Button>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
        <Kpi label="Поступления за 30 дней" value={money(data.revenue30, 0)} sub={`за 8 недель: ${money(data.revenue, 0)}`} />
        <Kpi label="Долги клиентов" value={<span className="text-danger">{money(data.receivable, 0)}</span>} sub={`${data.debtors.length} клиентов с задолженностью`} />
        <Kpi label="В пути, не оплачено" value={money(data.inTransitValue, 0)} sub="будет к оплате при выдаче" />
        <Kpi label="Доставлено за 30 дней" value={kg(data.kgDelivered30)} sub={data.kgDelivered30 ? `≈ ${money(data.revenue30 / data.kgDelivered30)} за кг` : ''} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="px-5 pb-4 pt-4">
          <div className="mb-2 flex items-start justify-between">
            <div>
              <div className="text-[13.5px] font-medium">Поступления по неделям, USD</div>
              <div className="text-[11.5px] text-muted">Все способы оплаты, пересчёт TJS и CNY по курсу</div>
            </div>
            <Segmented
              size="sm"
              value={view}
              onChange={setView}
              items={[
                { value: 'chart', label: 'График' },
                { value: 'table', label: 'Таблица' },
              ]}
            />
          </div>
          {view === 'chart' ? (
            <RevenueChart weeks={data.weekly} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Неделя</Th>
                  <Th className="text-right">Платежей</Th>
                  <Th className="text-right">Сумма</Th>
                </tr>
              </thead>
              <tbody>
                {data.weekly.map((w: any) => (
                  <tr key={w.wk}>
                    <Td>с {day(weekStart(w.wk).toISOString())}</Td>
                    <Td className="num text-right">{w.n}</Td>
                    <Td className="num text-right font-medium">{money(w.s, 0)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card className="px-5 py-4">
          <div className="text-[13.5px] font-medium">Способы оплаты</div>
          <div className="text-[11.5px] text-muted">за 8 недель</div>
          <div className="mt-4 space-y-3">
            {data.byMethod.map((m: any) => (
              <div key={m.method}>
                <div className="flex justify-between text-[12px]">
                  <span>{PAYMENT_METHODS[m.method] ?? m.method}</span>
                  <span className="num font-medium">
                    {money(m.s, 0)} <span className="font-normal text-muted">· {m.n}</span>
                  </span>
                </div>
                <div className="mt-1 h-[6px] overflow-hidden rounded-full bg-[#F0F0ED]">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(m.s / maxMethod) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
        <Card className="self-start overflow-hidden">
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <div>
              <div className="text-[13.5px] font-medium">Должники</div>
              <div className="text-[11.5px] text-muted">посылки выданы или ждут выдачи, оплата не получена</div>
            </div>
            <Button
              size="sm"
              variant="soft"
              icon={<Send size={12} />}
              onClick={async () => {
                const r = await post('/assistant/actions/debt_reminder');
                toast(r.message);
              }}
            >
              Напомнить всем
            </Button>
          </div>
          <div className="max-h-[480px] overflow-y-auto scroll-thin">
            {data.debtors.map((d: any) => (
              <div key={d.id} className="flex items-center gap-2.5 border-t border-line/70 px-5 py-2">
                <Avatar name={d.name} color={d.color} size={28} />
                <Link to={`/clients/${d.id}`} className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium hover:text-accent">{d.name}</div>
                  <div className="text-[11px] text-muted">
                    {d.code} · {d.phone}
                  </div>
                </Link>
                <span className="num text-[12.5px] font-medium text-danger">{money(d.balance)}</span>
                <Button size="sm" onClick={() => setPay(d)}>
                  Оплата
                </Button>
              </div>
            ))}
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="px-5 pb-2 pt-4 text-[13.5px] font-medium">Последние платежи</div>
          <div className="max-h-[520px] overflow-y-auto scroll-thin">
            <Table>
              <thead>
                <tr>
                  <Th>Дата</Th>
                  <Th>Клиент</Th>
                  <Th>Способ</Th>
                  <Th>Комментарий</Th>
                  <Th>Принял</Th>
                  <Th className="text-right">Сумма</Th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p: any) => (
                  <tr key={p.id} className="hover:bg-soft/70">
                    <Td className="text-[12px] text-ink-2">{dateTime(p.createdAt)}</Td>
                    <Td>
                      <Link to={`/clients/${p.clientId}`} className="flex items-center gap-2">
                        <Avatar name={p.clientName} color={p.clientColor} size={22} />
                        <span className="font-medium">{p.clientName}</span>
                        <span className="text-[11px] text-accent">{p.clientCode}</span>
                      </Link>
                    </Td>
                    <Td>{PAYMENT_METHODS[p.method] ?? p.method}</Td>
                    <Td className="max-w-[200px] truncate text-muted">{p.note ?? '—'}</Td>
                    <Td className="text-[12px] text-muted">{p.userName ?? '—'}</Td>
                    <Td className={clsx('num text-right font-medium')}>
                      {num(p.amount, 2)} {p.currency}
                      {p.currency !== 'USD' && <div className="text-[10.5px] font-normal text-muted">{money(p.amountUsd)}</div>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      </div>
      <PaymentModal open={!!pay} onClose={() => setPay(null)} client={pay?.id ? pay : undefined} onDone={reload} />
    </div>
  );
}
