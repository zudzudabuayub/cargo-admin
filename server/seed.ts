// Демо-данные: склады в Китае и Таджикистане, клиенты, траки, рейсы, посылки, чаты.
// Запуск: npm run seed  (пересоздаёт базу)
import { all, db, get, insert, nowIso, run, SCHEMA, setSetting, update } from './db.js';
import { buildRoute, CITIES, ROUTES, pointAt } from './geo.js';
import { calcPrice, clearRouteCache, getRoute, hashPassword, round2, token, type Tariff } from './domain.js';

let seed = 20261105;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const int = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1));
const num = (a: number, b: number) => a + rnd() * (b - a);
const H = 3600000;
const D = 86400000;
const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const ahead = (ms: number) => new Date(NOW + ms).toISOString();
const COLORS = ['#6B4EFF', '#F0443A', '#22B25F', '#F5A524', '#0EA5E9', '#EC4899', '#14B8A6', '#8B5CF6', '#F97316', '#64748B'];

const phoneTJ = () => `+992 ${pick(['90', '91', '92', '93', '98', '88', '55', '50', '77', '00', '11'])} ${int(100, 999)} ${int(10, 99)} ${int(10, 99)}`;

const MALE = ['Фаррух', 'Рустам', 'Шахзод', 'Бехруз', 'Дилшод', 'Сухроб', 'Комрон', 'Фирдавс', 'Абдулло', 'Шерзод', 'Алишер', 'Хуршед', 'Джамшед', 'Умед', 'Манучехр', 'Исмоил', 'Далер', 'Парвиз', 'Сорбон', 'Амир', 'Исфандиёр', 'Шухрат'];
const FEMALE = ['Нигина', 'Мадина', 'Зарина', 'Муниса', 'Парвина', 'Манижа', 'Нозанин', 'Гулнора', 'Шахноза', 'Фируза', 'Мехрангез', 'Тахмина', 'Сабрина', 'Дилноза', 'Малика', 'Сарвиноз'];
const SUR = ['Рахимов', 'Каримов', 'Назаров', 'Шарипов', 'Азимов', 'Джураев', 'Исмоилов', 'Султонов', 'Хасанов', 'Одинаев', 'Бобоев', 'Курбонов', 'Сафаров', 'Мирзоев', 'Давлатов', 'Холов', 'Саидов', 'Юсупов', 'Ахмедов', 'Рашидов', 'Нуров', 'Файзуллоев', 'Гафуров', 'Шамсиддинов', 'Раджабов', 'Зиёев'];
const TRANSLIT: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const translit = (s: string) => s.toLowerCase().split('').map((c) => TRANSLIT[c] ?? c).join('');

function personName(female = rnd() < 0.4) {
  const first = female ? pick(FEMALE) : pick(MALE);
  const sur = pick(SUR) + (female ? 'а' : '');
  return `${first} ${sur}`;
}

const CARRIERS: [string, () => string][] = [
  ['YTO', () => `YT${int(7000000, 7999999)}${int(100000, 999999)}`],
  ['ZTO', () => `7${int(3000000, 3999999)}${int(1000000, 9999999)}`],
  ['J&T', () => `JT${int(3000000, 3999999)}${int(100000, 999999)}`],
  ['SF', () => `SF${int(1000000, 1999999)}${int(10000, 99999)}`],
  ['Yunda', () => `43${int(10000000, 99999999)}${int(100, 999)}`],
  ['STO', () => `77${int(3000000, 3999999)}${int(100, 999)}`],
];

const ITEMS: Record<string, string[]> = {
  general: ['Одежда женская', 'Одежда детская', 'Кроссовки', 'Обувь мужская', 'Сумки', 'Хозтовары', 'Текстиль, ткани', 'Детские игрушки', 'Аксессуары для телефона', 'Канцтовары', 'Спорттовары', 'Постельное бельё'],
  electronics: ['Смартфоны', 'Наушники', 'Бытовая техника', 'Светодиодные лампы', 'Видеокамеры', 'Ноутбук', 'Комплектующие ПК'],
  fragile: ['Посуда', 'Стеклянные вазы', 'Люстры', 'Зеркала', 'Керамика'],
  cosmetics: ['Косметика', 'Парфюмерия', 'Средства по уходу'],
  bulk: ['Мебель', 'Стройматериалы', 'Плитка', 'Сантехника', 'Автозапчасти', 'Мебельная фурнитура', 'Оборудование для кафе', 'Рулоны ткани (опт)'],
};

export function seedDatabase(reset = false) {
  if (reset) {
    db.exec('PRAGMA foreign_keys = OFF');
    for (const t of all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)) db.exec(`DROP TABLE IF EXISTS ${t.name}`);
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(SCHEMA);
    clearRouteCache();
  }
  if (get('SELECT id FROM users LIMIT 1')) return false;

  db.exec('BEGIN');
  try {
    seedAll();
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return true;
}

