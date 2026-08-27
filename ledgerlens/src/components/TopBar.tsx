import { useEffect, useState } from 'react'
import { motion, useScroll, useSpring } from 'motion/react'
import { Zap, Keyboard } from 'lucide-react'
import { useStore } from '../lib/store'
import { cn } from '../lib/utils'

const SECTIONS = [
  { n: '01', id: 'hero', label: 'Hero' },
  { n: '02', id: 'stakes', label: 'The stakes' },
  { n: '03', id: 'pipeline', label: 'Where money leaks' },
  { n: '04', id: 'ways', label: 'Six ways' },
  { n: '05', id: 'root', label: 'Root cause' },
  { n: '06', id: 'product', label: 'The product' },
  { n: '07', id: 'engine', label: 'Detection engine' },
  { n: '08', id: 'architecture', label: 'How it works' },
  { n: '09', id: 'novelty', label: 'Novelty' },
  { n: '10', id: 'proof', label: 'Proof' },
  { n: '11', id: 'impact', label: 'Impact' },
  { n: '12', id: 'close', label: 'Coverage & close' },
]

export { SECTIONS }

export function TopBar({ onInject }: { onInject: () => void }) {
  const { scrollYProgress } = useScroll()
  const p = useSpring(scrollYProgress, { stiffness: 90, damping: 26, restDelta: 0.001 })
  const { section, setSection, notes, setNotes, phase } = useStore()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[]
    if (!els.length) return
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) {
          const idx = SECTIONS.findIndex((s) => s.id === visible.target.id)
          if (idx >= 0) setSection(idx + 1)
        }
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.05, 0.5] },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [setSection])

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-[120] transition-colors duration-300',
        scrolled ? 'bg-[color-mix(in_oklab,var(--color-ink)_97%,transparent)]' : 'bg-transparent',
      )}
      style={{ borderBottom: scrolled ? '1px solid var(--color-line)' : '1px solid transparent' }}
    >
      <div className="shell flex h-14 items-center gap-4">
        <a href="#hero" className="group flex shrink-0 items-baseline gap-2">
          <span className="num text-xs font-medium tracking-[0.2em] text-[var(--color-paper)]">LEDGERLENS</span>
          <span className="hidden h-3 w-px bg-[var(--color-line)] sm:block" />
          <span className="hidden font-mono text-[0.625rem] tracking-[0.14em] text-[var(--color-muted)] sm:block">
            VAIGAI INDUSTRIES LTD
          </span>
        </a>

        {/* section rail */}
        <nav aria-label="Sections" className="ml-auto hidden items-center gap-[3px] lg:flex">
          {SECTIONS.map((s, i) => (
            <a
              key={s.id} href={`#${s.id}`}
              title={`${s.n} — ${s.label}`}
              aria-current={section === i + 1 ? 'true' : undefined}
              className="group relative flex h-8 w-5 items-end justify-center pb-2"
            >
              <span className={cn(
                'block h-[2px] w-full origin-bottom transition-all duration-300',
                section === i + 1 ? 'bg-[var(--color-gold)]' : 'bg-[var(--color-line)] group-hover:bg-[var(--color-paper-dim)]',
              )} style={{ height: section === i + 1 ? 10 : 2 }} />
              <span className="sr-only">{s.n} {s.label}</span>
            </a>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setNotes(!notes)}
          aria-pressed={notes}
          aria-label="Toggle speaker notes"
          className={cn(
            'hidden shrink-0 items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[0.625rem] uppercase tracking-[0.12em] transition-colors md:inline-flex',
            notes ? 'border-[var(--color-gold-soft)] text-[var(--color-gold)]' : 'border-[var(--color-line)] text-[var(--color-muted)] hover:text-[var(--color-paper-dim)]',
          )}
        >
          <Keyboard className="size-3.5" strokeWidth={1.5} aria-hidden /> P
        </button>

        <button
          type="button"
          onClick={onInject}
          disabled={phase !== 'idle' && phase !== 'alerted'}
          className={cn(
            'group relative inline-flex shrink-0 items-center gap-2 border px-3 py-1.5',
            'font-mono text-[0.6875rem] uppercase tracking-[0.12em] transition-colors',
            'border-[var(--color-gold-soft)] text-[var(--color-gold)]',
            'hover:bg-[color-mix(in_oklab,var(--color-gold)_12%,transparent)]',
            'disabled:cursor-not-allowed disabled:opacity-45',
          )}
        >
          <Zap className="size-3.5" strokeWidth={1.5} aria-hidden />
          <span className="hidden sm:inline">Inject fraud</span>
          <span className="sm:hidden">Inject</span>
        </button>
      </div>

      {/* progress rail */}
      <motion.div
        className="h-px origin-left bg-[var(--color-gold)]"
        style={{ scaleX: p }}
        aria-hidden
      />
    </header>
  )
}

/** Persistent, discreet, and never removed. */
export function SyntheticBadge() {
  return (
    <div className="pointer-events-none fixed bottom-3 left-0 z-[110] w-full">
      <div className="shell">
        <p className="inline-block border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-ink)_82%,transparent)] px-2 py-1 font-mono text-[0.5625rem] uppercase tracking-[0.14em] text-[var(--color-muted)]">
          Demo dataset — synthetic, generated for evaluation
        </p>
      </div>
    </div>
  )
}
