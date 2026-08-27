import { useEffect, useMemo, useRef, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Cell } from 'recharts'
import { animate, utils } from 'animejs'
import { Panel } from './shell'
import { TipBox, tipData, AXIS_TICK, type TipProps } from './chartkit'
import { cn, formatINR, groupIN } from '../lib/utils'
import { poHistogram, THRESHOLD, splitCase, otherSplitCases } from '../data/invoices'
import { benford, BENFORD_CHI2, BENFORD_DF, offHours, monthlySpend, MARCH_MULTIPLE } from '../data/metrics'
import { vendorById } from '../data/vendors'
import { useInView, useReducedMotion } from '../lib/hooks'

/* ── The most persuasive object on the site. It does not animate until it is
      in front of the people it has to convince. ── */
function ThresholdHistogram() {
  const [wrapRef, inView] = useInView<HTMLDivElement>('-20% 0px')
  const svgRef = useRef<SVGSVGElement | null>(null)
  const reduced = useReducedMotion()

  const data = useMemo(
    () => poHistogram.map((b) => ({ ...b, label: `${b.lo / 1000}–${b.hi / 1000}k`, under: b.hi <= THRESHOLD, hug: b.lo >= 40_000 && b.hi <= THRESHOLD })),
    [],
  )
  const max = Math.max(...data.map((d) => d.count))
  const W = 720, H = 260, PAD_L = 42, PAD_B = 34, PAD_T = 16
  const bw = (W - PAD_L - 12) / data.length
  const thresholdX = PAD_L + (THRESHOLD / 5_000) * bw

  useEffect(() => {
    if (!inView) return
    const svg = svgRef.current
    if (!svg) return
    const bars = Array.from(svg.querySelectorAll<SVGRectElement>('[data-bar]'))
    const line = svg.querySelector<SVGLineElement>('[data-threshold]')
    const hugs = Array.from(svg.querySelectorAll<SVGRectElement>('[data-hug="1"]'))

    if (reduced) {
      bars.forEach((b) => utils.set(b, { scaleY: 1, opacity: 1 }))
      if (line) utils.set(line, { strokeDashoffset: 0, opacity: 1 })
      return
    }

    bars.forEach((b) => utils.set(b, { scaleY: 0, opacity: 1, transformBox: 'fill-box', transformOrigin: '50% 100%' }))
    if (line) utils.set(line, { strokeDasharray: H, strokeDashoffset: H, opacity: 1 })

    const a = animate(bars, { scaleY: 1, duration: 520, delay: (_el: unknown, i?: number) => (i ?? 0) * 40, ease: 'outExpo' })
    const total = data.length * 40 + 520
    const b = line ? animate(line, { strokeDashoffset: 0, duration: 620, delay: total, ease: 'outExpo' }) : null
    const c = animate(hugs, {
      opacity: [1, 0.45, 1],
      duration: 700,
      delay: total + 620,
      ease: 'inOutQuad',
    })
    return () => { a.pause(); b?.pause(); c.pause() }
  }, [inView, reduced, data.length])

  return (
    <Panel
      title="Threshold hugging — purchase order values below ₹80,000"
      note={`${groupIN(1203)} POs · ₹5,000 buckets · director sign-off at ₹50,000`}
    >
      <div ref={wrapRef} className="px-2 pb-2 pt-3">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
          aria-label={`Histogram of purchase order values. The ₹45,000–₹50,000 bucket holds ${data[9].count} orders, roughly ${(data[9].count / data[10].count).toFixed(0)} times the ₹50,000–₹55,000 bucket immediately above the approval threshold.`}>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={PAD_L} x2={W - 8} y1={PAD_T + (1 - f) * (H - PAD_T - PAD_B)} y2={PAD_T + (1 - f) * (H - PAD_T - PAD_B)} stroke="var(--color-line-soft)" strokeWidth="1" />
              <text x={PAD_L - 8} y={PAD_T + (1 - f) * (H - PAD_T - PAD_B) + 3} textAnchor="end"
                fill="var(--color-muted)" fontSize="9" fontFamily="var(--font-mono)">{Math.round(f * max)}</text>
            </g>
          ))}

          {data.map((d, i) => {
            const h = (d.count / max) * (H - PAD_T - PAD_B)
            const x = PAD_L + i * bw
            const fill = d.hug ? 'var(--color-signal)' : d.under ? 'var(--color-gold)' : 'var(--color-slate)'
            return (
              <g key={d.lo}>
                <rect data-bar data-hug={d.hug ? '1' : '0'} x={x + 1.5} y={H - PAD_B - h} width={bw - 3} height={Math.max(h, 0.5)} fill={fill} opacity={d.hug ? 1 : 0.82} />
                {i % 2 === 0 && (
                  <text x={x + bw / 2} y={H - PAD_B + 14} textAnchor="middle" fill="var(--color-muted)" fontSize="8.5" fontFamily="var(--font-mono)">
                    {d.lo / 1000}k
                  </text>
                )}
              </g>
            )
          })}

          <line data-threshold x1={thresholdX} x2={thresholdX} y1={PAD_T - 6} y2={H - PAD_B} stroke="var(--color-signal)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0" />
          <text x={thresholdX + 6} y={PAD_T + 4} fill="var(--color-signal)" fontSize="9.5" fontFamily="var(--font-mono)" letterSpacing="0.08em">
            ₹50,000 · DIRECTOR APPROVAL
          </text>
        </svg>
      </div>
      <p className="border-t border-[var(--color-line)] px-4 py-2.5 text-[0.75rem] leading-relaxed text-[var(--color-paper-dim)]">
        <span className="num text-[var(--color-signal)]">{data[9].count}</span> orders sit in the ₹45,000–₹50,000 bucket.
        The bucket immediately above the threshold holds <span className="num text-[var(--color-paper)]">{data[10].count}</span>.
        Nothing about ordinary purchasing produces that cliff.
      </p>
    </Panel>
  )
}

