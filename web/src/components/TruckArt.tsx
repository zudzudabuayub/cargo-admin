import { useId } from 'react';

/** Иллюстрация седельного тягача с полуприцепом (вид сбоку). */
export function TruckArt({ className, kind = 'Тент', brand = 'CARGO EXPRESS', small }: { className?: string; kind?: string; brand?: string; small?: boolean }) {
  const id = useId().replace(/:/g, '');
  const reefer = kind?.toLowerCase().includes('реф');
  const container = kind?.toLowerCase().includes('контейнер');
  const van = kind?.toLowerCase().includes('фургон');
  const wheel = (cx: number, r = 25) => (
    <g key={cx}>
      <circle cx={cx} cy={226} r={r} fill="#1A1A1D" />
      <circle cx={cx} cy={226} r={r - 4} fill="#232327" />
      <circle cx={cx} cy={226} r={r * 0.55} fill={`url(#${id}rim)`} />
      <circle cx={cx} cy={226} r={r * 0.2} fill="#5B5D63" />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <circle key={a} cx={cx + Math.cos((a * Math.PI) / 180) * r * 0.36} cy={226 + Math.sin((a * Math.PI) / 180) * r * 0.36} r={1.6} fill="#6C6E74" />
      ))}
    </g>
  );

  if (van) {
    // Малотоннажный фургон для развоза
    return (
      <svg viewBox="-120 0 660 270" className={className} aria-hidden>
        <defs>
          <linearGradient id={`${id}body`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#E7E6E1" />
          </linearGradient>
          <radialGradient id={`${id}rim`}>
            <stop offset="0" stopColor="#E3E5E9" />
            <stop offset="1" stopColor="#8D9096" />
          </radialGradient>
          <linearGradient id={`${id}glass`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3C4048" />
            <stop offset="1" stopColor="#1F2227" />
          </linearGradient>
        </defs>
        <ellipse cx="210" cy="252" rx="190" ry="9" fill="#000" opacity=".1" />
        <rect x="128" y="58" width="272" height="150" rx="6" fill={`url(#${id}body)`} stroke="#D8D7D1" />
        <path d="M30 208 L30 140 Q30 108 52 92 L88 70 Q96 64 108 64 L134 64 L134 208 Z" fill={`url(#${id}body)`} stroke="#D8D7D1" />
        <path d="M46 132 L58 104 Q64 94 76 90 L116 82 L116 132 Z" fill={`url(#${id}glass)`} />
        <rect x="24" y="188" width="40" height="18" rx="5" fill="#2E2F33" />
        <rect x="27" y="168" width="10" height="8" rx="2" fill="#FFE7A3" />
        <rect x="142" y="190" width="250" height="5" rx="2" fill="#6A4CFF" opacity=".85" />
        <text x="152" y="88" fontSize="12" fontWeight="700" letterSpacing="2" fill="#B9B8B2" fontFamily="Inter, sans-serif">
          {brand}
        </text>
        {wheel(82, 24)}
        {wheel(330, 24)}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 660 270" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}trailer`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".7" stopColor="#F1F0EC" />
          <stop offset="1" stopColor="#E2E1DB" />
        </linearGradient>
        <linearGradient id={`${id}cab`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E4E3DE" />
        </linearGradient>
        <linearGradient id={`${id}glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#454A54" />
          <stop offset=".55" stopColor="#262A30" />
          <stop offset="1" stopColor="#15171B" />
        </linearGradient>
        <linearGradient id={`${id}tank`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F4F5F7" />
          <stop offset=".5" stopColor="#BFC2C8" />
          <stop offset="1" stopColor="#8E9198" />
        </linearGradient>
        <radialGradient id={`${id}rim`}>
          <stop offset="0" stopColor="#E9EBEE" />
          <stop offset="1" stopColor="#8D9096" />
        </radialGradient>
        <filter id={`${id}blur`} x="-10%" y="-200%" width="120%" height="500%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* тень */}
      <ellipse cx="335" cy="250" rx="310" ry="10" fill="#000" opacity=".16" filter={`url(#${id}blur)`} />

      {/* полуприцеп */}
      <g>
        <rect x="176" y="22" width="470" height="172" rx={container ? 3 : 7} fill={`url(#${id}trailer)`} stroke="#D6D5CF" />
        {Array.from({ length: container ? 22 : 9 }).map((_, i) => {
          const step = container ? 21 : 52;
          return <line key={i} x1={176 + step * (i + 1)} y1="26" x2={176 + step * (i + 1)} y2="190" stroke="#D9D8D2" strokeWidth={container ? 1.2 : 1} opacity={container ? 0.9 : 0.55} />;
        })}
        <rect x="176" y="22" width="470" height="7" rx="3" fill="#000" opacity=".03" />
        {reefer && (
          <g>
            <rect x="182" y="40" width="34" height="78" rx="4" fill="#E9E8E3" stroke="#D3D2CC" />
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <line key={i} x1="188" x2="210" y1={50 + i * 11} y2={50 + i * 11} stroke="#C4C3BD" strokeWidth="2" />
            ))}
          </g>
        )}
        {/* бренд */}
        <g transform={`translate(${reefer ? 236 : 206}, 54)`}>
          <rect width="22" height="22" rx="6" fill="#111113" />
          <path d="M6 8h6v6H6zM12 10h2.5L16 12v2h-4z" fill="#fff" />
          <text x="32" y="16" fontSize="14" fontWeight="700" letterSpacing="2.5" fill="#C9C8C2" fontFamily="Inter, sans-serif">
            {brand}
          </text>
        </g>
        <rect x="176" y="194" width="470" height="9" rx="2" fill="#2C2C30" />
        <rect x="184" y="203" width="270" height="10" rx="2" fill="#3A3A3F" opacity=".9" />
        <rect x="190" y="186" width="440" height="3" rx="1.5" fill="#6A4CFF" opacity=".8" />
        <rect x="636" y="172" width="8" height="14" rx="2" fill="#EF4136" />
        <rect x="636" y="152" width="8" height="10" rx="2" fill="#F5A524" />
        {[300, 380, 460].map((x) => (
          <rect key={x} x={x} y="206" width="10" height="4" rx="1" fill="#EF4136" opacity=".9" />
        ))}
      </g>

      {/* сцепка и рама тягача */}
      <rect x="120" y="196" width="92" height="12" rx="3" fill="#2A2A2E" />

      {/* кабина */}
      <g>
        <path d="M100 36 Q112 14 146 10 L172 10 L172 38 Z" fill={`url(#${id}cab)`} stroke="#D6D5CF" />
        <path d="M44 208 L22 204 L22 118 Q22 76 40 56 L54 42 Q62 34 76 34 L160 34 Q172 34 172 46 L172 208 Z" fill={`url(#${id}cab)`} stroke="#D6D5CF" />
        <path d="M34 112 Q34 82 48 66 L60 52 Q65 47 74 47 L124 47 Q128 47 128 51 L128 108 Q128 112 124 112 Z" fill={`url(#${id}glass)`} />
        <path d="M52 64 L72 48 L92 48 L56 104 L40 104 Z" fill="#fff" opacity=".08" />
        <rect x="60" y="44" width="72" height="154" rx="7" fill="none" stroke="#D3D2CC" strokeWidth="1.2" />
        <rect x="114" y="124" width="12" height="4" rx="2" fill="#B9B8B2" />
        <rect x="140" y="50" width="26" height="140" rx="4" fill="#000" opacity=".025" />
        {/* зеркало */}
        <path d="M26 66 L16 66 L16 98 L24 98" fill="none" stroke="#2A2A2E" strokeWidth="3" strokeLinecap="round" />
        <rect x="9" y="62" width="10" height="36" rx="4" fill="#2A2A2E" />
        {/* бампер, фары */}
        <rect x="16" y="182" width="48" height="24" rx="5" fill="#2C2D31" />
        <rect x="20" y="164" width="14" height="10" rx="3" fill="#FFE7A3" />
        <rect x="20" y="164" width="14" height="10" rx="3" fill="#fff" opacity=".35" />
        <rect x="22" y="138" width="6" height="18" rx="2" fill="#2C2D31" opacity=".8" />
        {/* ступени и бак */}
        <rect x="70" y="200" width="30" height="5" rx="2" fill="#2C2D31" />
        <rect x="104" y="176" width="58" height="26" rx="12" fill={`url(#${id}tank)`} />
        <rect x="104" y="186" width="58" height="2" fill="#000" opacity=".1" />
        {/* выхлоп */}
        <rect x="164" y="40" width="7" height="150" rx="3" fill="#2E2F33" opacity=".85" />
      </g>

      {/* колёса */}
      <path d="M40 212 Q40 186 76 186 Q112 186 112 212" fill="#1E1E21" />
      {wheel(76)}
      {wheel(214)}
      {wheel(268)}
      {wheel(500)}
      {wheel(554)}
      {wheel(608)}
    </svg>
  );
}
