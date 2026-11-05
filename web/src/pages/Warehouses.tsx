import clsx from 'clsx';
import { Clock, MapPin, Pencil, Phone, Plus, User } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapView } from '../components/MapView';
import { Badge, Button, Card, CopyButton, Field, Modal, ModalHeader, PageHeader, Progress, Skeleton } from '../components/ui';
import { patch, post } from '../lib/api';
import { day, kg, num } from '../lib/format';
import { useApi, useToast } from '../lib/hooks';

export default function Warehouses() {
  const { data, reload } = useApi<any[]>('/warehouses');
  const { data: live } = useApi<any>('/live');
  const [edit, setEdit] = useState<any>(null);
  const cn = (data ?? []).filter((w) => w.country === 'CN');
  const tj = (data ?? []).filter((w) => w.country === 'TJ');
  const places = useMemo(() => (data ?? []).map((w) => ({ name: w.name, lat: w.lat, lng: w.lng, kind: w.country === 'CN' ? 'warehouse-cn' : 'warehouse-tj', label: w.address })) as any[], [data]);
  const ships = useMemo(() => (live?.shipments ?? []).filter((s: any) => ['in_transit', 'border', 'customs'].includes(s.status)).map((s: any) => ({ ...s, path: s.route.path })), [live]);
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Склады"
        sub="Приём в Китае · перегруз в Кашгаре · выдача в Таджикистане"
        right={
          <Button variant="dark" icon={<Plus size={15} />} onClick={() => setEdit({})}>
            Добавить склад
          </Button>
        }
      />
      <Card className="mb-5 h-[300px] overflow-hidden">{data && <MapView className="h-full w-full" places={places} shipments={ships} fitKey="wh" />}</Card>
      {!data && <Skeleton className="h-[400px]" />}
      {data && (
        <>
          <Section title="Китай" sub="Склады приёма — сюда клиенты отправляют заказы с Taobao, 1688, Pinduoduo" items={cn} onEdit={setEdit} />
          <Section title="Таджикистан" sub="Склады и пункты выдачи клиентам" items={tj} onEdit={setEdit} />
        </>
      )}
      <EditWarehouse wh={edit} onClose={() => setEdit(null)} onDone={reload} />
    </div>
  );
}

