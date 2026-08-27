import { useMemo } from 'react'
import { ArrowDown, ArrowRight } from 'lucide-react'
import { Reveal, Ticker, Derived } from '../components/ui/primitives'
import { useStore } from '../lib/store'
import { makeRng, intBetween, formatINR, fmtDate } from '../lib/utils'
import { vendors } from '../data/vendors'
import { CORPUS } from '../data/metrics'
import { useReducedMotion } from '../lib/hooks'

/* The marquee behind the hero: a river of documents, 6% opacity, seeded.
   It says "there are thousands of these" without a single word. */
function useMarqueeRows() {
  return useMemo(() => {
    const rng = makeRng(0xD0C5)
    const rows = Array.from({ length: 30 }, (_, i) => {
      const v = vendors[intBetween(rng, 0, vendors.length - 1)]
      const amount = intBetween(rng, 4, 320) * 1000 + intBetween(rng, 0, 99) * 10
      const d = new Date(Date.UTC(2025, 2, 1) + intBetween(rng, 0, 545) * 86400000).toISOString().slice(0, 10)
      return { no: `INV-${4000 + i * 13}`, name: v.name, amount, date: d }
    })
    rows[7] = { no: 'INV-8790', name: 'Sharma Traders', amount: 1_24_500, date: '2026-08-18' }
    rows[22] = { no: 'INV-8842', name: 'Sharma Traders', amount: 1_24_500, date: '2026-08-24' }
    return rows
  }, [])
}

function Marquee() {
  const rows = useMarqueeRows()
  const reduced = useReducedMotion()
  const doubled = [...rows, ...rows]
  return (
    <div aria-hidden className="marquee-mask pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity: 0.06 }}>
      <div
        className="absolute inset-x-0 top-0 will-change-transform"
        style={reduced ? undefined : { animation: 'll-marquee 70s linear infinite' }}
      >
        {doubled.map((r, i) => (
          <div key={i} className="flex items-baseline gap-3 whitespace-nowrap border-b border-[var(--color-line-soft)] px-1 py-[7px] font-mono text-[0.6875rem] text-[var(--color-paper)]">
            <span className="w-24 shrink-0">{r.no}</span>
            <span className="w-56 shrink-0 truncate">{r.name}</span>
            <span className="w-28 shrink-0 text-right">{formatINR(r.amount)}</span>
            <span className="shrink-0">{fmtDate(r.date, true)}</span>
          </div>
        ))}
      </div>
      <style>{`@keyframes ll-marquee { from { transform: translateY(0) } to { transform: translateY(-50%) } }`}</style>
    </div>
  )
}

export function S01Hero() {
  const { total } = useStore()
  return (
    <section id="hero" data-section="01" className="relative flex min-h-[100svh] items-center overflow-hidden pt-24">
      <div className="absolute inset-y-0 right-0 hidden w-[38%] md:block">
        <Marquee />
      </div>

      <div className="shell grid12 relative w-full">
        <div className="col-span-12 md:col-span-9 lg:col-span-8 lg:col-start-1">
          <Reveal>
            <p className="kicker">LedgerLens</p>
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="mt-6 text-[clamp(2.75rem,7.4vw,6rem)] leading-[0.98]">
              An X-ray machine for<br />how a company spends.
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mt-7 max-w-[52ch] text-[clamp(1rem,1.6vw,1.375rem)] leading-[1.55] text-[var(--color-paper-dim)]">
              We read every invoice, purchase order and vendor record together —
              and show you exactly where the money is leaking.
            </p>
          </Reveal>

          <Reveal delay={0.2}>
            <div className="mt-12 border-l border-[var(--color-gold-soft)] pl-5 sm:pl-7">
              <Derived metric="total">
                <span className="text-[clamp(3rem,10vw,8rem)] font-normal leading-[0.88] tracking-[-0.045em] text-[var(--color-gold)]">
                  <Ticker
                    to={total}
                    live={total}
                    format={(n) => `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n))}`}
                    className="tabular-nums"
                  />
                </span>
              </Derived>
              <p className="mt-4 max-w-[44ch] text-[0.9375rem] leading-relaxed text-[var(--color-paper-dim)]">
                recoverable, identified across{' '}
                <Derived metric="spend"><span className="num text-[var(--color-paper)]">₹42.6 Cr</span></Derived>{' '}
                of analysed spend — {CORPUS.invoices.toLocaleString('en-IN')} invoices, {CORPUS.vendors} vendors, {CORPUS.months} months.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.28}>
            <div className="mt-11 flex flex-wrap items-center gap-3">
              <a href="#pipeline"
                className="group inline-flex items-center gap-2.5 border border-[var(--color-gold-soft)] bg-[color-mix(in_oklab,var(--color-gold)_9%,transparent)] px-5 py-3 text-sm text-[var(--color-gold)] transition-colors hover:bg-[color-mix(in_oklab,var(--color-gold)_16%,transparent)]">
                See how it works
                <ArrowDown className="size-4 transition-transform duration-300 group-hover:translate-y-0.5" strokeWidth={1.5} aria-hidden />
              </a>
              <a href="#product"
                className="group inline-flex items-center gap-2.5 border border-[var(--color-line)] px-5 py-3 text-sm text-[var(--color-paper-dim)] transition-colors hover:border-[var(--color-paper-dim)] hover:text-[var(--color-paper)]">
                Skip to the product
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" strokeWidth={1.5} aria-hidden />
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.36}>
            <p className="mt-14 font-mono text-[0.6875rem] tracking-[0.08em] text-[var(--color-muted)]">
              Demo dataset — synthetic, generated for evaluation.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
