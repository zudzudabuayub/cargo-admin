import clsx from 'clsx';
import { MessageCircle, Phone, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TruckArt } from '../components/TruckArt';
import { Avatar, Badge, Button, Card, Field, Modal, ModalHeader, PageHeader, Progress, Segmented, Skeleton, Table, Td, Th } from '../components/ui';
import { patch, post } from '../lib/api';
import { ago, kg, num } from '../lib/format';
import { useApi, useToast } from '../lib/hooks';

const TRUCK_STATUS: Record<string, { label: string; tone: any }> = {
  on_trip: { label: 'В рейсе', tone: 'purple' },
  available: { label: 'Свободен', tone: 'green' },
  maintenance: { label: 'Ремонт', tone: 'amber' },
};

export default function Fleet() {
  const [tab, setTab] = useState<'trucks' | 'drivers'>('trucks');
  const { data: trucks, reload: rt } = useApi<any[]>('/trucks');
  const { data: drivers, reload: rd } = useApi<any[]>('/drivers');
  const [add, setAdd] = useState<null | 'truck' | 'driver'>(null);
  const toast = useToast();
  const nav = useNavigate();
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Транспорт и водители"
        sub={trucks ? `${trucks.length} машин · ${trucks.filter((t) => t.status === 'on_trip').length} в рейсе · ${trucks.filter((t) => t.status === 'available').length} свободны` : ' '}
        right={
          <Button variant="dark" icon={<Plus size={15} />} onClick={() => setAdd(tab === 'trucks' ? 'truck' : 'driver')}>
            {tab === 'trucks' ? 'Добавить трак' : 'Добавить водителя'}
          </Button>
        }
      />
      <Segmented
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'trucks', label: 'Транспорт', count: trucks?.length },
          { value: 'drivers', label: 'Водители', count: drivers?.length },
        ]}
      />
      {tab === 'trucks' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {!trucks && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[300px]" />)}
          {trucks?.map((t) => (
            <Card key={t.id} className="flex flex-col px-4 pb-4 pt-3">
              <div className="flex items-center justify-between">
                <Badge tone={TRUCK_STATUS[t.status]?.tone} dot>
                  {TRUCK_STATUS[t.status]?.label}
                </Badge>
                <span className="text-[11px] text-muted">{t.lastSeenAt ? `GPS ${ago(t.lastSeenAt)}` : ''}</span>
              </div>
              <div className="my-1 rounded-xl bg-soft px-2 py-1">
                <TruckArt className="w-full" kind={t.kind} />
              </div>
              <div className="text-[14px] font-medium">{t.model}</div>
              <div className="text-[11.5px] text-muted">
                {t.plate}
                {t.trailerPlate ? ` · прицеп ${t.trailerPlate}` : ''} · {t.year}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <div className="label">Тип</div>
                  <div className="mt-0.5 font-medium">{t.kind}</div>
                </div>
                <div>
                  <div className="label">Груз</div>
                  <div className="num mt-0.5 font-medium">{kg(t.capacityKg)}</div>
                </div>
                <div>
                  <div className="label">Объём</div>
                  <div className="num mt-0.5 font-medium">{t.capacityM3} м³</div>
                </div>
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted">Топливо</span>
                  <span className="num">{t.fuel}%</span>
                </div>
                <Progress value={(t.fuel ?? 0) / 100} tone={t.fuel < 25 ? 'red' : 'green'} className="mt-1" height={3} />
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                {t.driverName ? (
                  <>
                    <Avatar name={t.driverName} color={t.driverColor} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium">{t.driverName}</div>
                      <div className="num text-[10.5px] text-muted">{t.driverPhone}</div>
                    </div>
                  </>
                ) : (
                  <span className="flex-1 text-[12px] text-muted">Водитель не назначен</span>
                )}
                {t.shipmentCode && (
                  <Link to={`/shipments/${t.shipmentId}`}>
                    <Badge tone="purple">{t.shipmentCode}</Badge>
                  </Link>
                )}
              </div>
              <div className="mt-2 flex gap-1.5">
                <select
                  className="field h-8 flex-1 text-[12px]"
                  value={t.status}
                  disabled={t.status === 'on_trip'}
                  onChange={async (e) => {
                    await patch(`/trucks/${t.id}`, { status: e.target.value });
                    toast('Статус обновлён');
                    rt();
                  }}
                >
                  <option value="available">Свободен</option>
                  <option value="maintenance">На ремонте</option>
                  {t.status === 'on_trip' && <option value="on_trip">В рейсе</option>}
                </select>
                <span className="num self-center text-[11px] text-muted">{num(t.odometer)} км</span>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Водитель</Th>
                <Th>Телефон</Th>
                <Th>Статус</Th>
                <Th>Транспорт</Th>
                <Th>Текущий рейс</Th>
                <Th className="text-right">Стаж</Th>
                <Th className="text-right">Рейсов</Th>
                <Th className="text-right">Рейтинг</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {drivers?.map((d) => (
                <tr key={d.id} className="hover:bg-soft/70">
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={d.name} color={d.color} size={30} />
                      <div>
                        <div className="font-medium">{d.name}</div>
                        <div className="text-[11px] text-muted">
                          {d.citizenship} · {d.license}
                        </div>
                      </div>
                    </div>
                  </Td>
                  <Td className="num">{d.phone}</Td>
                  <Td>
                    <Badge tone={d.status === 'on_trip' ? 'purple' : d.status === 'off' ? 'gray' : 'green'}>{d.status === 'on_trip' ? 'В рейсе' : d.status === 'off' ? 'Выходной' : 'Свободен'}</Badge>
                  </Td>
                  <Td className="text-[12px]">{d.plate ? `${d.model} · ${d.plate}` : <span className="text-muted">—</span>}</Td>
                  <Td>
                    {d.shipmentCode ? (
                      <Link to={`/shipments/${d.shipmentId}`} className="font-medium text-accent">
                        {d.shipmentCode}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td className="num text-right">{d.experienceYears} лет</Td>
                  <Td className="num text-right">{d.trips}</Td>
                  <Td className="num text-right">★ {d.rating}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={async () => {
                          const r = await post('/conversations', { kind: 'driver', driverId: d.id });
                          nav(`/chats/${r.id}`);
                        }}
                        className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-accent-50 hover:text-accent"
                      >
                        <MessageCircle size={14} />
                      </button>
                      <a href={`tel:${d.phone.replace(/\s/g, '')}`} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-accent-50 hover:text-accent">
                        <Phone size={14} />
                      </a>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <AddModal kind={add} onClose={() => setAdd(null)} drivers={drivers ?? []} onDone={() => (rt(), rd())} />
    </div>
  );
}

function AddModal({ kind, onClose, drivers, onDone }: { kind: null | 'truck' | 'driver'; onClose: () => void; drivers: any[]; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<any>({ kind: 'Тент', capacityKg: 20000, capacityM3: 86 });
  const set = (k: string) => (e: any) => setF((x: any) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal open={!!kind} onClose={onClose} width={520}>
      <ModalHeader onClose={onClose} title={kind === 'truck' ? 'Новый трак' : 'Новый водитель'} />
      <div className="grid grid-cols-2 gap-3 px-6 py-3">
        {kind === 'truck' ? (
          <>
            <Field label="Модель" className="col-span-2">
              <input className="field" value={f.model ?? ''} onChange={set('model')} placeholder="Shacman X3000" />
            </Field>
            <Field label="Госномер">
              <input className="field" value={f.plate ?? ''} onChange={set('plate')} placeholder="1234 AB 01" />
            </Field>
            <Field label="Номер прицепа">
              <input className="field" value={f.trailerPlate ?? ''} onChange={set('trailerPlate')} />
            </Field>
            <Field label="Тип">
              <select className="field" value={f.kind} onChange={set('kind')}>
                {['Тент', 'Рефрижератор', 'Контейнер 40ft', 'Фургон'].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </Field>
            <Field label="Год">
              <input className="field num" value={f.year ?? ''} onChange={set('year')} />
            </Field>
            <Field label="Грузоподъёмность, кг">
              <input className="field num" value={f.capacityKg} onChange={set('capacityKg')} />
            </Field>
            <Field label="Объём, м³">
              <input className="field num" value={f.capacityM3} onChange={set('capacityM3')} />
            </Field>
            <Field label="Водитель" className="col-span-2">
              <select className="field" value={f.driverId ?? ''} onChange={set('driverId')}>
                <option value="">—</option>
                {drivers.filter((d) => !d.truckId).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Имя и фамилия" className="col-span-2">
              <input className="field" value={f.name ?? ''} onChange={set('name')} />
            </Field>
            <Field label="Телефон">
              <input className="field" value={f.phone ?? ''} onChange={set('phone')} placeholder="+992 …" />
            </Field>
            <Field label="Права">
              <input className="field" value={f.license ?? ''} onChange={set('license')} />
            </Field>
            <Field label="Гражданство">
              <input className="field" value={f.citizenship ?? 'Таджикистан'} onChange={set('citizenship')} />
            </Field>
            <Field label="Стаж, лет">
              <input className="field num" value={f.experienceYears ?? ''} onChange={set('experienceYears')} />
            </Field>
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="dark"
          onClick={async () => {
            try {
              await post(kind === 'truck' ? '/trucks' : '/drivers', f);
              toast(kind === 'truck' ? 'Трак добавлен' : 'Водитель добавлен');
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

export { clsx };
