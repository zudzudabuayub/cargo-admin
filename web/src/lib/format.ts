const TZ = 'Asia/Dushanbe';

export type Tone = 'gray' | 'blue' | 'purple' | 'amber' | 'green' | 'dark' | 'red' | 'lime';

export const plural = (n: number, forms: [string, string, string]) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
};

export const num = (n: number | null | undefined, digits = 0) =>
  n == null || Number.isNaN(n) ? '—' : n.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export const money = (n: number | null | undefined, digits = 2) => {
  if (n == null) return '—';
  const s = Math.abs(n).toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  return `${n < 0 ? '−' : ''}$${s}`;
};

export const kg = (n: number | null | undefined) => {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} т`;
  return `${n.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} кг`;
};

const d = (iso: string | Date) => (iso instanceof Date ? iso : new Date(iso));

export const time = (iso?: string | null) => (iso ? d(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '—');
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const day = (iso?: string | null) => {
  if (!iso) return '—';
  const parts = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'numeric', timeZone: TZ }).formatToParts(d(iso));
  const dd = parts.find((p) => p.type === 'day')?.value;
  const mm = Number(parts.find((p) => p.type === 'month')?.value) - 1;
  return `${dd} ${MONTHS[mm]}`;
};
export const dayLong = (iso?: string | null) => (iso ? d(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: TZ }) : '—');
export const dateTime = (iso?: string | null) => (iso ? `${day(iso)}, ${time(iso)}` : '—');
export const weekdayLine = (date = new Date()) =>
  `${date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ })} · ${time(date.toISOString())} Душанбе`;

export function ago(iso?: string | null) {
  if (!iso) return '—';
  const diff = Date.now() - d(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч назад`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} ${plural(days, ['день', 'дня', 'дней'])} назад`;
  return day(iso);
}

export function until(iso?: string | null) {
  if (!iso) return '—';
  const diff = d(iso).getTime() - Date.now();
  const h = Math.round(diff / 3600000);
  if (Math.abs(h) < 24) return h >= 0 ? `через ${h} ч` : `${-h} ч назад`;
  const days = Math.round(h / 24);
  return days >= 0 ? `через ${days} ${plural(days, ['день', 'дня', 'дней'])}` : `${-days} дн назад`;
}

export const hoursLabel = (h: number) => {
  const a = Math.round(Math.abs(h));
  if (a < 24) return `${a} ч`;
  const dd = Math.floor(a / 24);
  const hh = a % 24;
  return hh ? `${dd} д ${hh} ч` : `${dd} д`;
};

export const greeting = () => {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }));
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
};

export const initials = (name?: string | null) =>
  (name ?? '?')
    .replace(/[«»"()]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

export const PARCEL_STATUS: Record<string, { label: string; tone: Tone }> = {
  expected: { label: 'Ожидается', tone: 'gray' },
  received: { label: 'На складе в Китае', tone: 'blue' },
  in_transit: { label: 'В пути', tone: 'purple' },
  customs: { label: 'Таможня', tone: 'amber' },
  arrived: { label: 'Готов к выдаче', tone: 'green' },
  delivered: { label: 'Выдан', tone: 'dark' },
  problem: { label: 'Проблема', tone: 'red' },
};
export const SHIPMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  planned: { label: 'Запланирован', tone: 'gray' },
  loading: { label: 'Загрузка', tone: 'blue' },
  in_transit: { label: 'В пути', tone: 'purple' },
  border: { label: 'На границе', tone: 'amber' },
  customs: { label: 'Таможня', tone: 'amber' },
  arrived: { label: 'Прибыл', tone: 'green' },
  completed: { label: 'Завершён', tone: 'dark' },
};
export const RISK: Record<string, { label: string; tone: Tone }> = {
  ok: { label: 'По графику', tone: 'green' },
  risk: { label: 'Под риском', tone: 'amber' },
  delayed: { label: 'Задержка', tone: 'red' },
};
export const PAYMENT_METHODS: Record<string, string> = {
  cash: 'Наличные',
  alif: 'Alif',
  dc: 'Душанбе Сити',
  card: 'Корти Милли',
  transfer: 'Перевод',
  wechat: 'WeChat Pay',
};
export const CATEGORY: Record<string, string> = {
  general: 'Обычный',
  electronics: 'Электроника',
  fragile: 'Хрупкое',
  cosmetics: 'Косметика',
  bulk: 'Опт / габарит',
  air: 'Авиа',
};
