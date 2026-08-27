import { Section, Reveal, Ticker, Cite } from '../components/ui/primitives'
import { stakes } from '../data/metrics'

export function S02Stakes() {
  return (
    <Section n="02" id="stakes" kicker="02 — The stakes" title={<>What this costs, before anyone builds anything.</>}>
      <div className="mt-16 grid grid-cols-12 gap-x-6 gap-y-14">
        {stakes.map((s, i) => {
          // asymmetric on purpose — a four-up card grid is the thing to avoid
          const span = ['col-span-12 sm:col-span-6 lg:col-span-4 lg:col-start-1',
            'col-span-12 sm:col-span-6 lg:col-span-3 lg:col-start-6',
            'col-span-12 sm:col-span-6 lg:col-span-3 lg:col-start-2',
            'col-span-12 sm:col-span-6 lg:col-span-4 lg:col-start-7'][i]
          return (
            <Reveal key={s.claim} delay={(i % 2) * 0.055} className={span}>
              <div className="border-t border-[var(--color-line)] pt-5">
                <p className="text-[clamp(2.5rem,5.5vw,4.25rem)] leading-none text-[var(--color-paper)]"
                  style={{ fontFamily: 'var(--font-display)' }}>
                  {s.mode === 'pct' ? (
                    <Ticker to={s.value * 100} format={(n) => `${Math.round(n)}%`} />
                  ) : s.mode === 'int' ? (
                    <><Ticker to={s.value} format={(n) => `${Math.round(n)}`} /> <span className="text-[0.4em] text-[var(--color-paper-dim)]">months</span></>
                  ) : (
                    <span className="num">0.8–<Ticker to={2} format={(n) => `${n.toFixed(1)}`} />%</span>
                  )}
                </p>
                <p className="mt-4 max-w-[30ch] text-[0.9375rem] leading-relaxed text-[var(--color-paper-dim)]">{s.claim}</p>
                <Cite id={s.citationId} className="mt-3" />
              </div>
            </Reveal>
          )
        })}
      </div>

      <Reveal delay={0.1}>
        <div className="mt-28 grid grid-cols-12">
          <div className="col-span-12 border-l-2 border-[var(--color-signal)] pl-6 sm:pl-9 lg:col-span-9 lg:col-start-3">
            <p className="text-[clamp(1.5rem,3.4vw,2.5rem)] leading-[1.15]" style={{ fontFamily: 'var(--font-display)' }}>
              The most common fraud-detection method in the world is still one person telling on another.
            </p>
            <p className="mt-6 max-w-[56ch] text-[1.0625rem] leading-relaxed text-[var(--color-paper-dim)]">
              Internal audit catches 15%. Data analytics barely registers. That gap is the reason
              LedgerLens has a right to exist — not because auditors are careless, but because the
              evidence they would need is spread across four systems and fifty thousand documents.
            </p>
            <Cite id="acfe-summary" className="mt-5" />
          </div>
        </div>
      </Reveal>
    </Section>
  )
}
