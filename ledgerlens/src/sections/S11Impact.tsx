import { Section, Reveal, Ticker, Cite, Derived } from '../components/ui/primitives'
import { formatINR, groupIN } from '../lib/utils'
import {
  RECOVERABLE, AVOIDABLE, NEGOTIABLE, TOTAL_IDENTIFIED, avoidableLines, AVOIDABLE_TOP,
  AVOIDABLE_TAIL, AVOIDABLE_PAIRS, negotiableLines, pipeline, CORPUS,
} from '../data/metrics'
import { duplicatePairs } from '../data/invoices'

const TIERS = [
  {
    metric: 'recoverable', name: 'Recoverable', amount: RECOVERABLE, confidence: 'High',
    basis: `duplicate payments already made — ${duplicatePairs.length} confirmed pairs`,
    colour: 'var(--color-verify)',
  },
  {
    metric: 'avoidable', name: 'Avoidable', amount: AVOIDABLE, confidence: 'Medium',
    basis: `(unit price − peer median) × volume, across ${AVOIDABLE_PAIRS} flagged SKU–vendor pairs`,
    colour: 'var(--color-gold)',
  },
  {
    metric: 'negotiable', name: 'Negotiable', amount: NEGOTIABLE, confidence: 'Modelled',
    basis: 'vendor consolidation + missed early-payment discounts',
    colour: 'var(--color-slate)',
  },
]

function Funnel() {
  const max = pipeline[0].amount
  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-panel)]">
      <p className="kicker border-b border-[var(--color-line)] px-5 py-3">Realization pipeline</p>
      <div className="space-y-5 px-5 py-6">
        {pipeline.map((s, i) => {
          const pct = (s.amount / max) * 100
          const colour = i === 0 ? 'var(--color-gold)'
            : i === pipeline.length - 1 ? 'var(--color-verify)'
            : `color-mix(in oklab, var(--color-gold) ${100 - i * 32}%, var(--color-verify))`
          return (
            <div key={s.stage}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[0.9375rem] text-[var(--color-paper)]">{s.stage}</span>
                <span className="num text-[1.125rem]" style={{ color: colour }}>
                  <Ticker to={s.amount} format={(n) => formatINR(n, 'compact')} delay={i * 90} />
                </span>
              </div>
              <div className="mt-2 h-2 w-full bg-[var(--color-panel-2)]">
                <div className="h-full origin-left" style={{ width: `${pct}%`, background: colour, animation: 'grow2 700ms cubic-bezier(0.22,1,0.36,1) both', animationDelay: `${i * 110}ms` }} />
              </div>
              <p className="mt-1.5 text-[0.75rem] text-[var(--color-muted)]">{s.note}</p>
            </div>
          )
        })}
        <style>{`@keyframes grow2{from{transform:scaleX(0)}to{transform:scaleX(1)}}`}</style>
      </div>
    </div>
  )
}

