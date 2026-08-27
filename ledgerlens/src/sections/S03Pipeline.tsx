import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'motion/react'
import { Reveal } from '../components/ui/primitives'
import { cn } from '../lib/utils'
import { useReducedMotion } from '../lib/hooks'

const STAGES = [
  { id: 'req', label: 'Requisition', doc: 'Someone asks for something' },
  { id: 'po', label: 'Purchase Order', doc: 'A commitment to buy is issued' },
  { id: 'grn', label: 'Goods Receipt', doc: 'Someone signs that it arrived' },
  { id: 'inv', label: 'Invoice', doc: 'The vendor asks to be paid' },
  { id: 'pay', label: 'Payment', doc: 'Money leaves the account' },
]

const GAPS = [
  { after: 0, title: 'No competitive quotes obtained', body: 'A requisition becomes a purchase order without anyone testing the price against the market. The vendor was chosen before the requirement was written.' },
  { after: 1, title: 'Goods never verified', body: 'The purchase order says 240 units. Nobody counted what arrived. Thirty-two units were paid for and never received.' },
  { after: 2, title: 'Billed ≠ ordered', body: 'The invoice matches the purchase order. It does not match the goods-receipt note. Only a three-way comparison catches that, and it is nobody’s job.' },
  { after: 3, title: 'Paid twice', body: 'A vendor re-sends an unanswered invoice under a new number. Both documents clear. Nobody committed fraud — the control simply did not exist.' },
]

const N = STAGES.length
const W = 1000, H = 190
const stageX = (i: number) => 92 + i * ((W - 184) / (N - 1))

export function S03Pipeline() {
  const ref = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })

  // 0–0.12 settle · 0.12–0.92 the four gaps · 0.92–1 release
  const step = useTransform(scrollYProgress, (p) => {
    if (p < 0.14) return -1
    if (p > 0.9) return 4
    return Math.min(3, Math.floor(((p - 0.14) / 0.76) * 4))
  })

  return (
    <section id="pipeline" data-section="03" ref={ref} className="relative" style={{ height: reduced ? 'auto' : '400vh' }}>
      <div className={cn('flex flex-col justify-center', reduced ? 'py-24' : 'sticky top-0 h-screen')}>
        <div className="shell w-full">
          <Reveal>
            <p className="kicker">03 — Where the money leaks</p>
            <h2 className="mt-4 max-w-[20ch] text-[clamp(1.75rem,4vw,3rem)]">
              Four documents. Four different people. Often four different systems.
            </h2>
          </Reveal>

          <div className="mt-10 lg:mt-14">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
              aria-label="The procurement pipeline: Requisition, Purchase Order, Goods Receipt, Invoice, Payment. Money leaks in the gaps between each pair of stages.">
              {/* connectors */}
              {STAGES.slice(0, -1).map((_, i) => (
                <Connector key={i} i={i} step={step} />
              ))}
              {/* stages */}
              {STAGES.map((s, i) => (
                <Stage key={s.id} i={i} label={s.label} doc={s.doc} step={step} />
              ))}
            </svg>
          </div>

          {/* caption */}
          <div className="relative mt-8 min-h-[9.5rem] lg:mt-10">
            {GAPS.map((g, i) => (
              <Caption key={g.title} i={i} step={step} title={g.title} body={g.body} reduced={reduced} />
            ))}
            <Release step={step} reduced={reduced} />
          </div>
        </div>
      </div>
    </section>
  )
}

type Step = ReturnType<typeof useTransform<number, number>>

