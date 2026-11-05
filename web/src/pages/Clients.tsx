import clsx from 'clsx';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NewClientModal } from '../components/modals';
import { Avatar, Badge, Button, Card, Empty, PageHeader, Segmented, Skeleton, Table, Td, Th } from '../components/ui';
import { ago, kg, money, num } from '../lib/format';
import { useApi } from '../lib/hooks';

export default function Clients() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | 'vip' | 'business' | 'blocked'>('');
  const [create, setCreate] = useState(false);
  const nav = useNavigate();
  const { data, loading } = useApi<any>(`/clients?q=${encodeURIComponent(q)}&status=${status}`);
  const t = data?.totals;
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Клиенты"
        sub={t ? `${num(t.all)} клиентов · ${t.newMonth} новых за 30 дней` : ' '}
        right={
          <Button variant="dark" icon={<Plus size={15} />} onClick={() => setCreate(true)}>
            Новый клиент
          </Button>
        }
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={status}
          onChange={setStatus}
          items={[
            { value: '', label: 'Все', count: t?.all },
            { value: 'vip', label: 'VIP', count: t?.vip },
            { value: 'business', label: 'Бизнес', count: t?.business },
            { value: 'blocked', label: 'Заблокированы', count: t?.blocked },
          ]}
        />
        <div className="relative w-[320px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="field rounded-full pl-8" placeholder="Имя, код DSH-…, телефон, компания" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <Card className="overflow-hidden">
        {loading && !data ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <Empty title="Клиенты не найдены" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Клиент</Th>
                <Th>Контакты</Th>
                <Th>Пункт выдачи</Th>
                <Th className="text-right">В работе</Th>
                <Th className="text-right">Всего</Th>
                <Th className="text-right">Баланс</Th>
                <Th>Источник</Th>
                <Th className="text-right">Активность</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c: any) => (
                <tr key={c.id} onClick={() => nav(`/clients/${c.id}`)} className="cursor-pointer hover:bg-soft/70">
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={c.company ?? c.name} color={c.color} size={30} />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{c.name}</span>
                          {c.status === 'vip' && <Badge tone="lime">VIP</Badge>}
                          {c.status === 'blocked' && <Badge tone="red">Блок</Badge>}
                        </div>
                        <div className="text-[10.5px]">
                          <span className="font-medium text-accent">{c.code}</span>
                          {c.company && <span className="text-muted"> · {c.company}</span>}
                        </div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="num text-[11.5px]">{c.phone}</div>
                    <div className="text-[10.5px] text-muted">{c.telegram ?? c.email ?? '—'}</div>
                  </Td>
                  <Td className="text-[11.5px] text-ink-2">{c.warehouseName}</Td>
                  <Td className="num text-right">
                    {c.parcelsActive}
                    {c.parcelsReady > 0 && <div className="text-[10px] text-ok">{c.parcelsReady} к выдаче</div>}
                  </Td>
                  <Td className="num text-right">
                    {c.parcelsTotal}
                    <div className="text-[10px] text-muted">{kg(c.kgTotal)}</div>
                  </Td>
                  <Td className={clsx('num text-right font-medium', c.balance < -0.5 ? 'text-danger' : c.balance > 0.5 ? 'text-ok' : 'text-muted')}>{money(c.balance)}</Td>
                  <Td className="text-[11.5px] text-muted">{c.source}</Td>
                  <Td className="text-right text-[10.5px] text-muted">{ago(c.lastParcelAt ?? c.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <NewClientModal open={create} onClose={() => setCreate(false)} />
    </div>
  );
}
