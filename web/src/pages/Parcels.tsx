import clsx from 'clsx';
import { Check, ChevronDown, CreditCard, HandCoins, MessageSquare, PackageCheck, Plus, Search, Truck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClientPicker, ReceiveParcelModal } from '../components/modals';
import { Avatar, Badge, Button, Card, Drawer, Empty, Field, Menu, MenuItem, Modal, ModalHeader, PageHeader, Skeleton, Table, Td, Th } from '../components/ui';
import { api, patch, post } from '../lib/api';
import { ago, CATEGORY, dateTime, kg, money, num, PARCEL_STATUS, PAYMENT_METHODS } from '../lib/format';
import { useApi, useLiveReload, useToast } from '../lib/hooks';

const TABS = [
  { value: '', label: 'Все' },
  { value: 'expected', label: 'Ожидаются' },
  { value: 'received', label: 'На складе КНР' },
  { value: 'in_transit', label: 'В пути' },
  { value: 'customs', label: 'Таможня' },
  { value: 'arrived', label: 'К выдаче' },
  { value: 'delivered', label: 'Выданы' },
  { value: 'problem', label: 'Проблемы' },
];

export default function Parcels() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const status = params.get('status') ?? '';
  const filter = params.get('filter') ?? '';
  const warehouseId = params.get('warehouseId') ?? '';
  const shipmentId = params.get('shipmentId') ?? '';
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(60);
  const [sel, setSel] = useState<number[]>([]);
  const [openId, setOpenId] = useState<number | null>(params.get('open') ? Number(params.get('open')) : null);
  const [receive, setReceive] = useState(false);
  const [deliver, setDeliver] = useState(false);
  const [broadcast, setBroadcast] = useState(false);
  const qs = new URLSearchParams({ status, filter, warehouseId, shipmentId, q, limit: String(limit) }).toString();
  const { data, reload, loading } = useApi<any>(`/parcels?${qs}`);
  const { data: warehouses } = useApi<any[]>('/warehouses');
  const { data: ships } = useApi<any>('/shipments?status=upcoming');
  useLiveReload(['parcel', 'shipment'], reload, 1000);
  useEffect(() => setSel([]), [status, filter, warehouseId, shipmentId]);

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    if (k === 'status') p.delete('filter');
    if (k === 'filter') p.delete('status');
    p.delete('open');
    setParams(p);
  };
  const items: any[] = data?.items ?? [];
  const selected = items.filter((p) => sel.includes(p.id));
  const canAssign = selected.length > 0 && selected.every((p) => p.status === 'received');
  const canDeliver = selected.length > 0 && selected.every((p) => p.status === 'arrived');
  const bulk = async (body: any) => {
    try {
      const r = await post('/parcels/bulk', { ids: sel, ...body });
      toast(r.message);
      setSel([]);
      reload();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  const shipment = shipmentId ? ships?.items?.find((s: any) => String(s.id) === shipmentId) : null;

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Посылки"
        sub={shipmentId ? `Рейс #${shipmentId}` : 'Приёмка в Китае, отправка, выдача в Таджикистане'}
      />
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => {
          const active = !filter && status === t.value;
          const count = t.value ? data?.counts?.[t.value] : data?.counts?.all;
          return (
            <button
              key={t.value}
              onClick={() => setParam('status', t.value)}
              className={clsx('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-medium transition', active ? 'bg-ink text-white' : 'bg-white text-ink-2 shadow-card hover:text-ink')}
            >
              {t.label}
              {count != null && <span className={clsx('num text-[10px]', active ? 'text-white/60' : 'text-muted')}>{count}</span>}
            </button>
          );
        })}
        <button
          onClick={() => setParam('filter', filter === 'unidentified' ? '' : 'unidentified')}
          className={clsx('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-medium', filter === 'unidentified' ? 'bg-danger text-white' : 'bg-danger-50 text-danger')}
        >
          Без кода клиента <span className="num text-[10px] opacity-70">{data?.counts?.unidentified}</span>
        </button>
        {[
          ['waiting', 'Ждут > 3 дней'],
          ['unpaid', 'Не оплачены'],
          ['unassigned', 'Не в рейсе'],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setParam('filter', filter === k ? '' : k)} className={clsx('inline-flex h-8 items-center rounded-full px-3 text-[11.5px] font-medium', filter === k ? 'bg-accent text-white' : 'bg-accent-50 text-accent')}>
            {l}
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-[300px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="field rounded-full pl-8" placeholder="Трек-номер, код или телефон клиента" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="field w-[220px] rounded-full" value={warehouseId} onChange={(e) => setParam('warehouseId', e.target.value)}>
          <option value="">Все склады</option>
          {warehouses?.map((w) => (
            <option key={w.id} value={w.id}>
              {w.country === 'CN' ? '🇨🇳' : '🇹🇯'} {w.name}
            </option>
          ))}
        </select>
        {shipmentId && (
          <button onClick={() => setParam('shipmentId', '')} className="inline-flex h-8 items-center gap-1 rounded-full bg-accent-50 px-3 text-[11.5px] font-medium text-accent">
            Рейс {shipment?.code ?? `#${shipmentId}`} <X size={12} />
          </button>
        )}
        <div className="ml-auto text-[11.5px] text-muted">
          {num(data?.total)} пос. · {kg(data?.sum?.kg)} · {num(data?.sum?.m3, 1)} м³ · {money(data?.sum?.price, 0)}
        </div>
      </div>

      {sel.length > 0 && (
        <div className="fade-up sticky top-16 z-30 mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-ink px-4 py-2.5 text-white shadow-pop">
          <span className="text-[11.5px] font-medium">Выбрано: {sel.length}</span>
          <span className="text-[11px] text-white/50">
            {kg(selected.reduce((a, p) => a + (p.weightKg || 0), 0))} · {money(selected.reduce((a, p) => a + (p.price || 0), 0))}
          </span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Menu
              trigger={(t) => (
                <Button size="sm" variant="primary" icon={<Truck size={13} />} onClick={t} disabled={!canAssign}>
                  Загрузить в рейс <ChevronDown size={12} />
                </Button>
              )}
            >
              {(close) => (
                <>
                  {(ships?.items ?? []).map((s: any) => (
                    <MenuItem
                      key={s.id}
                      icon={<Truck size={14} />}
                      sub={`${s.route.name} · ${kg(s.load.kg)} / ${kg(s.truck?.capacityKg)}`}
                      onClick={() => {
                        close();
                        bulk({ action: 'assign_shipment', shipmentId: s.id });
                      }}
                    >
                      {s.code} · {s.origin?.name}
                    </MenuItem>
                  ))}
                  {!ships?.items?.length && <div className="px-3 py-2 text-[11.5px] text-muted">Нет рейсов в загрузке</div>}
                </>
              )}
            </Menu>
            <Button size="sm" className="!border-white/20 !bg-white/10 !text-white" icon={<PackageCheck size={13} />} disabled={!canDeliver} onClick={() => setDeliver(true)}>
              Выдать клиенту
            </Button>
            <Button size="sm" className="!border-white/20 !bg-white/10 !text-white" icon={<CreditCard size={13} />} onClick={() => bulk({ action: 'mark_paid' })}>
              Оплачено
            </Button>
            <Button size="sm" className="!border-white/20 !bg-white/10 !text-white" icon={<MessageSquare size={13} />} onClick={() => setBroadcast(true)}>
              Написать клиентам
            </Button>
            <button onClick={() => setSel([])} className="grid h-7 w-7 place-items-center rounded-full text-white/60 hover:bg-white/10">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        {loading && !data ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Empty icon={<PackageCheck size={20} />} title="Посылок нет" sub="Измените фильтр или примите новую посылку" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-8">
                  <input type="checkbox" className="h-4 w-4 accent-[#6A4CFF]" checked={sel.length === items.length} onChange={(e) => setSel(e.target.checked ? items.map((p) => p.id) : [])} />
                </Th>
                <Th>Трек-номер</Th>
                <Th>Клиент</Th>
                <Th>Содержимое</Th>
                <Th>Статус</Th>
                <Th>Где</Th>
                <Th className="text-right">Вес · объём</Th>
                <Th className="text-right">Сумма</Th>
                <Th className="text-right">Обновлено</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className={clsx('cursor-pointer hover:bg-soft/70', sel.includes(p.id) && 'bg-accent-50/50')} onClick={() => setOpenId(p.id)}>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="h-4 w-4 accent-[#6A4CFF]" checked={sel.includes(p.id)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))} />
                  </Td>
                  <Td>
                    <div className="font-mono text-[11px]">{p.trackNumber}</div>
                    <div className="text-[10px] text-muted">{p.carrier ?? '—'}</div>
                  </Td>
                  <Td>
                    {p.clientId ? (
                      <div className="flex items-center gap-2">
                        <Avatar name={p.clientName} color={p.clientColor} size={22} />
                        <div>
                          <div className="text-[11.5px] font-medium">{p.clientName}</div>
                          <div className="text-[10px] text-accent">{p.clientCode}</div>
                        </div>
                      </div>
                    ) : (
                      <Badge tone="red">Без кода</Badge>
                    )}
                  </Td>
                  <Td>
                    <div className="max-w-[180px] truncate text-ink-2">{p.description ?? '—'}</div>
                    <div className="text-[10px] text-muted">
                      {CATEGORY[p.category] ?? p.category}
                      {p.places > 1 ? ` · ${p.places} мест` : ''}
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={PARCEL_STATUS[p.status]?.tone}>{PARCEL_STATUS[p.status]?.label}</Badge>
                  </Td>
                  <Td className="text-[11.5px]">
                    {p.shipmentCode ? (
                      <Link to={`/shipments/${p.shipmentId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-accent">
                        {p.shipmentCode}
                      </Link>
                    ) : (
                      <span className="text-ink-2">{p.warehouseName ?? '—'}</span>
                    )}
                    {p.shelf && <div className="text-[10px] text-muted">ячейка {p.shelf}</div>}
                    {p.shipmentCode && p.status === 'received' && <div className="text-[10px] text-muted">в листе загрузки</div>}
                  </Td>
                  <Td className="num text-right">
                    <div>{p.weightKg ? kg(p.weightKg) : '—'}</div>
                    <div className="text-[10px] text-muted">{p.volumeM3 ? `${num(p.volumeM3, 2)} м³` : ''}</div>
                  </Td>
                  <Td className="num text-right">
                    <div className="font-medium">{money(p.price)}</div>
                    <div className={clsx('text-[10px]', p.paid ? 'text-ok' : 'text-muted')}>{p.price ? (p.paid ? 'оплачено' : 'не оплачено') : ''}</div>
                  </Td>
                  <Td className="text-right text-[10.5px] text-muted">{ago(p.deliveredAt ?? p.arrivedAt ?? p.shippedAt ?? p.receivedAt ?? p.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {data && data.total > items.length && (
          <div className="border-t border-line p-3 text-center">
            <Button size="sm" onClick={() => setLimit((l) => l + 100)}>
              Показать ещё ({data.total - items.length})
            </Button>
          </div>
        )}
      </Card>

      <ParcelDrawer id={openId} onClose={() => setOpenId(null)} onChanged={reload} />
      <ReceiveParcelModal open={receive} onClose={() => setReceive(false)} onDone={reload} />
      <DeliverModal open={deliver} onClose={() => setDeliver(false)} parcels={selected} onDone={() => (setSel([]), reload())} />
      <BroadcastModal open={broadcast} onClose={() => setBroadcast(false)} count={new Set(selected.map((p) => p.clientId).filter(Boolean)).size} onSend={(text) => bulk({ action: 'notify', text })} />
    </div>
  );
}

function ParcelDrawer({ id, onClose, onChanged }: { id: number | null; onClose: () => void; onChanged: () => void }) {
  const { data: p, reload } = useApi<any>(id ? `/parcels/${id}` : null, [id]);
  const toast = useToast();
  const [client, setClient] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  useEffect(() => {
    setClient(null);
    setEdit(null);
  }, [id]);
  if (!id) return null;
  const save = async (body: any, msg: string) => {
    try {
      await patch(`/parcels/${id}`, body);
      toast(msg);
      reload();
      onChanged();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  return (
    <Drawer open={!!id} onClose={onClose} width={480}>
      {!p ? (
        <div className="p-6">
          <Skeleton className="h-40" />
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between border-b border-line px-5 py-4">
            <div>
              <div className="label">Посылка · {p.carrier}</div>
              <div className="mt-1 font-mono text-[15px]">{p.trackNumber}</div>
              <div className="mt-1.5 flex gap-1.5">
                <Badge tone={PARCEL_STATUS[p.status].tone}>{PARCEL_STATUS[p.status].label}</Badge>
                {p.price != null && <Badge tone={p.paid ? 'green' : 'gray'}>{p.paid ? 'Оплачено' : 'Не оплачено'}</Badge>}
              </div>
            </div>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-soft">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 scroll-thin">
            {!p.clientId ? (
              <div className="rounded-2xl bg-danger-50 p-3">
                <div className="text-[11.5px] font-medium text-danger">Посылка без кода клиента</div>
                <div className="mb-2 text-[11px] text-ink-2">{p.notes ?? 'Найдите владельца по трек-номеру или фото и привяжите посылку.'}</div>
                <ClientPicker value={client} onChange={setClient} />
                <Button size="sm" variant="dark" className="mt-2" disabled={!client} onClick={() => save({ clientId: client.id }, `Привязано к ${client.code}`)}>
                  Привязать к клиенту
                </Button>
              </div>
            ) : (
              <Link to={`/clients/${p.clientId}`} className="flex items-center gap-3 rounded-2xl bg-soft p-3 hover:bg-[#F1F1EE]">
                <Avatar name={p.clientName} color={p.clientColor} size={36} />
                <div>
                  <div className="text-[12px] font-medium">{p.clientName}</div>
                  <div className="text-[11px] text-muted">
                    {p.clientCode} · {p.clientPhone}
                  </div>
                </div>
                <span className="ml-auto text-[11px] text-accent">Карточка →</span>
              </Link>
            )}
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Вес', p.weightKg ? kg(p.weightKg) : '—'],
                ['Объём', p.volumeM3 ? `${num(p.volumeM3, 3)} м³` : '—'],
                ['Мест', p.places],
                ['Тариф', p.tariff?.name ?? '—'],
                ['Стоимость', money(p.price)],
                ['Ячейка', p.shelf ?? '—'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-soft px-3 py-2">
                  <div className="label">{k}</div>
                  <div className="num mt-0.5 truncate text-[12px] font-medium">{v}</div>
                </div>
              ))}
            </div>
            {edit ? (
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-line p-3">
                <Field label="Вес, кг">
                  <input className="field num" value={edit.weightKg ?? ''} onChange={(e) => setEdit({ ...edit, weightKg: e.target.value })} />
                </Field>
                <Field label="Ячейка">
                  <input className="field" value={edit.shelf ?? ''} onChange={(e) => setEdit({ ...edit, shelf: e.target.value })} />
                </Field>
                <Field label="Содержимое" className="col-span-2">
                  <input className="field" value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
                </Field>
                <Field label="Статус" className="col-span-2">
                  <select className="field" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                    {Object.entries(PARCEL_STATUS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="col-span-2 flex justify-end gap-2">
                  <Button size="sm" onClick={() => setEdit(null)}>
                    Отмена
                  </Button>
                  <Button
                    size="sm"
                    variant="dark"
                    onClick={async () => {
                      await save({ weightKg: Number(edit.weightKg) || undefined, shelf: edit.shelf, description: edit.description, status: edit.status !== p.status ? edit.status : undefined }, 'Сохранено');
                      setEdit(null);
                    }}
                  >
                    Сохранить
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setEdit({ weightKg: p.weightKg, shelf: p.shelf, description: p.description, status: p.status })}>
                  Редактировать
                </Button>
                {p.status === 'arrived' && (
                  <Button size="sm" variant="dark" icon={<PackageCheck size={13} />} onClick={() => post('/parcels/bulk', { ids: [p.id], action: 'deliver' }).then(() => (toast('Выдано клиенту'), reload(), onChanged()))}>
                    Выдать
                  </Button>
                )}
                {!p.paid && p.price && (
                  <Button size="sm" icon={<Check size={13} />} onClick={() => post('/parcels/bulk', { ids: [p.id], action: 'mark_paid' }).then(() => (toast('Отмечено оплаченным'), reload(), onChanged()))}>
                    Оплачено
                  </Button>
                )}
              </div>
            )}
            {p.shipmentCode && (
              <Link to={`/shipments/${p.shipmentId}`} className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 hover:bg-soft">
                <span className="flex items-center gap-2 text-[11.5px]">
                  <Truck size={14} className="text-muted" /> Рейс <b className="font-medium">{p.shipmentCode}</b>
                </span>
                <span className="text-[11px] text-accent">Открыть →</span>
              </Link>
            )}
            <div>
              <div className="label mb-2">История</div>
              <div className="relative">
                <div className="absolute bottom-2 left-[5px] top-2 w-px bg-line" />
                {p.events.map((e: any) => (
                  <div key={e.id} className="relative flex gap-3 pb-3">
                    <span className={clsx('relative z-[1] mt-1 h-[11px] w-[11px] shrink-0 rounded-full ring-4 ring-white', e.status === 'problem' ? 'bg-danger' : e.status === 'delivered' ? 'bg-ink' : 'bg-accent')} />
                    <div>
                      <div className="text-[11.5px] font-medium">{e.note}</div>
                      <div className="text-[10.5px] text-muted">
                        {dateTime(e.at)}
                        {e.warehouseName ? ` · ${e.warehouseName}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </Drawer>
  );
}

function DeliverModal({ open, onClose, parcels, onDone }: { open: boolean; onClose: () => void; parcels: any[]; onDone: () => void }) {
  const toast = useToast();
  const [withPayment, setWithPayment] = useState(true);
  const [method, setMethod] = useState('cash');
  const unpaid = parcels.filter((p) => !p.paid);
  const sum = unpaid.reduce((a, p) => a + (p.price || 0), 0);
  const clients = useMemo(() => [...new Set(parcels.map((p) => p.clientName))], [parcels]);
  return (
    <Modal open={open} onClose={onClose} width={460}>
      <ModalHeader onClose={onClose} title={`Выдать ${parcels.length} пос.`} sub={clients.join(', ')} />
      <div className="space-y-3 px-6 py-3">
        <div className="flex items-center justify-between rounded-2xl bg-soft px-4 py-3">
          <div>
            <div className="label">К оплате</div>
            <div className="h-display num mt-1 text-[22px]">{money(sum)}</div>
          </div>
          <div className="text-right text-[11px] text-muted">
            {unpaid.length} из {parcels.length} не оплачены
            <br />≈ {num(sum * 10.95)} сомони
          </div>
        </div>
        {sum > 0 && (
          <>
            <label className="flex items-center gap-2 text-[11.5px]">
              <input type="checkbox" className="h-4 w-4 accent-[#6A4CFF]" checked={withPayment} onChange={(e) => setWithPayment(e.target.checked)} /> Принять оплату при выдаче
            </label>
            {withPayment && (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                  <button key={k} onClick={() => setMethod(k)} className={clsx('h-8 rounded-full border px-3 text-[11.5px]', method === k ? 'border-ink bg-ink text-white' : 'border-line-2 hover:bg-soft')}>
                    {v}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="dark"
          icon={<HandCoins size={14} />}
          onClick={async () => {
            const r = await post('/parcels/bulk', { ids: parcels.map((p) => p.id), action: 'deliver', withPayment: withPayment && sum > 0, method });
            toast(r.message, 'ok', 'Клиенты получили подтверждение в приложении');
            onDone();
            onClose();
          }}
        >
          Выдать {withPayment && sum > 0 ? `и принять ${money(sum)}` : ''}
        </Button>
      </div>
    </Modal>
  );
}

function BroadcastModal({ open, onClose, count, onSend }: { open: boolean; onClose: () => void; count: number; onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <Modal open={open} onClose={onClose} width={480}>
      <ModalHeader onClose={onClose} title="Сообщение клиентам" sub={`Получат ${count} клиентов в чате приложения`} />
      <div className="px-6 py-3">
        <textarea className="field" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ваши посылки готовы к выдаче…" />
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="primary"
          disabled={!text}
          onClick={() => {
            onSend(text);
            setText('');
            onClose();
          }}
        >
          Отправить
        </Button>
      </div>
    </Modal>
  );
}

export { api };