function Connector({ i, step }: { i: number; step: Step }) {
  const x1 = stageX(i) + 46
  const x2 = stageX(i + 1) - 46
  const active = useTransform(step, (s) => (s === i ? 1 : 0))
  const drawn = useTransform(step, (s) => (s >= i ? 1 : 0.22))
  const mid = (x1 + x2) / 2
  return (
    <g>
      <motion.line x1={x1} y1={72} x2={x2} y2={72} stroke="var(--color-line)" strokeWidth="1" style={{ opacity: drawn }} />
      <motion.path d={`M ${x2 - 9} 67 L ${x2} 72 L ${x2 - 9} 77`} fill="none" stroke="var(--color-paper-dim)" strokeWidth="1.2" style={{ opacity: drawn }} />
      {/* the gap itself */}
      <motion.rect x={mid - 22} y={62} width={44} height={20} fill="var(--color-signal)" style={{ opacity: useTransform(active, (a) => a * 0.16) }} />
      <motion.line x1={mid} y1={82} x2={mid} y2={120} stroke="var(--color-signal)" strokeWidth="1.2" strokeDasharray="3 3" style={{ opacity: active }} />
      <motion.circle cx={mid} cy={124} r="3.5" fill="var(--color-signal)" style={{ opacity: active }} />
      <motion.text x={mid} y={146} textAnchor="middle" fill="var(--color-signal)" fontSize="11" fontFamily="var(--font-mono)" letterSpacing="0.06em"
        style={{ opacity: active }}>
        {['NO QUOTES', 'NOT VERIFIED', 'BILLED ≠ ORDERED', 'PAID TWICE'][i]}
      </motion.text>
    </g>
  )
}

function Stage({ i, label, doc, step }: { i: number; label: string; doc: string; step: Step }) {
  const x = stageX(i)
  const lit = useTransform(step, (s) => (s >= i - 1 ? 1 : 0.34))
  const strokeCol = useTransform(step, (s) => (s >= i - 1 ? 'var(--color-gold)' : 'var(--color-line)'))
  return (
    <g>
      <motion.rect x={x - 46} y={52} width={92} height={40} fill="var(--color-panel)" stroke={strokeCol} strokeWidth="1" style={{ opacity: lit }} />
      <motion.text x={x} y={40} textAnchor="middle" fill="var(--color-paper)" fontSize="13" fontFamily="var(--font-sans)" style={{ opacity: lit }}>
        {label}
      </motion.text>
      <motion.text x={x} y={76} textAnchor="middle" fill="var(--color-muted)" fontSize="9" fontFamily="var(--font-mono)" style={{ opacity: lit }}>
        {String(i + 1).padStart(2, '0')}
      </motion.text>
      <motion.text x={x} y={110} textAnchor="middle" fill="var(--color-paper-dim)" fontSize="10" fontFamily="var(--font-sans)"
        style={{ opacity: useTransform(step, (s) => (s === i || s === i - 1 ? 0.9 : 0)) }}>
        {doc}
      </motion.text>
    </g>
  )
}

function Caption({ i, step, title, body, reduced }: { i: number; step: Step; title: string; body: string; reduced: boolean }) {
  const opacity = useTransform(step, (s) => (s === i ? 1 : 0))
  const y = useTransform(step, (s) => (s === i ? 0 : 12))
  if (reduced) {
    return (
      <div className="mb-6 grid grid-cols-12">
        <div className="col-span-12 border-l-2 border-[var(--color-signal)] pl-5 lg:col-span-7 lg:col-start-5">
          <p className="text-[1.375rem] text-[var(--color-paper)]">{title}</p>
          <p className="mt-2 max-w-[54ch] text-[0.9375rem] leading-relaxed text-[var(--color-paper-dim)]">{body}</p>
        </div>
      </div>
    )
  }
  return (
    <motion.div className="absolute inset-x-0 top-0 grid grid-cols-12" style={{ opacity, y }} aria-hidden={undefined}>
      <div className="col-span-12 border-l-2 border-[var(--color-signal)] pl-5 lg:col-span-7 lg:col-start-5">
        <p className="text-[clamp(1.125rem,2.2vw,1.75rem)] leading-tight text-[var(--color-paper)]">{title}</p>
        <p className="mt-2.5 max-w-[54ch] text-[0.9375rem] leading-relaxed text-[var(--color-paper-dim)]">{body}</p>
      </div>
    </motion.div>
  )
}

function Release({ step, reduced }: { step: Step; reduced: boolean }) {
  const opacity = useTransform(step, (s) => (s === 4 ? 1 : 0))
  const content = (
    <p className="max-w-[40ch] text-[clamp(1.25rem,2.6vw,2rem)] leading-[1.2] text-[var(--color-gold)]"
      style={{ fontFamily: 'var(--font-display)' }}>
      Every gap is where money leaves.
    </p>
  )
  if (reduced) return <div className="mt-8">{content}</div>
  return <motion.div className="absolute inset-x-0 top-0" style={{ opacity }}>{content}</motion.div>
}
