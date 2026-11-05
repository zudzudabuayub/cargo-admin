// География: города, КПП и маршруты Китай → Таджикистан.
export type LatLng = [number, number];

export interface CityDef {
  code: string;
  name: string;
  nameLocal?: string;
  country: 'CN' | 'TJ' | 'KG';
  lat: number;
  lng: number;
  kind: 'hub' | 'city' | 'border';
}

export const CITIES: CityDef[] = [
  // Китай
  { code: 'CAN', name: 'Гуанчжоу', nameLocal: '广州', country: 'CN', lat: 23.13, lng: 113.26, kind: 'hub' },
  { code: 'YIW', name: 'Иу', nameLocal: '义乌', country: 'CN', lat: 29.31, lng: 120.08, kind: 'hub' },
  { code: 'SZX', name: 'Шэньчжэнь', nameLocal: '深圳', country: 'CN', lat: 22.54, lng: 114.06, kind: 'city' },
  { code: 'URC', name: 'Урумчи', nameLocal: '乌鲁木齐', country: 'CN', lat: 43.83, lng: 87.62, kind: 'hub' },
  { code: 'KHG', name: 'Кашгар', nameLocal: '喀什', country: 'CN', lat: 39.47, lng: 75.99, kind: 'hub' },
  { code: 'XIA', name: 'Сиань', nameLocal: '西安', country: 'CN', lat: 34.34, lng: 108.94, kind: 'city' },
  { code: 'LHW', name: 'Ланьчжоу', nameLocal: '兰州', country: 'CN', lat: 36.06, lng: 103.83, kind: 'city' },
  // Пограничные переходы
  { code: 'IRK', name: 'Иркештам', nameLocal: 'КПП CN–KG', country: 'KG', lat: 39.68, lng: 73.92, kind: 'border' },
  { code: 'KUL', name: 'Кульма', nameLocal: 'КПП CN–TJ', country: 'TJ', lat: 38.1, lng: 74.85, kind: 'border' },
  { code: 'KRM', name: 'Карамык', nameLocal: 'КПП KG–TJ', country: 'TJ', lat: 39.47, lng: 71.93, kind: 'border' },
  // Кыргызстан (транзит)
  { code: 'OSS', name: 'Ош', country: 'KG', lat: 40.51, lng: 72.8, kind: 'city' },
  { code: 'STS', name: 'Сары-Таш', country: 'KG', lat: 39.73, lng: 73.25, kind: 'city' },
  // Таджикистан
  { code: 'DYU', name: 'Душанбе', nameLocal: 'Душанбе', country: 'TJ', lat: 38.56, lng: 68.77, kind: 'hub' },
  { code: 'LBD', name: 'Худжанд', nameLocal: 'Хуҷанд', country: 'TJ', lat: 40.28, lng: 69.62, kind: 'hub' },
  { code: 'KLB', name: 'Куляб', nameLocal: 'Кӯлоб', country: 'TJ', lat: 37.91, lng: 69.78, kind: 'hub' },
  { code: 'BKT', name: 'Бохтар', nameLocal: 'Бохтар', country: 'TJ', lat: 37.84, lng: 68.78, kind: 'hub' },
  { code: 'KHO', name: 'Хорог', nameLocal: 'Хоруғ', country: 'TJ', lat: 37.49, lng: 71.55, kind: 'city' },
  { code: 'MUR', name: 'Мургаб', country: 'TJ', lat: 38.17, lng: 73.96, kind: 'city' },
  { code: 'IST', name: 'Истаравшан', country: 'TJ', lat: 39.91, lng: 69.0, kind: 'city' },
  { code: 'TUR', name: 'Турсунзаде', country: 'TJ', lat: 38.51, lng: 68.23, kind: 'city' },
  { code: 'PJK', name: 'Пенджикент', country: 'TJ', lat: 39.5, lng: 67.61, kind: 'city' },
  { code: 'ISF', name: 'Исфара', country: 'TJ', lat: 40.12, lng: 70.63, kind: 'city' },
  { code: 'VAH', name: 'Вахдат', country: 'TJ', lat: 38.56, lng: 69.02, kind: 'city' },
  { code: 'HIS', name: 'Гиссар', country: 'TJ', lat: 38.53, lng: 68.55, kind: 'city' },
  { code: 'RSH', name: 'Рашт', country: 'TJ', lat: 39.03, lng: 70.38, kind: 'city' },
];

const cityByCode = new Map(CITIES.map((c) => [c.code, c]));

type Waypoint = string | LatLng;