function seedAll() {
  // ---------- Настройки ----------
  setSetting('company', {
    name: 'Cargo Express',
    legalName: 'ООО «Карго Экспресс»',
    phone: '+992 44 600 00 00',
    whatsapp: '+992 93 600 00 00',
    telegram: '@cargo_express_tj',
    email: 'info@cargo.tj',
    address: 'г. Душанбе, р-н Фирдавси, ул. Н. Карабаева, 112',
    inn: '020000000',
  });
  setSetting('usdToTjs', 10.95);
  setSetting('cnyToUsd', 0.14);
  setSetting('pickupFreeDays', 5);
  setSetting('storageFeePerDay', 0.5);

  // ---------- Города и маршруты ----------
  const cityId: Record<string, number> = {};
  for (const c of CITIES) cityId[c.code] = insert('cities', { code: c.code, name: c.name, nameLocal: c.nameLocal ?? null, country: c.country, lat: c.lat, lng: c.lng, kind: c.kind });
  const routeId: Record<string, number> = {};
  for (const r of ROUTES) {
    const b = buildRoute(r.waypoints, r.transport === 'air' ? 1 : 1.18);
    routeId[r.code] = insert('routes', { code: r.code, name: r.name, via: r.via, transport: r.transport, distanceKm: b.distanceKm, days: r.days, path: b.path, stops: b.stops });
  }

  // ---------- Склады ----------
  const W = (o: Record<string, unknown>) => insert('warehouses', { active: 1, ...o });
  const wh = {
    GZ: W({ code: 'GZ', name: 'Склад Гуанчжоу', country: 'CN', cityId: cityId.CAN, role: 'origin', address: 'Гуанчжоу, р-н Байюнь, Шицзин, ул. Цинфэн, 88, склад №3', addressLocal: '广东省广州市白云区石井街道庆丰路88号3号仓', receiverName: '阿里', receiverPhone: '+86 138 0013 8821', zip: '510430', phone: '+86 20 3622 1088', manager: 'Ли На (李娜)', managerPhone: '+86 138 0013 8821', workHours: 'Пн–Сб 09:00–19:00 (по Пекину)', capacityM3: 1200, notes: 'Основной склад приёма. Отправка трака — вторник и пятница.' }),
    YW: W({ code: 'YW', name: 'Склад Иу', country: 'CN', cityId: cityId.YIW, role: 'origin', address: 'Иу, р-н Футянь, пр. Шанчэн, 1188, зона B-12', addressLocal: '浙江省义乌市福田街道商城大道1188号B区12号', receiverName: '阿里', receiverPhone: '+86 139 5792 4410', zip: '322000', phone: '+86 579 8521 7766', manager: 'Чжан Вэй (张伟)', managerPhone: '+86 139 5792 4410', workHours: 'Пн–Сб 08:30–18:30 (по Пекину)', capacityM3: 800, notes: 'Мелкий опт с рынка Футянь.' }),
    UR: W({ code: 'UR', name: 'Склад Урумчи', country: 'CN', cityId: cityId.URC, role: 'origin', address: 'Урумчи, р-н Мидун, Международный логистический парк, корпус A-07', addressLocal: '新疆乌鲁木齐市米东区国际物流园A区7号库', receiverName: '阿里', receiverPhone: '+86 135 6543 2019', zip: '830017', phone: '+86 991 466 2290', manager: 'Абдурахим Турсун', managerPhone: '+86 135 6543 2019', workHours: 'Пн–Сб 10:00–20:00 (по Пекину)', capacityM3: 1500, notes: 'Сборные грузы и экспресс-авиа.' }),
    KS: W({ code: 'KS', name: 'Кашгар · перегруз', country: 'CN', cityId: cityId.KHG, role: 'transit', address: 'Кашгар, Международный логистический порт, склад №5', addressLocal: '新疆喀什市国际物流港5号库', receiverName: '阿里', receiverPhone: '+86 137 9988 1203', zip: '844000', phone: '+86 998 255 4410', manager: 'Мухаммад Эли', managerPhone: '+86 137 9988 1203', workHours: 'Ежедневно 08:00–22:00', capacityM3: 600, notes: 'Транзитная площадка перед границей.' }),
    DU: W({ code: 'DU', name: 'Склад Душанбе', country: 'TJ', cityId: cityId.DYU, role: 'destination', address: 'г. Душанбе, р-н Фирдавси, ул. Н. Карабаева, 112', phone: '+992 44 640 12 12', manager: 'Сухроб Джураев', managerPhone: '+992 93 640 12 12', workHours: 'Пн–Сб 09:00–18:00, Вс 10:00–15:00', capacityM3: 1500, notes: 'Главный склад выдачи и таможенный терминал.' }),
    KH: W({ code: 'KH', name: 'Склад Худжанд', country: 'TJ', cityId: cityId.LBD, role: 'destination', address: 'г. Худжанд, ул. Камоли Худжанди, 64', phone: '+992 34 225 18 18', manager: 'Бахром Олимов', managerPhone: '+992 92 225 18 18', workHours: 'Пн–Сб 09:00–18:00', capacityM3: 700 }),
    KL: W({ code: 'KL', name: 'Пункт выдачи Куляб', country: 'TJ', cityId: cityId.KLB, role: 'destination', address: 'г. Куляб, ул. Рудаки, 31', phone: '+992 33 222 41 41', manager: 'Фируза Назарова', managerPhone: '+992 98 222 41 41', workHours: 'Пн–Сб 09:00–17:00', capacityM3: 200 }),
    BK: W({ code: 'BK', name: 'Пункт выдачи Бохтар', country: 'TJ', cityId: cityId.BKT, role: 'destination', address: 'г. Бохтар, ул. Вахдат, 17', phone: '+992 32 222 55 05', manager: 'Джамшед Холов', managerPhone: '+992 90 222 55 05', workHours: 'Пн–Сб 09:00–17:00', capacityM3: 200 }),
  };

  // ---------- Сотрудники ----------
  const U = (name: string, email: string, role: string, pw: string, color: string, warehouseId?: number, phone?: string) =>
    insert('users', { name, email, role, passwordHash: hashPassword(pw), color, warehouseId: warehouseId ?? null, phone: phone ?? null, createdAt: nowIso() });
  const adminId = U('Фаррух Рахимов', 'admin@cargo.tj', 'admin', 'admin123', '#6B4EFF', undefined, '+992 93 600 00 01');
  U('Нигина Саидова', 'manager@cargo.tj', 'manager', 'manager123', '#EC4899', undefined, '+992 93 600 00 02');
  U('Ли На', 'gz@cargo.tj', 'warehouse', 'sklad123', '#F97316', wh.GZ, '+86 138 0013 8821');
  U('Сухроб Джураев', 'dushanbe@cargo.tj', 'warehouse', 'sklad123', '#14B8A6', wh.DU, '+992 93 640 12 12');
  U('Мадина Юсупова', 'finance@cargo.tj', 'accountant', 'finance123', '#22B25F', undefined, '+992 93 600 00 03');

  // ---------- Тарифы ----------
  const T = (o: Omit<Tariff, 'id'> & { description?: string }) => insert('tariffs', { active: 1, ...o });
  const tariffs: Record<string, number> = {
    general: T({ name: 'Обычный товар', category: 'general', transport: 'auto', pricePerKg: 2.8, pricePerM3: 290, minCharge: 3, daysMin: 14, daysMax: 20, description: 'Одежда, обувь, хозтовары, игрушки' }),
    electronics: T({ name: 'Электроника и техника', category: 'electronics', transport: 'auto', pricePerKg: 3.6, pricePerM3: 360, minCharge: 5, daysMin: 14, daysMax: 20, description: 'Телефоны, гаджеты, бытовая техника' }),
    fragile: T({ name: 'Хрупкий груз', category: 'fragile', transport: 'auto', pricePerKg: 3.2, pricePerM3: 330, minCharge: 5, daysMin: 15, daysMax: 22, description: 'Посуда, стекло, керамика — с обрешёткой' }),
    cosmetics: T({ name: 'Косметика и жидкости', category: 'cosmetics', transport: 'auto', pricePerKg: 3.9, pricePerM3: 380, minCharge: 5, daysMin: 15, daysMax: 22, description: 'Косметика, парфюмерия, бытовая химия' }),
    bulk: T({ name: 'Оптовый / габаритный', category: 'bulk', transport: 'auto', pricePerKg: 0.85, pricePerM3: 210, minCharge: 50, daysMin: 15, daysMax: 25, description: 'Мебель, стройматериалы, оборудование — от 100 кг' }),
    air: T({ name: 'Авиа-экспресс', category: 'air', transport: 'air', pricePerKg: 7.5, pricePerM3: 1250, minCharge: 10, daysMin: 4, daysMax: 7, description: 'Срочные посылки до 30 кг' }),
  };
  const tariffRow = (id: number) => get<Tariff>('SELECT * FROM tariffs WHERE id = ?', id)!;

  // ---------- Клиенты ----------
  const prefixes: [string, number, string][] = [
    ['DSH', wh.DU, 'DYU'],
    ['DSH', wh.DU, 'DYU'],
    ['DSH', wh.DU, 'DYU'],
    ['DSH', wh.DU, 'DYU'],
    ['KHJ', wh.KH, 'LBD'],
    ['KHJ', wh.KH, 'LBD'],
    ['KLB', wh.KL, 'KLB'],
    ['BKT', wh.BK, 'BKT'],
  ];
  const districts: Record<string, string[]> = {
    DYU: ['р-н Сино, ул. Айни', 'р-н Шохмансур, ул. Бухоро', 'р-н Фирдавси, мкр. 91', 'р-н Исмоили Сомони, пр. Рудаки', 'р-н Сино, мкр. 82', 'р-н Шохмансур, ул. Мирзо Турсунзаде'],
    LBD: ['ул. Ленина', '19 мкр.', 'ул. Гагарина', '12 мкр.', 'ул. Сырдарьинская'],
    KLB: ['ул. Сомони', 'ул. Ленина', 'ул. Абуали ибни Сино'],
    BKT: ['ул. Айни', 'ул. Вахш', 'ул. Ленина'],
  };
  const businesses = ['ИП «Ситора» — магазин одежды', 'ООО «Пайванд Сохтмон»', 'ООО «Нури Хона»', 'ИП «Детский мир Худжанд»', 'ООО «АвтоДеталь»', 'ИП «Гулбахор» — текстиль', 'ООО «Сарвар Трейд»', 'ИП «Мебель Плюс»', 'ООО «Кафе Сервис»', 'ИП «Смарт Гаджет»'];
  const clientIds: number[] = [];
  const bizIds: number[] = [];
  const codeCounters: Record<string, number> = { DSH: 1000, KHJ: 2000, KLB: 3000, BKT: 4000 };
  for (let i = 0; i < 56; i++) {
    const [prefix, whId, city] = pick(prefixes);
    const female = rnd() < 0.42;
    const name = personName(female);
    const isBiz = i < businesses.length;
    codeCounters[prefix] += int(3, 29);
    const code = `${prefix}-${codeCounters[prefix]}`;
    const tg = rnd() < 0.6 ? `@${translit(name.split(' ')[0])}_${translit(name.split(' ')[1]).slice(0, 4)}${int(1, 99)}` : null;
    const id = insert('clients', {
      code,
      name,
      phone: phoneTJ(),
      phone2: rnd() < 0.2 ? phoneTJ() : null,
      email: rnd() < 0.3 ? `${translit(name.split(' ')[0])}.${translit(name.split(' ')[1])}@mail.tj` : null,
      telegram: tg,
      cityId: cityId[city],
      warehouseId: whId,
      address: `${pick(districts[city])}, ${int(1, 140)}${rnd() < 0.5 ? `, кв. ${int(1, 90)}` : ''}`,
      company: isBiz ? businesses[i] : null,
      type: isBiz ? 'business' : 'individual',
      status: isBiz && rnd() < 0.6 ? 'vip' : rnd() < 0.04 ? 'blocked' : 'active',
      discount: isBiz ? pick([3, 5, 7, 10]) : 0,
      source: pick(['Instagram', 'Telegram', 'Рекомендация', 'TikTok', 'Сайт', 'Офис']),
      color: pick(COLORS),
      createdAt: ago(int(20, 400) * D),
    });
    clientIds.push(id);
    if (isBiz) bizIds.push(id);
  }
  const retailIds = clientIds.filter((id) => !bizIds.includes(id));

  // ---------- Водители и транспорт ----------
  const driverNames = ['Тоджиддин Салимов', 'Бахтиёр Каримов', 'Сайфулло Рахмонов', 'Неъматулло Ашуров', 'Зафар Мирзоев', 'Хайрулло Гуломов', 'Фаридун Абдуллоев', 'Ориф Шукуров', 'Илхом Нематов', 'Абдурашид Тошев', 'Мансур Кодиров', 'Рахмон Хакимов', 'Эркин Ахмет', 'Саидали Валиев'];
  const driverIds = driverNames.map((name, i) =>
    insert('drivers', {
      name,
      phone: i === 12 ? '+86 135 0991 7720' : phoneTJ(),
      license: `${i === 12 ? 'CN' : 'TJ'} ${int(1000000, 9999999)}`,
      citizenship: i === 12 ? 'Китай' : 'Таджикистан',
      experienceYears: int(4, 24),
      status: 'available',
      rating: round2(num(4.3, 5)),
      color: COLORS[i % COLORS.length],
    }),
  );
  const truckDefs: [string, string, string, number, number, number][] = [
    ['Shacman X3000', '0145 AB 01', 'Тент', 20000, 86, 2021],
    ['Howo T7H', '3321 AC 01', 'Тент', 22000, 90, 2022],
    ['FAW J6P', '7720 AB 02', 'Тент', 20000, 82, 2020],
    ['Mercedes-Benz Actros 1845', '1001 AA 01', 'Рефрижератор', 18000, 76, 2019],
    ['Volvo FH 460', '5532 BA 01', 'Тент', 20000, 86, 2018],
    ['MAN TGX 18.440', '4410 AC 03', 'Контейнер 40ft', 24000, 67, 2020],
    ['Isuzu NQR 90', '2208 AD 01', 'Фургон', 5000, 32, 2023],
    ['DAF XF 480', '6610 AB 01', 'Тент', 20000, 90, 2021],
    ['Sitrak C7H', '8845 AC 01', 'Тент', 22000, 92, 2024],
    ['Shacman X6000', '9012 AE 01', 'Тент', 22000, 92, 2024],
    ['Scania R450', '3388 AB 02', 'Тент', 20000, 86, 2019],
    ['Howo TX', '1290 AE 03', 'Тент', 18000, 82, 2017],
    ['FAW JH6', '新A 7K291', 'Тент', 22000, 90, 2022],
    ['Foton Aumark', '0571 AF 01', 'Фургон', 3000, 20, 2023],
  ];
  const truckIds = truckDefs.map(([model, plate, kind, kg, m3, year], i) =>
    insert('trucks', {
      plate,
      trailerPlate: kind === 'Фургон' ? null : `${int(1000, 9999)} ${pick(['ТА', 'ТВ', 'TC'])} 01`,
      model,
      kind,
      capacityKg: kg,
      capacityM3: m3,
      year,
      status: 'available',
      driverId: driverIds[i],
      fuel: int(30, 95),
      odometer: int(80000, 720000),
      lat: null,
      lng: null,
      speed: 0,
      lastSeenAt: ago(int(1, 20) * 60000),
    }),
  );

  // ---------- Рейсы ----------
  let codeN = 1043;
  type SDef = {
    route: string;
    truck: number | null;
    origin: number;
    dest: number;
    status: string;
    departedAgo?: number;
    plannedIn?: number;
    arrivedAgo?: number;
    risk?: 'ok' | 'risk' | 'delayed';
    delayHours?: number;
    delayReason?: string;
    holdAt?: string;
    forceProgress?: number;
    parcels: [number, number];
    biz: number;
    flaggedMin?: number;
    transport?: string;
    notes?: string;
  };
  const SH: SDef[] = [
    { route: 'URC-DYU-IRK', truck: 4, origin: wh.UR, dest: wh.DU, status: 'completed', departedAgo: 58 * D, arrivedAgo: 50 * D, parcels: [18, 24], biz: 6 },
    { route: 'CAN-DYU-IRK', truck: 10, origin: wh.GZ, dest: wh.DU, status: 'completed', departedAgo: 61 * D, arrivedAgo: 44 * D, parcels: [22, 28], biz: 7 },
    { route: 'CAN-LBD-OSH', truck: 7, origin: wh.GZ, dest: wh.KH, status: 'completed', departedAgo: 54 * D, arrivedAgo: 37 * D, parcels: [18, 24], biz: 6 },
    { route: 'YIW-DYU-IRK', truck: 11, origin: wh.YW, dest: wh.DU, status: 'completed', departedAgo: 47 * D, arrivedAgo: 30 * D, parcels: [20, 26], biz: 6 },
    { route: 'URC-DYU-KUL', truck: 2, origin: wh.UR, dest: wh.DU, status: 'completed', departedAgo: 31 * D, arrivedAgo: 22 * D, parcels: [16, 22], biz: 5 },
    { route: 'CAN-DYU-IRK', truck: 4, origin: wh.GZ, dest: wh.DU, status: 'completed', departedAgo: 31 * D, arrivedAgo: 14 * D, parcels: [26, 34], biz: 8 },
    { route: 'URC-DYU-IRK', truck: 10, origin: wh.UR, dest: wh.DU, status: 'completed', departedAgo: 19 * D, arrivedAgo: 11 * D, parcels: [20, 28], biz: 7 },
    { route: 'YIW-DYU-IRK', truck: 7, origin: wh.YW, dest: wh.DU, status: 'completed', departedAgo: 25 * D, arrivedAgo: 7 * D, parcels: [24, 30], biz: 8 },
    { route: 'CAN-LBD-OSH', truck: 11, origin: wh.GZ, dest: wh.KH, status: 'arrived', departedAgo: 17 * D, arrivedAgo: 1.4 * D, parcels: [22, 30], biz: 7 },
    { route: 'CAN-DYU-IRK', truck: 0, origin: wh.GZ, dest: wh.DU, status: 'in_transit', departedAgo: 12.4 * D, risk: 'delayed', delayHours: 38, delayReason: 'Очередь на КПП Иркештам (~120 машин) и сокращённый график работы', forceProgress: 0.79, parcels: [34, 42], biz: 10, flaggedMin: 25 },
    { route: 'URC-DYU-IRK', truck: 1, origin: wh.UR, dest: wh.DU, status: 'border', departedAgo: 3.6 * D, risk: 'delayed', delayHours: 20, delayReason: 'Очередь на КПП Иркештам', holdAt: 'IRK', parcels: [28, 36], biz: 7, flaggedMin: 90 },
    { route: 'YIW-DYU-IRK', truck: 2, origin: wh.YW, dest: wh.DU, status: 'in_transit', departedAgo: 6.2 * D, parcels: [26, 34], biz: 8 },
    { route: 'CAN-DYU-KUL', truck: 3, origin: wh.GZ, dest: wh.DU, status: 'in_transit', departedAgo: 14.6 * D, risk: 'risk', delayHours: 9, delayReason: 'Снегопад на перевале Ак-Байтал, движение по одной полосе', parcels: [18, 24], biz: 5, flaggedMin: 48, notes: 'Рефрижератор: косметика и жидкости, держать +5…+15 °C' },
    { route: 'URC-LBD-OSH', truck: 5, origin: wh.UR, dest: wh.KH, status: 'in_transit', departedAgo: 2.9 * D, parcels: [20, 28], biz: 7 },
    { route: 'CAN-DYU-IRK', truck: 9, origin: wh.GZ, dest: wh.DU, status: 'customs', departedAgo: 16.3 * D, risk: 'risk', delayHours: 14, delayReason: 'Досмотр на таможенном терминале Душанбе', forceProgress: 0.995, parcels: [30, 38], biz: 8, flaggedMin: 130 },
    { route: 'URC-DYU-AIR', truck: null, origin: wh.UR, dest: wh.DU, status: 'in_transit', departedAgo: 0.85 * D, parcels: [14, 20], biz: 0, transport: 'air', notes: 'Авиа-партия, рейс Урумчи — Душанбе' },
    { route: 'DYU-KLB', truck: 6, origin: wh.DU, dest: wh.KL, status: 'in_transit', departedAgo: 3.5 * H, parcels: [10, 16], biz: 0, notes: 'Развоз в пункт выдачи Куляб' },
    { route: 'CAN-DYU-IRK', truck: 7, origin: wh.GZ, dest: wh.DU, status: 'loading', plannedIn: 1.2 * D, parcels: [22, 30], biz: 7 },
    { route: 'YIW-DYU-IRK', truck: 8, origin: wh.YW, dest: wh.DU, status: 'loading', plannedIn: 2.3 * D, parcels: [14, 20], biz: 5 },
    { route: 'URC-DYU-KUL', truck: null, origin: wh.UR, dest: wh.DU, status: 'planned', plannedIn: 4 * D, parcels: [0, 0], biz: 0 },
    { route: 'CAN-DYU-IRK', truck: 12, origin: wh.GZ, dest: wh.DU, status: 'in_transit', departedAgo: 2.1 * D, parcels: [24, 30], biz: 7 },
  ];

  const parcelCats = ['general', 'general', 'general', 'general', 'electronics', 'fragile', 'cosmetics'];
  const clientCode = new Map(all<{ id: number; code: string; discount: number }>('SELECT id, code, discount FROM clients').map((c) => [c.id, c]));

  function makeParcel(o: { clientId: number | null; biz: boolean; air?: boolean; status: string; warehouseId: number | null; destWarehouseId: number; shipmentId: number | null; receivedAt?: string; shippedAt?: string; arrivedAt?: string; deliveredAt?: string; createdAt: string; paid?: boolean; notes?: string }) {
    const [carrier, gen] = pick(CARRIERS);
    const cat = o.air ? 'air' : o.biz ? 'bulk' : pick(parcelCats);
    const itemsCat = cat === 'air' ? pick(['general', 'electronics', 'cosmetics']) : cat;
    const weight = cat === 'bulk' ? round2(num(350, 2300)) : cat === 'air' ? round2(num(0.4, 12)) : round2(Math.max(0.3, num(0.4, 1) ** 2 * num(1, 38)));
    const density = cat === 'bulk' ? num(160, 420) : num(110, 320);
    const volume = round2(Math.max(0.005, weight / density));
    const places = cat === 'bulk' ? int(3, 40) : weight > 15 ? int(1, 4) : 1;
    const t = tariffRow(tariffs[cat]);
    const disc = o.clientId ? clientCode.get(o.clientId)?.discount ?? 0 : 0;
    const price = o.status === 'expected' ? null : calcPrice(weight, volume, t, disc).total;
    const id = insert('parcels', {
      trackNumber: gen(),
      carrier,
      clientId: o.clientId,
      description: pick(ITEMS[itemsCat]),
      category: cat,
      places,
      weightKg: o.status === 'expected' ? null : weight,
      volumeM3: o.status === 'expected' ? null : volume,
      declaredValue: round2(weight * num(4, 30)),
      status: o.status,
      warehouseId: o.warehouseId,
      destWarehouseId: o.destWarehouseId,
      shipmentId: o.shipmentId,
      tariffId: t.id,
      price,
      paid: o.paid ? 1 : 0,
      shelf: o.status === 'received' || o.status === 'arrived' ? `${pick(['A', 'B', 'C', 'D'])}-${int(1, 24)}-${int(1, 6)}` : null,
      receivedAt: o.receivedAt ?? null,
      shippedAt: o.shippedAt ?? null,
      arrivedAt: o.arrivedAt ?? null,
      deliveredAt: o.deliveredAt ?? null,
      createdAt: o.createdAt,
      notes: o.notes ?? null,
    });
    // История статусов
    const evs: [string, string | undefined, string, number | null][] = [['expected', o.createdAt, 'Клиент добавил трек-номер', null]];
    if (o.receivedAt) evs.push(['received', o.receivedAt, `Принято на складе, вес ${weight} кг`, o.warehouseId]);
    if (o.shippedAt) evs.push(['in_transit', o.shippedAt, 'Отправлено рейсом', null]);
    if (o.arrivedAt) evs.push(['arrived', o.arrivedAt, 'Прибыло на склад выдачи', o.destWarehouseId]);
    if (o.deliveredAt) evs.push(['delivered', o.deliveredAt, 'Выдано клиенту', o.destWarehouseId]);
    for (const [status, at, note, w] of evs) insert('parcel_events', { parcelId: id, status, note, warehouseId: w, at: at! });
    return { id, price: price ?? 0, clientId: o.clientId };
  }

  const createdShipments: { id: number; def: SDef; code: string }[] = [];
  const payable: { clientId: number; price: number; id: number; at: string; sid: number }[] = [];

  for (const def of SH) {
    const code = `TJ-${codeN++}`;
    const route = getRoute(routeId[def.route]);
    const days = route.row.days;
    const truckId = def.truck === null ? null : truckIds[def.truck];
    const driverId = def.truck === null ? null : driverIds[def.truck];
    const departedAt = def.departedAgo != null ? ago(def.departedAgo) : null;
    const plannedDeparture = def.plannedIn != null ? ahead(def.plannedIn) : departedAt;
    const plannedArrival = departedAt ? new Date(NOW - def.departedAgo! + days * D).toISOString() : ahead((def.plannedIn ?? 0) + days * D);
    const etaAt = new Date(new Date(plannedArrival).getTime() + (def.delayHours ?? 0) * H).toISOString();
    let progress = 0;
    if (def.status === 'completed' || def.status === 'arrived') progress = 1;
    else if (def.holdAt) progress = route.stops.find((s) => s.code === def.holdAt)!.at;
    else if (def.forceProgress != null) progress = def.forceProgress;
    else if (departedAt) progress = Math.min(0.98, (NOW - new Date(departedAt).getTime()) / (new Date(etaAt).getTime() - new Date(departedAt).getTime()));
    const arrivedAt = def.arrivedAgo != null ? ago(def.arrivedAgo) : null;
    const speed = ['in_transit'].includes(def.status) ? (def.transport === 'air' ? 780 : int(42, 78)) : 0;

    const sid = insert('shipments', {
      code,
      routeId: routeId[def.route],
      truckId,
      driverId,
      originWarehouseId: def.origin,
      destWarehouseId: def.dest,
      status: def.status,
      transport: def.transport ?? 'auto',
      plannedDeparture,
      departedAt,
      plannedArrival,
      etaAt: arrivedAt ?? etaAt,
      arrivedAt,
      progress,
      risk: def.risk ?? 'ok',
      delayReason: def.delayReason ?? null,
      delayHours: def.delayHours ?? 0,
      speed,
      sealNumber: def.status === 'planned' ? null : `TJ${int(100000, 999999)}`,
      declaration: ['completed', 'arrived', 'customs'].includes(def.status) ? `10005020/${int(100000, 999999)}/${int(1000000, 9999999)}` : null,
      trackingToken: token(9),
      notes: def.notes ?? null,
      createdAt: ago((def.departedAgo ?? 0) + 3 * D),
      flaggedAt: def.flaggedMin ? ago(def.flaggedMin * 60000) : null,
    });
    createdShipments.push({ id: sid, def, code });

    if (truckId) {
      const active = ['in_transit', 'border', 'customs'].includes(def.status);
      const pos = pointAt(route.path, progress);
      update('trucks', truckId, { status: active ? 'on_trip' : 'available', lat: pos[0], lng: pos[1], speed, lastSeenAt: ago(int(1, 6) * 60000) });
      if (active) update('drivers', driverId!, { status: 'on_trip' });
    }

    // События рейса
    const ev = (type: string, title: string, at: string, description?: string, city?: string, actor = 'Система') =>
      insert('shipment_events', { shipmentId: sid, type, title, description: description ?? null, cityId: city ? cityId[city] : null, actor, at });
    const originName = get<{ name: string }>('SELECT name FROM warehouses WHERE id = ?', def.origin)!.name;
    ev('planned', 'Рейс запланирован', ago((def.departedAgo ?? 0) + 3 * D), route.row.name, undefined, 'Фаррух Рахимов');
    if (def.status !== 'planned') ev('loading', `Загрузка — ${originName}`, ago((def.departedAgo ?? 0) + 1 * D), undefined, route.stops[0].code, 'Склад');
    if (departedAt) {
      ev('in_transit', 'Рейс отправлен', departedAt, `Пломба ${int(100000, 999999)}`, route.stops[0].code, 'Склад');
      const depMs = new Date(departedAt).getTime();
      const spanMs = new Date(etaAt).getTime() - depMs;
      for (const st of route.stops.slice(1)) {
        if (st.at > progress + 1e-9) break;
        if (st.at >= 1 && def.status !== 'completed' && def.status !== 'arrived') break;
        const at = new Date(depMs + spanMs * st.at * (def.status === 'completed' || def.status === 'arrived' ? 1 : 1)).toISOString();
        if (st.at >= 1) continue;
        if (st.kind === 'border') ev('checkpoint', `КПП ${st.name}`, at, def.holdAt === st.code ? 'Ожидание в очереди на пересечение границы' : 'Граница пройдена', st.code, 'Водитель');
        else ev('checkpoint', `Прошёл ${st.name}`, at, undefined, st.code, 'GPS');
      }
      if (def.delayReason) ev('delay', 'Задержка', ago((def.flaggedMin ?? 60) * 60000), def.delayReason, undefined, 'Ассистент');
      if (def.status === 'customs') ev('customs', 'Таможенное оформление', ago(5 * H), 'Груз на таможенном терминале Душанбе', 'DYU', 'Склад');
      if (arrivedAt) ev('arrived', `Прибыл — ${get<{ name: string }>('SELECT name FROM warehouses WHERE id = ?', def.dest)!.name}`, arrivedAt, undefined, route.stops[route.stops.length - 1].code, 'Склад');
      if (def.status === 'completed') ev('completed', 'Рейс завершён', ago(def.arrivedAgo! - 1 * D), 'Все посылки выданы или переданы на хранение', undefined, 'Фаррух Рахимов');
    }

    // Посылки рейса
    const [pmin, pmax] = def.parcels;
    const n = pmax ? int(pmin, pmax) : 0;
    const recvAt = ago((def.departedAgo ?? 0) + int(2, 6) * D);
    for (let i = 0; i < n; i++) {
      const biz = i < def.biz;
      const cid = biz ? pick(bizIds) : pick(retailIds);
      let status = 'received';
      let deliveredAt: string | undefined;
      let paid = false;
      if (def.status === 'completed') {
        status = rnd() < 0.93 ? 'delivered' : 'arrived';
        deliveredAt = status === 'delivered' ? ago(def.arrivedAgo! - num(0.1, 3) * D) : undefined;
        paid = status === 'delivered' ? true : rnd() < 0.3;
      } else if (def.status === 'arrived') {
        status = rnd() < 0.45 ? 'delivered' : 'arrived';
        deliveredAt = status === 'delivered' ? ago(rnd() < 0.35 ? num(0.2, 3) * H : def.arrivedAgo! * num(0.1, 0.9)) : undefined;
        paid = status === 'delivered' ? true : rnd() < 0.2;
      } else if (['in_transit', 'border'].includes(def.status)) {
        status = 'in_transit';
        paid = biz && rnd() < 0.5;
      } else if (def.status === 'customs') {
        status = 'customs';
        paid = biz && rnd() < 0.5;
      }
      const destWh = def.dest === wh.KL || def.dest === wh.BK ? def.dest : def.dest;
      const p = makeParcel({
        clientId: cid,
        biz,
        air: def.transport === 'air',
        status,
        warehouseId: status === 'received' ? def.origin : ['arrived', 'delivered'].includes(status) ? def.dest : null,
        destWarehouseId: destWh,
        shipmentId: sid,
        createdAt: ago((def.departedAgo ?? 0) + int(5, 12) * D),
        receivedAt: recvAt,
        shippedAt: departedAt ?? undefined,
        arrivedAt: arrivedAt ?? undefined,
        deliveredAt,
        paid,
      });
      if (paid) payable.push({ clientId: cid, price: p.price, id: p.id, at: deliveredAt ?? recvAt, sid });
    }
  }

  // Посылки на складах в Китае без рейса, ожидаемые и неопознанные
  const cnWh = [wh.GZ, wh.GZ, wh.YW, wh.UR];
  for (let i = 0; i < 46; i++) {
    const cid = pick(retailIds);
    const w = pick(cnWh);
    const destOf = get<{ warehouseId: number }>('SELECT warehouseId FROM clients WHERE id = ?', cid)!.warehouseId;
    makeParcel({ clientId: cid, biz: false, status: 'received', warehouseId: w, destWarehouseId: destOf, shipmentId: null, createdAt: ago(int(3, 12) * D), receivedAt: ago(num(0.1, 4) * D) });
  }
  for (let i = 0; i < 28; i++) {
    const cid = pick(retailIds);
    const destOf = get<{ warehouseId: number }>('SELECT warehouseId FROM clients WHERE id = ?', cid)!.warehouseId;
    makeParcel({ clientId: cid, biz: false, status: 'expected', warehouseId: null, destWarehouseId: destOf, shipmentId: null, createdAt: ago(num(0.1, 6) * D) });
  }
  for (let i = 0; i < 7; i++) {
    makeParcel({ clientId: null, biz: false, status: 'received', warehouseId: pick([wh.GZ, wh.GZ, wh.YW]), destWarehouseId: wh.DU, shipmentId: null, createdAt: ago(num(0.5, 3) * D), receivedAt: ago(num(0.2, 2.5) * D), notes: 'Нет кода клиента на коробке' });
  }
  for (let i = 0; i < 3; i++) {
    const cid = pick(retailIds);
    makeParcel({ clientId: cid, biz: false, status: 'problem', warehouseId: wh.DU, destWarehouseId: wh.DU, shipmentId: null, createdAt: ago(int(10, 20) * D), receivedAt: ago(int(8, 15) * D), notes: pick(['Повреждена упаковка, требуется фото-акт', 'Расхождение веса с данными склада в Китае', 'Не хватает 1 места из 3']) });
  }

  // ---------- Платежи ----------
  const byClient = new Map<string, { sum: number; ids: number[]; at: string; cid: number }>();
  for (const p of payable) {
    const key = `${p.clientId}:${p.sid}`;
    const e = byClient.get(key) ?? { sum: 0, ids: [], at: p.at, cid: p.clientId };
    e.sum += p.price;
    e.ids.push(p.id);
    if (p.at > e.at) e.at = p.at;
    byClient.set(key, e);
  }
  const methods = ['cash', 'cash', 'alif', 'alif', 'dc', 'card', 'transfer'];
  for (const e of byClient.values()) {
    const cid = e.cid;
    // Делим на 1–3 платежа
    const parts = e.ids.length > 3 ? int(1, 3) : 1;
    for (let i = 0; i < parts; i++) {
      const amt = round2(e.sum / parts);
      const currency = rnd() < 0.35 ? 'TJS' : 'USD';
      insert('payments', {
        clientId: cid,
        amount: currency === 'TJS' ? round2(amt * 10.95) : amt,
        currency,
        amountUsd: amt,
        method: bizIds.includes(cid) ? pick(['transfer', 'transfer', 'cash']) : pick(methods),
        note: null,
        parcelIds: e.ids,
        userId: adminId,
        createdAt: new Date(new Date(e.at).getTime() - i * D).toISOString(),
      });
    }
  }
  // Предоплаты и переплаты пары клиентов
  for (const cid of bizIds.slice(0, 3)) insert('payments', { clientId: cid, amount: 500, currency: 'USD', amountUsd: 500, method: 'transfer', note: 'Предоплата за следующий рейс', parcelIds: [], userId: adminId, createdAt: ago(int(1, 5) * D) });

  // ---------- Чаты ----------
  const conv = (kind: string, ref: { clientId?: number; driverId?: number; warehouseId?: number }, title: string, pinned = 0) =>
    insert('conversations', { kind, clientId: ref.clientId ?? null, driverId: ref.driverId ?? null, warehouseId: ref.warehouseId ?? null, title, status: 'open', pinned, createdAt: ago(10 * D) });
  const msg = (cid: number, senderType: string, text: string, minutesAgo: number, senderName?: string, meta?: unknown) =>
    insert('messages', { conversationId: cid, senderType, senderName: senderName ?? null, text, meta: meta ?? null, createdAt: ago(minutesAgo * 60000) });

  const featured = createdShipments.find((x) => x.def.flaggedMin === 25)!;
  const featuredParcels = all<{ id: number; clientId: number; trackNumber: string }>('SELECT id, clientId, trackNumber FROM parcels WHERE shipmentId = ? AND clientId IS NOT NULL', featured.id);
  const clientName = (id: number) => get<{ name: string; code: string }>('SELECT name, code FROM clients WHERE id = ?', id)!;

  const scripts: ((c: number, client: { name: string; code: string }, track: string) => [string, string, number][])[] = [
    (_c, cl, tr) => [
      ['client', `Ассалому алейкум! Мой трек ${tr}, когда будет в Душанбе?`, 46],
      ['admin', `Ваалейкум ассалом, ${cl.name.split(' ')[0]}! Посылка в рейсе ${featured.code}, сейчас между Аксу и Кашгаром.`, 41],
      ['admin', 'На КПП Иркештам большая очередь, ориентировочно прибытие на 1–2 дня позже. Мы сообщим, как только пройдём границу.', 40],
      ['client', 'Хорошо, рахмат. А можно будет забрать в Худжанде?', 12],
    ],
    (_c, cl, tr) => [
      ['client', `Здравствуйте, я ${cl.code}. Заказал на Pinduoduo 3 посылки, одна пришла (${tr}), а две нет`, 180],
      ['admin', 'Здравствуйте! Пришлите, пожалуйста, трек-номера двух других посылок — проверим по складу.', 172],
      ['client', 'YT7712039481022 и JT3109928811043', 165],
      ['admin', 'Обе ещё не поступили на склад в Гуанчжоу. Обычно Pinduoduo доставляет 3–5 дней, проверим завтра.', 160],
      ['client', 'Спасибо 🙏', 158],
    ],
    () => [
      ['client', 'Сколько стоит доставка 1 кг одежды?', 600],
      ['admin', 'Обычный товар (одежда, обувь) — $2.8 за кг, срок 14–20 дней. Если груз лёгкий и объёмный — считаем по объёму, $290 за м³.', 590],
      ['client', 'А телефоны?', 585],
      ['admin', 'Электроника — $3.6 за кг. Телефоны принимаем только без аккумуляторов отдельно, в заводской упаковке.', 580],
      ['client', 'Понял. Как получить адрес склада в Китае?', 9],
    ],
    (_c, cl) => [
      ['system', `Ваши посылки прибыли на Склад Худжанд (г. Худжанд, ул. Камоли Худжанди, 64). Можно забрать с 09:00 до 18:00.`, 2000],
      ['client', 'Можно завтра после обеда забрать? И оплатить через Алиф?', 1900],
      ['admin', 'Да, конечно. Оплата Alif, Душанбе Сити или наличными на месте.', 1880],
      ['client', `Отлично. Забирать будет брат, код ${cl.code}`, 4],
    ],
    () => [
      ['client', 'Добрый день! Нужна доставка 2 тонн плитки из Фошаня, можете забрать с фабрики?', 320],
      ['admin', 'Добрый день! Да, организуем забор из Фошаня до склада в Гуанчжоу (+$40). Оптовый тариф — $0.85/кг или $210/м³.', 300],
      ['client', 'Отправьте, пожалуйста, договор на почту', 30],
    ],
    (_c, _cl, tr) => [
      ['client', `Посылка ${tr} показывает «на складе в Китае» уже 6 дней. Почему не отправляют?`, 70],
      ['admin', 'Ближайший трак из Гуанчжоу уходит завтра, ваша посылка уже в листе загрузки.', 62],
    ],
  ];
  const chatClients = [...new Set([...new Set(featuredParcels.map((p) => p.clientId))].slice(0, 3).concat(bizIds.slice(0, 2), retailIds.slice(10, 16)))].slice(0, 9);
  chatClients.forEach((cid, i) => {
    const cl = clientName(cid);
    const tr = get<{ trackNumber: string }>('SELECT trackNumber FROM parcels WHERE clientId = ? ORDER BY id DESC LIMIT 1', cid)?.trackNumber ?? 'YT7445012938812';
    const c = conv('client', { clientId: cid }, cl.name, i === 0 ? 1 : 0);
    const lines = scripts[i % scripts.length](c, cl, tr);
    for (const [type, text, m] of lines) msg(c, type, text, m + i * 3, type === 'admin' ? 'Нигина Саидова' : type === 'client' ? cl.name : 'Карго');
    const last = lines[lines.length - 1];
    run('UPDATE conversations SET lastMessageAt = ?, lastMessage = ?, unreadAdmin = ? WHERE id = ?', ago((last[2] + i * 3) * 60000), last[1].slice(0, 160), last[0] === 'client' ? int(1, 3) : 0, c);
  });

  const d0 = conv('driver', { driverId: driverIds[1] }, driverNames[1]);
  const driverLines: [string, string, number][] = [
    ['driver', 'Прибыл на Иркештам. Очередь примерно 120 машин, говорят граница работает до 17:00.', 210],
    ['admin', 'Понял, Бахтиёр-ака. Документы все на руках? CMR, TIR, декларация?', 200],
    ['driver', 'Да, всё есть. Пломба целая. Думаю, завтра к обеду пройдём.', 190],
    ['admin', 'Хорошо, клиентов предупредим. Держите на связи.', 185],
  ];
  for (const [t, x, m] of driverLines) msg(d0, t, x, m, t === 'driver' ? driverNames[1] : 'Фаррух Рахимов');
  run('UPDATE conversations SET lastMessageAt = ?, lastMessage = ? WHERE id = ?', ago(185 * 60000), driverLines[3][1], d0);

  const d1 = conv('driver', { driverId: driverIds[3] }, driverNames[3]);
  const d1Lines: [string, string, number][] = [
    ['driver', 'Ак-Байтал: снег, идём медленно, цепи поставил. Температура в кузове +9.', 55],
    ['admin', 'Принято. Не рискуйте, если закроют перевал — ждите в Мургабе.', 50],
    ['driver', 'Хоп, понял.', 47],
  ];
  for (const [t, x, m] of d1Lines) msg(d1, t, x, m, t === 'driver' ? driverNames[3] : 'Фаррух Рахимов');
  run('UPDATE conversations SET lastMessageAt = ?, lastMessage = ?, unreadAdmin = 1 WHERE id = ?', ago(47 * 60000), 'Хоп, понял.', d1);

  const w0 = conv('warehouse', { warehouseId: wh.GZ }, 'Склад Гуанчжоу', 1);
  const wLines: [string, string, number][] = [
    ['warehouse', 'Доброе утро! Сегодня приняли 64 посылки, 7 без кода клиента — фото отправила в группу.', 300],
    ['admin', 'Спасибо, Ли На. Неопознанные отложите отдельно, разберём по трек-номерам.', 290],
    ['warehouse', `Трак ${createdShipments.find((x) => x.def.status === 'loading')!.code} загружаем, заполнено около 70%. Отправка завтра в 10:00.`, 35],
  ];
  for (const [t, x, m] of wLines) msg(w0, t, x, m, t === 'warehouse' ? 'Ли На' : 'Фаррух Рахимов');
  run('UPDATE conversations SET lastMessageAt = ?, lastMessage = ?, unreadAdmin = 1 WHERE id = ?', ago(35 * 60000), wLines[2][1], w0);

  const w1 = conv('warehouse', { warehouseId: wh.DU }, 'Склад Душанбе');
  msg(w1, 'warehouse', `Рейс ${createdShipments.find((x) => x.def.status === 'customs')!.code} на таможенном терминале, досмотр 2 мест. Ориентировочно выпустят сегодня к вечеру.`, 140, 'Сухроб Джураев');
  run('UPDATE conversations SET lastMessageAt = ?, lastMessage = ? WHERE id = ?', ago(140 * 60000), 'Рейс на таможенном терминале, досмотр 2 мест.', w1);

  const team = conv('team', {}, 'Команда · общий', 1);
  msg(team, 'admin', 'Коллеги, с понедельника тариф на электронику $3.6/кг. Обновите прайсы в Instagram.', 1500, 'Фаррух Рахимов');
  msg(team, 'admin', 'Сделано ✅', 1440, 'Нигина Саидова');
  run('UPDATE conversations SET lastMessageAt = ?, lastMessage = ? WHERE id = ?', ago(1440 * 60000), 'Сделано ✅', team);

  // Автоуведомления клиентам (как их отправляет система при отправке и прибытии рейса)
  const convFor = (clientId: number) => {
    const ex = get<{ id: number }>(`SELECT id FROM conversations WHERE kind = 'client' AND clientId = ?`, clientId);
    if (ex) return ex.id;
    return conv('client', { clientId }, clientName(clientId).name);
  };
  for (const cs of createdShipments) {
    const sh = get<any>('SELECT * FROM shipments WHERE id = ?', cs.id);
    if (!sh.departedAt) continue;
    const destWh = get<any>('SELECT name, address, workHours FROM warehouses WHERE id = ?', sh.destWarehouseId);
    const groups = all<{ clientId: number; n: number; sum: number }>(
      `SELECT clientId, COUNT(*) n, ROUND(SUM(price),2) sum FROM parcels WHERE shipmentId = ? AND clientId IS NOT NULL GROUP BY clientId`,
      sh.id,
    );
    for (const g of groups) {
      const c = convFor(g.clientId);
      msg(c, 'system', `Ваши посылки (${g.n} шт.) отправлены рейсом ${sh.code}. Ориентировочная дата прибытия — ${new Date(sh.plannedArrival).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}.`, (NOW - Date.parse(sh.departedAt)) / 60000 - 5, 'Карго');
      if (sh.arrivedAt)
        msg(c, 'system', `Ваши посылки прибыли на ${destWh.name} (${destWh.address}). Количество: ${g.n}. К оплате: $${g.sum}. Время работы: ${destWh.workHours}.`, (NOW - Date.parse(sh.arrivedAt)) / 60000 - 10, 'Карго');
    }
  }
  run(
    `UPDATE conversations SET lastMessageAt = (SELECT MAX(createdAt) FROM messages m WHERE m.conversationId = conversations.id),
       lastMessage = (SELECT text FROM messages m WHERE m.conversationId = conversations.id ORDER BY createdAt DESC LIMIT 1)`,
  );

  // ---------- Уведомления ----------
  const N = (kind: string, title: string, body: string, link: string, level: string, minAgo: number, read = 0) =>
    insert('notifications', { kind, title, body, link, level, read, createdAt: ago(minAgo * 60000) });
  N('risk', `Рейс ${featured.code} опаздывает`, 'Очередь на КПП Иркештам. Прогноз: +38 ч к плану.', `/shipments/${featured.id}`, 'danger', 25);
  N('risk', `Рейс ${createdShipments.find((x) => x.def.flaggedMin === 48)!.code} под риском`, 'Снегопад на перевале Ак-Байтал.', `/shipments/${createdShipments.find((x) => x.def.flaggedMin === 48)!.id}`, 'warning', 48);
  N('parcel', '7 неопознанных посылок', 'На складе Гуанчжоу посылки без кода клиента.', '/parcels?filter=unidentified', 'warning', 300);
  N('shipment', `Рейс ${createdShipments.find((x) => x.def.status === 'arrived')!.code} прибыл в Худжанд`, 'Клиенты уведомлены о готовности к выдаче.', `/shipments/${createdShipments.find((x) => x.def.status === 'arrived')!.id}`, 'success', 2000, 1);
  N('payment', 'Поступил платёж $500', 'Предоплата от ООО «Пайванд Сохтмон»', '/finance', 'success', 2900, 1);
  N('chat', 'Новое сообщение в чате', 'Клиент спрашивает адрес склада в Китае', '/chats', 'info', 9);

  // Журнал (включая то, что агенты сделали сами)
  insert('audit_log', { userId: adminId, userName: 'Фаррух Рахимов', action: 'auth.login', entity: null, entityId: null, details: null, createdAt: ago(3 * H) });
  const AUTO: [string, string, string, number][] = [
    ['Агент исключений', 'auto.flag_delays', 'Отмечено 3 задержки на КПП Иркештам и открыты инциденты', 42],
    ['Агент клиентов', 'auto.draft_messages', 'Подготовлено 12 уведомлений клиентам о новом сроке', 48],
    ['Агент маршрутов', 'auto.eta', 'Пересчитаны ETA 9 рейсов по данным GPS', 55],
    ['Агент автопарка', 'auto.fleet_check', 'Проверено топливо и пробег 14 траков, 1 на ремонте', 95],
    ['Агент-диспетчер', 'auto.load_check', 'Проверена загрузка рейсов на складах Гуанчжоу и Иу', 130],
    ['Финансовый аналитик', 'auto.report', 'Собран отчёт по выручке за неделю', 260],
  ];
  for (const [who, action, details, min] of AUTO) insert('audit_log', { userId: null, userName: who, action, entity: 'agents', entityId: null, details, createdAt: ago(min * 60000) });
}

// CLI
if (process.argv[1] && /seed\.(ts|js)$/.test(process.argv[1])) {
  const reset = process.argv.includes('--reset');
  const done = seedDatabase(reset);
  console.log(done ? '✓ Демо-данные загружены' : 'База уже заполнена (используйте --reset)');
}
