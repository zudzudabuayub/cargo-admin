// SQLite через встроенный модуль node:sqlite (Node 22.13+), без нативных зависимостей.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// Скрываем ExperimentalWarning для node:sqlite, остальные предупреждения оставляем.
const origEmit = process.emitWarning.bind(process);
process.emitWarning = ((warning: any, ...rest: any[]) => {
  const text = typeof warning === 'string' ? warning : warning?.message ?? '';
  if (text.includes('SQLite')) return;
  return (origEmit as any)(warning, ...rest);
}) as typeof process.emitWarning;

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.resolve(process.cwd(), 'data', 'cargo.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');

type Param = string | number | bigint | null | Uint8Array;
const cache = new Map<string, ReturnType<typeof db.prepare>>();
function stmt(sql: string) {
  let s = cache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    cache.set(sql, s);
  }
  return s;
}

export function norm(v: unknown): Param {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && !(v instanceof Uint8Array)) return JSON.stringify(v);
  return v as Param;
}

export function all<T = any>(sql: string, ...params: unknown[]): T[] {
  return stmt(sql).all(...params.map(norm)) as T[];
}
export function get<T = any>(sql: string, ...params: unknown[]): T | undefined {
  return stmt(sql).get(...params.map(norm)) as T | undefined;
}
export function run(sql: string, ...params: unknown[]) {
  return stmt(sql).run(...params.map(norm));
}
export function insert(table: string, obj: Record<string, unknown>): number {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  const res = run(
    `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    ...keys.map((k) => obj[k]),
  );
  return Number(res.lastInsertRowid);
}
export function update(table: string, id: number | string, obj: Record<string, unknown>, key = 'id') {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  if (!keys.length) return;
  run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ${key} = ?`, ...keys.map((k) => obj[k]), id);
}

