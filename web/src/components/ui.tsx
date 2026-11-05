import clsx from 'clsx';
import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { initials, type Tone } from '../lib/format';

export { clsx };

const toneCls: Record<Tone, string> = {
  gray: 'bg-[#F1F1EF] text-[#5D5D63]',
  blue: 'bg-[#EAF3FF] text-[#2563C9]',
  purple: 'bg-accent-50 text-accent',
  amber: 'bg-warn-50 text-[#B26B00]',
  green: 'bg-ok-50 text-ok',
  dark: 'bg-ink text-white',
  red: 'bg-danger-50 text-danger',
  lime: 'bg-lime text-lime-ink',
};

export function Badge({ tone = 'gray', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={clsx('inline-flex h-[20px] items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11px] font-medium leading-none', toneCls[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

type BtnVariant = 'primary' | 'dark' | 'outline' | 'ghost' | 'danger' | 'soft';
export function Button({
  variant = 'outline',
  size = 'md',
  className,
  icon,
  children,
  loading,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={clsx(
        'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-7 px-3 text-[12px]',
        size === 'md' && 'h-9 px-4 text-[12.5px]',
        size === 'lg' && 'h-11 px-5 text-[13.5px]',
        variant === 'primary' && 'bg-accent text-white shadow-[0_1px_0_rgba(255,255,255,.2)_inset,0_4px_14px_-4px_rgba(106,76,255,.6)] hover:bg-accent-600',
        variant === 'dark' && 'bg-ink text-white hover:bg-ink-2',
        variant === 'outline' && 'border border-line-2 bg-white text-ink hover:bg-soft',
        variant === 'ghost' && 'text-ink-2 hover:bg-black/[.04]',
        variant === 'soft' && 'bg-accent-50 text-accent hover:bg-accent-100',
        variant === 'danger' && 'border border-danger-100 bg-white text-danger hover:bg-danger-50',
        className,
      )}
    >
      {loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ children, className, badge, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { badge?: number | string }) {
  return (
    <button {...rest} className={clsx('relative grid h-9 w-9 place-items-center rounded-full text-ink-2 transition hover:bg-black/[.05]', className)}>
      {children}
      {badge ? (
        <span className="absolute -right-0.5 -top-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-danger px-1 text-[9.5px] font-semibold text-white ring-2 ring-canvas">{badge}</span>
      ) : null}
    </button>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={clsx('card', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, sub, right, className }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-start justify-between gap-3 px-5 pt-4', className)}>
      <div>
        <div className="text-[13.5px] font-medium">{title}</div>
        {sub && <div className="mt-0.5 text-[11.5px] text-muted">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function Avatar({ name, color, size = 28, className, ring }: { name?: string | null; color?: string | null; size?: number; className?: string; ring?: boolean }) {
  return (
    <span
      className={clsx('inline-grid shrink-0 place-items-center rounded-full font-medium text-white', ring && 'ring-2 ring-white', className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: color ?? '#8A8A91' }}
    >
      {initials(name)}
    </span>
  );
}

export function Progress({ value, tone = 'purple', className, height = 4 }: { value: number; tone?: 'purple' | 'red' | 'green' | 'dark' | 'amber'; className?: string; height?: number }) {
  const c = { purple: 'bg-accent', red: 'bg-danger', green: 'bg-ok', dark: 'bg-ink', amber: 'bg-warn' }[tone];
  return (
    <div className={clsx('w-full overflow-hidden rounded-full bg-[#EDEDEA]', className)} style={{ height }}>
      <div className={clsx('h-full rounded-full transition-all duration-700', c)} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, items, className, size = 'md' }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={clsx('inline-flex items-center gap-0.5 rounded-full bg-[#EFEFEC] p-[3px]', className)}>
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={clsx(
            'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium transition',
            size === 'sm' ? 'h-6 px-2.5 text-[11px]' : 'h-7 px-3 text-[12px]',
            value === it.value ? 'bg-ink text-white shadow-sm' : 'text-ink-2 hover:text-ink',
          )}
        >
          {value === it.value && <span className="text-[10px]">✓</span>}
          {it.label}
          {it.count != null && <span className={clsx('num text-[10.5px]', value === it.value ? 'text-white/60' : 'text-muted')}>{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="flex items-center gap-5 border-b border-line">
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={clsx('-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 pt-1 text-[12.5px] font-medium transition', value === it.value ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink')}
        >
          {it.label}
          {it.count != null && <span className="num rounded-md bg-[#F0F0EE] px-1.5 text-[10.5px] text-ink-2">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, children, width = 520, className }: { open: boolean; onClose: () => void; children: ReactNode; width?: number; className?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-[#1b1b20]/25 p-4 pt-[8vh] backdrop-blur-[3px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={clsx('fade-up relative w-full rounded-[20px] bg-white shadow-pop', className)} style={{ maxWidth: width }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ModalHeader({ title, sub, onClose, eyebrow }: { title: ReactNode; sub?: ReactNode; onClose: () => void; eyebrow?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
      <div>
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <div className="h-display text-[21px]">{title}</div>
        {sub && <div className="mt-1 text-[12px] leading-relaxed text-muted">{sub}</div>}
      </div>
      <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-black/5 hover:text-ink">
        <X size={16} />
      </button>
    </div>
  );
}

export function Drawer({ open, onClose, children, width = 460 }: { open: boolean; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[900] bg-[#1b1b20]/20" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute bottom-2 right-2 top-2 flex flex-col overflow-hidden rounded-[20px] bg-white shadow-pop" style={{ width: `min(${width}px, calc(100vw - 16px))`, animation: 'fade-up .2s ease-out' }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, children, hint, className }: { label: ReactNode; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1.5 block text-[11.5px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={clsx('relative h-[20px] w-[34px] shrink-0 rounded-full transition', checked ? 'bg-accent' : 'bg-[#DCDCD8]')}>
      <span className={clsx('absolute top-[2px] h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[16px]' : 'left-[2px]')} />
    </button>
  );
}

export function Empty({ icon, title, sub, action }: { icon?: ReactNode; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-soft text-muted">{icon}</div>}
      <div className="text-[13.5px] font-medium">{title}</div>
      {sub && <div className="mt-1 max-w-xs text-[12px] text-muted">{sub}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} />;
}

export function Kpi({ label, value, badge, sub, onClick }: { label: string; value: ReactNode; badge?: ReactNode; sub?: ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="group min-w-0 text-left">
      <div className="label">{label}</div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="h-display num text-[28px] leading-none">{value}</span>
        {badge}
      </div>
      {sub && <div className="mt-1.5 truncate text-[11.5px] text-muted group-hover:text-ink-2">{sub}</div>}
    </button>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'red' | 'purple' | 'green' }) {
  return (
    <div className="rounded-xl bg-soft px-3 py-2.5">
      <div className="label">{label}</div>
      <div className={clsx('num mt-1 text-[17px] font-medium tracking-tight', tone === 'red' && 'text-danger', tone === 'purple' && 'text-accent', tone === 'green' && 'text-ok')}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

export function Menu({ trigger, children, align = 'right', placement = 'bottom' }: { trigger: (open: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; placement?: 'bottom' | 'top' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger(() => setOpen((o) => !o))}
      {open && (
        <div className={clsx('fade-up absolute z-50 min-w-[220px] rounded-xl bg-white p-1 shadow-pop', placement === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5', align === 'right' ? 'right-0' : 'left-0')}>{children(() => setOpen(false))}</div>
      )}
    </div>
  );
}

export function MenuItem({ icon, children, onClick, danger, sub }: { icon?: ReactNode; children: ReactNode; onClick?: () => void; danger?: boolean; sub?: ReactNode }) {
  return (
    <button onClick={onClick} className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-soft', danger && 'text-danger')}>
      {icon && <span className="text-muted">{icon}</span>}
      <span className="flex-1">
        {children}
        {sub && <span className="block text-[11px] text-muted">{sub}</span>}
      </span>
    </button>
  );
}

export function CopyButton({ text, label = 'Копировать', className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className={clsx('inline-flex h-6 items-center rounded-md px-2 text-[11px] font-medium transition', done ? 'bg-ok-50 text-ok' : 'bg-white text-ink-2 shadow-card hover:text-ink', className)}
    >
      {done ? 'Скопировано' : label}
    </button>
  );
}

export function PageHeader({ eyebrow, title, sub, right }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="label mb-1.5">{eyebrow}</div>}
        <h1 className="h-display text-[30px] leading-tight">{title}</h1>
        {sub && <div className="mt-1 text-[12.5px] text-muted">{sub}</div>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('overflow-x-auto scroll-thin', className)}>
      <table className="w-full border-separate border-spacing-0 text-[12.5px]">{children}</table>
    </div>
  );
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th className={clsx('sticky top-0 z-[1] whitespace-nowrap border-b border-line bg-white px-3 py-2.5 text-left text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted first:pl-5 last:pr-5', className)}>{children}</th>
);
export const Td = ({ children, className, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td {...rest} className={clsx('border-b border-line/70 px-3 py-2.5 align-middle first:pl-5 last:pr-5', className)}>
    {children}
  </td>
);
