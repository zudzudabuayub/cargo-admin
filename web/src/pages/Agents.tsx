import clsx from 'clsx';
import { AlertTriangle, BarChart3, Check, FileText, Lock, MessagesSquare, Pause, Play, Route, Send, ShieldCheck, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Modal, ModalHeader, Segmented, Skeleton } from '../components/ui';
import { post, put } from '../lib/api';
import { ago, dateTime, num, plural, time } from '../lib/format';
import { useApi, useAuth, useLiveReload, useToast } from '../lib/hooks';

const ICON: Record<string, any> = { send: Send, route: Route, alert: AlertTriangle, chat: MessagesSquare, truck: Truck, chart: BarChart3 };

const STATUS: Record<string, { label: (n: number) => string; dot: string; cls: string }> = {
  needs: { label: (n) => `Ждёт вас · ${n}`, dot: 'bg-warn', cls: 'text-[#B26B00]' },
  active: { label: () => 'Активен', dot: 'bg-ok', cls: 'text-ok' },
  idle: { label: () => 'Ожидание', dot: 'bg-muted-2', cls: 'text-muted' },
  paused: { label: () => 'Пауза', dot: 'bg-muted-2', cls: 'text-muted' },
};

export default function Agents() {
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { data, reload } = useApi<any>('/agents');
  useLiveReload(['shipment', 'parcel', 'notification'], reload, 1500);
  const [perm, setPerm] = useState(false);
  const canManage = user?.role === 'admin' || user?.role === 'manager';

  if (!data) return <Skeleton className="h-[600px]" />;
  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-display text-[26px] leading-tight">AI-агенты</h1>
          <div className="mt-1 text-[11.5px] text-muted">Агенты следят за сетью круглосуточно. Важные решения — только после вашего одобрения.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<FileText size={14} />} onClick={() => nav('/settings#audit')}>
            Журнал действий
          </Button>
          <Button icon={<ShieldCheck size={14} />} onClick={() => setPerm(true)} disabled={!canManage}>
            Разрешения
          </Button>
          <Button
            variant="dark"
            disabled={!canManage}
            icon={data.paused ? <Play size={14} /> : <Pause size={14} />}
            onClick={async () => {
              await post('/agents/pause', { paused: !data.paused });
              toast(data.paused ? 'Агенты снова работают' : 'Все агенты на паузе', data.paused ? 'ok' : 'info');
              reload();
            }}
          >
            {data.paused ? 'Возобновить агентов' : 'Приостановить всех'}
          </Button>
        </div>
      </div>

      {/* Сводка */}
      <div className="grid gap-5 rounded-[22px] bg-ink p-6 text-white lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/70">
            <span className="relative flex h-3 w-3 items-center justify-center">
              {!data.paused && <span className="pulse-ring absolute inset-0 rounded-full bg-accent" />}
              <span className={clsx('relative h-2 w-2 rounded-full', data.paused ? 'bg-white/40' : 'bg-accent')} />
            </span>
            {data.paused ? 'Агенты на паузе' : `${data.activeAgents} агентов активны · live`}
          </div>
          <div className="h-display mt-5 max-w-[640px] text-[22px] leading-snug">
            {num(data.actionsToday)} {plural(data.actionsToday, ['действие', 'действия', 'действий'])} за сутки. {data.autoShare}% — без участия человека, и {data.waiting}{' '}
            {plural(data.waiting, ['решение ждёт', 'решения ждут', 'решений ждут'])} вас.
          </div>
          <div className="mt-auto grid grid-cols-2 gap-5 pt-6 sm:grid-cols-4">
            {[
              ['Сэкономлено за неделю', `${data.timeSavedHours} ч`],
              ['Точность', `${String(data.accuracy).replace('.', ',')}%`],
              ['Отклонено вами', `${String(data.overrideRate).replace('.', ',')}%`],
              ['Ждут вас', data.waiting],
            ].map(([k, v], i) => (
              <div key={k as string}>
                <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-white/50">{k}</div>
                <div className={clsx('h-display num mt-1 text-[26px]', i === 3 && 'text-lime')}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-[230px] rounded-2xl bg-white/[.06] p-4">
            <div className="flex items-center gap-2 text-[12.5px] font-medium">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-lime text-ink">
                <Check size={10} strokeWidth={3} />
              </span>
              Работает сам
            </div>
            <div className="mt-3 space-y-2">
              {data.runsOwn.map((t: string) => (
                <div key={t} className="flex items-start gap-2 text-[11.5px] text-white/70">
                  <Check size={12} className="mt-0.5 shrink-0 text-lime" />
                  {t}
                </div>
              ))}
            </div>
          </div>
          <div className="min-w-[230px] rounded-2xl bg-white/[.06] p-4">
            <div className="flex items-center gap-2 text-[12.5px] font-medium">
              <Lock size={13} className="text-accent-200" />
              Сначала спрашивает
            </div>
            <div className="mt-3 space-y-2">
              {data.asksFirst.map((t: string) => (
                <div key={t} className="flex items-start gap-2 text-[11.5px] text-white/70">
                  <Lock size={11} className="mt-0.5 shrink-0 text-accent-200" />
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Агенты */}
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.agents.map((a: any) => {
          const Icon = ICON[a.icon] ?? Send;
          const st = STATUS[a.status] ?? STATUS.active;
          return (
            <Card key={a.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-white">
                  <Icon size={18} />
                </span>
                <span className={clsx('inline-flex items-center gap-1.5 text-[11.5px] font-medium', st.cls)}>
                  <span className={clsx('h-1.5 w-1.5 rounded-full', st.dot)} />
                  {st.label(a.pending)}
                </span>
              </div>
              <div className="mt-3 text-[14px] font-medium">{a.name}</div>
              <div className="mt-1 text-[11.5px] leading-relaxed text-muted">{a.desc}</div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {a.stats.map(([k, v]: [string, any]) => (
                  <div key={k}>
                    <div className="h-display num text-[24px] leading-none">{typeof v === 'number' ? num(v) : v}</div>
                    <div className="mt-1.5 text-[11px] text-muted">{k}</div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => (a.last.state === 'waiting' ? nav('/dispatch') : nav('/settings#audit'))}
                className="mt-4 flex items-center gap-2.5 rounded-xl bg-soft px-3 py-2.5 text-left hover:bg-[#F1F1EE]"
              >
                <span className="num shrink-0 text-[11px] text-muted">{a.last.at ? time(a.last.at) : '—'}</span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium">{a.last.text}</span>
                <span className={clsx('shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium', a.last.state === 'waiting' ? 'bg-warn-50 text-[#B26B00]' : 'bg-ok-50 text-ok')}>
                  {a.last.state === 'waiting' ? 'Ждёт' : 'Готово'}
                </span>
              </button>
              <div className="mt-auto pt-4">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted">Автономность</span>
                  <span className="font-medium">{a.autonomyLabel}</span>
                </div>
                <div className="mt-2 grid grid-cols-5 gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <span key={i} className={clsx('h-[4px] rounded-full', i <= a.autonomyLevel ? 'bg-accent' : 'bg-[#E6E6E2]')} />
                  ))}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="px-5 pb-1 pt-4">
          <div className="text-[13px] font-medium">Последние действия</div>
          <div className="text-[11px] text-muted">Что агенты сделали сами и что одобрили сотрудники</div>
        </div>
        <div className="divide-y divide-line/70">
          {data.recent.map((e: any) => (
            <div key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-[12px]">
              <span className={clsx('grid h-6 w-6 shrink-0 place-items-center rounded-full', e.userId ? 'bg-accent-50 text-accent' : 'bg-ok-50 text-ok')}>{e.userId ? <ShieldCheck size={12} /> : <Check size={12} />}</span>
              <span className="w-[150px] shrink-0 truncate font-medium">{e.userName}</span>
              <span className="min-w-0 flex-1 truncate text-ink-2">{e.details && !e.details.startsWith('{') && !e.details.startsWith('[') ? e.details : e.action}</span>
              <span className="shrink-0 text-[11px] text-muted" title={dateTime(e.createdAt)}>
                {ago(e.createdAt)}
              </span>
            </div>
          ))}
        </div>
      </Card>
      <Permissions open={perm} onClose={() => setPerm(false)} agents={data.agents} onDone={reload} />
    </div>
  );
}

function Permissions({ open, onClose, agents, onDone }: { open: boolean; onClose: () => void; agents: any[]; onDone: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) setV(Object.fromEntries(agents.map((a) => [a.id, a.autonomy])));
  }, [open, agents]);
  return (
    <Modal open={open} onClose={onClose} width={600}>
      <ModalHeader onClose={onClose} title="Разрешения агентов" sub="«Работает сам» — агент выполняет действия без вашего одобрения (например, сам сообщает клиентам о задержке). Всё записывается в журнал." />
      <div className="divide-y divide-line px-6 py-2">
        {agents.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium">{a.name}</div>
              <div className="max-w-[260px] text-[11px] text-muted">{a.desc}</div>
            </div>
            <Segmented
              size="sm"
              value={v[a.id] ?? a.autonomy}
              onChange={(x) => setV((s) => ({ ...s, [a.id]: x }))}
              items={[
                { value: 'recommend', label: 'Советует' },
                { value: 'approve', label: 'С одобрением' },
                { value: 'auto', label: 'Сам' },
              ]}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="dark"
          onClick={async () => {
            await put('/agents/autonomy', v);
            toast('Разрешения сохранены');
            onDone();
            onClose();
          }}
        >
          Сохранить
        </Button>
      </div>
    </Modal>
  );
}