/* ── Benford ── */
interface BenfordDatum { digit: number; expected: number; observed: number; deviation: number }
function BenfordTip(p: TipProps<BenfordDatum>) {
  const d = tipData(p)
  if (!d) return null
  return (
    <TipBox
      title={`Leading digit ${d.datum.digit}`}
      rows={[
        { label: 'Expected', value: `${(d.datum.expected * 100).toFixed(1)}%`, colour: 'var(--color-slate)' },
        { label: 'Observed', value: `${(d.datum.observed * 100).toFixed(1)}%`, colour: Math.abs(d.datum.deviation) > 0.03 ? 'var(--color-signal)' : 'var(--color-gold)' },
        { label: 'Deviation', value: `${d.datum.deviation > 0 ? '+' : ''}${(d.datum.deviation * 100).toFixed(1)}pp` },
      ]}
    />
  )
}

function Benford() {
  const data = useMemo(() => benford.map((b) => ({ ...b, e: b.expected * 100, o: b.observed * 100 })), [])
  return (
    <Panel title="Benford's Law — leading digit distribution" note={`5,847 invoice amounts · χ² ${BENFORD_CHI2} on ${BENFORD_DF} df · p < 0.001`}>
      <div className="h-52 px-1 pb-1 pt-3" role="img"
        aria-label="Paired bar chart comparing the Benford-expected leading-digit distribution against the observed distribution across 5,847 invoice amounts. Digit 4 is observed at 18.6% against an expected 9.7%; all other digits track the expected curve within two percentage points.">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 12, left: -18, bottom: 0 }} barGap={1}>
            <CartesianGrid stroke="var(--color-line-soft)" vertical={false} />
            <XAxis dataKey="digit" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--color-line)' }} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={38} tickFormatter={(v: number) => `${v}%`} />
            <RTooltip cursor={{ fill: 'color-mix(in oklab, var(--color-paper) 4%, transparent)' }} content={<BenfordTip />} />
            <Bar dataKey="e" fill="var(--color-slate)" opacity={0.5} isAnimationActive={false} />
            <Bar dataKey="o" isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.digit} fill={Math.abs(d.deviation) > 0.03 ? 'var(--color-signal)' : 'var(--color-gold)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="border-t border-[var(--color-line)] px-4 py-2.5 text-[0.75rem] leading-relaxed text-[var(--color-paper-dim)]">
        Digit 4 appears in <span className="num text-[var(--color-signal)]">18.6%</span> of amounts against an expected{' '}
        <span className="num">9.7%</span>. Amounts beginning with 4 are being chosen, not incurred — which is what
        parking a purchase at ₹4x,xxx looks like from above.
      </p>
    </Panel>
  )
}

