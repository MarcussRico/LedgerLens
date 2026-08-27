import { type ReactNode, type ElementType, useId, useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { animate } from 'animejs'
import * as Tooltip from '@radix-ui/react-tooltip'
import { ArrowUpRight } from 'lucide-react'
import { cn, formatINR } from '../../lib/utils'
import { useCountUp, useInView } from '../../lib/hooks'
import { citationById } from '../../data/citations'
import { metricById } from '../../data/metrics'

/* ── Section shell: number in the margin, sticky as the section scrolls ── */
export function Section({
  n, id, title, kicker, children, className, wide = false,
}: {
  n: string; id: string; title?: ReactNode; kicker?: string
  children: ReactNode; className?: string; wide?: boolean
}) {
  return (
    <section
      id={id}
      data-section={n}
      className={cn('relative', className)}
      style={{ paddingBlock: 'clamp(6rem, 14vh, 11rem)' }}
      aria-labelledby={title ? `${id}-h` : undefined}
    >
      <div className={cn('shell relative', !wide && 'grid12')}>
        <div className="pointer-events-none absolute left-0 top-0 hidden h-full lg:block"
          style={{ width: 'var(--gutter)', marginLeft: 'calc(var(--gutter) * -1)' }}>
          <div className="sticky top-28 num text-2xs text-[var(--color-muted)] tabular-nums"
            style={{ paddingLeft: 'clamp(0.75rem, 2vw, 2rem)' }}>
            {n}
          </div>
        </div>
        {wide ? children : (
          <div className="col-span-12">
            {(kicker || title) && (
              <Reveal>
                {kicker && <p className="kicker mb-4">{kicker}</p>}
                {title && <h2 id={`${id}-h`} className="max-w-[18ch] text-[clamp(2rem,5vw,3.75rem)]">{title}</h2>}
              </Reveal>
            )}
            {children}
          </div>
        )}
      </div>
    </section>
  )
}

/* ── Entrance. opacity + y only. Restraint reads as confidence. ── */
export function Reveal({
  children, delay = 0, as = 'div', className,
}: { children: ReactNode; delay?: number; as?: ElementType; className?: string }) {
  const M = motion[as as 'div']
  return (
    <M
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-15% 0px' }}
      transition={{ duration: 0.62, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </M>
  )
}

export function Stagger({ children, className, gap = 0.055 }: { children: ReactNode[]; className?: string; gap?: number }) {
  return (
    <div className={className}>
      {children.map((c, i) => <Reveal key={i} delay={i * gap}>{c}</Reveal>)}
    </div>
  )
}

/* ── Ticker: anime.js counts, in view, once. ── */
export function Ticker({
  to, format = (n) => Math.round(n).toLocaleString('en-IN'), className, duration = 1400, delay = 0, live,
}: {
  to: number
  format?: (n: number) => string
  className?: string
  duration?: number
  delay?: number
  /** when supplied, the ticker re-targets on change instead of counting from zero */
  live?: number
}) {
  const [wrapRef, inView] = useInView<HTMLSpanElement>('-10% 0px')
  const { ref, retarget } = useCountUp(to, { duration, format, enabled: inView, delay })
  const key = live ?? to
  useTickerRetarget(key, retarget, inView)
  useReplayOnKey(ref, to, format, inView)
  return (
    <span ref={wrapRef} className={cn('num', className)}>
      <span ref={ref} data-ticker={to}>{format(0)}</span>
    </span>
  )
}

function useTickerRetarget(key: number, retarget: (n: number) => void, ready: boolean) {
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (ready) retarget(key)
  }, [key, retarget, ready])
}

/** Presenter key `R` replays every ticker currently on screen. */
function useReplayOnKey(
  ref: React.RefObject<HTMLSpanElement | null>,
  to: number,
  format: (n: number) => string,
  inView: boolean,
) {
  const fmt = useRef(format)
  fmt.current = format
  useEffect(() => {
    if (!inView) return
    const on = () => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      if (r.bottom < 0 || r.top > window.innerHeight) return
      const state = { v: 0 }
      animate(state, {
        v: to, duration: 1400, ease: 'outExpo',
        onUpdate: () => { if (ref.current) ref.current.textContent = fmt.current(state.v) },
      })
    }
    window.addEventListener('ll:replay-tickers', on)
    return () => window.removeEventListener('ll:replay-tickers', on)
  }, [ref, to, inView])
}

