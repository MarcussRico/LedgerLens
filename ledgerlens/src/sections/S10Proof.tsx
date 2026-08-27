import { Section, Reveal, Ticker, Cite } from '../components/ui/primitives'
import { confusion, PRECISION, RECALL, F1, PLANTED, pillarPrecision, WEAKNESS, EVAL_CORPUS } from '../data/metrics'
import { citations } from '../data/citations'
import { ArrowUpRight } from 'lucide-react'

const CELLS = [
  { k: 'True positives', v: confusion.tp, note: 'planted frauds caught', colour: 'var(--color-verify)' },
  { k: 'False positives', v: confusion.fp, note: 'findings matching no planted fraud', colour: 'var(--color-signal)' },
  { k: 'False negatives', v: confusion.fn, note: 'planted frauds missed', colour: 'var(--color-signal)' },
  { k: 'True negatives', v: confusion.tn, note: 'clean invoices left unflagged', colour: 'var(--color-muted)' },
]

export function S10Proof() {
  return (
    <Section n="10" id="proof" kicker="10 — Proof and methodology"
      title={<>Measured, not asserted.</>}>
      <Reveal delay={0.06}>
        <p className="mt-6 max-w-[58ch] text-[1.0625rem] leading-relaxed text-[var(--color-paper-dim)]">
          Ground truth exists because we planted it. A procurement fraud simulator injects {PLANTED} labelled
          frauds of known type into {EVAL_CORPUS.invoices.toLocaleString('en-IN')} invoices of realistic spend — a corpus built
          to measure the engine, separate from the demo dataset shown above. The engine then runs blind.
          Every figure below is reproducible with one command.
        </p>
      </Reveal>

      <div className="mt-14 grid grid-cols-12 gap-x-6 gap-y-10">
        {/* headline metrics */}
        <Reveal delay={0.08} className="col-span-12 lg:col-span-5">
          <div className="grid grid-cols-3 gap-px border border-[var(--color-line)] bg-[var(--color-line)]">
            {[['Precision', PRECISION], ['Recall', RECALL], ['F1', F1]].map(([k, v]) => (
              <div key={k as string} className="bg-[var(--color-panel)] px-3 py-6 text-center">
                <p className="num text-[clamp(1.5rem,3.2vw,2.25rem)] leading-none text-[var(--color-verify)]">
                  <Ticker to={(v as number) * 100} format={(n) => `${n.toFixed(1)}%`} />
                </p>
                <p className="mt-2 font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-[var(--color-muted)]">{k as string}</p>
              </div>
            ))}
          </div>
          <p className="num mt-3 text-[0.6875rem] leading-relaxed text-[var(--color-muted)]">
            precision = {confusion.tp} ÷ ({confusion.tp} + {confusion.fp}) · recall = {confusion.tp} ÷ ({confusion.tp} + {confusion.fn})
          </p>
          <p className="num mt-3 border border-[var(--color-line)] px-3 py-2 text-[0.6875rem] leading-relaxed text-[var(--color-verify)]">
            {EVAL_CORPUS.command}
          </p>
          <p className="mt-2 text-[0.75rem] leading-relaxed text-[var(--color-muted)]">
            Seeded at {EVAL_CORPUS.seed}. Same corpus, same result, on any machine.
          </p>
        </Reveal>

        {/* confusion matrix */}
        <Reveal delay={0.12} className="col-span-12 lg:col-span-7">
          <div className="grid grid-cols-2 gap-px border border-[var(--color-line)] bg-[var(--color-line)]">
            {CELLS.map((c) => (
              <div key={c.k} className="bg-[var(--color-panel)] px-4 py-4">
                <p className="num text-[1.75rem] leading-none" style={{ color: c.colour }}>
                  <Ticker to={c.v} format={(n) => Math.round(n).toLocaleString('en-IN')} />
                </p>
                <p className="mt-1.5 text-[0.75rem] text-[var(--color-paper)]">{c.k}</p>
                <p className="mt-0.5 text-[0.6875rem] text-[var(--color-muted)]">{c.note}</p>
              </div>
            ))}
          </div>
          <p className="num mt-3 text-[0.6875rem] leading-relaxed text-[var(--color-muted)]">
            {confusion.tp} + {confusion.fn} = {PLANTED} planted frauds. TP and FN count frauds; FP counts findings;
            TN counts invoices — three different units, so they deliberately do not sum to one population.
          </p>
        </Reveal>
      </div>

      {/* per-pillar */}
      <Reveal delay={0.14}>
        <div className="mt-16">
          <p className="kicker mb-5">Precision by pillar</p>
          <ul className="space-y-3">
            {pillarPrecision.map((p) => (
              <li key={p.key} className="flex items-center gap-4">
                <span className="w-52 shrink-0 truncate text-[0.8125rem] text-[var(--color-paper-dim)]">{p.pillar}</span>
                <span className="h-[6px] flex-1 bg-[var(--color-panel-2)]">
                  <span className="block h-full" style={{ width: `${p.precision * 100}%`, background: 'var(--color-verify)' }} />
                </span>
                <span className="num w-14 shrink-0 text-right text-[0.8125rem] text-[var(--color-verify)]">{(p.precision * 100).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>

      {/* weakness — the strongest credibility move available */}
      <Reveal delay={0.16}>
        <div className="mt-16 grid grid-cols-12">
          <div className="hatch col-span-12 border border-[var(--color-signal-dim)] px-6 py-7 sm:px-9 lg:col-span-9">
            <p className="kicker text-[var(--color-signal)]">Where we are weakest</p>
            <p className="mt-4 text-[clamp(1.25rem,2.4vw,1.75rem)] leading-tight text-[var(--color-paper)]">
              Vendor Integrity is our least precise pillar, at <span className="num text-[var(--color-signal)]">{(WEAKNESS.precision * 100).toFixed(1)}%</span>.
            </p>
            <p className="mt-4 max-w-[58ch] text-[0.9375rem] leading-relaxed text-[var(--color-paper-dim)]">{WEAKNESS.reason}</p>
            <p className="mt-3 max-w-[58ch] text-[0.9375rem] leading-relaxed text-[var(--color-paper-dim)]">{WEAKNESS.fix}</p>
            <p className="mt-3 max-w-[58ch] text-[0.875rem] leading-relaxed text-[var(--color-paper-dim)]">{WEAKNESS.secondary}</p>
            <p className="num mt-5 text-[0.6875rem] text-[var(--color-muted)]">{WEAKNESS.detector}</p>
          </div>
        </div>
      </Reveal>

      {/* sources */}
      <Reveal delay={0.18}>
        <div className="mt-16 border border-[var(--color-line)] bg-[var(--color-panel)]">
          <p className="kicker border-b border-[var(--color-line)] px-5 py-3">Full source list</p>
          <ul className="divide-y divide-[var(--color-line-soft)]">
            {citations.map((c) => (
              <li key={c.id}>
                <a href={c.url} target="_blank" rel="noreferrer"
                  className="group flex items-start gap-4 px-5 py-3.5 transition-colors hover:bg-[var(--color-panel-2)]">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.875rem] leading-snug text-[var(--color-paper)]">{c.label}</span>
                    <span className="num mt-1 block text-[0.6875rem] text-[var(--color-muted)]">{c.publisher} · {c.year}</span>
                  </span>
                  <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-[var(--color-line)] transition-colors group-hover:text-[var(--color-gold)]" strokeWidth={1.5} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4"><Cite id="acfe-2026" /></div>
      </Reveal>
    </Section>
  )
}
