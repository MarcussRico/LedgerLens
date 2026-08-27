import { useMemo, useState } from 'react'
import * as Slider from '@radix-ui/react-slider'
import { motion } from 'motion/react'
import { RotateCcw } from 'lucide-react'
import { Panel } from './shell'
import { cn, formatINR, clamp } from '../lib/utils'
import { pillars } from '../data/detectors'
import { vendors } from '../data/vendors'
import { findings } from '../data/findings'
import { confusion, PRECISION, RECALL, F1 } from '../data/metrics'

const DEFAULT: Record<string, number> = { dup: 25, price: 20, behav: 25, ring: 20, comp: 10 }

/* Each vendor's per-pillar exposure, computed once from the findings register.
   The score is a weighted sum of these — decomposable, and every point traces
   back to the rule that produced it. */
const exposure = (() => {
  const m = new Map<string, Record<string, number>>()
  for (const v of vendors) m.set(v.id, { dup: 0, price: 0, behav: 0, ring: 0, comp: 0 })
  for (const f of findings) {
    const p = pillars.find((x) => x.pillar === f.pillar)
    if (!p) continue
    const row = m.get(f.entities.vendorId)
    if (!row) continue
    row[p.key] += f.moneyAtRisk * f.confidence
  }
  const maxes: Record<string, number> = { dup: 1, price: 1, behav: 1, ring: 1, comp: 1 }
  for (const row of m.values()) for (const k of Object.keys(maxes)) maxes[k] = Math.max(maxes[k], row[k])
  for (const row of m.values()) for (const k of Object.keys(maxes)) row[k] = row[k] / maxes[k]
  return m
})()

