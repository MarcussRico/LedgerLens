import type { ReactNode } from 'react'
import { cn } from '../lib/utils'
import { usePointerEdge } from '../lib/hooks'
import { Derived } from '../components/ui/primitives'

/** A working panel. The 1px edge-light follows the cursor; transform/opacity only. */
export function Panel({
  title, note, children, className, right,
}: { title?: string; note?: string; children: ReactNode; className?: string; right?: ReactNode }) {
  const ref = usePointerEdge<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className={cn('relative h-full border border-[var(--color-line)] bg-[var(--color-panel)]', className)}
      style={{ ['--edge' as string]: 0, ['--px' as string]: '50%', ['--py' as string]: '50%' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: 'var(--edge)',
          padding: 1,
          background: 'radial-gradient(14rem 14rem at var(--px) var(--py), color-mix(in oklab, var(--color-gold) 55%, transparent), transparent 70%)',
          WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
        }}
      />
      {(title || right) && (
        <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-line)] px-4 py-2.5">
          <div className="min-w-0">
            {title && <h4 className="truncate font-sans text-[0.8125rem] font-medium text-[var(--color-paper)]">{title}</h4>}
            {note && <p className="mt-0.5 truncate font-mono text-[0.625rem] uppercase tracking-[0.1em] text-[var(--color-muted)]">{note}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

export function TileGrid({ children }: { children: ReactNode }) {
  return <div className="grid h-full grid-cols-2 gap-px border border-[var(--color-line)] bg-[var(--color-line)]">{children}</div>
}

export function Tile({
  label, value, sub, accent, metric,
}: { label: string; value: ReactNode; sub?: string; accent?: 'gold' | 'verify' | 'signal'; metric?: string }) {
  const colour = accent === 'gold' ? 'var(--color-gold)' : accent === 'verify' ? 'var(--color-verify)'
    : accent === 'signal' ? 'var(--color-signal)' : 'var(--color-paper)'
  const inner = (
    <p className="num mt-2 text-[clamp(1.125rem,2.4vw,1.75rem)] leading-none tracking-tight" style={{ color: colour }}>{value}</p>
  )
  return (
    <div className="bg-[var(--color-panel)] px-4 py-4">
      <p className="kicker truncate">{label}</p>
      {metric ? <Derived metric={metric}>{inner}</Derived> : inner}
      {sub && <p className="mt-1.5 truncate font-mono text-[0.625rem] text-[var(--color-muted)]">{sub}</p>}
    </div>
  )
}
