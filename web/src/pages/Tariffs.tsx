import clsx from 'clsx';
import { Plane, Plus, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, Field, Modal, ModalHeader, PageHeader, Table, Td, Th } from '../components/ui';
import { patch, post } from '../lib/api';
import { money, num } from '../lib/format';
import { useApi, useToast } from '../lib/hooks';

export default function Tariffs() {
  const { data: tariffs, reload } = useApi<any[]>('/tariffs');
  const toast = useToast();
  const [editing, setEditing] = useState<Record<number, any>>({});
  const [add, setAdd] = useState(false);
  const save = async (t: any) => {
    const e = editing[t.id];
    await patch(`/tariffs/${t.id}`, { pricePerKg: Number(e.pricePerKg), pricePerM3: Number(e.pricePerM3), minCharge: Number(e.minCharge), daysMin: Number(e.daysMin), daysMax: Number(e.daysMax) });
    toast(`Тариф «${t.name}» обновлён`, 'ok', 'Новые цены применяются к новым посылкам');
    setEditing((x) => {
      const { [t.id]: _, ...rest } = x;
      return rest;
    });
    reload();
  };
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Тарифы и калькулятор"
        sub="Стоимость считается по большему из веса и объёма, минус скидка клиента"
        right={
          <Button variant="dark" icon={<Plus size={15} />} onClick={() => setAdd(true)}>
            Новый тариф
          </Button>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="self-start overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Тариф</Th>
                <Th>Транспорт</Th>
                <Th className="text-right">$ за кг</Th>
                <Th className="text-right">$ за м³</Th>
                <Th className="text-right">Минимум</Th>
                <Th className="text-right">Срок, дней</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {tariffs?.map((t) => {
                const e = editing[t.id];
                const inp = (k: string, w = 'w-20') => <input className={clsx('field num h-8 text-right', w)} value={e[k]} onChange={(ev) => setEditing((x) => ({ ...x, [t.id]: { ...x[t.id], [k]: ev.target.value } }))} />;
                return (
                  <tr key={t.id} className="hover:bg-soft/70">
                    <Td>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-[10.5px] text-muted">{t.description}</div>
                    </Td>
                    <Td>
                      <Badge tone={t.transport === 'air' ? 'purple' : 'gray'}>
                        {t.transport === 'air' ? <Plane size={11} /> : <Truck size={11} />} {t.transport === 'air' ? 'Авиа' : 'Авто'}
                      </Badge>
                    </Td>
                    <Td className="num text-right font-medium">{e ? inp('pricePerKg') : money(t.pricePerKg)}</Td>
                    <Td className="num text-right">{e ? inp('pricePerM3') : money(t.pricePerM3, 0)}</Td>
                    <Td className="num text-right">{e ? inp('minCharge', 'w-16') : money(t.minCharge, 0)}</Td>
                    <Td className="num text-right">
                      {e ? (
                        <span className="inline-flex gap-1">
                          {inp('daysMin', 'w-14')}
                          {inp('daysMax', 'w-14')}
                        </span>
                      ) : (
                        `${t.daysMin}–${t.daysMax}`
                      )}
                    </Td>
                    <Td className="text-right">
                      {e ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" onClick={() => setEditing(({ [t.id]: _, ...rest }) => rest)}>
                            Отмена
                          </Button>
                          <Button size="sm" variant="dark" onClick={() => save(t)}>
                            Сохранить
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setEditing((x) => ({ ...x, [t.id]: { ...t } }))}>
                          Изменить
                        </Button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <div className="border-t border-line bg-soft px-5 py-3 text-[11px] leading-relaxed text-muted">
            Пример: 10 кг одежды в коробке 60×40×40 см (0,096 м³). По весу 10 × $2,8 = $28, по объёму 0,096 × $290 = $27,84 → берём <b className="text-ink">$28</b>. Плотность ниже ~100 кг/м³ — считается по объёму.
          </div>
        </Card>
        <Calculator tariffs={tariffs ?? []} />
      </div>
      <AddTariff open={add} onClose={() => setAdd(false)} onDone={reload} />
    </div>
  );
}

function Calculator({ tariffs }: { tariffs: any[] }) {
  const [tariffId, setTariffId] = useState<number | null>(null);
  const [f, setF] = useState({ weightKg: '10', lengthCm: '60', widthCm: '40', heightCm: '40' });
  const [res, setRes] = useState<any>(null);
  useEffect(() => {
    if (tariffs.length && !tariffId) setTariffId(tariffs.find((t) => t.category === 'general')?.id ?? tariffs[0].id);
  }, [tariffs, tariffId]);
  useEffect(() => {
    if (!tariffId) return;
    const t = setTimeout(() => post('/calculate', { tariffId, ...f, weightKg: Number(f.weightKg) }).then(setRes).catch(() => {}), 150);
    return () => clearTimeout(t);
  }, [tariffId, f]);
  const set = (k: keyof typeof f) => (e: any) => setF((x) => ({ ...x, [k]: e.target.value }));
  const t = tariffs.find((x) => x.id === tariffId);
  return (
    <Card className="self-start px-5 py-4">
      <div className="text-[12.5px] font-medium">Калькулятор доставки</div>
      <div className="text-[11px] text-muted">Для ответа клиенту в чате или по телефону</div>
      <div className="mt-4 grid gap-3">
        <Field label="Тариф">
          <select className="field" value={tariffId ?? ''} onChange={(e) => setTariffId(Number(e.target.value))}>
            {tariffs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Вес, кг">
          <input className="field num text-[14px]" value={f.weightKg} onChange={set('weightKg')} />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Д, см">
            <input className="field num" value={f.lengthCm} onChange={set('lengthCm')} />
          </Field>
          <Field label="Ш, см">
            <input className="field num" value={f.widthCm} onChange={set('widthCm')} />
          </Field>
          <Field label="В, см">
            <input className="field num" value={f.heightCm} onChange={set('heightCm')} />
          </Field>
        </div>
      </div>
      {res && (
        <div className="mt-4 rounded-2xl bg-[#F3F0FF] p-4 ring-1 ring-accent-100">
          <div className="label">Стоимость доставки</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="h-display num text-[30px]">{money(res.total)}</span>
            <span className="num text-[12px] text-muted">≈ {num(res.tjs)} сомони</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11.5px]">
            <div className={clsx('rounded-xl px-3 py-2', res.chargedBy === 'weight' ? 'bg-white font-medium' : 'bg-white/50 text-muted')}>
              По весу
              <div className="num">{money(res.byWeight)}</div>
            </div>
            <div className={clsx('rounded-xl px-3 py-2', res.chargedBy === 'volume' ? 'bg-white font-medium' : 'bg-white/50 text-muted')}>
              По объёму · {num(res.volumeM3, 3)} м³
              <div className="num">{money(res.byVolume)}</div>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-muted">
            Плотность {res.density ?? '—'} кг/м³ · срок {t?.daysMin}–{t?.daysMax} дней
          </div>
        </div>
      )}
    </Card>
  );
}

function AddTariff({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<any>({ transport: 'auto', daysMin: 14, daysMax: 20 });
  const set = (k: string) => (e: any) => setF((x: any) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal open={open} onClose={onClose} width={480}>
      <ModalHeader onClose={onClose} title="Новый тариф" />
      <div className="grid grid-cols-2 gap-3 px-6 py-3">
        <Field label="Название" className="col-span-2">
          <input className="field" value={f.name ?? ''} onChange={set('name')} placeholder="Например: Шины и диски" />
        </Field>
        <Field label="Транспорт">
          <select className="field" value={f.transport} onChange={set('transport')}>
            <option value="auto">Авто</option>
            <option value="air">Авиа</option>
            <option value="rail">Ж/Д</option>
          </select>
        </Field>
        <Field label="$ за кг">
          <input className="field num" value={f.pricePerKg ?? ''} onChange={set('pricePerKg')} />
        </Field>
        <Field label="$ за м³">
          <input className="field num" value={f.pricePerM3 ?? ''} onChange={set('pricePerM3')} />
        </Field>
        <Field label="Минимум, $">
          <input className="field num" value={f.minCharge ?? ''} onChange={set('minCharge')} />
        </Field>
        <Field label="Срок от, дней">
          <input className="field num" value={f.daysMin} onChange={set('daysMin')} />
        </Field>
        <Field label="Срок до, дней">
          <input className="field num" value={f.daysMax} onChange={set('daysMax')} />
        </Field>
        <Field label="Описание" className="col-span-2">
          <input className="field" value={f.description ?? ''} onChange={set('description')} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="dark"
          onClick={async () => {
            try {
              await post('/tariffs', f);
              toast('Тариф добавлен');
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
