import clsx from 'clsx';
import { Check, Link2, Route, ScanLine, ShieldCheck, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, post } from '../lib/api';
import { dateTime, day, hoursLabel, money, num, PAYMENT_METHODS, PARCEL_STATUS, time } from '../lib/format';
import { useApi, useAuth, useToast } from '../lib/hooks';
import { Avatar, Badge, Button, CopyButton, Field, Modal, ModalHeader, Toggle } from './ui';

// ---------- Выбор клиента ----------
export function ClientPicker({ value, onChange, placeholder = 'Код клиента, имя или телефон' }: { value: any | null; onChange: (c: any | null) => void; placeholder?: string }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (q.length < 2) return setItems([]);
    const t = setTimeout(() => api(`/clients?q=${encodeURIComponent(q)}`).then((r) => setItems(r.items.slice(0, 7))), 160);
    return () => clearTimeout(t);
  }, [q]);
  if (value)
    return (
      <div className="flex h-9 items-center gap-2 rounded-lg border border-accent-200 bg-accent-50/60 px-2">
        <Avatar name={value.name} color={value.color} size={22} />
        <span className="text-[12.5px] font-medium">{value.name}</span>
        <span className="text-[12px] text-accent">{value.code}</span>
        <button type="button" onClick={() => onChange(null)} className="ml-auto grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-white">
          <X size={13} />
        </button>
      </div>
    );
  return (
    <div className="relative">
      <input
        className="field"
        value={q}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && items.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl bg-white p-1 shadow-pop">
          {items.map((c) => (
            <button
              type="button"
              key={c.id}
              onMouseDown={() => {
                onChange(c);
                setQ('');
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-soft"
            >
              <Avatar name={c.name} color={c.color} size={22} />
              <span className="text-[12.5px] font-medium">{c.name}</span>
              <span className="text-[11.5px] text-accent">{c.code}</span>
              <span className="ml-auto text-[11px] text-muted">{c.phone}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Приёмка посылки на складе ----------
export function ReceiveParcelModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone?: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const { data: warehouses } = useApi<any[]>(open ? '/warehouses' : null);
  const { data: tariffs } = useApi<any[]>(open ? '/tariffs' : null);
  const origin = useMemo(() => (warehouses ?? []).filter((w) => w.role !== 'destination'), [warehouses]);
  const blank = { trackNumber: '', weightKg: '', places: '1', lengthCm: '', widthCm: '', heightCm: '', description: '', shelf: '', notes: '' };
  const [f, setF] = useState(blank);
  const [client, setClient] = useState<any | null>(null);
  const [whId, setWhId] = useState<number | null>(null);
  const [tariffId, setTariffId] = useState<number | null>(null);
  const [lookup, setLookup] = useState<any | null>(null);
  const [calc, setCalc] = useState<any | null>(null);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const trackRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setF(blank);
    setClient(null);
    setLookup(null);
    setCalc(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (origin.length && !whId) setWhId(user?.warehouseId && origin.some((w) => w.id === user.warehouseId) ? user.warehouseId : origin[0].id);
  }, [origin, whId, user]);
  useEffect(() => {
    if (tariffs?.length && !tariffId) setTariffId(tariffs.find((t) => t.category === 'general')?.id ?? tariffs[0].id);
  }, [tariffs, tariffId]);
  useEffect(() => {
    if (!tariffId || !Number(f.weightKg)) return setCalc(null);
    const t = setTimeout(() => post('/calculate', { tariffId, weightKg: Number(f.weightKg), lengthCm: f.lengthCm, widthCm: f.widthCm, heightCm: f.heightCm, clientId: client?.id }).then(setCalc).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [tariffId, f.weightKg, f.lengthCm, f.widthCm, f.heightCm, client]);

  const doLookup = async () => {
    const tr = f.trackNumber.trim();
    if (tr.length < 6) return;
    const p = await api(`/parcels/lookup?track=${encodeURIComponent(tr)}`);
    setLookup(p);
    if (p?.clientId && !client) setClient({ id: p.clientId, name: p.clientName, code: p.clientCode, color: p.clientColor });
    if (p?.description && !f.description) setF((x) => ({ ...x, description: p.description }));
  };

  const submit = async (again: boolean) => {
    setBusy(true);
    try {
      const tariff = tariffs?.find((t) => t.id === tariffId);
      const r = await post('/parcels', { ...f, clientId: client?.id, warehouseId: whId, tariffId, category: tariff?.category, notify });
      toast(`Посылка ${r.trackNumber} принята`, 'ok', client ? `${client.code} · ${money(r.price)}${notify ? ' · клиент уведомлён' : ''}` : 'Без кода клиента — в разделе «Без кода»');
      onDone?.();
      if (again) {
        setF(blank);
        setClient(null);
        setLookup(null);
        setCalc(null);
        trackRef.current?.focus();
      } else onClose();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <Modal open={open} onClose={onClose} width={620}>
      <ModalHeader
        onClose={onClose}
        eyebrow={
          <Badge tone="purple" dot>
            Приёмка на складе
          </Badge>
        }
        title="Принять посылку"
        sub="Отсканируйте трек-номер. Если клиент заранее добавил его в приложении — посылка привяжется автоматически."
      />
      <div className="grid gap-4 px-6 py-3">
        <div className="grid grid-cols-[1fr_200px] gap-3">
          <Field label="Трек-номер">
            <div className="relative">
              <ScanLine size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                ref={trackRef}
                autoFocus
                className="field pl-9 font-mono uppercase"
                placeholder="YT7445012938812"
                value={f.trackNumber}
                onChange={(e) => {
                  set('trackNumber')(e);
                  setLookup(null);
                }}
                onBlur={doLookup}
                onKeyDown={(e) => e.key === 'Enter' && doLookup()}
              />
            </div>
          </Field>
          <Field label="Склад">
            <select className="field" value={whId ?? ''} onChange={(e) => setWhId(Number(e.target.value))}>
              {origin.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {lookup && (
          <div className={clsx('fade-up flex items-center gap-2 rounded-xl px-3 py-2 text-[12px]', lookup.status === 'expected' ? 'bg-ok-50 text-ok' : 'bg-warn-50 text-[#9A5D00]')}>
            {lookup.status === 'expected' ? <Check size={14} /> : <ShieldCheck size={14} />}
            {lookup.status === 'expected'
              ? `Ожидалась клиентом ${lookup.clientCode} (${lookup.clientName}) — добавлена ${dateTime(lookup.createdAt)}`
              : `Уже есть в системе: ${PARCEL_STATUS[lookup.status]?.label}${lookup.clientCode ? ` · ${lookup.clientCode}` : ''}`}
          </div>
        )}
        <Field label="Клиент" hint="Оставьте пустым, если на коробке нет кода — посылка попадёт в «Без кода»">
          <ClientPicker value={client} onChange={setClient} />
        </Field>
        <div className="grid grid-cols-4 gap-3">
          <Field label="Вес, кг">
            <input className="field num" inputMode="decimal" placeholder="0.0" value={f.weightKg} onChange={set('weightKg')} />
          </Field>
          <Field label="Длина, см">
            <input className="field num" inputMode="numeric" value={f.lengthCm} onChange={set('lengthCm')} />
          </Field>
          <Field label="Ширина, см">
            <input className="field num" inputMode="numeric" value={f.widthCm} onChange={set('widthCm')} />
          </Field>
          <Field label="Высота, см">
            <input className="field num" inputMode="numeric" value={f.heightCm} onChange={set('heightCm')} />
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_90px_110px] gap-3">
          <Field label="Тариф / категория">
            <select className="field" value={tariffId ?? ''} onChange={(e) => setTariffId(Number(e.target.value))}>
              {tariffs?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — ${t.pricePerKg}/кг
                </option>
              ))}
            </select>
          </Field>
          <Field label="Мест">
            <input className="field num" value={f.places} onChange={set('places')} />
          </Field>
          <Field label="Ячейка">
            <input className="field" placeholder="A-12-3" value={f.shelf} onChange={set('shelf')} />
          </Field>
        </div>
        <Field label="Содержимое">
          <input className="field" placeholder="Одежда, обувь…" value={f.description} onChange={set('description')} />
        </Field>
        <div className="flex items-center justify-between rounded-2xl bg-soft px-4 py-3">
          <div>
            <div className="label">Стоимость доставки</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="h-display num text-[26px]">{calc ? money(calc.total) : '—'}</span>
              {calc && <span className="num text-[12px] text-muted">≈ {num(calc.tjs)} сомони</span>}
            </div>
          </div>
          {calc && (
            <div className="text-right text-[11.5px] text-muted">
              <div>
                Расчёт <b className="text-ink">{calc.chargedBy === 'volume' ? 'по объёму' : 'по весу'}</b>
                {calc.density ? ` · плотность ${calc.density} кг/м³` : ''}
              </div>
              <div className="num">
                вес {money(calc.byWeight)} · объём {money(calc.byVolume)}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
        <label className="flex items-center gap-2 text-[12px] text-ink-2">
          <Toggle checked={notify} onChange={setNotify} /> Уведомить клиента в приложении
        </label>
        <div className="flex gap-2">
          <Button onClick={() => submit(true)} loading={busy} disabled={!f.trackNumber || !f.weightKg}>
            Принять и следующую
          </Button>
          <Button variant="primary" onClick={() => submit(false)} loading={busy} disabled={!f.trackNumber || !f.weightKg} icon={<Check size={14} />}>
            Принять
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Подтверждение смены маршрута ----------
export function RerouteModal({ open, onClose, option, shipment, onApproved }: { open: boolean; onClose: () => void; option: any; shipment: any; onApproved?: () => void }) {
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  useEffect(() => setApproved(false), [open]);
  if (!option) return null;
  const fuelUsd = Math.round(Math.max(0, option.extraKm) * 0.36);
  const approve = async () => {
    setBusy(true);
    try {
      const r = await post('/assistant/actions/reroute', { shipmentId: option.shipmentId });
      setApproved(true);
      setTimeout(() => {
        toast(r.message, 'ok', 'Записано в журнал действий');
        onApproved?.();
        onClose();
      }, 1100);
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} width={540}>
      <ModalHeader
        onClose={onClose}
        eyebrow={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-medium text-accent">
            <span className="h-2 w-2 rounded-full bg-accent" /> Ассистент маршрутов
          </span>
        }
        title="Подтвердить смену маршрута?"
        sub={`Перенаправить ${option.code} ${option.currentVia} → ${option.via}. Текущий маршрут даёт задержку ${hoursLabel(shipment?.delayHours ?? 0)} к плану.`}
      />
      <div className="px-6 py-3">
        <div className="relative grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-soft p-3.5">
            <div className="label">Сейчас · {option.currentVia.replace('через ', '')}</div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="h-display num text-[24px]">{day(option.currentEta)}</span>
              <span className="num text-[12px] text-muted">{time(option.currentEta)}</span>
            </div>
            <Badge tone="red" className="mt-2">
              Опоздание к сроку
            </Badge>
          </div>
          <div className="rounded-2xl bg-accent-50/70 p-3.5 ring-1 ring-accent-200">
            <div className="label">Предложено · {option.via.replace('через ', '')}</div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="h-display num text-[24px]">{day(option.proposedEta)}</span>
              <span className="num text-[12px] text-muted">{time(option.proposedEta)}</span>
            </div>
            <Badge tone="lime" className="mt-2">
              −{hoursLabel(option.savedHours)}
            </Badge>
          </div>
          {approved && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="stamp flex items-center gap-2 rounded-xl border-[3px] border-ok bg-white/90 px-5 py-2 text-[22px] font-bold tracking-[0.12em] text-ok">
                <Check size={22} strokeWidth={3} /> ОДОБРЕНО
              </div>
            </div>
          )}
        </div>
        <div className="mt-4 divide-y divide-line text-[12.5px]">
          {[
            ['Ожидаемый эффект', `Прибытие на ${hoursLabel(option.savedHours)} раньше`],
            ['Доп. расстояние', `${option.extraKm >= 0 ? '+' : ''}${num(option.extraKm)} км · ≈ $${fuelUsd} топливо`],
            ['Клиенты', `${shipment?.load?.clients ?? '—'} клиентов получат обновлённый срок`],
            ['Водитель', shipment?.driver ? `${shipment.driver.name} · ${shipment.driver.phone}` : '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-2.5">
              <span className="text-muted">{k}</span>
              <span className="font-medium">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-soft px-3 py-2 text-[11.5px] text-muted">
          <ShieldCheck size={14} /> Действие запишется в журнал: ваше имя, рекомендация ассистента и результат.
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-line px-6 py-4">
        <Button variant="danger" icon={<X size={14} />} onClick={onClose}>
          Отклонить
        </Button>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              onClose();
              nav(`/shipments/${option.shipmentId}`);
            }}
          >
            Подробнее
          </Button>
          <Button variant="dark" icon={<Check size={14} />} onClick={approve} loading={busy} disabled={approved}>
            Подтвердить
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Поделиться трекингом ----------
export function ShareTrackingModal({ open, onClose, shipment }: { open: boolean; onClose: () => void; shipment: any }) {
  const toast = useToast();
  const [tokenStr, setTokenStr] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [showMap, setShowMap] = useState(true);
  const [showCargo, setShowCargo] = useState(true);
  const [showDriver, setShowDriver] = useState(false);
  const [expires, setExpires] = useState('after_delivery_24h');
  const [busy, setBusy] = useState(false);
  const clients: any[] = shipment?.clients ?? [];
  useEffect(() => {
    if (!open || !shipment) return;
    setSelected(clients.slice(0, 1).map((c) => c.id));
    post(`/shipments/${shipment.id}/share`, { showMap: true, showCargo: true, showDriver: false }).then((r) => setTokenStr(r.token));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shipment?.id]);
  const url = tokenStr ? `${location.origin}/t/${tokenStr}` : '';
  const send = async () => {
    setBusy(true);
    try {
      const r = await post(`/shipments/${shipment.id}/share`, { token: tokenStr, clientIds: selected, showMap, showCargo, showDriver, expires, origin: location.origin });
      toast(`Ссылка отправлена ${r.sent} клиентам`, 'ok', `${shipment.code} · карта и ETA`);
      onClose();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const allSelected = selected.length === clients.length && clients.length > 0;
  return (
    <Modal open={open} onClose={onClose} width={560}>
      <ModalHeader onClose={onClose} title="Поделиться трекингом" sub={`Клиенты рейса ${shipment?.code} увидят карту и ETA. Ваши тарифы и данные других клиентов не показываются.`} />
      <div className="grid gap-4 px-6 py-3">
        <Field label="Ссылка для отслеживания">
          <div className="flex h-9 items-center gap-2 rounded-lg border border-line-2 bg-soft px-3">
            <Link2 size={14} className="text-muted" />
            <span className="flex-1 truncate font-mono text-[12px]">{url || 'создаём ссылку…'}</span>
            {url && <CopyButton text={url} />}
          </div>
        </Field>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11.5px] font-medium text-ink-2">Отправить в чат приложения</span>
            <button className="text-[11.5px] text-accent" onClick={() => setSelected(allSelected ? [] : clients.map((c) => c.id))}>
              {allSelected ? 'Снять все' : `Все клиенты рейса (${clients.length})`}
            </button>
          </div>
          <div className="max-h-[188px] overflow-y-auto rounded-xl border border-line scroll-thin">
            {clients.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-3 border-b border-line/70 px-3 py-2 last:border-0 hover:bg-soft">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#6A4CFF]"
                  checked={selected.includes(c.id)}
                  onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))}
                />
                <Avatar name={c.name} color={c.color} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium">{c.name}</div>
                  <div className="truncate text-[11px] text-muted">
                    {c.code} · {c.phone} · {c.parcels} пос.
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[11.5px] font-medium text-ink-2">Что увидит клиент</div>
          <div className="divide-y divide-line rounded-xl border border-line">
            {[
              ['Карта и ETA', 'Обновляется каждые 30 секунд', showMap, setShowMap],
              ['Состав груза', 'Количество мест и общий вес рейса', showCargo, setShowCargo],
              ['Имя и телефон водителя', 'По умолчанию скрыто для приватности водителя', showDriver, setShowDriver],
            ].map(([t, s, v, fn]: any) => (
              <div key={t} className="flex items-center justify-between px-3 py-2.5">
                <div>
                  <div className="text-[12.5px] font-medium">{t}</div>
                  <div className="text-[11px] text-muted">{s}</div>
                </div>
                <Toggle checked={v} onChange={fn} />
              </div>
            ))}
          </div>
        </div>
        <Field label="Срок действия ссылки">
          <select className="field" value={expires} onChange={(e) => setExpires(e.target.value)}>
            <option value="after_delivery_24h">24 часа после доставки</option>
            <option value="7d">7 дней</option>
            <option value="never">Бессрочно</option>
          </select>
        </Field>
      </div>
      <div className="flex items-center justify-between border-t border-line px-6 py-4">
        <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
          <ShieldCheck size={13} /> Ссылку можно отключить в любой момент
        </span>
        <div className="flex gap-2">
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={send} loading={busy} disabled={!selected.length || !tokenStr}>
            Отправить {selected.length} {selected.length === 1 ? 'клиенту' : 'клиентам'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Приём оплаты ----------
export function PaymentModal({ open, onClose, client: fixedClient, onDone }: { open: boolean; onClose: () => void; client?: any; onDone?: () => void }) {
  const toast = useToast();
  const [client, setClient] = useState<any | null>(fixedClient ?? null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const { data: detail } = useApi<any>(open && client ? `/clients/${client.id}` : null, [client?.id]);
  const unpaid = (detail?.parcels ?? []).filter((p: any) => !p.paid && p.price && ['arrived', 'delivered', 'in_transit', 'customs', 'received'].includes(p.status));
  useEffect(() => {
    if (open) {
      setClient(fixedClient ?? null);
      setAmount('');
      setPicked([]);
      setNote('');
    }
  }, [open, fixedClient]);
  useEffect(() => {
    if (!picked.length) return;
    const sum = unpaid.filter((p: any) => picked.includes(p.id)).reduce((a: number, p: any) => a + p.price, 0);
    setAmount(String(Math.round((currency === 'TJS' ? sum * 10.95 : sum) * 100) / 100));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, currency]);
  const submit = async () => {
    setBusy(true);
    try {
      await post('/payments', { clientId: client.id, amount: Number(amount), currency, method, note, parcelIds: picked });
      toast('Оплата принята', 'ok', `${client.name} · ${amount} ${currency}`);
      onDone?.();
      onClose();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} width={520}>
      <ModalHeader onClose={onClose} title="Принять оплату" sub="Платёж зачисляется на баланс клиента, выбранные посылки отмечаются оплаченными." />
      <div className="grid gap-4 px-6 py-3">
        <Field label="Клиент">{fixedClient ? <ClientPicker value={client} onChange={() => {}} /> : <ClientPicker value={client} onChange={setClient} />}</Field>
        {detail && (
          <div className="flex items-center justify-between rounded-xl bg-soft px-3 py-2 text-[12px]">
            <span className="text-muted">Баланс</span>
            <span className={clsx('num font-medium', detail.balance < 0 ? 'text-danger' : 'text-ok')}>{money(detail.balance)}</span>
          </div>
        )}
        {unpaid.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11.5px] font-medium text-ink-2">Неоплаченные посылки</div>
            <div className="max-h-[150px] overflow-y-auto rounded-xl border border-line scroll-thin">
              {unpaid.map((p: any) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-3 border-b border-line/70 px-3 py-1.5 last:border-0 hover:bg-soft">
                  <input type="checkbox" className="h-4 w-4 accent-[#6A4CFF]" checked={picked.includes(p.id)} onChange={(e) => setPicked((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))} />
                  <span className="font-mono text-[11.5px]">{p.trackNumber}</span>
                  <Badge tone={PARCEL_STATUS[p.status]?.tone}>{PARCEL_STATUS[p.status]?.label}</Badge>
                  <span className="num ml-auto text-[12px] font-medium">{money(p.price)}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Field label="Сумма">
            <input className="field num text-[15px]" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Валюта">
            <select className="field" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option>USD</option>
              <option value="TJS">TJS (сомони)</option>
              <option value="CNY">CNY (юань)</option>
            </select>
          </Field>
        </div>
        <Field label="Способ оплаты">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
              <button key={k} type="button" onClick={() => setMethod(k)} className={clsx('h-8 rounded-full border px-3 text-[12px]', method === k ? 'border-ink bg-ink text-white' : 'border-line-2 bg-white hover:bg-soft')}>
                {v}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Комментарий">
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: оплата при выдаче" />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="primary" onClick={submit} loading={busy} disabled={!client || !Number(amount)}>
          Принять {amount ? `${amount} ${currency}` : ''}
        </Button>
      </div>
    </Modal>
  );
}

// ---------- Новый клиент ----------
export function NewClientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const nav = useNavigate();
  const { data: warehouses } = useApi<any[]>(open ? '/warehouses' : null);
  const dest = (warehouses ?? []).filter((w) => w.role === 'destination');
  const [f, setF] = useState<any>({ type: 'individual', source: 'Instagram' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF({ type: 'individual', source: 'Instagram' });
  }, [open]);
  const set = (k: string) => (e: any) => setF((x: any) => ({ ...x, [k]: e.target.value }));
  const submit = async () => {
    setBusy(true);
    try {
      const c = await post('/clients', { ...f, warehouseId: f.warehouseId ?? dest[0]?.id });
      toast(`Клиент создан: ${c.code}`, 'ok', 'Адрес склада в Китае отправлен в чат');
      onClose();
      nav(`/clients/${c.id}`);
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} width={560}>
      <ModalHeader onClose={onClose} title="Новый клиент" sub="Код клиента создаётся автоматически по пункту выдачи (DSH, KHJ, KLB, BKT)." />
      <div className="grid grid-cols-2 gap-3 px-6 py-3">
        <Field label="Имя и фамилия" className="col-span-2">
          <input className="field" autoFocus value={f.name ?? ''} onChange={set('name')} placeholder="Рустам Назаров" />
        </Field>
        <Field label="Телефон">
          <input className="field" value={f.phone ?? ''} onChange={set('phone')} placeholder="+992 93 123 45 67" />
        </Field>
        <Field label="Telegram / WhatsApp">
          <input className="field" value={f.telegram ?? ''} onChange={set('telegram')} placeholder="@username" />
        </Field>
        <Field label="Пункт выдачи">
          <select className="field" value={f.warehouseId ?? dest[0]?.id ?? ''} onChange={(e) => setF((x: any) => ({ ...x, warehouseId: Number(e.target.value) }))}>
            {dest.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Тип">
          <select className="field" value={f.type} onChange={set('type')}>
            <option value="individual">Физлицо</option>
            <option value="business">Бизнес / оптовик</option>
          </select>
        </Field>
        {f.type === 'business' && (
          <>
            <Field label="Компания">
              <input className="field" value={f.company ?? ''} onChange={set('company')} placeholder="ООО «…»" />
            </Field>
            <Field label="Скидка, %">
              <input className="field num" value={f.discount ?? ''} onChange={set('discount')} placeholder="5" />
            </Field>
          </>
        )}
        <Field label="Адрес" className="col-span-2">
          <input className="field" value={f.address ?? ''} onChange={set('address')} placeholder="р-н Сино, ул. Айни, 45" />
        </Field>
        <Field label="Откуда узнал">
          <select className="field" value={f.source} onChange={set('source')}>
            {['Instagram', 'Telegram', 'TikTok', 'Рекомендация', 'Сайт', 'Офис'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Email">
          <input className="field" value={f.email ?? ''} onChange={set('email')} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="primary" onClick={submit} loading={busy} disabled={!f.name || !f.phone}>
          Создать клиента
        </Button>
      </div>
    </Modal>
  );
}

// ---------- Новый рейс ----------
export function NewShipmentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const nav = useNavigate();
  const { data: routes } = useApi<any[]>(open ? '/routes' : null);
  const { data: trucks } = useApi<any[]>(open ? '/trucks' : null);
  const [routeId, setRouteId] = useState<number | null>(null);
  const [truckId, setTruckId] = useState<string>('');
  const [dep, setDep] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (routes?.length && !routeId) setRouteId(routes[0].id);
  }, [routes, routeId]);
  const route = routes?.find((r) => r.id === routeId);
  const free = (trucks ?? []).filter((t) => t.status === 'available');
  const submit = async () => {
    setBusy(true);
    try {
      const s = await post('/shipments', { routeId, truckId: truckId || null, plannedDeparture: new Date(dep).toISOString(), notes, status: 'loading' });
      toast(`Рейс ${s.code} создан`, 'ok', 'Добавьте посылки со склада в рейс');
      onClose();
      nav(`/shipments/${s.id}`);
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} width={560}>
      <ModalHeader onClose={onClose} title="Новый рейс" sub="После создания добавьте в рейс посылки со склада в разделе «Посылки»." />
      <div className="grid gap-3 px-6 py-3">
        <Field label="Маршрут">
          <div className="grid gap-1.5">
            {routes?.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRouteId(r.id)}
                className={clsx('flex items-center gap-3 rounded-xl border px-3 py-2 text-left', r.id === routeId ? 'border-accent bg-accent-50/60' : 'border-line hover:bg-soft')}
              >
                <Route size={15} className={r.id === routeId ? 'text-accent' : 'text-muted'} />
                <span className="text-[12.5px] font-medium">{r.name}</span>
                <span className="text-[11.5px] text-muted">{r.via}</span>
                <span className="num ml-auto text-[11.5px] text-muted">
                  {num(r.distanceKm)} км · {r.days} дн
                </span>
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Транспорт" hint={`${free.length} свободно`}>
            <select className="field" value={truckId} onChange={(e) => setTruckId(e.target.value)}>
              <option value="">{route?.transport === 'air' ? 'Авиа — без трака' : 'Назначить позже'}</option>
              {free.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.model} · {t.plate} · {t.driverName ?? 'без водителя'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Плановая отправка">
            <input type="datetime-local" className="field" value={dep} onChange={(e) => setDep(e.target.value)} />
          </Field>
        </div>
        <Field label="Комментарий">
          <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Например: догрузка в Кашгаре" />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="primary" onClick={submit} loading={busy} disabled={!routeId}>
          Создать рейс
        </Button>
      </div>
    </Modal>
  );
}
