import clsx from 'clsx';
import { ArrowLeft, CreditCard, Mail, MapPin, MessageCircle, Pencil, Phone, Send } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PaymentModal } from '../components/modals';
import { Avatar, Badge, Button, Card, CopyButton, Field, Modal, ModalHeader, Skeleton, Table, Tabs, Td, Th } from '../components/ui';
import { patch, post } from '../lib/api';
import { CATEGORY, dateTime, day, kg, money, num, PARCEL_STATUS, PAYMENT_METHODS } from '../lib/format';
import { useApi, useToast } from '../lib/hooks';

export default function ClientDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: c, reload } = useApi<any>(`/clients/${id}`);
  const [tab, setTab] = useState<'parcels' | 'payments'>('parcels');
  const [pay, setPay] = useState(false);
  const [edit, setEdit] = useState(false);
  const [addrIdx, setAddrIdx] = useState(0);
  if (!c) return <Skeleton className="h-[500px]" />;
  const active = c.parcels.filter((p: any) => p.status !== 'delivered');
  const addr = c.chinaAddresses[addrIdx];
  const openChat = async () => {
    const r = c.conversationId ? { id: c.conversationId } : await post('/conversations', { kind: 'client', clientId: c.id });
    nav(`/chats/${r.id}`);
  };
  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => nav(-1)} className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-card hover:bg-soft">
            <ArrowLeft size={16} />
          </button>
          <Avatar name={c.company ?? c.name} color={c.color} size={48} />
          <div>
            <div className="label mb-1">
              Клиенты / {c.type === 'business' ? 'Бизнес' : 'Физлицо'} / с {day(c.createdAt)}
            </div>
            <div className="flex items-center gap-2">
              <h1 className="h-display text-[28px] leading-none">{c.name}</h1>
              <span className="rounded-lg bg-accent-50 px-2 py-1 text-[13px] font-semibold text-accent">{c.code}</span>
              {c.status === 'vip' && <Badge tone="lime">VIP</Badge>}
              {c.status === 'blocked' && <Badge tone="red">Заблокирован</Badge>}
            </div>
            {c.company && <div className="mt-1 text-[12.5px] text-muted">{c.company}</div>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button icon={<Pencil size={14} />} onClick={() => setEdit(true)}>
            Изменить
          </Button>
          <Button icon={<MessageCircle size={14} />} onClick={openChat}>
            Написать
          </Button>
          <Button variant="primary" icon={<CreditCard size={14} />} onClick={() => setPay(true)}>
            Принять оплату
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="px-5 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="label">Баланс</div>
                <div className={clsx('h-display num mt-1 text-[26px]', c.balance < -0.5 ? 'text-danger' : 'text-ink')}>{money(c.balance)}</div>
              </div>
              <div>
                <div className="label">Посылок</div>
                <div className="h-display num mt-1 text-[26px]">{c.parcels.length}</div>
              </div>
              <div>
                <div className="label">Оплачено всего</div>
                <div className="num mt-0.5 text-[13px] font-medium">{money(c.paid)}</div>
              </div>
              <div>
                <div className="label">Привезли</div>
                <div className="num mt-0.5 text-[13px] font-medium">{kg(c.parcels.reduce((a: number, p: any) => a + (p.weightKg || 0), 0))}</div>
              </div>
            </div>
          </Card>
          <Card className="space-y-3 px-5 py-4 text-[12.5px]">
            <div className="text-[13.5px] font-medium">Контакты</div>
            <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="flex items-center gap-2.5 hover:text-accent">
              <Phone size={14} className="text-muted" />
              <span className="num">{c.phone}</span>
            </a>
            {c.phone2 && (
              <div className="flex items-center gap-2.5">
                <Phone size={14} className="text-muted" />
                <span className="num">{c.phone2}</span>
              </div>
            )}
            {c.telegram && (
              <div className="flex items-center gap-2.5">
                <Send size={14} className="text-muted" />
                {c.telegram}
              </div>
            )}
            {c.email && (
              <div className="flex items-center gap-2.5">
                <Mail size={14} className="text-muted" />
                {c.email}
              </div>
            )}
            <div className="flex items-start gap-2.5">
              <MapPin size={14} className="mt-0.5 text-muted" />
              <span>
                {c.cityName}, {c.address ?? '—'}
              </span>
            </div>
            <div className="rounded-xl bg-soft px-3 py-2">
              <div className="label">Пункт выдачи</div>
              <div className="mt-0.5 font-medium">{c.warehouseName}</div>
              <div className="text-[11.5px] text-muted">{c.warehouseAddress}</div>
            </div>
            {c.discount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">Скидка</span>
                <b className="font-medium">{c.discount}%</b>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted">Источник</span>
              <span>{c.source ?? '—'}</span>
            </div>
          </Card>
          <Card className="px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="text-[13.5px] font-medium">Адрес склада в Китае</div>
              <CopyButton text={addr?.copyText ?? ''} />
            </div>
            <div className="mt-1 text-[11.5px] text-muted">Клиент указывает его при заказе на Taobao, 1688, Pinduoduo</div>
            <div className="mt-3 flex flex-wrap gap-1">
              {c.chinaAddresses.map((a: any, i: number) => (
                <button key={a.warehouseId} onClick={() => setAddrIdx(i)} className={clsx('h-7 rounded-full px-2.5 text-[11.5px] font-medium', i === addrIdx ? 'bg-ink text-white' : 'bg-soft text-ink-2')}>
                  {a.warehouse.replace('Склад ', '')}
                </button>
              ))}
            </div>
            {addr && (
              <div className="mt-3 space-y-2 rounded-xl bg-soft p-3 text-[12px]">
                {[
                  ['收货人 Получатель', addr.receiver],
                  ['电话 Телефон', addr.phone],
                  ['地址 Адрес', addr.addressLocal],
                  ['邮编 Индекс', addr.zip],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="label">{k}</div>
                    <div className="mt-0.5 font-medium leading-snug">{v}</div>
                  </div>
                ))}
                <div className="border-t border-line pt-2 text-[11px] text-muted">{addr.addressRu}</div>
              </div>
            )}
          </Card>
        </div>

        <Card className="self-start overflow-hidden">
          <div className="px-5 pt-3">
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                { value: 'parcels', label: 'Посылки', count: c.parcels.length },
                { value: 'payments', label: 'Платежи', count: c.payments.length },
              ]}
            />
          </div>
          {tab === 'parcels' ? (
            <>
              {active.length > 0 && (
                <div className="flex flex-wrap gap-2 px-5 pt-3">
                  {Object.entries(
                    active.reduce((a: any, p: any) => {
                      a[p.status] = (a[p.status] ?? 0) + 1;
                      return a;
                    }, {}),
                  ).map(([s, n]: any) => (
                    <Badge key={s} tone={PARCEL_STATUS[s].tone}>
                      {PARCEL_STATUS[s].label}: {n}
                    </Badge>
                  ))}
                </div>
              )}
              <Table className="mt-2">
                <thead>
                  <tr>
                    <Th>Трек-номер</Th>
                    <Th>Содержимое</Th>
                    <Th>Статус</Th>
                    <Th>Рейс / склад</Th>
                    <Th className="text-right">Вес</Th>
                    <Th className="text-right">Сумма</Th>
                    <Th className="text-right">Дата</Th>
                  </tr>
                </thead>
                <tbody>
                  {c.parcels.map((p: any) => (
                    <tr key={p.id} className="hover:bg-soft/70">
                      <Td className="font-mono text-[11.5px]">
                        <Link to={`/parcels?open=${p.id}`} className="hover:text-accent">
                          {p.trackNumber}
                        </Link>
                      </Td>
                      <Td>
                        <div className="text-ink-2">{p.description ?? '—'}</div>
                        <div className="text-[10.5px] text-muted">{CATEGORY[p.category]}</div>
                      </Td>
                      <Td>
                        <Badge tone={PARCEL_STATUS[p.status].tone}>{PARCEL_STATUS[p.status].label}</Badge>
                      </Td>
                      <Td className="text-[12px]">
                        {p.shipmentCode ? (
                          <Link to={`/shipments/${p.shipmentId}`} className="font-medium text-accent">
                            {p.shipmentCode}
                          </Link>
                        ) : (
                          <span className="text-muted">{p.warehouseName ?? '—'}</span>
                        )}
                      </Td>
                      <Td className="num text-right">{p.weightKg ? kg(p.weightKg) : '—'}</Td>
                      <Td className="num text-right">
                        {money(p.price)} {p.paid ? <span className="text-ok">✓</span> : null}
                      </Td>
                      <Td className="text-right text-[11px] text-muted">{day(p.createdAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          ) : (
            <Table className="mt-2">
              <thead>
                <tr>
                  <Th>Дата</Th>
                  <Th>Способ</Th>
                  <Th>Комментарий</Th>
                  <Th className="text-right">Сумма</Th>
                  <Th className="text-right">В USD</Th>
                </tr>
              </thead>
              <tbody>
                {c.payments.map((p: any) => (
                  <tr key={p.id}>
                    <Td className="text-[12px]">{dateTime(p.createdAt)}</Td>
                    <Td>{PAYMENT_METHODS[p.method] ?? p.method}</Td>
                    <Td className="text-muted">{p.note ?? '—'}</Td>
                    <Td className="num text-right font-medium">
                      {num(p.amount, 2)} {p.currency}
                    </Td>
                    <Td className="num text-right text-muted">{money(p.amountUsd)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
      <PaymentModal open={pay} onClose={() => setPay(false)} client={c} onDone={reload} />
      <EditClient open={edit} onClose={() => setEdit(false)} client={c} onDone={reload} />
    </div>
  );
}

function EditClient({ open, onClose, client, onDone }: { open: boolean; onClose: () => void; client: any; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<any>(client);
  const set = (k: string) => (e: any) => setF((x: any) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal open={open} onClose={onClose} width={540}>
      <ModalHeader onClose={onClose} title="Изменить клиента" sub={client.code} />
      <div className="grid grid-cols-2 gap-3 px-6 py-3">
        <Field label="Имя" className="col-span-2">
          <input className="field" value={f.name ?? ''} onChange={set('name')} />
        </Field>
        <Field label="Телефон">
          <input className="field" value={f.phone ?? ''} onChange={set('phone')} />
        </Field>
        <Field label="Доп. телефон">
          <input className="field" value={f.phone2 ?? ''} onChange={set('phone2')} />
        </Field>
        <Field label="Telegram">
          <input className="field" value={f.telegram ?? ''} onChange={set('telegram')} />
        </Field>
        <Field label="Email">
          <input className="field" value={f.email ?? ''} onChange={set('email')} />
        </Field>
        <Field label="Адрес" className="col-span-2">
          <input className="field" value={f.address ?? ''} onChange={set('address')} />
        </Field>
        <Field label="Статус">
          <select className="field" value={f.status} onChange={set('status')}>
            <option value="active">Активный</option>
            <option value="vip">VIP</option>
            <option value="blocked">Заблокирован</option>
          </select>
        </Field>
        <Field label="Скидка, %">
          <input className="field num" value={f.discount ?? 0} onChange={set('discount')} />
        </Field>
        <Field label="Заметки" className="col-span-2">
          <textarea className="field" rows={2} value={f.notes ?? ''} onChange={set('notes')} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="dark"
          onClick={async () => {
            await patch(`/clients/${client.id}`, { name: f.name, phone: f.phone, phone2: f.phone2, telegram: f.telegram, email: f.email, address: f.address, status: f.status, discount: Number(f.discount) || 0, notes: f.notes });
            toast('Сохранено');
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