function Section({ title, sub, items, onEdit }: { title: string; sub: string; items: any[]; onEdit: (w: any) => void }) {
  return (
    <div className="mb-6">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="h-display text-[19px]">{title}</h2>
        <span className="text-[11.5px] text-muted">{sub}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {items.map((w) => {
          const st = w.stats;
          const util = w.capacityM3 ? (st.m3 ?? 0) / w.capacityM3 : 0;
          return (
            <Card key={w.id} className="flex flex-col px-5 py-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={clsx('rounded-md px-1.5 py-0.5 text-[10px] font-bold', w.country === 'CN' ? 'bg-danger-50 text-danger' : 'bg-accent-50 text-accent')}>{w.code}</span>
                    <span className="text-[13px] font-medium">{w.name}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {w.cityName}
                    {w.cityLocal && w.country === 'CN' ? ` · ${w.cityLocal}` : ''} · {w.role === 'origin' ? 'приём' : w.role === 'transit' ? 'транзит' : 'выдача'}
                  </div>
                </div>
                <button onClick={() => onEdit(w)} className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-soft">
                  <Pencil size={13} />
                </button>
              </div>
              <div className="mt-3 space-y-1.5 text-[11.5px]">
                <div className="flex gap-2">
                  <MapPin size={13} className="mt-0.5 shrink-0 text-muted" />
                  <span className="leading-snug">{w.address}</span>
                </div>
                {w.addressLocal && (
                  <div className="flex items-start gap-2 rounded-lg bg-soft px-2 py-1.5">
                    <span className="flex-1 text-[11px] leading-snug">{w.addressLocal}</span>
                    <CopyButton text={w.addressLocal} label="Копир." />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <User size={13} className="text-muted" />
                  {w.manager} · <span className="num text-muted">{w.managerPhone}</span>
                </div>
                <a href={`tel:${(w.phone ?? '').replace(/\s/g, '')}`} className="flex items-center gap-2 hover:text-accent">
                  <Phone size={13} className="text-muted" />
                  <span className="num">{w.phone}</span>
                </a>
                <div className="flex items-center gap-2 text-muted">
                  <Clock size={13} />
                  {w.workHours}
                </div>
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-[10.5px]">
                  <span className="text-muted">Заполненность</span>
                  <span className="num font-medium">
                    {num(st.m3 ?? 0, 1)} / {num(w.capacityM3)} м³
                  </span>
                </div>
                <Progress value={util} tone={util > 0.85 ? 'red' : 'dark'} className="mt-1.5" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {(w.country === 'CN'
                  ? [
                      ['На складе', st.onHand, `/parcels?status=received&warehouseId=${w.id}`],
                      ['Ждут рейса', st.awaitingShipment, `/parcels?filter=unassigned&warehouseId=${w.id}`],
                      ['Без кода', st.unidentified, `/parcels?filter=unidentified&warehouseId=${w.id}`],
                    ]
                  : [
                      ['К выдаче', st.readyForPickup, `/parcels?status=arrived&warehouseId=${w.id}`],
                      ['Едут', st.incoming, `/parcels?status=in_transit&destWarehouseId=${w.id}`],
                      ['Ожидаются', st.expected, `/parcels?status=expected`],
                    ]
                ).map(([k, v, to]) => (
                  <Link key={k as string} to={to as string} className="rounded-xl bg-soft px-2 py-2 hover:bg-[#F1F1EE]">
                    <div className={clsx('num text-[15px] font-medium', k === 'Без кода' && (v as number) > 0 && 'text-danger')}>{num(v as number)}</div>
                    <div className="text-[10px] text-muted">{k}</div>
                  </Link>
                ))}
              </div>
              {(w.outbound.length > 0 || w.inbound.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                  {w.outbound.map((s: any) => (
                    <Link key={s.id} to={`/shipments/${s.id}`}>
                      <Badge tone="blue">
                        ↗ {s.code} · {day(s.plannedDeparture)}
                      </Badge>
                    </Link>
                  ))}
                  {w.inbound.map((s: any) => (
                    <Link key={s.id} to={`/shipments/${s.id}`}>
                      <Badge tone={s.risk === 'delayed' ? 'red' : s.risk === 'risk' ? 'amber' : 'purple'}>
                        ↘ {s.code} · {day(s.etaAt)}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
              <div className="mt-auto pt-3 text-[10.5px] text-muted">{st.kg ? `${kg(st.kg)} на хранении` : ''}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function EditWarehouse({ wh, onClose, onDone }: { wh: any; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { data: cities } = useApi<any[]>(wh ? '/cities' : null);
  const [f, setF] = useState<any>({});
  const isNew = wh && !wh.id;
  const v = (k: string) => f[k] ?? wh?.[k] ?? '';
  const set = (k: string) => (e: any) => setF((x: any) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal
      open={!!wh}
      onClose={() => {
        setF({});
        onClose();
      }}
      width={600}
    >
      <ModalHeader onClose={onClose} title={isNew ? 'Новый склад' : wh?.name} sub="Адрес на китайском показывается клиентам для заказа на маркетплейсах" />
      <div className="grid grid-cols-2 gap-3 px-6 py-3">
        {isNew && (
          <>
            <Field label="Код">
              <input className="field uppercase" value={v('code')} onChange={set('code')} placeholder="SZ" />
            </Field>
            <Field label="Город">
              <select className="field" value={v('cityId')} onChange={set('cityId')}>
                <option value="">—</option>
                {cities?.filter((c) => c.kind !== 'border').map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.country} · {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        <Field label="Название" className="col-span-2">
          <input className="field" value={v('name')} onChange={set('name')} />
        </Field>
        <Field label="Адрес (рус.)" className="col-span-2">
          <input className="field" value={v('address')} onChange={set('address')} />
        </Field>
        <Field label="Адрес на китайском (для клиентов)" className="col-span-2">
          <input className="field" value={v('addressLocal')} onChange={set('addressLocal')} placeholder="广东省广州市…" />
        </Field>
        <Field label="Получатель (收货人)">
          <input className="field" value={v('receiverName')} onChange={set('receiverName')} />
        </Field>
        <Field label="Телефон получателя">
          <input className="field" value={v('receiverPhone')} onChange={set('receiverPhone')} />
        </Field>
        <Field label="Менеджер">
          <input className="field" value={v('manager')} onChange={set('manager')} />
        </Field>
        <Field label="Телефон менеджера">
          <input className="field" value={v('managerPhone')} onChange={set('managerPhone')} />
        </Field>
        <Field label="Телефон склада">
          <input className="field" value={v('phone')} onChange={set('phone')} />
        </Field>
        <Field label="Вместимость, м³">
          <input className="field num" value={v('capacityM3')} onChange={set('capacityM3')} />
        </Field>
        <Field label="Режим работы" className="col-span-2">
          <input className="field" value={v('workHours')} onChange={set('workHours')} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="dark"
          onClick={async () => {
            try {
              if (isNew) await post('/warehouses', f);
              else await patch(`/warehouses/${wh.id}`, f);
              toast('Склад сохранён');
              setF({});
              onDone();
              onClose();
            } catch (e: any) {
              toast(e.message, 'error');
            }
          }}
        >
          Сохранить
        </Button>
      </div>
    </Modal>
  );
}