// Общий участок Урумчи → Кашгар
const URC_KHG: Waypoint[] = ['URC', [42.79, 88.65], [41.76, 86.15], [41.72, 82.96], [41.17, 80.26], [39.71, 76.17], 'KHG'];
// Гуанчжоу → Урумчи (через Ухань, Сиань, Ланьчжоу, Хами)
const CAN_URC: Waypoint[] = [
  'CAN', [28.23, 112.94], [30.59, 114.3], [34.75, 113.62], 'XIA', 'LHW', [38.93, 100.45], [39.73, 98.49], [42.82, 93.51], [42.95, 89.19], 'URC',
];
const YIW_URC: Waypoint[] = [
  'YIW', [28.68, 115.86], [30.59, 114.3], [34.75, 113.62], 'XIA', 'LHW', [38.93, 100.45], [39.73, 98.49], [42.82, 93.51], [42.95, 89.19], 'URC',
];
// Кашгар → Душанбе через Иркештам и Карамык
const KHG_DYU_IRK: Waypoint[] = ['KHG', [39.71, 75.25], 'IRK', 'STS', [39.55, 72.2], 'KRM', [39.22, 71.21], 'RSH', [38.72, 69.7], 'VAH', 'DYU'];
// Кашгар → Душанбе через Кульму (Памирский тракт)
const KHG_DYU_KUL: Waypoint[] = [
  'KHG', [38.95, 75.45], [38.43, 75.05], [37.77, 75.23], 'KUL', 'MUR', [37.75, 73.47], 'KHO', [37.95, 71.55], [38.43, 70.79], 'KLB', 'VAH', 'DYU',
];
// Кашгар → Худжанд через Иркештам и Ош
const KHG_LBD: Waypoint[] = ['KHG', [39.71, 75.25], 'IRK', 'STS', [40.1, 73.3], 'OSS', [40.06, 70.82], 'ISF', [40.29, 70.42], 'LBD'];

const join = (...parts: Waypoint[][]) => parts.reduce<Waypoint[]>((acc, p) => (acc.length ? acc.concat(p.slice(1)) : p.slice()), []);

export interface RouteDef {
  code: string;
  name: string;
  via: string;
  transport: 'auto' | 'air' | 'rail';
  days: number;
  waypoints: Waypoint[];
}

export const ROUTES: RouteDef[] = [
  { code: 'CAN-DYU-IRK', name: 'Гуанчжоу → Душанбе', via: 'через Иркештам', transport: 'auto', days: 16, waypoints: join(CAN_URC, URC_KHG, KHG_DYU_IRK) },
  { code: 'YIW-DYU-IRK', name: 'Иу → Душанбе', via: 'через Иркештам', transport: 'auto', days: 17, waypoints: join(YIW_URC, URC_KHG, KHG_DYU_IRK) },
  { code: 'URC-DYU-IRK', name: 'Урумчи → Душанбе', via: 'через Иркештам', transport: 'auto', days: 7, waypoints: join(URC_KHG, KHG_DYU_IRK) },
  { code: 'URC-DYU-KUL', name: 'Урумчи → Душанбе', via: 'через Кульму (Памир)', transport: 'auto', days: 8, waypoints: join(URC_KHG, KHG_DYU_KUL) },
  { code: 'CAN-DYU-KUL', name: 'Гуанчжоу → Душанбе', via: 'через Кульму (Памир)', transport: 'auto', days: 17, waypoints: join(CAN_URC, URC_KHG, KHG_DYU_KUL) },
  { code: 'URC-LBD-OSH', name: 'Урумчи → Худжанд', via: 'через Иркештам и Ош', transport: 'auto', days: 7, waypoints: join(URC_KHG, KHG_LBD) },
  { code: 'CAN-LBD-OSH', name: 'Гуанчжоу → Худжанд', via: 'через Иркештам и Ош', transport: 'auto', days: 16, waypoints: join(CAN_URC, URC_KHG, KHG_LBD) },
  { code: 'URC-DYU-AIR', name: 'Урумчи → Душанбе', via: 'авиа', transport: 'air', days: 2, waypoints: ['URC', 'DYU'] },
  { code: 'DYU-KLB', name: 'Душанбе → Куляб', via: 'развоз по Таджикистану', transport: 'auto', days: 1, waypoints: ['DYU', 'VAH', [38.2, 69.4], 'KLB'] },
  { code: 'DYU-BKT', name: 'Душанбе → Бохтар', via: 'развоз по Таджикистану', transport: 'auto', days: 1, waypoints: ['DYU', [38.2, 68.8], 'BKT'] },
];

export function haversineKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export interface BuiltRoute {
  path: LatLng[];
  stops: { code: string; name: string; kind: string; country: string; index: number; at: number }[];
  distanceKm: number;
}

/** Превращает список точек в геометрию с долями пути для каждой остановки. */
export function buildRoute(waypoints: Waypoint[], roadFactor = 1.18): BuiltRoute {
  const path: LatLng[] = [];
  const stopIdx: { code: string; index: number }[] = [];
  for (const w of waypoints) {
    if (typeof w === 'string') {
      const c = cityByCode.get(w);
      if (!c) throw new Error(`Unknown city ${w}`);
      stopIdx.push({ code: w, index: path.length });
      path.push([c.lat, c.lng]);
    } else path.push(w);
  }
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversineKm(path[i - 1], path[i]));
  const total = cum[cum.length - 1] || 1;
  const stops = stopIdx.map((s) => {
    const c = cityByCode.get(s.code)!;
    return { code: s.code, name: c.name, kind: c.kind, country: c.country, index: s.index, at: cum[s.index] / total };
  });
  return { path, stops, distanceKm: Math.round(total * roadFactor) };
}

/** Точка на пути по доле прохождения 0..1 */
export function pointAt(path: LatLng[], progress: number): LatLng {
  if (path.length === 1) return path[0];
  const p = Math.max(0, Math.min(1, progress));
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversineKm(path[i - 1], path[i]));
  const target = p * cum[cum.length - 1];
  for (let i = 1; i < path.length; i++) {
    if (cum[i] >= target) {
      const seg = cum[i] - cum[i - 1] || 1;
      const t = (target - cum[i - 1]) / seg;
      return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t];
    }
  }
  return path[path.length - 1];
}

export const getCityDef = (code: string) => cityByCode.get(code);