export function S11Impact() {
  return (
    <Section n="11" id="impact" kicker="11 — Impact, with the arithmetic shown"
      title={<>Three tiers. Each one shows its formula.</>}>
      <Reveal delay={0.06}>
        <p className="mt-6 max-w-[56ch] text-[1.0625rem] leading-relaxed text-[var(--color-paper-dim)]">
          Never claim a number you cannot derive on demand. Hover any figure below and the derivation
          comes from the data model, not from a slide.
        </p>
      </Reveal>

      <div className="mt-14 space-y-px border border-[var(--color-line)] bg-[var(--color-line)]">
        {TIERS.map((t, i) => (
          <Reveal key={t.name} delay={i * 0.055}>
            <div className="grid grid-cols-12 items-baseline gap-x-5 gap-y-2 bg-[var(--color-panel)] px-5 py-6 sm:px-7">
              <div className="col-span-12 sm:col-span-3">
                <span className="inline-block h-3 w-[3px] align-middle" style={{ background: t.colour }} aria-hidden />
                <span className="ml-3 text-[1.125rem] text-[var(--color-paper)]">{t.name}</span>
              </div>
              <p className="col-span-12 text-[0.875rem] leading-relaxed text-[var(--color-paper-dim)] sm:col-span-5">{t.basis}</p>
              <p className="col-span-8 num text-[clamp(1.375rem,3vw,1.75rem)] sm:col-span-2 sm:text-right" style={{ color: t.colour }}>
                <Derived metric={t.metric}><Ticker to={t.amount} format={(n) => formatINR(n, 'compact')} /></Derived>
              </p>
              <p className="col-span-4 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--color-muted)] sm:col-span-2 sm:text-right">{t.confidence}</p>
            </div>
          </Reveal>
        ))}
        <Reveal delay={0.18}>
          <div className="hatch-gold grid grid-cols-12 items-baseline gap-x-5 gap-y-2 bg-[var(--color-panel)] px-5 py-7 sm:px-7">
            <p className="col-span-12 text-[1.125rem] text-[var(--color-gold)] sm:col-span-8">Total identified</p>
            <p className="col-span-8 num text-[clamp(1.75rem,4vw,2.5rem)] text-[var(--color-gold)] sm:col-span-2 sm:text-right">
              <Derived metric="total"><Ticker to={TOTAL_IDENTIFIED} format={(n) => formatINR(n, 'compact')} /></Derived>
            </p>
            <p className="col-span-4 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--color-muted)] sm:col-span-2 sm:text-right">
              on {formatINR(CORPUS.spendAnalysed, 'compact')} analysed
            </p>
          </div>
        </Reveal>
      </div>

      {/* the arithmetic, opened up */}
      <div className="mt-12 grid grid-cols-12 gap-6">
        <Reveal delay={0.06} className="col-span-12 lg:col-span-7">
          <div className="h-full border border-[var(--color-line)] bg-[var(--color-panel)]">
            <p className="kicker border-b border-[var(--color-line)] px-5 py-3">Tier 2 — the working</p>
            <table className="w-full text-[0.75rem]">
              <thead>
                <tr className="text-left font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-[var(--color-muted)]">
                  <th className="px-5 py-2 font-normal">Item / vendor</th>
                  <th className="px-2 py-2 text-right font-normal">Paid</th>
                  <th className="px-2 py-2 text-right font-normal">Median</th>
                  <th className="px-2 py-2 text-right font-normal">Volume</th>
                  <th className="px-5 py-2 text-right font-normal">Delta</th>
                </tr>
              </thead>
              <tbody>
                {avoidableLines.map((l) => (
                  <tr key={l.sku + l.vendor} className="border-t border-[var(--color-line-soft)]">
                    <td className="px-5 py-2.5">
                      <span className="block text-[var(--color-paper)]">{l.sku}</span>
                      <span className="block text-[0.625rem] text-[var(--color-muted)]">{l.vendor}</span>
                    </td>
                    <td className="num px-2 py-2.5 text-right text-[var(--color-signal)]">{groupIN(l.paid)}</td>
                    <td className="num px-2 py-2.5 text-right text-[var(--color-verify)]">{groupIN(l.median)}</td>
                    <td className="num px-2 py-2.5 text-right text-[var(--color-muted)]">{groupIN(l.volume)}</td>
                    <td className="num px-5 py-2.5 text-right text-[var(--color-gold)]">{groupIN(l.delta)}</td>
                  </tr>
                ))}
                <tr className="border-t border-[var(--color-line)]">
                  <td colSpan={4} className="px-5 py-2.5 text-right text-[var(--color-paper-dim)]">Top six</td>
                  <td className="num px-5 py-2.5 text-right text-[var(--color-paper)]">{groupIN(AVOIDABLE_TOP)}</td>
                </tr>
                <tr>
                  <td colSpan={4} className="px-5 py-2 text-right text-[var(--color-paper-dim)]">Remaining {AVOIDABLE_PAIRS - avoidableLines.length} pairs</td>
                  <td className="num px-5 py-2 text-right text-[var(--color-paper)]">{groupIN(AVOIDABLE_TAIL)}</td>
                </tr>
                <tr className="border-t border-[var(--color-line)]">
                  <td colSpan={4} className="px-5 py-2.5 text-right font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--color-muted)]">Tier 2 total</td>
                  <td className="num px-5 py-2.5 text-right text-[0.875rem] text-[var(--color-gold)]">{groupIN(AVOIDABLE)}</td>
                </tr>
              </tbody>
            </table>
            <div className="border-t border-[var(--color-line)] px-5 py-3">
              <p className="kicker mb-2">Tier 3 — the working</p>
              {negotiableLines.map((l) => (
                <p key={l.label} className="mb-2 text-[0.75rem] leading-relaxed text-[var(--color-paper-dim)]">
                  <span className="num text-[var(--color-gold)]">{formatINR(l.amount)}</span> — {l.basis}
                </p>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1} className="col-span-12 lg:col-span-5">
          <Funnel />
          <div className="mt-6 border-l-2 border-[var(--color-gold-soft)] pl-5">
            <p className="num text-[clamp(1.125rem,2.4vw,1.5rem)] text-[var(--color-paper)]">
              <Derived metric="ratio">₹18,42,650 on ₹42.6 Cr = 0.43% of spend recovered</Derived>
            </p>
            <p className="mt-4 max-w-[46ch] text-[0.9375rem] leading-relaxed text-[var(--color-paper-dim)]">
              Conservative. Published benchmarks put duplicate payments alone at 0.8–2% of disbursements.
              We are claiming only what this dataset lets us prove.
            </p>
            <Cite id="apqc-dup" className="mt-4" />
          </div>
        </Reveal>
      </div>
    </Section>
  )
}
