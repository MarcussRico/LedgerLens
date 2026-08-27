import { Reveal } from '../components/ui/primitives'

export function S05Root() {
  return (
    <section id="root" data-section="05" className="relative" style={{ paddingBlock: 'clamp(8rem, 20vh, 15rem)' }}>
      <div className="shell">
        <Reveal>
          <p className="kicker mb-10">The root cause</p>
        </Reveal>
        <Reveal delay={0.06}>
          <h2 className="max-w-[16ch] text-[clamp(2.5rem,8vw,6rem)] leading-[0.98] text-[var(--color-paper)]">
            Humans review invoices one at a time.
          </h2>
        </Reveal>
        <Reveal delay={0.14}>
          <h2 className="mt-2 max-w-[18ch] text-[clamp(2.5rem,8vw,6rem)] leading-[0.98] text-[var(--color-gold)]">
            The problems only exist across thousands at once.
          </h2>
        </Reveal>

        <div className="mt-20 grid grid-cols-12 gap-8">
          <Reveal delay={0.2} className="col-span-12 lg:col-span-6 lg:col-start-5">
            <p className="text-[1.0625rem] leading-[1.75] text-[var(--color-paper-dim)]">
              Every fraud above passes single-document inspection perfectly. The fraud lives in the{' '}
              <em className="not-italic text-[var(--color-paper)]" style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.1em' }}>relationships</em>{' '}
              — between this invoice and one from three weeks ago, between this price and eleven other vendors’,
              between this vendor’s bank account and that employee’s.
            </p>
            <div className="mt-8 border-t border-[var(--color-line)] pt-8">
              <p className="text-[1.0625rem] leading-[1.75] text-[var(--color-paper)]">
                A human cannot hold 50,000 invoices in their head simultaneously.
              </p>
              <p className="mt-1 text-[1.0625rem] leading-[1.75] text-[var(--color-paper)]">
                A computer trivially can.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
