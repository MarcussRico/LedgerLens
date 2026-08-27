import { Zap } from 'lucide-react'
import { Section, Reveal } from '../components/ui/primitives'
import { useInjection } from '../components/Injection'
import { CORPUS } from '../data/metrics'
import { DETECTOR_COUNT } from '../data/detectors'

const COVERAGE: [string, string][] = [
  ['Analyse invoices and procurement records',
    `${CORPUS.invoices.toLocaleString('en-IN')} invoices · ${CORPUS.purchaseOrders.toLocaleString('en-IN')} POs · ${CORPUS.vendors} vendors · ${CORPUS.months} months · ${DETECTOR_COUNT} detectors`],
  ['Detect duplicate invoices', '8 detectors — exact, fuzzy, transposition, cross-alias, cross-PO'],
  ['Identify unusual purchases', '11 behavioural detectors + Isolation Forest'],
  ['Compare vendor pricing', 'SKU-normalised benchmarking, peer median, creep regression'],
  ['Detect abnormal spending patterns', "Benford, threshold-hugging, off-hours, year-end dumping"],
  ['Generate procurement risk scores', '5-pillar decomposable PRS, live weights, calibrated'],
  ['Estimate potential savings', '3-tier model with confidence bands and shown arithmetic'],
  ['Recommend better purchasing decisions', 'Per-finding action + drafted email, brief, memo'],
]

const BEYOND = [
  'vendor–employee collusion graph', 'entity resolution', 'three-way match',
  'India compliance layer (GSTIN · HSN · 43B(h))', 'fraud simulator with ground truth',
  'NL query with visible SQL', 'human-in-the-loop feedback', 'tamper-evident audit log',
  'live rule injection',
]

const ROADMAP = [
  { when: 'Tonight', what: 'Backend live on the real pipeline — the detectors already run headless; this is wiring, not research.' },
  { when: 'This week', what: 'OCR ingestion for scanned invoices, and the feedback loop that reweights a detector from false-positive labels.' },
  { when: 'Production', what: 'ERP connectors for Tally, SAP and Zoho · role-based access · tamper-evident audit log with hash-chained findings.' },
]

export function S12Close() {
  const inject = useInjection()
  return (
    <Section n="12" id="close" kicker="12 — Coverage, roadmap, close"
      title={<>Nothing in the brief was skipped.</>}>
      <Reveal delay={0.06}>
        <div className="mt-12 overflow-x-auto border border-[var(--color-line)]">
          <table className="w-full min-w-[42rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--color-line)] bg-[var(--color-panel)]">
                <th className="w-[22rem] px-5 py-3 font-mono text-[0.5625rem] font-normal uppercase tracking-[0.14em] text-[var(--color-muted)]">Required</th>
                <th className="px-5 py-3 font-mono text-[0.5625rem] font-normal uppercase tracking-[0.14em] text-[var(--color-verify)]">Delivered</th>
              </tr>
            </thead>
            <tbody>
              {COVERAGE.map(([req, del]) => (
                <tr key={req} className="border-b border-[var(--color-line-soft)] align-top">
                  <th scope="row" className="px-5 py-3.5 text-[0.8125rem] font-normal text-[var(--color-paper-dim)]">{req}</th>
                  <td className="num px-5 py-3.5 text-[0.8125rem] leading-relaxed text-[var(--color-paper)]">{del}</td>
                </tr>
              ))}
              <tr className="align-top">
                <th scope="row" className="px-5 py-4 text-[0.8125rem] font-medium text-[var(--color-gold)]">Beyond the brief</th>
                <td className="px-5 py-4">
                  <ul className="flex flex-wrap gap-1.5">
                    {BEYOND.map((b) => (
                      <li key={b} className="num border border-[var(--color-gold-soft)] px-2 py-0.5 text-[0.6875rem] text-[var(--color-gold)]">{b}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Reveal>

      <div className="mt-16 grid grid-cols-12 gap-x-8 gap-y-6">
        {ROADMAP.map((r, i) => (
          <Reveal key={r.when} delay={i * 0.055} className="col-span-12 sm:col-span-4">
            <div className="border-t border-[var(--color-line)] pt-4">
              <p className="num text-2xs text-[var(--color-gold)]">{r.when}</p>
              <p className="mt-2.5 text-[0.875rem] leading-relaxed text-[var(--color-paper-dim)]">{r.what}</p>
            </div>
          </Reveal>
        ))}
      </div>

      {/* close */}
      <Reveal delay={0.1}>
        <div className="mt-28 border-t border-[var(--color-line)] pt-16">
          <h2 className="max-w-[17ch] text-[clamp(2rem,6.5vw,4.5rem)] leading-[1]">
            Humans review invoices one at a time.
          </h2>
          <h2 className="mt-2 max-w-[19ch] text-[clamp(2rem,6.5vw,4.5rem)] leading-[1] text-[var(--color-gold)]">
            The problems only exist across thousands at once.
          </h2>

          <button
            type="button" onClick={inject}
            className="group mt-12 inline-flex items-center gap-3 border border-[var(--color-gold-soft)] bg-[color-mix(in_oklab,var(--color-gold)_10%,transparent)] px-6 py-4 text-[1rem] text-[var(--color-gold)] transition-colors hover:bg-[color-mix(in_oklab,var(--color-gold)_18%,transparent)]"
          >
            <Zap className="size-4" strokeWidth={1.5} aria-hidden />
            Inject a fraud and watch it get caught
          </button>

          <p className="mt-14 max-w-[60ch] text-[0.75rem] leading-relaxed text-[var(--color-muted)]">
            LedgerLens · demo dataset synthetic, generated for evaluation. Client entity, vendors, invoices,
            GSTINs and employees are fictional. Every statistic cited on this page links to its published source;
            every rupee figure resolves to arithmetic in the data model.
          </p>
        </div>
      </Reveal>
    </Section>
  )
}
