import { useMemo } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ReferenceDot } from 'recharts'
import { TipBox, tipData, AXIS_TICK, type TipProps } from './chartkit'
import { ArrowUpRight } from 'lucide-react'
import { Ticker, Chip, Derived } from '../components/ui/primitives'
import { Panel, TileGrid, Tile } from './shell'
import { cn, formatINR, groupIN } from '../lib/utils'
import { CORPUS, monthlySpend, pipeline, RECOVERED, TOTAL_IDENTIFIED } from '../data/metrics'
import { topFindings } from '../data/findings'
import { vendorById } from '../data/vendors'
import { useStore } from '../lib/store'

const AXIS = AXIS_TICK

interface SpendDatum { month: string; spend: number; anomalies: number; cr: number }

function SpendTip(p: TipProps<SpendDatum>) {
  const d = tipData(p)
  if (!d) return null
  return (
    <TipBox
      title={d.datum.month}
      rows={[
        { label: 'Spend', value: formatINR(d.datum.spend, 'compact'), colour: 'var(--color-gold)' },
        { label: 'Findings', value: String(d.datum.anomalies) },
      ]}
    />
  )
}

function SpendChart() {
  const data = useMemo(() => monthlySpend.map((m) => ({ ...m, cr: m.spend / 1_00_00_000 })), [])
  const spikes = data.filter((d) => d.anomalies >= 9)
  return (
    <Panel title="Monthly spend" note={`${CORPUS.windowLabel} · anomaly count punched on`}>
      <div className="h-56 w-full px-1 pb-1" role="img"
        aria-label="Line chart of monthly spend from March 2025 to August 2026, ranging ₹1.98 crore to ₹9.39 crore. March 2026 is an outlier at 4.1 times the monthly mean. Months carrying nine or more findings are marked.">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 14, left: -14, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-line-soft)" vertical={false} />
            <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--color-line)' }} interval={2} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v.toFixed(0)}Cr`} width={44} />
            <RTooltip cursor={{ stroke: 'var(--color-line)' }} content={<SpendTip />} />
            <Line type="linear" dataKey="cr" stroke="var(--color-gold)" strokeWidth={1.5} dot={{ r: 1.5, fill: 'var(--color-gold)', strokeWidth: 0 }} activeDot={{ r: 3 }} isAnimationActive={false} />
            {spikes.map((s) => (
              <ReferenceDot key={s.month} x={s.month} y={s.cr} r={4} fill="none" stroke="var(--color-signal)" strokeWidth={1.5} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="border-t border-[var(--color-line)] px-4 py-2 text-[0.6875rem] text-[var(--color-muted)]">
        March 2026 runs 4.1× the monthly mean. Circled points carry nine or more findings.
      </p>
    </Panel>
  )
}

function Funnel() {
  const max = pipeline[0].amount
  return (
    <Panel title="Realization pipeline" note="identified → recovered">
      <div className="space-y-3 p-4">
        {pipeline.map((s, i) => {
          const w = (s.amount / max) * 100
          const colour = i === pipeline.length - 1 ? 'var(--color-verify)'
            : `color-mix(in oklab, var(--color-gold) ${100 - i * 18}%, var(--color-verify))`
          return (
            <div key={s.stage}>
              <div className="flex items-baseline justify-between text-[0.75rem]">
                <span className="text-[var(--color-paper-dim)]">{s.stage}</span>
                <span className="num text-[var(--color-paper)]">{formatINR(s.amount)}</span>
              </div>
              <div className="mt-1.5 h-[6px] w-full bg-[var(--color-panel-2)]">
                <div className="h-full origin-left" style={{ width: `${w}%`, background: colour, animation: 'grow 620ms cubic-bezier(0.22,1,0.36,1) both', animationDelay: `${i * 90}ms` }} />
              </div>
              <p className="mt-1 text-[0.625rem] text-[var(--color-muted)]">{s.note}</p>
            </div>
          )
        })}
        <style>{`@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}`}</style>
      </div>
    </Panel>
  )
}

function HealthGauge() {
  const score = 62
  const R = 54
  const circumference = Math.PI * R
  const dash = (score / 100) * circumference
  const bands = [
    { label: 'Duplicates', got: 18, of: 25 },
    { label: 'Price', got: 11, of: 20 },
    { label: 'Behaviour', got: 12, of: 25 },
    { label: 'Integrity', got: 13, of: 20 },
    { label: 'Compliance', got: 8, of: 10 },
  ]
  return (
    <Panel title="Procurement Health Index" note="0–100 · weighted across five pillars">
      <div className="flex flex-col items-center px-4 pb-4 pt-2">
        <svg viewBox="0 0 140 78" className="w-40" role="img" aria-label={`Procurement Health Index ${score} out of 100`}>
          <path d="M 16 70 A 54 54 0 0 1 124 70" fill="none" stroke="var(--color-line)" strokeWidth="8" strokeLinecap="butt" />
          <path d="M 16 70 A 54 54 0 0 1 124 70" fill="none" stroke="var(--color-gold)" strokeWidth="8" strokeLinecap="butt"
            strokeDasharray={`${dash} ${circumference}`} style={{ transition: 'stroke-dasharray 900ms cubic-bezier(0.22,1,0.36,1)' }} />
        </svg>
        <p className="num -mt-6 text-[2.5rem] leading-none text-[var(--color-paper)]">
          <Derived metric="phi"><Ticker to={score} format={(n) => `${Math.round(n)}`} /></Derived>
        </p>
        <p className="mt-1 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--color-muted)]">Elevated exposure</p>
        <dl className="mt-4 w-full space-y-1.5">
          {bands.map((b) => (
            <div key={b.label} className="flex items-center gap-2 text-[0.6875rem]">
              <dt className="w-20 shrink-0 text-[var(--color-muted)]">{b.label}</dt>
              <dd className="flex-1">
                <span className="block h-[3px] bg-[var(--color-panel-2)]">
                  <span className="block h-full bg-[var(--color-gold-soft)]" style={{ width: `${(b.got / b.of) * 100}%` }} />
                </span>
              </dd>
              <dd className="num w-10 shrink-0 text-right text-[var(--color-paper-dim)]">{b.got}/{b.of}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Panel>
  )
}

function TopFindings() {
  const { openFinding } = useStore()
  return (
    <Panel title="Top findings by rupee value" note="click any row for the evidence">
      <ul>
        {topFindings.map((f, i) => {
          const v = vendorById.get(f.entities.vendorId)!
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => openFinding(f.id)}
                className="group flex w-full items-start gap-3 border-b border-[var(--color-line-soft)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--color-panel-2)]"
              >
                <span className="num mt-0.5 w-5 shrink-0 text-[0.625rem] text-[var(--color-muted)]">{String(i + 1).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <Chip kind={f.severity} />
                    <span className="num text-[0.625rem] text-[var(--color-muted)]">{f.ruleId}</span>
                    <span className="truncate text-[0.8125rem] text-[var(--color-paper)]">{v.name}</span>
                  </span>
                  <span className="mt-1 block truncate text-[0.75rem] text-[var(--color-paper-dim)]">{f.explanation}</span>
                </span>
                <span className="num shrink-0 pt-0.5 text-[0.8125rem] text-[var(--color-gold)]">{formatINR(f.moneyAtRisk, 'compact')}</span>
                <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-[var(--color-line)] transition-colors group-hover:text-[var(--color-gold)]" strokeWidth={1.5} aria-hidden />
              </button>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

const STRIP = [
  { k: 'Ingest', v: '5,847 documents · 4 formats' },
  { k: 'Resolve', v: '118 vendors → 96 entities · 15 SKUs normalised' },
  { k: 'Detect', v: `${CORPUS.detectors} detectors · 163 findings` },
  { k: 'Act', v: '94 validated · ₹6.21 L recovered' },
]

export function CommandCenter() {
  const { total, findingCount, injected } = useStore()
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-7">
          <div className={cn('hatch-gold h-full border border-[var(--color-line)] bg-[var(--color-panel)] p-5 sm:p-7',
            injected && 'border-[var(--color-gold-soft)]')}>
            <p className="kicker">Recoverable, identified</p>
            <p className="num mt-3 text-[clamp(2.25rem,5.4vw,3.75rem)] leading-none tracking-tight text-[var(--color-gold)]">
              <Derived metric="total">
                <Ticker to={total} live={total} format={(n) => `₹${groupIN(n)}`} />
              </Derived>
            </p>
            <p className="mt-3 max-w-[46ch] text-[0.8125rem] leading-relaxed text-[var(--color-paper-dim)]">
              Across {formatINR(CORPUS.spendAnalysed, 'compact')} of analysed spend — that is{' '}
              <Derived metric="ratio"><span className="num text-[var(--color-paper)]">0.43%</span></Derived> of the total,
              which is a conservative read against published duplicate-payment benchmarks.
            </p>
          </div>
        </div>
        <div className="col-span-12 xl:col-span-5">
          <TileGrid>
            <Tile label="Spend analysed" value={<Ticker to={42.6} format={(n) => `₹${n.toFixed(1)} Cr`} />} sub={`${CORPUS.months} months`} metric="spend" />
            <Tile label="Invoices scanned" value={<Ticker to={CORPUS.invoices} format={(n) => groupIN(n)} />} sub={`${groupIN(CORPUS.purchaseOrders)} POs · ${CORPUS.vendors} vendors`} />
            <Tile label="Findings" value={<Ticker to={findingCount} live={findingCount} format={(n) => `${Math.round(n)}`} />} sub={`${CORPUS.detectors} detectors · 5 pillars`} accent={injected ? 'gold' : undefined} />
            <Tile label="Already recovered" value={<Ticker to={RECOVERED} format={(n) => `₹${groupIN(n)}`} />} sub={`${((RECOVERED / TOTAL_IDENTIFIED) * 100).toFixed(0)}% of identified`} accent="verify" metric="recovered" />
          </TileGrid>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8"><SpendChart /></div>
        <div className="col-span-12 lg:col-span-4"><Funnel /></div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8"><TopFindings /></div>
        <div className="col-span-12 lg:col-span-4"><HealthGauge /></div>
      </div>

      <div className="grid grid-cols-2 gap-px border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-4">
        {STRIP.map((s) => (
          <div key={s.k} className="bg-[var(--color-panel)] px-4 py-3">
            <p className="kicker text-[var(--color-gold)]">{s.k}</p>
            <p className="num mt-1 text-[0.6875rem] leading-snug text-[var(--color-paper-dim)]">{s.v}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
