import { Section, Reveal } from '../components/ui/primitives'
import { PRECISION, RECALL } from '../data/metrics'

const ROWS: { k: string; obvious: string; ours: string; hero?: boolean }[] = [
  { k: 'Unit of analysis', obvious: 'one record at a time',
    ours: 'relationships across the whole corpus — the only place these frauds exist', hero: true },
  { k: 'Duplicate detection', obvious: 'groupby(invoice_no).count() > 1',
    ours: 'fuzzy, transposition-tolerant, cross-alias, tolerance-windowed on amount and date' },
  { k: 'Before comparing prices', obvious: 'compares raw strings, silently wrong',
    ours: 'entity + SKU resolution first. Without it every price comparison in every competing demo is invalid', hero: true },
  { k: 'Risk score', obvious: 'one opaque weighted sum',
    ours: 'five decomposable pillars, live-adjustable weights, every point traceable to a rule' },
  { k: 'Accuracy claim', obvious: 'none possible',
    ours: `${(PRECISION * 100).toFixed(1)}% precision / ${(RECALL * 100).toFixed(1)}% recall against 150 planted frauds — measured, and reproducible with one command`, hero: true },
  { k: 'Role of the LLM', obvious: 'asked to judge the data',
    ours: 'forbidden from arithmetic. Language only' },
  { k: 'Output', obvious: '"47 anomalies detected"',
    ours: '₹18.4 L recoverable · ₹6.2 L already recovered, with the arithmetic shown' },
  { k: 'Jurisdiction', obvious: 'generic',
    ours: 'GSTIN checksum, duplicate GST numbering, HSN tax match, MSME 43B(h) 45-day rule' },
  { k: 'Extensibility', obvious: 'rewrite the notebook',
    ours: 'plugin detector — new rule live in five minutes, on stage' },
]

const NOVELTIES = [
  { n: '01', t: 'Relational forensics over record-level checks.',
    b: 'PO splitting, price creep, shell-vendor rings and threshold hugging are structurally invisible to per-record validation. This is not a better filter — it is a different unit of analysis.' },
  { n: '02', t: 'Resolution as a precondition, not a feature.',
    b: 'Vendor aliases and SKU variants are normalised before any comparison runs. Every competing demo that skips this is comparing strings and reporting noise.' },
  { n: '03', t: 'A falsifiable accuracy claim.',
    b: 'We built a procurement fraud simulator that plants 150 labelled frauds of known type into realistic spend, which converts every claim on this page from an assertion into a measurement. One command reproduces the figure on any machine — and we report the pillar where we score worst, not just the headline.' },
  { n: '04', t: 'Deterministic scoring with a language-only LLM.',
    b: 'Auditable, reproducible, defensible in front of a regulator — the property that decides whether software like this is ever actually deployed.' },
]

export function S09Novelty() {
  return (
    <Section n="09" id="novelty" kicker="09 — Novelty"
      title={<>What nobody else in this room is building.</>}>
      <Reveal delay={0.06}>
        <p className="mt-6 max-w-[60ch] text-[1.0625rem] leading-relaxed text-[var(--color-paper-dim)]">
          Written for a judge who has already seen four near-identical demos today. No hedging.
        </p>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="mt-12 overflow-x-auto border border-[var(--color-line)]">
          <table className="w-full min-w-[46rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--color-line)] bg-[var(--color-panel)]">
                <th className="w-[13rem] px-5 py-3 font-mono text-[0.5625rem] font-normal uppercase tracking-[0.14em] text-[var(--color-muted)]" />
                <th className="px-5 py-3 font-mono text-[0.5625rem] font-normal uppercase tracking-[0.14em] text-[var(--color-muted)]">The obvious build</th>
                <th className="px-5 py-3 font-mono text-[0.5625rem] font-normal uppercase tracking-[0.14em] text-[var(--color-gold)]">LedgerLens</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.k} className="border-b border-[var(--color-line-soft)] last:border-b-0 align-top">
                  <th scope="row" className="px-5 py-4 text-[0.8125rem] font-medium text-[var(--color-paper)]">{r.k}</th>
                  <td className="num px-5 py-4 text-[0.8125rem] leading-relaxed text-[var(--color-muted)]">{r.obvious}</td>
                  <td className={`px-5 py-4 text-[0.8125rem] leading-relaxed ${r.hero ? 'bg-[color-mix(in_oklab,var(--color-gold)_6%,transparent)] text-[var(--color-paper)]' : 'text-[var(--color-paper-dim)]'}`}>
                    {r.ours}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>

      <div className="mt-20 grid grid-cols-12 gap-x-8 gap-y-10">
        {NOVELTIES.map((n, i) => (
          <Reveal key={n.n} delay={(i % 2) * 0.055}
            className={i % 2 === 0 ? 'col-span-12 lg:col-span-5 lg:col-start-1' : 'col-span-12 lg:col-span-6 lg:col-start-7'}>
            <div className="border-t border-[var(--color-gold-soft)] pt-5">
              <p className="num text-2xs text-[var(--color-gold)]">{n.n}</p>
              <h3 className="mt-3 text-[clamp(1.25rem,2.2vw,1.75rem)] leading-tight text-[var(--color-paper)]">{n.t}</h3>
              <p className="mt-3 max-w-[52ch] text-[0.9375rem] leading-relaxed text-[var(--color-paper-dim)]">{n.b}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}
