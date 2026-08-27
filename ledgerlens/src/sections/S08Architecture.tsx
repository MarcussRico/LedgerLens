import { useEffect, useRef } from 'react'
import { Section, Reveal } from '../components/ui/primitives'
import { useInView, useReducedMotion, drawPath } from '../lib/hooks'
import { DETECTOR_COUNT } from '../data/detectors'

const BANDS = [
  {
    key: 'INGEST',
    items: 'CSV · Excel · PDF · scanned image · email attachment',
    under: 'LLM schema mapper: any column naming survives contact',
    colour: 'var(--color-slate)',
  },
  {
    key: 'RESOLVE',
    items: 'Vendor entity resolution · SKU & unit normalisation · currency and tax normalisation',
    under: 'the prerequisite nobody builds — without it, no comparison is valid',
    colour: 'var(--color-clay)',
  },
  {
    key: 'DETECT',
    items: 'Rules engine (deterministic) → Statistical models (Isolation Forest, robust z, Benford)',
    under: `${DETECTOR_COUNT} detectors, plugin architecture, each emits a typed Finding`,
    colour: 'var(--color-signal)',
  },
  {
    key: 'ACT',
    items: 'Risk scoring → Savings quantification → Recommended action → Drafted artifact',
    under: 'LLM writes the language. It never writes the numbers.',
    colour: 'var(--color-gold)',
  },
]

const CONTRACT = `interface Finding {
  id: string
  ruleId: string                    // e.g. "DUP-002"
  pillar: Pillar
  severity: 'critical' | 'high' | 'medium' | 'low'
  entities: { invoiceIds: string[]; vendorId: string; poIds?: string[] }
  evidence: Record<string, unknown> // exactly the fields the rule compared
  moneyAtRisk: number               // INR
  confidence: number                // 0–1, calibrated on labelled data
  explanation: string               // one plain-English sentence
  recommendedAction: Action
  scoreContribution: { component: string; points: number }[]
}`

function Diagram() {
  const [ref, inView] = useInView<HTMLDivElement>('-20% 0px')
  const svgRef = useRef<SVGSVGElement | null>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (!inView || reduced) return
    const svg = svgRef.current
    if (!svg) return
    const paths = Array.from(svg.querySelectorAll<SVGPathElement>('[data-draw]'))
    const anims = paths.map((p, i) => drawPath(p, 520, 180 + i * 130))
    return () => anims.forEach((a) => a.pause())
  }, [inView, reduced])

  return (
    <div ref={ref} className="mt-14">
      <div className="relative">
        <svg ref={svgRef} viewBox="0 0 60 660" className="pointer-events-none absolute left-0 top-0 hidden h-full w-14 lg:block" aria-hidden preserveAspectRatio="none">
          {[0, 1, 2].map((i) => (
            <path key={i} data-draw d={`M 30 ${44 + i * 165} L 30 ${152 + i * 165}`} stroke="var(--color-line)" strokeWidth="1" fill="none" />
          ))}
          {[0, 1, 2].map((i) => (
            <path key={`a${i}`} data-draw d={`M 25 ${145 + i * 165} L 30 ${152 + i * 165} L 35 ${145 + i * 165}`} stroke="var(--color-paper-dim)" strokeWidth="1.2" fill="none" />
          ))}
        </svg>

        <div className="space-y-4 lg:pl-14">
          {BANDS.map((b, i) => (
            <Reveal key={b.key} delay={i * 0.055}>
              <div className="grid grid-cols-12 items-start gap-x-5 gap-y-3 border border-[var(--color-line)] bg-[var(--color-panel)] px-5 py-5">
                <div className="col-span-12 flex items-baseline gap-3 sm:col-span-3 lg:col-span-2">
                  <span className="inline-block h-3 w-[3px]" style={{ background: b.colour }} aria-hidden />
                  <span className="num text-[0.8125rem] tracking-[0.14em]" style={{ color: b.colour }}>{b.key}</span>
                </div>
                <div className="col-span-12 sm:col-span-9 lg:col-span-10">
                  <p className="num text-[0.875rem] leading-relaxed text-[var(--color-paper)]">{b.items}</p>
                  <p className="mt-2 flex items-baseline gap-2 text-[0.8125rem] leading-relaxed text-[var(--color-paper-dim)]">
                    <span className="num shrink-0 text-[var(--color-muted)]">└─</span>
                    {b.under}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  )
}

export function S08Architecture() {
  return (
    <Section n="08" id="architecture" kicker="08 — How it works"
      title={<>Four bands. Each one earns its place.</>}>
      <Diagram />

      <Reveal delay={0.1}>
        <div className="mt-16 grid grid-cols-12">
          <div className="col-span-12 border border-[var(--color-gold-soft)] bg-[color-mix(in_oklab,var(--color-gold)_5%,transparent)] px-6 py-8 sm:px-10 sm:py-10 lg:col-span-10 lg:col-start-2">
            <h3 className="max-w-[24ch] text-[clamp(1.5rem,3.4vw,2.5rem)] leading-[1.1] text-[var(--color-gold)]">
              No language model ever produces a number in this system.
            </h3>
            <p className="mt-5 max-w-[62ch] text-[1.0625rem] leading-relaxed text-[var(--color-paper)]">
              Rules and statistics compute. The model only explains, drafts and translates.
              Every score is decomposable, reproducible, and auditable to the rule that fired.
            </p>
            <p className="mt-4 max-w-[62ch] text-[0.9375rem] leading-relaxed text-[var(--color-paper-dim)]">
              This is not a stylistic preference. It is the property that decides whether software
              like this is ever actually deployed — because a finance controller has to be able to
              defend the number to an auditor, and “the model said so” is not a defence.
            </p>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.14}>
        <div className="mt-14 grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-7">
            <p className="kicker mb-3">The Finding contract</p>
            <pre className="num overflow-x-auto border border-[var(--color-line)] bg-[var(--color-panel)] px-5 py-4 text-[0.75rem] leading-[1.7] text-[var(--color-paper-dim)]">
              <code>{CONTRACT}</code>
            </pre>
          </div>
          <div className="col-span-12 lg:col-span-5">
            <p className="kicker mb-3">Why that shape</p>
            <p className="text-[0.9375rem] leading-relaxed text-[var(--color-paper-dim)]">
              Every detector is a plugin implementing{' '}
              <code className="num text-[var(--color-gold)]">run(ctx) =&gt; Finding[]</code>. Nothing else.
              The engine does not know what a rule does, only that it returns typed findings
              carrying their own evidence and their own arithmetic.
            </p>
            <p className="mt-4 text-[0.9375rem] leading-relaxed text-[var(--color-paper-dim)]">
              A new rule takes five minutes to add — which is why we can accept a suggestion from
              this jury and demonstrate it before the session ends.
            </p>
            <div className="mt-6 border-t border-[var(--color-line)] pt-5">
              <p className="num text-[0.75rem] leading-relaxed text-[var(--color-muted)]">
                evidence: Record&lt;string, unknown&gt;<br />
                <span className="text-[var(--color-paper-dim)]">— the fields the rule actually compared, so the drawer<br />
                  can render the comparison rather than describe it.</span>
              </p>
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  )
}