/* ── PO splitting case table ── */
function SplitCases() {
  const cases = [
    { vendorId: splitCase.vendorId, count: splitCase.pos.length, each: 48_000, total: splitCase.total, window: splitCase.window, approver: splitCase.approver },
    ...otherSplitCases,
  ]
  return (
    <Panel title="PO splitting" note="orders below the threshold, same vendor, one approval window">
      <table className="w-full text-[0.75rem]">
        <thead>
          <tr className="border-b border-[var(--color-line)] text-left font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-[var(--color-muted)]">
            <th className="px-4 py-2 font-normal">Vendor</th>
            <th className="px-2 py-2 text-right font-normal">Orders</th>
            <th className="px-2 py-2 text-right font-normal">Each</th>
            <th className="px-2 py-2 text-right font-normal">Combined</th>
            <th className="hidden px-2 py-2 font-normal sm:table-cell">Window</th>
            <th className="hidden px-4 py-2 font-normal lg:table-cell">Approved by</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c, i) => (
            <tr key={c.vendorId + i} className={cn('border-b border-[var(--color-line-soft)] last:border-b-0', i === 0 && 'bg-[color-mix(in_oklab,var(--color-signal)_7%,transparent)]')}>
              <td className="px-4 py-2.5 text-[var(--color-paper)]">{vendorById.get(c.vendorId)?.name}</td>
              <td className="num px-2 py-2.5 text-right text-[var(--color-paper-dim)]">{c.count}</td>
              <td className="num px-2 py-2.5 text-right text-[var(--color-paper-dim)]">{formatINR(c.each)}</td>
              <td className="num px-2 py-2.5 text-right text-[var(--color-signal)]">{formatINR(c.total)}</td>
              <td className="num hidden px-2 py-2.5 text-[var(--color-muted)] sm:table-cell">{c.window}</td>
              <td className="hidden px-4 py-2.5 text-[0.6875rem] text-[var(--color-muted)] lg:table-cell">{c.approver}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-[var(--color-line)] px-4 py-2.5 text-[0.75rem] leading-relaxed text-[var(--color-paper-dim)]">
        Five purchase orders, ₹48,000 each, same vendor, same week — <span className="num text-[var(--color-signal)]">₹2,40,000</span> routed
        around director approval. Each order passes inspection. The bypass only exists across all five.
      </p>
    </Panel>
  )
}