let depth = 0;
export function tx<T>(fn: () => T): T {
  if (depth > 0) return fn();
  depth++;
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

export const nowIso = () => new Date().toISOString();
export const parseJson = <T>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string' || !s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone TEXT,
  role TEXT NOT NULL DEFAULT 'manager', passwordHash TEXT NOT NULL, warehouseId INTEGER,
  color TEXT, createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, kind TEXT NOT NULL, subjectId INTEGER NOT NULL, createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS otp_codes (
  phone TEXT PRIMARY KEY, code TEXT NOT NULL, expiresAt TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cities (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, nameLocal TEXT,
  country TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, kind TEXT NOT NULL DEFAULT 'city'
);
CREATE TABLE IF NOT EXISTS warehouses (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, country TEXT NOT NULL,
  cityId INTEGER NOT NULL REFERENCES cities(id), role TEXT NOT NULL,
  address TEXT NOT NULL, addressLocal TEXT, receiverName TEXT, receiverPhone TEXT, zip TEXT,
  phone TEXT, manager TEXT, managerPhone TEXT, workHours TEXT, capacityM3 REAL, active INTEGER NOT NULL DEFAULT 1,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, phone2 TEXT,
  email TEXT, telegram TEXT, cityId INTEGER REFERENCES cities(id), warehouseId INTEGER REFERENCES warehouses(id),
  address TEXT, company TEXT, type TEXT NOT NULL DEFAULT 'individual', status TEXT NOT NULL DEFAULT 'active',
  discount REAL NOT NULL DEFAULT 0, source TEXT, notes TEXT, color TEXT, createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE TABLE IF NOT EXISTS drivers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, license TEXT, citizenship TEXT,
  experienceYears INTEGER, status TEXT NOT NULL DEFAULT 'available', rating REAL, color TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS trucks (
  id INTEGER PRIMARY KEY, plate TEXT UNIQUE NOT NULL, trailerPlate TEXT, model TEXT NOT NULL, kind TEXT NOT NULL,
  capacityKg REAL NOT NULL, capacityM3 REAL NOT NULL, year INTEGER, status TEXT NOT NULL DEFAULT 'available',
  driverId INTEGER REFERENCES drivers(id), fuel REAL, odometer REAL, lat REAL, lng REAL, speed REAL,
  lastSeenAt TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, via TEXT, transport TEXT NOT NULL DEFAULT 'auto',
  distanceKm REAL NOT NULL, days REAL NOT NULL, path TEXT NOT NULL, stops TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, routeId INTEGER NOT NULL REFERENCES routes(id),
  truckId INTEGER REFERENCES trucks(id), driverId INTEGER REFERENCES drivers(id),
  originWarehouseId INTEGER REFERENCES warehouses(id), destWarehouseId INTEGER REFERENCES warehouses(id),
  status TEXT NOT NULL DEFAULT 'loading', transport TEXT NOT NULL DEFAULT 'auto',
  plannedDeparture TEXT, departedAt TEXT, plannedArrival TEXT, etaAt TEXT, arrivedAt TEXT,
  progress REAL NOT NULL DEFAULT 0, risk TEXT NOT NULL DEFAULT 'ok', delayReason TEXT, delayHours REAL NOT NULL DEFAULT 0,
  speed REAL, delayNotifiedAt TEXT, sealNumber TEXT, declaration TEXT, trackingToken TEXT UNIQUE, notes TEXT,
  createdAt TEXT NOT NULL, flaggedAt TEXT
);
CREATE TABLE IF NOT EXISTS shipment_events (
  id INTEGER PRIMARY KEY, shipmentId INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  type TEXT NOT NULL, title TEXT NOT NULL, description TEXT, cityId INTEGER, actor TEXT, at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sev_ship ON shipment_events(shipmentId);
CREATE TABLE IF NOT EXISTS tariffs (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, transport TEXT NOT NULL DEFAULT 'auto',
  pricePerKg REAL NOT NULL, pricePerM3 REAL NOT NULL, minCharge REAL NOT NULL DEFAULT 0,
  daysMin INTEGER, daysMax INTEGER, description TEXT, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS parcels (
  id INTEGER PRIMARY KEY, trackNumber TEXT NOT NULL, carrier TEXT, clientId INTEGER REFERENCES clients(id),
  description TEXT, category TEXT, places INTEGER NOT NULL DEFAULT 1, weightKg REAL, volumeM3 REAL,
  declaredValue REAL, status TEXT NOT NULL DEFAULT 'expected', warehouseId INTEGER REFERENCES warehouses(id),
  destWarehouseId INTEGER REFERENCES warehouses(id), shipmentId INTEGER REFERENCES shipments(id),
  tariffId INTEGER REFERENCES tariffs(id), price REAL, paid INTEGER NOT NULL DEFAULT 0, shelf TEXT,
  receivedAt TEXT, shippedAt TEXT, arrivedAt TEXT, deliveredAt TEXT, createdAt TEXT NOT NULL, notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_parcels_client ON parcels(clientId);
CREATE INDEX IF NOT EXISTS idx_parcels_ship ON parcels(shipmentId);
CREATE INDEX IF NOT EXISTS idx_parcels_track ON parcels(trackNumber);
CREATE TABLE IF NOT EXISTS parcel_events (
  id INTEGER PRIMARY KEY, parcelId INTEGER NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  status TEXT NOT NULL, note TEXT, warehouseId INTEGER, at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pev_parcel ON parcel_events(parcelId);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY, clientId INTEGER NOT NULL REFERENCES clients(id), amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD', amountUsd REAL NOT NULL, method TEXT NOT NULL, note TEXT,
  parcelIds TEXT, userId INTEGER, createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pay_client ON payments(clientId);
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, clientId INTEGER REFERENCES clients(id), driverId INTEGER REFERENCES drivers(id),
  warehouseId INTEGER REFERENCES warehouses(id), title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
  pinned INTEGER NOT NULL DEFAULT 0, unreadAdmin INTEGER NOT NULL DEFAULT 0, unreadOther INTEGER NOT NULL DEFAULT 0,
  lastMessageAt TEXT, lastMessage TEXT, createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, conversationId INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  senderType TEXT NOT NULL, senderId INTEGER, senderName TEXT, text TEXT NOT NULL, meta TEXT, createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversationId);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT, link TEXT, level TEXT NOT NULL DEFAULT 'info',
  read INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS shares (
  token TEXT PRIMARY KEY, shipmentId INTEGER REFERENCES shipments(id), parcelId INTEGER REFERENCES parcels(id),
  showMap INTEGER NOT NULL DEFAULT 1, showDriver INTEGER NOT NULL DEFAULT 0, showCargo INTEGER NOT NULL DEFAULT 1,
  expires TEXT NOT NULL DEFAULT 'after_delivery_24h', createdAt TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY, userId INTEGER, userName TEXT, action TEXT NOT NULL, entity TEXT, entityId INTEGER,
  details TEXT, createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value TEXT NOT NULL );
`;

db.exec(SCHEMA);

export function getSetting<T = string>(key: string, fallback: T): T {
  const row = get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  if (!row) return fallback;
  return parseJson<T>(row.value, fallback);
}
export function setSetting(key: string, value: unknown) {
  run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value),
  );
}
