import { useEffect, useRef, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from 'recharts'
import { CornerDownLeft, Terminal } from 'lucide-react'
import { animate } from 'animejs'
import { Panel } from './shell'
import { AXIS_TICK } from './chartkit'
import { cn, formatINR, groupIN } from '../lib/utils'
import { useReducedMotion } from '../lib/hooks'

interface Answer {
  q: string
  a: string
  sql: string
  chart: { label: string; value: number; flag?: boolean }[]
  unit: 'inr' | 'count'
  foot: string
}

/* Canned, because there is no backend — and the SQL is shown because that is
   the trust mechanism. A language model that shows its query cannot hallucinate
   a number without showing you where it came from. */
const ANSWERS: Answer[] = [
  {
    q: 'Which vendor overcharged us the most?',
    a: 'Trident Infosystems — ₹3,03,400 above contracted rates across two SKUs, driven by a monitor price that drifted 23.9% over eighteen months while the peer median stayed flat.',
    sql: `SELECT v.name,
       SUM((i.unit_price - rc.contract_rate) * i.qty) AS overbilled
FROM   invoice_lines i
JOIN   sku_resolved   s  ON s.sku_id = i.sku_id
JOIN   rate_card      rc ON rc.sku_id = s.sku_id
                        AND rc.vendor_id = i.vendor_id
JOIN   vendor_entity  v  ON v.entity_id = i.resolved_entity_id
WHERE  i.invoice_date BETWEEN '2025-03-01' AND '2026-08-31'
  AND  i.unit_price > rc.contract_rate
GROUP  BY v.name
ORDER  BY overbilled DESC
LIMIT  6;`,
    chart: [
      { label: 'Trident Infosystems', value: 3_03_400, flag: true },
      { label: 'Sharma Traders', value: 1_07_100 },
      { label: 'Vetri Facility Svcs', value: 44_640 },
      { label: 'Thangam Electricals', value: 46_256 },
      { label: 'Nexa Consulting', value: 28_900 },
      { label: 'Velan Powergrid', value: 19_400 },
    ],
    unit: 'inr',
    foot: 'joins on resolved_entity_id, not vendor name — aliases collapse before the sum',
  },
  {
    q: 'Show me every purchase just below the approval limit',
    a: '371 purchase orders fall in the ₹45,000–₹50,000 band against 12 in the band immediately above it. Four vendors account for 61% of them.',
    sql: `WITH banded AS (
  SELECT po_id, vendor_id, amount,
         width_bucket(amount, 0, 80000, 16) AS bucket
  FROM   purchase_orders
  WHERE  amount < 80000
)
SELECT (bucket-1)*5000 AS band_lo,
       COUNT(*)        AS orders
FROM   banded
GROUP  BY bucket
ORDER  BY bucket;`,
    chart: [
      { label: '30–35k', value: 28 }, { label: '35–40k', value: 37 },
      { label: '40–45k', value: 112 }, { label: '45–50k', value: 371, flag: true },
      { label: '50–55k', value: 12 }, { label: '55–60k', value: 12 },
    ],
    unit: 'count',
    foot: 'the approval threshold is ₹50,000 — the cliff is the finding, not the spike',
  },
  {
    q: 'What did we spend on IT hardware last quarter?',
    a: '₹2.31 Cr across 3 vendors and 4 resolved SKUs. Cortex holds 54% of it at a price index of 108; Trident holds 39% at 126.',
    sql: `SELECT v.name, SUM(i.amount) AS spend
FROM   invoices i
JOIN   vendor_entity v ON v.entity_id = i.resolved_entity_id
JOIN   sku_resolved  s ON s.sku_id    = i.primary_sku_id
WHERE  s.category = 'IT Hardware'
  AND  i.invoice_date >= date_trunc('quarter', DATE '2026-08-31')
                        - INTERVAL '3 months'
  AND  i.invoice_date <  date_trunc('quarter', DATE '2026-08-31')
GROUP  BY v.name
ORDER  BY spend DESC;`,
    chart: [
      { label: 'Cortex Computing', value: 1_24_70_000 },
      { label: 'Trident Infosystems', value: 90_10_000, flag: true },
      { label: 'Velan Powergrid', value: 16_20_000 },
    ],
    unit: 'inr',
    foot: 'category comes from the resolved SKU, never from the raw line description',
  },
]

function Sql({ text, play }: { text: string; play: boolean }) {
  const ref = useRef<HTMLPreElement | null>(null)
  const reduced = useReducedMotion()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!play || reduced) { el.textContent = text; return }
    const s = { i: 0 }
    el.textContent = ''
    const a = animate(s, {
      i: text.length, duration: Math.min(1400, text.length * 5), ease: 'linear',
      onUpdate: () => { if (ref.current) ref.current.textContent = text.slice(0, Math.round(s.i)) },
    })
    return () => { a.pause() }
  }, [text, play, reduced])
  return <pre ref={ref} className="num overflow-x-auto whitespace-pre px-4 py-3 text-[0.6875rem] leading-[1.6] text-[var(--color-slate)]" />
}