/* ── Off-hours heatmap ── */
function OffHours() {
  const [hover, setHover] = useState<{ d: string; h: number; n: number } | null>(null)
  const max = Math.max(...offHours.flatMap((r) => r.hours))
  return (
    <Panel title="Submission time — day × hour" note="who is filing invoices at 2am on a Sunday">
      <div className="overflow-x-auto p-4">
        <div className="min-w-[30rem]">
          <div className="flex">
            <div className="w-9 shrink-0" />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex-1 text-center font-mono text-[0.5rem] text-[var(--color-muted)]">{h % 6 === 0 ? h : ''}</div>
            ))}
          </div>
          {offHours.map((row) => (
            <div key={row.day} className="mt-[2px] flex items-center">
              <div className="w-9 shrink-0 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-[var(--color-muted)]">{row.day}</div>
              {row.hours.map((n, h) => {
                const isBurn = (row.day === 'Sun' && h >= 1 && h <= 3) || (row.day === 'Sat' && h === 23)
                const a = n / max
                return (
                  <button
                    key={h} type="button"
                    onMouseEnter={() => setHover({ d: row.day, h, n })}
                    onFocus={() => setHover({ d: row.day, h, n })}
                    onMouseLeave={() => setHover(null)}
                    aria-label={`${row.day} ${String(h).padStart(2, '0')}:00 — ${n} submissions`}
                    className="mx-[1px] h-4 flex-1 border border-transparent transition-colors hover:border-[var(--color-paper-dim)]"
                    style={{
                      background: n === 0 ? 'var(--color-panel-2)'
                        : isBurn ? `color-mix(in oklab, var(--color-signal) ${25 + a * 75}%, var(--color-panel-2))`
                        : `color-mix(in oklab, var(--color-slate) ${12 + a * 78}%, var(--color-panel-2))`,
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="border-t border-[var(--color-line)] px-4 py-2.5 text-[0.75rem] text-[var(--color-paper-dim)]">
        {hover
          ? <>{hover.d} {String(hover.h).padStart(2, '0')}:00 — <span className="num text-[var(--color-paper)]">{hover.n}</span> submissions</>
          : <>Eleven invoices filed in the Sunday 02:00 slot. Corpus-wide, the off-hours share is <span className="num">1.1%</span>.</>}
      </p>
    </Panel>
  )
}

/* ── Year-end dumping ── */
interface MonthDatum { month: string; spend: number; anomalies: number }
function MonthTip(p: TipProps<MonthDatum>) {
  const d = tipData(p)
  if (!d) return null
  return <TipBox title={d.datum.month} rows={[{ label: 'Spend', value: formatINR(d.datum.spend, 'compact'), colour: 'var(--color-gold)' }]} />
}

function YearEnd() {
  return (
    <Panel title="Fiscal year-end spend" note={`March at ${MARCH_MULTIPLE.toFixed(1)}× the monthly mean`}>
      <div className="h-44 px-1 pb-1 pt-3" role="img"
        aria-label="Bar chart of monthly spend across 18 months. Every month falls between ₹1.98 and ₹2.63 crore except March 2026 at ₹9.39 crore, 4.1 times the mean of the other months.">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthlySpend} margin={{ top: 4, right: 12, left: -14, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-line-soft)" vertical={false} />
            <XAxis dataKey="month" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--color-line)' }} interval={2} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={42} tickFormatter={(v: number) => `${(v / 1_00_00_000).toFixed(0)}Cr`} />
            <RTooltip cursor={{ fill: 'color-mix(in oklab, var(--color-paper) 4%, transparent)' }} content={<MonthTip />} />
            <Bar dataKey="spend" isAnimationActive={false}>
              {monthlySpend.map((m) => (
                <Cell key={m.month} fill={m.month === 'Mar 26' ? 'var(--color-signal)' : 'var(--color-slate)'} opacity={m.month === 'Mar 26' ? 1 : 0.6} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="border-t border-[var(--color-line)] px-4 py-2.5 text-[0.75rem] leading-relaxed text-[var(--color-paper-dim)]">
        Budget that would otherwise lapse converted into inventory nobody requisitioned. It repeats every year,
        which is exactly why a year-on-year total never shows it.
      </p>
    </Panel>
  )
}

export function PatternLab() {
  return (
    <div className="space-y-4">
      <ThresholdHistogram />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6"><Benford /></div>
        <div className="col-span-12 lg:col-span-6"><SplitCases /></div>
      </div>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-7"><OffHours /></div>
        <div className="col-span-12 lg:col-span-5"><YearEnd /></div>
      </div>
    </div>
  )
}
