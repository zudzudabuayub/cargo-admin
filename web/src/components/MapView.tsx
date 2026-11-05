import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import region from '../assets/region.geo.json';

export type LatLng = [number, number];
export interface MapShipment {
  id: number;
  code: string;
  risk: string;
  status: string;
  transport?: string;
  progress: number;
  position: { lat: number; lng: number };
  path?: LatLng[];
  label?: string;
}
export interface MapPlace {
  id?: number;
  name: string;
  lat: number;
  lng: number;
  kind: 'warehouse-cn' | 'warehouse-tj' | 'border' | 'city';
  label?: string;
}

const CITY_LABELS: (MapPlace & { minZoom?: number })[] = [
  { name: 'Гуанчжоу', lat: 23.13, lng: 113.26, kind: 'city' },
  { name: 'Иу', lat: 29.31, lng: 120.08, kind: 'city' },
  { name: 'Урумчи', lat: 43.83, lng: 87.62, kind: 'city' },
  { name: 'Кашгар', lat: 39.47, lng: 75.99, kind: 'city' },
  { name: 'Сиань', lat: 34.34, lng: 108.94, kind: 'city' },
  { name: 'Ланьчжоу', lat: 36.06, lng: 103.83, kind: 'city' },
  { name: 'Душанбе', lat: 38.56, lng: 68.77, kind: 'city' },
  { name: 'Худжанд', lat: 40.28, lng: 69.62, kind: 'city', minZoom: 5 },
  { name: 'Куляб', lat: 37.91, lng: 69.78, kind: 'city', minZoom: 6 },
  { name: 'Бохтар', lat: 37.84, lng: 68.78, kind: 'city', minZoom: 6 },
  { name: 'Хорог', lat: 37.49, lng: 71.55, kind: 'city', minZoom: 5.5 },
  { name: 'Ош', lat: 40.51, lng: 72.8, kind: 'city', minZoom: 5.5 },
  { name: 'Мургаб', lat: 38.17, lng: 73.96, kind: 'city', minZoom: 5.5 },
];

function hav(a: LatLng, b: LatLng) {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
/** Делит путь на пройденную часть и остаток по доле progress */
export function splitPath(path: LatLng[], progress: number, extra = 0): [LatLng[], LatLng[], LatLng[]] {
  if (path.length < 2) return [path, path, []];
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + hav(path[i - 1], path[i]));
  const total = cum[cum.length - 1];
  const at = (p: number): { pt: LatLng; idx: number } => {
    const target = Math.max(0, Math.min(1, p)) * total;
    for (let i = 1; i < path.length; i++) {
      if (cum[i] >= target) {
        const t = (target - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
        return { pt: [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t], idx: i };
      }
    }
    return { pt: path[path.length - 1], idx: path.length };
  };
  const a = at(progress);
  const done = [...path.slice(0, a.idx), a.pt];
  const rest = [a.pt, ...path.slice(a.idx)];
  let late: LatLng[] = [];
  if (extra > 0) {
    const b = at(progress + extra);
    late = [a.pt, ...path.slice(a.idx, b.idx), b.pt];
  }
  return [done, rest, late];
}

const truckSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>`;
const planeSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>`;
const whSvg = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/></svg>`;

function truckIcon(s: MapShipment, selected: boolean) {
  const ring = s.risk === 'delayed' ? '#EF4136' : s.risk === 'risk' ? '#F5A524' : selected ? '#6A4CFF' : '#ffffff';
  const size = selected ? 34 : 26;
  const pulse = s.risk !== 'ok' ? `<span class="pulse-ring" style="position:absolute;inset:0;border-radius:999px;background:${ring};opacity:.5"></span>` : '';
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="position:relative;width:${size}px;height:${size}px">${pulse}<div style="position:relative;width:${size}px;height:${size}px;border-radius:999px;background:#111113;color:#fff;display:grid;place-items:center;box-shadow:0 0 0 ${selected ? 4 : 3}px ${ring},0 6px 14px -4px rgba(0,0,0,.4)">${s.transport === 'air' ? planeSvg : truckSvg}</div></div>`,
  });
}

