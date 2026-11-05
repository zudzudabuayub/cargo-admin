import { Plus, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar, Badge, Button, Card, Field, Modal, ModalHeader, PageHeader, Table, Td, Th } from '../components/ui';
import { post, put } from '../lib/api';
import { dateTime } from '../lib/format';
import { useApi, useAuth, useToast } from '../lib/hooks';

const ROLES: Record<string, string> = { admin: 'Администратор', manager: 'Менеджер', warehouse: 'Склад', accountant: 'Бухгалтер' };

const API_DOC: [string, string, string][] = [
  ['POST', '/api/client/auth/request-code', 'SMS-код на номер телефона'],
  ['POST', '/api/client/auth/verify', 'Вход / регистрация → токен'],
  ['GET', '/api/client/me', 'Профиль, код клиента, баланс, адреса складов в Китае'],
  ['GET', '/api/client/parcels', 'Мои посылки и статусы'],
  ['POST', '/api/client/parcels', 'Добавить трек-номер заказа (Taobao, 1688…)'],
  ['GET', '/api/client/parcels/:id', 'История посылки и положение рейса'],
  ['GET', '/api/client/tariffs', 'Тарифы'],
  ['POST', '/api/client/calculate', 'Калькулятор стоимости'],
  ['GET', '/api/client/warehouses', 'Склады и пункты выдачи'],
  ['GET', '/api/client/chat', 'Чат с поддержкой'],
  ['POST', '/api/client/chat/messages', 'Отправить сообщение'],
  ['GET', '/api/client/stream', 'Real-time: новые сообщения и статусы (SSE)'],
  ['GET', '/api/client/payments', 'История оплат'],
  ['GET', '/api/public/track/:code', 'Публичный трекинг по трек-номеру или ссылке'],
];

