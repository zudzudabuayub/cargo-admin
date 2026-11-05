import clsx from 'clsx';
import { Plane, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { NewShipmentModal } from '../components/modals';
import { Avatar, Badge, Button, Card, Empty, PageHeader, Progress, Segmented, Skeleton, Table, Td, Th } from '../components/ui';
import { day, hoursLabel, kg, num, RISK, SHIPMENT_STATUS, until } from '../lib/format';
import { useApi, useLiveReload } from '../lib/hooks';

type Tab = 'active' | 'risk' | 'upcoming' | 'done' | 'all';

export default function Shipments() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'active';
  const [q, setQ] = useState('');
  const [create, setCreate] = useState(false);
  const nav = useNavigate();
  const { data, reload, loading } = useApi<any>(`/shipments?status=${tab === 'all' ? '' : tab}&q=${encodeURIComponent(q)}`, []);
  useLiveReload(['shipment'], reload);
  const c = data?.counts ?? {};
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Рейсы"
        sub="Отправки траками и авиа из Китая в Таджикистан и развоз по пунктам выдачи"
        right={
          <Button variant="dark" icon={<Plus size={15} />} onClick={() => setCreate(true)}>
            Новый рейс
          </Button>
        }
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={tab}
          onChange={(v) => setParams({ tab: v })}
          items={[
            { value: 'active', label: 'В пути', count: c.active },
            { value: 'risk', label: 'Под риском', count: c.risk },
            { value: 'upcoming', label: 'Загрузка и планы', count: c.upcoming },
            { value: 'done', label: 'Завершённые', count: c.done },
            { value: 'all', label: 'Все' },
          ]}
        />
        <div className="relative w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="field rounded-full pl-8" placeholder="Код рейса, госномер, водитель" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <Card className="overflow-hidden">
        {loading && !data ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : data?.items.length === 0 ? (
          <Empty title="Рейсов нет" sub="Создайте рейс и добавьте в него посылки со склада" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Рейс</Th>
                <Th>Статус</Th>
                <Th>Водитель · транспорт</Th>
                <Th className="w-[220px]">Прогресс</Th>
                <Th>Загрузка</Th>
                <Th>Посылки</Th>
                <Th className="text-right">Прибытие</Th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((s: any) => {
                const st = SHIPMENT_STATUS[s.status];
                const late = (Date.parse(s.etaAt) - Date.parse(s.plannedArrival)) / 3600000;
                const fill = s.truck ? s.load.kg / s.truck.capacityKg : 0;
                return (
                  <tr key={s.id} onClick={() => nav(`/shipments/${s.id}`)} className="cursor-pointer hover:bg-soft/70">
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{s.code}</span>
                        {s.transport === 'air' && <Plane size={13} className="text-accent" />}
                      </div>
                      <div className="text-[11.5px] text-muted">
                        {s.route.name} · {s.route.via}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {s.risk !== 'ok' && ['in_transit', 'border', 'customs'].includes(s.status) && (
                          <Badge tone={RISK[s.risk].tone} dot>
                            {RISK[s.risk].label}
                          </Badge>
                        )}
                      </div>
                    </Td>
                    <Td>
                      {s.driver ? (
                        <div className="flex items-center gap-2">
                          <Avatar name={s.driver.name} color={s.driver.color} size={26} />
                          <div>
                            <div className="text-[12px] font-medium">{s.driver.name}</div>
                            <div className="text-[11px] text-muted">
                              {s.truck?.model} · {s.truck?.plate}
                            </div>
                          </div>
                        </div>
                      ) : s.transport === 'air' ? (
                        <span className="text-[12px] text-muted">Авиа · Урумчи — Душанбе</span>
                      ) : (
                        <Badge tone="amber">Нет трака</Badge>
                      )}
                    </Td>
                    <Td>
                      <Progress value={s.progress} tone={s.risk === 'delayed' ? 'red' : s.status === 'completed' || s.status === 'arrived' ? 'dark' : 'purple'} />
                      <div className="mt-1 flex justify-between text-[11px] text-muted">
                        <span>{s.status === 'arrived' || s.status === 'completed' ? s.dest?.name : s.nextStop ? `след.: ${s.nextStop.kind === 'border' ? 'КПП ' : ''}${s.nextStop.name}` : s.origin?.name}</span>
                        <span className="num">{Math.round(s.progress * 100)}%</span>
                      </div>
                    </Td>
                    <Td>
                      <div className="num text-[12px] font-medium">
                        {kg(s.load.kg)}
                        {s.truck && <span className="font-normal text-muted"> / {kg(s.truck.capacityKg)}</span>}
                      </div>
                      {s.truck && <Progress value={fill} tone="dark" className="mt-1 w-24" height={3} />}
                    </Td>
                    <Td>
                      <div className="num text-[12px] font-medium">{num(s.load.n)}</div>
                      <div className="text-[11px] text-muted">{s.load.clients} клиентов</div>
                    </Td>
                    <Td className="text-right">
                      <div className={clsx('num text-[12.5px] font-medium', late > 2 && !['arrived', 'completed'].includes(s.status) && 'text-danger')}>{day(s.arrivedAt ?? s.etaAt)}</div>
                      <div className="text-[11px] text-muted">
                        {s.arrivedAt ? 'прибыл' : s.status === 'loading' || s.status === 'planned' ? `отправка ${day(s.plannedDeparture)}` : late > 2 ? `+${hoursLabel(late)} к плану` : until(s.etaAt)}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      <NewShipmentModal open={create} onClose={() => setCreate(false)} />
    </div>
  );
}