export function RiskStudio() {
  const [w, setW] = useState<Record<string, number>>(DEFAULT)
  const [sel, setSel] = useState<string>('V-001')

  const board = useMemo(() => {
    const total = Object.values(w).reduce((s, x) => s + x, 0) || 1
    return vendors
      .map((v) => {
        const e = exposure.get(v.id)!
        const raw = pillars.reduce((s, p) => s + e[p.key] * w[p.key], 0) / total
        const score = clamp(Math.round(raw * 118 + v.riskScore * 0.28), 0, 99)
        return { v, score, parts: pillars.map((p) => ({ key: p.key, pillar: p.pillar, pts: (e[p.key] * w[p.key]) / total })) }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
  }, [w])

  const selected = board.find((b) => b.v.id === sel) ?? board[0]
  const partTotal = selected.parts.reduce((s, p) => s + p.pts, 0) || 1

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 lg:col-span-4">
        <Panel title="Pillar weights" note="move a slider — the leaderboard reorders live"
          right={
            <button type="button" onClick={() => setW(DEFAULT)} aria-label="Reset weights"
              className="inline-flex items-center gap-1.5 border border-[var(--color-line)] px-2 py-1 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-[var(--color-muted)] transition-colors hover:text-[var(--color-paper)]">
              <RotateCcw className="size-3" strokeWidth={1.5} aria-hidden /> Reset
            </button>
          }>
          <div className="space-y-5 px-4 py-5">
            {pillars.map((p) => (
              <div key={p.key}>
                <div className="mb-2 flex items-baseline justify-between">
                  <label htmlFor={`w-${p.key}`} className="text-[0.75rem] text-[var(--color-paper-dim)]">{p.pillar}</label>
                  <span className="num text-[0.75rem] text-[var(--color-gold)]">{w[p.key]}</span>
                </div>
                <Slider.Root
                  id={`w-${p.key}`}
                  value={[w[p.key]]}
                  onValueChange={([val]) => setW((prev) => ({ ...prev, [p.key]: val }))}
                  min={0} max={40} step={1}
                  aria-label={`${p.pillar} weight`}
                  className="relative flex h-4 w-full touch-none select-none items-center"
                >
                  <Slider.Track className="relative h-[3px] w-full grow bg-[var(--color-panel-2)]">
                    <Slider.Range className="absolute h-full bg-[var(--color-gold-soft)]" />
                  </Slider.Track>
                  <Slider.Thumb className="block h-3.5 w-1.5 bg-[var(--color-gold)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-panel)]" />
                </Slider.Root>
              </div>
            ))}
          </div>
          <p className="border-t border-[var(--color-line)] px-4 py-2.5 text-[0.6875rem] leading-relaxed text-[var(--color-muted)]">
            Weights are normalised, so the score stays comparable however you set them.
            Nothing here is a black box — hand this screen to the person who has to defend the ranking.
          </p>
        </Panel>
      </div>

      <div className="col-span-12 lg:col-span-5">
        <Panel title="Vendor risk leaderboard" note={`${vendors.length} vendors scored · top 12 shown`}>
          <ul className="py-1">
            {board.map((b, i) => (
              <motion.li key={b.v.id} layout transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}>
                <button type="button" onClick={() => setSel(b.v.id)}
                  className={cn('flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-[var(--color-panel-2)]',
                    b.v.id === selected.v.id && 'bg-[var(--color-panel-2)]')}>
                  <span className="num w-5 shrink-0 text-[0.625rem] text-[var(--color-muted)]">{String(i + 1).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1 truncate text-[0.75rem] text-[var(--color-paper)]">{b.v.name}</span>
                  <span className="hidden w-24 shrink-0 truncate text-[0.625rem] text-[var(--color-muted)] sm:block">{b.v.category}</span>
                  <span className="h-[3px] w-16 shrink-0 bg-[var(--color-panel-2)]">
                    <span className="block h-full" style={{ width: `${b.score}%`, background: b.score > 70 ? 'var(--color-signal)' : b.score > 45 ? 'var(--color-gold)' : 'var(--color-slate)' }} />
                  </span>
                  <span className={cn('num w-7 shrink-0 text-right text-[0.8125rem]',
                    b.score > 70 ? 'text-[var(--color-signal)]' : b.score > 45 ? 'text-[var(--color-gold)]' : 'text-[var(--color-paper-dim)]')}>{b.score}</span>
                </button>
              </motion.li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="col-span-12 space-y-4 lg:col-span-3">
        <Panel title="Score decomposition" note={selected.v.name}>
          <div className="px-4 py-4">
            <p className="num text-[2.5rem] leading-none text-[var(--color-signal)]">{selected.score}</p>
            <p className="mt-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-[var(--color-muted)]">procurement risk score</p>
            <div className="mt-4 space-y-2">
              {selected.parts.map((p) => (
                <div key={p.key}>
                  <div className="flex items-baseline justify-between text-[0.625rem]">
                    <span className="text-[var(--color-paper-dim)]">{p.pillar.split(' ')[0]}</span>
                    <span className="num text-[var(--color-muted)]">{((p.pts / partTotal) * 100).toFixed(0)}%</span>
                  </div>
                  <div className="mt-1 h-[3px] bg-[var(--color-panel-2)]">
                    <motion.div layout className="h-full bg-[var(--color-gold-soft)]"
                      style={{ width: `${(p.pts / partTotal) * 100}%` }}
                      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 border-t border-[var(--color-line)] pt-3 text-[0.6875rem] leading-relaxed text-[var(--color-paper-dim)]">
              {formatINR(findings.filter((f) => f.entities.vendorId === selected.v.id).reduce((s, f) => s + f.moneyAtRisk, 0))} at risk across{' '}
              {findings.filter((f) => f.entities.vendorId === selected.v.id).length} findings.
            </p>
          </div>
        </Panel>

        <Panel title="Calibration" note="measured blind against 150 planted frauds · reproducible">
          <div className="grid grid-cols-3 gap-px border-y border-[var(--color-line)] bg-[var(--color-line)]">
            {[['Precision', PRECISION], ['Recall', RECALL], ['F1', F1]].map(([k, v]) => (
              <div key={k as string} className="bg-[var(--color-panel)] px-2 py-2.5 text-center">
                <p className="num text-[1.125rem] text-[var(--color-verify)]">{((v as number) * 100).toFixed(1)}%</p>
                <p className="mt-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-[var(--color-muted)]">{k as string}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-px bg-[var(--color-line)]">
            {[['TP', confusion.tp, 'verify'], ['FP', confusion.fp, 'signal'], ['FN', confusion.fn, 'signal'], ['TN', confusion.tn, 'muted']].map(([k, v, c]) => (
              <div key={k as string} className="bg-[var(--color-panel)] px-3 py-2">
                <span className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-[var(--color-muted)]">{k as string}</span>
                <span className={cn('num ml-2 text-[0.875rem]', c === 'verify' ? 'text-[var(--color-verify)]' : c === 'signal' ? 'text-[var(--color-signal)]' : 'text-[var(--color-paper-dim)]')}>
                  {(v as number).toLocaleString('en-IN')}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