export default function Settings() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: settings, reload } = useApi<any>('/settings');
  const { data: users, reload: ru } = useApi<any[]>('/users');
  const { data: audit } = useApi<any[]>('/audit');
  const [company, setCompany] = useState<any>({});
  const [rates, setRates] = useState<any>({});
  const [addUser, setAddUser] = useState(false);
  useEffect(() => {
    if (settings) {
      setCompany(settings.company);
      setRates({ usdToTjs: settings.usdToTjs, cnyToUsd: settings.cnyToUsd, pickupFreeDays: settings.pickupFreeDays, storageFeePerDay: settings.storageFeePerDay });
    }
  }, [settings]);
  useEffect(() => {
    if (location.hash) setTimeout(() => document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth' }), 300);
  }, []);
  const isAdmin = user?.role === 'admin';
  const save = async () => {
    try {
      await put('/settings', { company, usdToTjs: Number(rates.usdToTjs), cnyToUsd: Number(rates.cnyToUsd), pickupFreeDays: Number(rates.pickupFreeDays), storageFeePerDay: Number(rates.storageFeePerDay) });
      toast('Настройки сохранены');
      reload();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  const c = (k: string) => ({ value: company[k] ?? '', onChange: (e: any) => setCompany((x: any) => ({ ...x, [k]: e.target.value })), disabled: !isAdmin });
  const r = (k: string) => ({ value: rates[k] ?? '', onChange: (e: any) => setRates((x: any) => ({ ...x, [k]: e.target.value })), disabled: !isAdmin });
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader title="Настройки" sub="Компания, курсы валют, сотрудники и API для приложения клиентов" right={isAdmin && <Button variant="dark" onClick={save}>Сохранить</Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="px-5 py-4">
          <div className="mb-3 text-[12.5px] font-medium">Компания</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Название (бренд)">
              <input className="field" {...c('name')} />
            </Field>
            <Field label="Юр. название">
              <input className="field" {...c('legalName')} />
            </Field>
            <Field label="Телефон">
              <input className="field" {...c('phone')} />
            </Field>
            <Field label="WhatsApp">
              <input className="field" {...c('whatsapp')} />
            </Field>
            <Field label="Telegram">
              <input className="field" {...c('telegram')} />
            </Field>
            <Field label="Email">
              <input className="field" {...c('email')} />
            </Field>
            <Field label="Адрес офиса" className="col-span-2">
              <input className="field" {...c('address')} />
            </Field>
            <Field label="ИНН">
              <input className="field" {...c('inn')} />
            </Field>
          </div>
        </Card>
        <Card className="px-5 py-4">
          <div className="mb-3 text-[12.5px] font-medium">Курсы и хранение</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="1 USD = сомони">
              <input className="field num" {...r('usdToTjs')} />
            </Field>
            <Field label="1 CNY = USD">
              <input className="field num" {...r('cnyToUsd')} />
            </Field>
            <Field label="Бесплатное хранение, дней" hint="После — платное хранение на складе выдачи">
              <input className="field num" {...r('pickupFreeDays')} />
            </Field>
            <Field label="Хранение, $ в день">
              <input className="field num" {...r('storageFeePerDay')} />
            </Field>
          </div>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div>
            <div className="text-[12.5px] font-medium">Сотрудники</div>
            <div className="text-[11px] text-muted">Роли: администратор, менеджер, склад (Китай/ТДЖ), бухгалтер</div>
          </div>
          {isAdmin && (
            <Button size="sm" icon={<Plus size={13} />} onClick={() => setAddUser(true)}>
              Добавить
            </Button>
          )}
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Сотрудник</Th>
              <Th>Email</Th>
              <Th>Телефон</Th>
              <Th>Роль</Th>
              <Th>Склад</Th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id}>
                <Td>
                  <div className="flex items-center gap-2">
                    <Avatar name={u.name} color={u.color} size={26} />
                    <span className="font-medium">{u.name}</span>
                  </div>
                </Td>
                <Td>{u.email}</Td>
                <Td className="num">{u.phone ?? '—'}</Td>
                <Td>
                  <Badge tone={u.role === 'admin' ? 'dark' : 'gray'}>{ROLES[u.role] ?? u.role}</Badge>
                </Td>
                <Td className="text-muted">{u.warehouseName ?? 'Все'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card id="api" className="mt-4 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-50 text-accent">
            <Smartphone size={18} />
          </span>
          <div>
            <div className="text-[12.5px] font-medium">API для приложения клиентов</div>
            <div className="mt-0.5 max-w-[720px] text-[11.5px] leading-relaxed text-muted">
              Мобильное приложение (iOS / Android / PWA) работает с этим же сервером. Клиент входит по номеру телефона и SMS-коду, видит свой код и адрес склада в Китае, добавляет трек-номера заказов, следит за посылками и пишет в чат — сообщения появляются здесь, в разделе «Чаты». Подробно: <code className="rounded bg-soft px-1">docs/CLIENT_API.md</code>.
            </div>
          </div>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-line">
          {API_DOC.map(([m, path, desc]) => (
            <div key={path + m} className="flex items-center gap-3 border-b border-line/70 px-3 py-2 text-[11.5px] last:border-0">
              <span className={`w-12 shrink-0 rounded-md px-1.5 py-0.5 text-center text-[10px] font-bold ${m === 'GET' ? 'bg-ok-50 text-ok' : 'bg-accent-50 text-accent'}`}>{m}</span>
              <code className="w-[300px] shrink-0 font-mono text-[11px]">{path}</code>
              <span className="text-muted">{desc}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card id="audit" className="mt-4 overflow-hidden">
        <div className="px-5 pb-2 pt-4">
          <div className="text-[12.5px] font-medium">Журнал действий</div>
          <div className="text-[11px] text-muted">Кто, что и когда изменил — включая решения по рекомендациям ассистента</div>
        </div>
        <div className="max-h-[420px] overflow-y-auto scroll-thin">
          <Table>
            <thead>
              <tr>
                <Th>Время</Th>
                <Th>Сотрудник</Th>
                <Th>Действие</Th>
                <Th>Детали</Th>
              </tr>
            </thead>
            <tbody>
              {audit?.map((a) => (
                <tr key={a.id}>
                  <Td className="whitespace-nowrap text-[11.5px] text-ink-2">{dateTime(a.createdAt)}</Td>
                  <Td>{a.userName}</Td>
                  <Td>
                    <code className="rounded bg-soft px-1.5 py-0.5 text-[10.5px]">{a.action}</code>
                  </Td>
                  <Td className="max-w-[420px] truncate text-[11px] text-muted">{a.details ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>
      <AddUser open={addUser} onClose={() => setAddUser(false)} onDone={ru} />
    </div>
  );
}

function AddUser({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { data: warehouses } = useApi<any[]>(open ? '/warehouses' : null);
  const [f, setF] = useState<any>({ role: 'manager' });
  const set = (k: string) => (e: any) => setF((x: any) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal open={open} onClose={onClose} width={480}>
      <ModalHeader onClose={onClose} title="Новый сотрудник" />
      <div className="grid grid-cols-2 gap-3 px-6 py-3">
        <Field label="Имя" className="col-span-2">
          <input className="field" value={f.name ?? ''} onChange={set('name')} />
        </Field>
        <Field label="Email">
          <input className="field" value={f.email ?? ''} onChange={set('email')} />
        </Field>
        <Field label="Пароль">
          <input className="field" type="password" value={f.password ?? ''} onChange={set('password')} />
        </Field>
        <Field label="Роль">
          <select className="field" value={f.role} onChange={set('role')}>
            {Object.entries(ROLES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Склад">
          <select className="field" value={f.warehouseId ?? ''} onChange={set('warehouseId')}>
            <option value="">Все</option>
            {warehouses?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Телефон" className="col-span-2">
          <input className="field" value={f.phone ?? ''} onChange={set('phone')} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="dark"
          onClick={async () => {
            try {
              await post('/users', f);
              toast('Сотрудник добавлен');
              onDone();
              onClose();
            } catch (e: any) {
              toast(e.message, 'error');
            }
          }}
        >
          Добавить
        </Button>
      </div>
    </Modal>
  );
}