/* ── Citation chip. Every claim on this site carries one. ── */
export function Cite({ id, className }: { id: string; className?: string }) {
  const c = citationById.get(id)
  if (!c) return null
  return (
    <a
      href={c.url} target="_blank" rel="noreferrer"
      className={cn(
        'group inline-flex max-w-full items-baseline gap-1.5 border-b border-transparent',
        'font-mono text-[0.6875rem] tracking-wide text-[var(--color-muted)]',
        'transition-colors hover:border-[var(--color-gold-soft)] hover:text-[var(--color-paper-dim)]',
        className,
      )}
    >
      <span className="truncate">{c.publisher} · {c.year}</span>
      <ArrowUpRight className="size-3 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" strokeWidth={1.5} aria-hidden />
      <span className="sr-only">Source: {c.label}. Opens in a new tab.</span>
    </a>
  )
}

/* ── Derivation tooltip. "Where did that come from" is answered by the UI. ── */
export function Derived({ metric, children }: { metric: string; children: ReactNode }) {
  const m = metricById.get(metric)
  const id = useId()
  if (!m) return <>{children}</>
  return (
    <Tooltip.Root delayDuration={120}>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-describedby={id}
          className="cursor-help border-b border-dotted border-[var(--color-gold-soft)] text-left"
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          id={id} sideOffset={8} collisionPadding={16}
          className="z-[200] max-w-[min(30rem,90vw)] border border-[var(--color-line)] bg-[var(--color-panel-2)] px-4 py-3 text-xs leading-relaxed text-[var(--color-paper-dim)] shadow-none"
        >
          <p className="kicker mb-1.5 text-[var(--color-gold)]">Derivation</p>
          <p className="num text-[0.8125rem] leading-relaxed text-[var(--color-paper)]">{m.derivation}</p>
          <Tooltip.Arrow className="fill-[var(--color-line)]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

/* ── Status chip — the only pill shape allowed on the site ── */
const CHIP: Record<string, string> = {
  critical: 'border-[var(--color-signal)] text-[var(--color-signal)] bg-[color-mix(in_oklab,var(--color-signal)_10%,transparent)]',
  high: 'border-[var(--color-signal-dim)] text-[#D07A64]',
  medium: 'border-[var(--color-gold-soft)] text-[var(--color-gold)]',
  low: 'border-[var(--color-line)] text-[var(--color-muted)]',
  open: 'border-[var(--color-line)] text-[var(--color-paper-dim)]',
  validated: 'border-[var(--color-slate)] text-[var(--color-slate)]',
  actioned: 'border-[var(--color-gold-soft)] text-[var(--color-gold)]',
  recovered: 'border-[var(--color-verify)] text-[var(--color-verify)] bg-[color-mix(in_oklab,var(--color-verify)_10%,transparent)]',
  dismissed: 'border-[var(--color-line-soft)] text-[var(--color-muted)] line-through',
}
export function Chip({ kind, children, className }: { kind: string; children?: ReactNode; className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center whitespace-nowrap rounded-full border px-2 py-[1px]',
      'font-mono text-[0.625rem] uppercase leading-[1.5] tracking-[0.09em]',
      CHIP[kind] ?? CHIP.low, className,
    )}>
      {children ?? kind}
    </span>
  )
}

export function Money({ value, compact = false, className }: { value: number; compact?: boolean; className?: string }) {
  return <span className={cn('num', className)}>{formatINR(value, compact ? 'compact' : 'full')}</span>
}

/* ── Rule: a hairline with an optional label sitting on it ── */
export function Rule({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <span className="h-px flex-1 bg-[var(--color-line)]" />
      {label && <span className="kicker shrink-0">{label}</span>}
      {label && <span className="h-px flex-1 bg-[var(--color-line)]" />}
    </div>
  )
}