export function AskLedgerLens() {
  const [active, setActive] = useState<number | null>(null)
  const [typed, setTyped] = useState('')
  const ans = active !== null ? ANSWERS[active] : null
  const max = ans ? Math.max(...ans.chart.map((c) => c.value)) : 1

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 lg:col-span-5">
        <Panel title="Ask LedgerLens" note="natural language in · SQL and a chart out">
          <div className="p-4">
            <form
              onSubmit={(e) => { e.preventDefault(); const i = ANSWERS.findIndex((a) => a.q.toLowerCase().includes(typed.toLowerCase().slice(0, 12))); setActive(i >= 0 ? i : 0) }}
              className="flex items-center gap-2 border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2"
            >
              <Terminal className="size-4 shrink-0 text-[var(--color-muted)]" strokeWidth={1.5} aria-hidden />
              <input
                value={typed} onChange={(e) => setTyped(e.target.value)}
                placeholder="Ask about the spend…"
                aria-label="Ask a question about the procurement data"
                className="min-w-0 flex-1 bg-transparent text-[0.8125rem] text-[var(--color-paper)] outline-none placeholder:text-[var(--color-muted)]"
              />
              <button type="submit" aria-label="Run query" className="shrink-0 text-[var(--color-muted)] transition-colors hover:text-[var(--color-gold)]">
                <CornerDownLeft className="size-4" strokeWidth={1.5} />
              </button>
            </form>

            <p className="kicker mt-5">Try one of these</p>
            <ul className="mt-2 space-y-1.5">
              {ANSWERS.map((a, i) => (
                <li key={a.q}>
                  <button type="button" onClick={() => { setActive(i); setTyped(a.q) }}
                    className={cn('w-full border px-3 py-2 text-left text-[0.8125rem] leading-snug transition-colors',
                      active === i ? 'border-[var(--color-gold-soft)] bg-[color-mix(in_oklab,var(--color-gold)_8%,transparent)] text-[var(--color-gold)]'
                        : 'border-[var(--color-line)] text-[var(--color-paper-dim)] hover:border-[var(--color-paper-dim)] hover:text-[var(--color-paper)]')}>
                    {a.q}
                  </button>
                </li>
              ))}
            </ul>

            <p className="mt-6 border-t border-[var(--color-line)] pt-4 text-[0.6875rem] leading-relaxed text-[var(--color-muted)]">
              The model writes the query and the sentence. It never writes the number — the number comes back
              from the database. That is why the SQL is on screen and not hidden behind the answer.
            </p>
          </div>
        </Panel>
      </div>

      <div className="col-span-12 space-y-4 lg:col-span-7">
        {!ans ? (
          <Panel>
            <div className="flex min-h-[20rem] items-center justify-center px-8 text-center">
              <p className="max-w-[36ch] text-[0.875rem] leading-relaxed text-[var(--color-muted)]">
                Pick a question. You will get one sentence, the SQL that produced it, and the chart —
                in that order, every time.
              </p>
            </div>
          </Panel>
        ) : (
          <>
            <Panel title="Answer" note={`generated ${new Date().toISOString().slice(0, 10)} · 3 sources joined`}>
              <p className="px-4 py-4 text-[0.9375rem] leading-relaxed text-[var(--color-paper)]">{ans.a}</p>
            </Panel>

            <Panel title="Generated SQL" note="shown, always — this is the trust mechanism">
              <Sql text={ans.sql} play={active !== null} />
              <p className="border-t border-[var(--color-line)] px-4 py-2 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-[var(--color-muted)]">{ans.foot}</p>
            </Panel>

            <Panel title="Result">
              <div className="h-52 px-1 pb-1 pt-4" role="img" aria-label={`Chart of the query result. ${ans.chart.map((c) => `${c.label}: ${ans.unit === 'inr' ? formatINR(c.value) : groupIN(c.value)}`).join('; ')}.`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ans.chart} layout="vertical" margin={{ top: 0, right: 60, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke="var(--color-line-soft)" horizontal={false} />
                    <XAxis type="number" domain={[0, max * 1.1]} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--color-line)' }}
                      tickFormatter={(v: number) => (ans.unit === 'inr' ? formatINR(v, 'compact') : groupIN(v))} />
                    <YAxis type="category" dataKey="label" tick={{ ...AXIS_TICK, fontSize: 9.5 }} tickLine={false} axisLine={false} width={120} />
                    <Bar dataKey="value" isAnimationActive={false} barSize={14}>
                      {ans.chart.map((c) => <Cell key={c.label} fill={c.flag ? 'var(--color-signal)' : 'var(--color-gold)'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </>
        )}
      </div>
    </div>
  )
}