function placeIcon(p: MapPlace) {
  if (p.kind === 'border')
    return L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8], html: `<div style="width:16px;height:16px;border-radius:999px;border:3px solid #F5A524;background:#fff;box-shadow:0 0 0 3px rgba(245,165,36,.18)"></div>` });
  if (p.kind === 'city')
    return L.divIcon({ className: '', iconSize: [6, 6], iconAnchor: [3, 3], html: `<div style="width:6px;height:6px;border-radius:999px;background:#9B9BA0"></div>` });
  const color = p.kind === 'warehouse-cn' ? '#EF4136' : '#6A4CFF';
  return L.divIcon({
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div style="width:22px;height:22px;border-radius:7px;background:#fff;color:${color};display:grid;place-items:center;box-shadow:0 0 0 1.5px ${color},0 4px 10px -3px rgba(0,0,0,.3)">${whSvg}</div>`,
  });
}

export function MapView({
  shipments = [],
  places = [],
  selectedId,
  onSelect,
  altPath,
  className,
  interactive = true,
  fitKey,
  tiles = true,
  cityLabels = true,
  focusSelected,
}: {
  shipments?: MapShipment[];
  places?: MapPlace[];
  selectedId?: number | null;
  onSelect?: (id: number) => void;
  altPath?: LatLng[] | null;
  className?: string;
  interactive?: boolean;
  fitKey?: string | number;
  tiles?: boolean;
  cityLabels?: boolean;
  focusSelected?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef<string | number | undefined>(undefined);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, {
      zoomControl: interactive,
      attributionControl: tiles,
      scrollWheelZoom: interactive,
      dragging: true,
      doubleClickZoom: interactive,
      minZoom: 3,
      maxZoom: 12,
      zoomSnap: 0.25,
      worldCopyJump: false,
    }).setView([37, 92], 4);
    if (interactive) m.zoomControl.setPosition('topright');
    m.createPane('base');
    m.getPane('base')!.style.zIndex = '150';
    L.geoJSON(region as any, {
      pane: 'base',
      interactive: false,
      style: (f) => {
        const id = f?.properties?.id;
        const highlight = id === '762';
        const transit = id === '417' || id === '156';
        return { color: '#CFCFCA', weight: highlight ? 1.4 : 0.9, fillColor: highlight ? '#F1EEFF' : transit ? '#FAFAF8' : '#F3F3F0', fillOpacity: 1 };
      },
    }).addTo(m);
    if (tiles) {
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap, © CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
        opacity: 0.9,
      }).addTo(m);
    }
    m.createPane('labels');
    m.getPane('labels')!.style.zIndex = '450';
    m.getPane('labels')!.style.pointerEvents = 'none';
    if (cityLabels) {
      const labelMarkers = CITY_LABELS.map((c) => ({
        c,
        mk: L.marker([c.lat, c.lng], {
          pane: 'labels',
          interactive: false,
          icon: L.divIcon({ className: '', iconSize: [0, 0], html: `<div style="transform:translate(14px,-7px);white-space:nowrap;font-size:10.5px;color:#7a7a80;font-weight:500;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff">${c.name}</div>` }),
        }),
      }));
      const sync = () => {
        const z = m.getZoom();
        for (const { c, mk } of labelMarkers) {
          const show = z >= (c.minZoom ?? 0);
          if (show && !m.hasLayer(mk)) mk.addTo(m);
          if (!show && m.hasLayer(mk)) mk.remove();
        }
      };
      m.on('zoomend', sync);
      sync();
    }
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    fitted.current = undefined;
    const ro = new ResizeObserver(() => map.current === m && m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      map.current = null;
      try {
        m.stop();
        m.remove();
      } catch {
        /* карта уже удалена */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const bounds = L.latLngBounds([]);
    const sorted = [...shipments].sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId));
    for (const s of sorted) {
      const sel = s.id === selectedId;
      const dim = selectedId != null && !sel;
      if (s.path && s.path.length > 1) {
        const [done, rest, late] = splitPath(s.path, s.progress, s.risk === 'delayed' ? 0.06 : s.risk === 'risk' ? 0.04 : 0);
        const isAir = s.transport === 'air';
        L.polyline(rest, { color: '#2A2A2E', weight: sel ? 2.4 : 1.6, opacity: dim ? 0.25 : 0.7, dashArray: isAir ? '4 6' : undefined, interactive: false }).addTo(g);
        L.polyline(done, { color: '#6A4CFF', weight: sel ? 3.6 : 2.4, opacity: dim ? 0.3 : 0.95, dashArray: isAir ? '4 6' : undefined, interactive: false }).addTo(g);
        if (late.length > 1) L.polyline(late, { color: s.risk === 'delayed' ? '#EF4136' : '#F5A524', weight: sel ? 4.5 : 3.5, opacity: dim ? 0.35 : 1, interactive: false }).addTo(g);
        if (!selectedId || sel) s.path.forEach((p) => bounds.extend(p));
      }
      const mk = L.marker([s.position.lat, s.position.lng], { icon: truckIcon(s, sel), zIndexOffset: sel ? 1000 : s.risk !== 'ok' ? 500 : 0, opacity: dim ? 0.75 : 1 }).addTo(g);
      mk.bindTooltip(`<b>${s.code}</b>${s.label ? `<br/><span style="color:#8a8a91">${s.label}</span>` : ''}`, { className: 'map-tip', direction: 'right', offset: [14, 0], permanent: sel });
      if (onSelect) mk.on('click', () => onSelect(s.id));
      bounds.extend([s.position.lat, s.position.lng]);
    }
    if (altPath && altPath.length > 1) {
      L.polyline(altPath, { color: '#6A4CFF', weight: 2.4, dashArray: '2 7', lineCap: 'round', opacity: 0.95, interactive: false }).addTo(g);
      altPath.forEach((p) => bounds.extend(p));
    }
    for (const p of places) {
      const mk = L.marker([p.lat, p.lng], { icon: placeIcon(p), zIndexOffset: -100 }).addTo(g);
      mk.bindTooltip(`<b>${p.name}</b>${p.label ? `<br/><span style="color:#8a8a91">${p.label}</span>` : ''}`, { className: 'map-tip', direction: 'top', offset: [0, -10] });
      if (!shipments.length) bounds.extend([p.lat, p.lng]);
    }
    const key = `${fitKey ?? ''}|${focusSelected ? selectedId : ''}`;
    if (bounds.isValid() && fitted.current !== key) {
      const first = fitted.current === undefined;
      fitted.current = key;
      const fit = () => {
        if (map.current !== m) return;
        m.invalidateSize();
        m.fitBounds(bounds, { padding: [28, 28], maxZoom: 7, animate: !first });
      };
      if (first) requestAnimationFrame(fit);
      else fit();
    }
  }, [shipments, places, selectedId, altPath, onSelect, fitKey, focusSelected]);

  return <div ref={el} className={className} />;
}
