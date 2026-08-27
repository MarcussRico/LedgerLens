import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'motion/react'
import * as Accordion from '@radix-ui/react-accordion'
import { ChevronDown } from 'lucide-react'
import { pillars, DETECTOR_COUNT } from '../data/detectors'
import { useReducedMotion } from '../lib/hooks'

const ACCENT: Record<string, string> = {
  gold: 'var(--color-gold)', slate: 'var(--color-slate)', signal: 'var(--color-signal)',
  clay: 'var(--color-clay)', verify: 'var(--color-verify)',
}

function PillarPanel({ p, stacked = false }: { p: (typeof pillars)[number]; stacked?: boolean }) {
  const flagships = p.detectors.filter((d) => d.flagship)
  const rest = p.detectors.filter((d) => !d.flagship)
  const colour = ACCENT[p.accent]
  return (
    <article className={stacked ? 'w-full' : 'flex h-full w-screen shrink-0 flex-col justify-center'}>
      <div className={stacked ? 'w-full' : 'mx-auto w-full max-w-[52rem] px-[clamp(1.5rem,5vw,4rem)]'}>
        <div className="flex items-baseline gap-4">
          <span className="num text-2xs" style={{ color: colour }}>PILLAR {p.n}</span>
          <span className="h-px flex-1" style={{ background: 'var(--color-line)' }} />
          <span className="num text-2xs text-[var(--color-muted)]">{p.detectors.length} detectors · {p.findings} findings</span>
        </div>

        <h3 className="mt-5 text-[clamp(1.75rem,3.6vw,2.5rem)] leading-[1.08]" style={{ color: colour }}>{p.pillar}</h3>
        <p className="mt-4 max-w-[52ch] text-[0.9375rem] leading-relaxed text-[var(--color-paper-dim)]">{p.blurb}</p>

        <ul className="mt-8 space-y-4">
          {flagships.map((d) => (
            <li key={d.id} className="border-l pl-4" style={{ borderColor: colour }}>
              <p className="flex flex-wrap items-baseline gap-2.5">
                <span className="num text-[0.625rem]" style={{ color: colour }}>{d.id}</span>
                <span className="text-[0.9375rem] text-[var(--color-paper)]">{d.name}</span>
              </p>
              <p className="mt-1 max-w-[56ch] text-[0.8125rem] leading-relaxed text-[var(--color-paper-dim)]">{d.note}</p>
            </li>
          ))}
        </ul>

        <Accordion.Root type="single" collapsible className="mt-7 border-t border-[var(--color-line)]">
          <Accordion.Item value="rest">
            <Accordion.Header>
              <Accordion.Trigger className="group flex w-full items-center justify-between py-3 text-left">
                <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--color-muted)]">
                  The other {rest.length} in this pillar
                </span>
                <ChevronDown className="size-4 text-[var(--color-muted)] transition-transform duration-300 group-data-[state=open]:rotate-180" strokeWidth={1.5} aria-hidden />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="overflow-hidden data-[state=open]:animate-[acc_320ms_cubic-bezier(0.22,1,0.36,1)]">
              <style>{`@keyframes acc{from{opacity:0}to{opacity:1}}`}</style>
              <ul className="grid gap-x-6 gap-y-1.5 pb-4 sm:grid-cols-2">
                {rest.map((d) => (
                  <li key={d.id} className="flex items-baseline gap-2.5 text-[0.8125rem] text-[var(--color-paper-dim)]">
                    <span className="num shrink-0 text-[0.5625rem] text-[var(--color-muted)]">{d.id}</span>
                    {d.name}
                  </li>
                ))}
              </ul>
            </Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>
      </div>
    </article>
  )
}

export function S07Engine() {
  const ref = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const x = useTransform(scrollYProgress, [0.04, 0.96], ['0vw', `-${(pillars.length - 1) * 100}vw`])
  const rail = useTransform(scrollYProgress, [0.04, 0.96], [0.06, 1])

  if (reduced) {
    return (
      <section id="engine" data-section="07" className="shell" style={{ paddingBlock: 'clamp(6rem, 14vh, 11rem)' }}>
        <p className="kicker">07 — The detection engine</p>
        <div className="mt-12 space-y-24">
          {pillars.map((p) => <PillarPanel key={p.key} p={p} stacked />)}
        </div>
      </section>
    )
  }

  return (
    <section id="engine" data-section="07" ref={ref} className="relative" style={{ height: `${pillars.length * 100}vh` }}>
      <div className="sticky top-0 flex h-screen flex-col overflow-hidden">
        <div className="shell shrink-0 pt-24">
          <p className="kicker">07 — The detection engine</p>
        </div>

        <motion.div className="flex min-h-0 flex-1 items-stretch will-change-transform" style={{ x }}>
          {pillars.map((p) => <PillarPanel key={p.key} p={p} />)}
        </motion.div>

        <div className="shrink-0 border-t border-[var(--color-line)]">
          <div className="h-[2px] w-full bg-[var(--color-panel-2)]">
            <motion.div className="h-full origin-left bg-[var(--color-gold)]" style={{ scaleX: rail }} />
          </div>
          <div className="shell flex items-center justify-between py-3">
            <p className="num text-2xs text-[var(--color-muted)]">
              {DETECTOR_COUNT} detectors · 5 pillars · every finding traceable to source documents
            </p>
            <div className="hidden gap-4 lg:flex">
              {pillars.map((p) => (
                <span key={p.key} className="num text-[0.5625rem] uppercase tracking-[0.12em]" style={{ color: ACCENT[p.accent] }}>
                  {p.pillar.split(' ')[0]}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
