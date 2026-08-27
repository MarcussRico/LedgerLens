import { useEffect, useRef, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, LabelList } from 'recharts'
import { Database, Table2 } from 'lucide-react'
import { animate } from 'animejs'
import { Panel } from './shell'
import { AXIS_TICK } from './chartkit'
import { cn, formatINR, groupIN } from '../lib/utils'
import { useReducedMotion } from '../lib/hooks'

interface Answer {
  q: string
  short: string
  a: string
  sql: string
  chart: { label: string; value: number; flag?: boolean }[]
  unit: 'inr' | 'count'
  foot: string
  joins: string[]
}

/* Fixed questions with fixed answers. Nothing here is generated at runtime and
   nothing is asked of a language model — the SQL below each answer is the whole
   point: you can read the query that produced the number. */
const ANSWERS: Answer[] = [
  {
    q: 'Which vendor overcharged us the most?',
    short: 'Worst overcharge',
    a: 'Trident Infosystems — ₹3,03,400 above contracted rates across two SKUs, driven by a monitor price that drifted 23.9% over eighteen months while the peer median stayed flat.',
    sql: `SELECT v.name,
       SUM((i.unit_price - rc.contract_rate) * i.qty) AS overbilled
FROM   invoice_lines i
JOIN   sku_resolved   s  ON s.sku_id    = i.sku_id
JOIN   rate_card      rc ON rc.sku_id   = s.sku_id
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
      { label: 'Thangam Electricals', value: 46_256 },
      { label: 'Vetri Facility Svcs', value: 44_640 },
      { label: 'Nexa Consulting', value: 28_900 },
      { label: 'Velan Powergrid', value: 19_400 },
    ],
    unit: 'inr',
    foot: 'joins on resolved_entity_id, never on vendor name — aliases collapse before the sum',
    joins: ['invoice_lines', 'sku_resolved', 'rate_card', 'vendor_entity'],
  },
  {
    q: 'Show me every purchase just below the approval limit',
    short: 'Below the limit',
    a: '371 purchase orders fall in the ₹45,000–₹50,000 band against 12 in the band immediately above it. Four vendors account for 61% of them.',
    sql: `WITH banded AS (
  SELECT po_id, vendor_id, amount,
         width_bucket(amount, 0, 80000, 16) AS bucket
  FROM   purchase_orders
  WHERE  amount < 80000
)
SELECT (bucket - 1) * 5000 AS band_lo,
       COUNT(*)            AS orders
FROM   banded
GROUP  BY bucket
ORDER  BY bucket;`,
    chart: [
      { label: '30–35k', value: 28 }, { label: '35–40k', value: 37 },
      { label: '40–45k', value: 112 }, { label: '45–50k', value: 371, flag: true },
      { label: '50–55k', value: 12 }, { label: '55–60k', value: 12 },
    ],
    unit: 'count',
    foot: 'the threshold is ₹50,000 — the cliff after it is the finding, not the spike before it',
    joins: ['purchase_orders'],
  },
  {
    q: 'What did we spend on IT hardware last quarter?',
    short: 'IT hardware spend',
    a: '₹2.31 Cr across three vendors and four resolved SKUs. Cortex holds 54% of it at a price index of 108; Trident holds 39% at 126.',
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
    joins: ['invoices', 'vendor_entity', 'sku_resolved'],
  },
]

function Sql({ text, play }: { text: string; play: number }) {
  const ref = useRef<HTMLPreElement | null>(null)
  const reduced = useReducedMotion()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduced) { el.textContent = text; return }
    const s = { i: 0 }
    el.textContent = ''
    const a = animate(s, {
      i: text.length, duration: Math.min(1100, text.length * 4), ease: 'linear',
      onUpdate: () => { if (ref.current) ref.current.textContent = text.slice(0, Math.round(s.i)) },
    })
    return () => { a.pause() }
  }, [text, play, reduced])
  return (
    <pre ref={ref}
      className="num h-full overflow-auto whitespace-pre px-4 py-3 text-[0.6875rem] leading-[1.62] text-[var(--color-slate)]" />
  )
}

export function AskLedgerLens() {
  // Always a question selected: an empty right-hand panel reads as broken.
  const [active, setActive] = useState(0)
  const ans = ANSWERS[active]
  const max = Math.max(...ans.chart.map((c) => c.value))
  const fmt = (v: number) => (ans.unit === 'inr' ? formatINR(v, 'compact') : groupIN(v))

  return (
    <div className="space-y-4">
      {/* the three questions, always visible, one always chosen */}
      <div className="grid grid-cols-1 gap-px border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-3">
        {ANSWERS.map((a, i) => (
          <button key={a.q} type="button" onClick={() => setActive(i)}
            aria-pressed={active === i}
            className={cn('group px-4 py-4 text-left transition-colors',
              active === i ? 'bg-[var(--color-panel-2)]' : 'bg-[var(--color-panel)] hover:bg-[var(--color-panel-2)]')}>
            <span className="flex items-center gap-2">
              <span className={cn('num text-[0.625rem]',
                active === i ? 'text-[var(--color-gold)]' : 'text-[var(--color-muted)]')}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className={cn('h-px flex-1 transition-colors',
                active === i ? 'bg-[var(--color-gold-soft)]' : 'bg-[var(--color-line)]')} />
            </span>
            <span className={cn('mt-2.5 block text-[0.875rem] leading-snug transition-colors',
              active === i ? 'text-[var(--color-paper)]' : 'text-[var(--color-paper-dim)]')}>
              {a.q}
            </span>
          </button>
        ))}
      </div>

      {/* answer — the sentence a person actually wanted */}
      <div className="border border-[var(--color-line)] bg-[var(--color-panel)] px-5 py-5 sm:px-7">
        <p className="kicker">Answer</p>
        <p className="mt-3 max-w-[92ch] text-[clamp(1rem,1.7vw,1.25rem)] leading-[1.5] text-[var(--color-paper)]">
          {ans.a}
        </p>
      </div>

      {/* the query and the result, side by side and both always full */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-6">
          <Panel
            title="The query that produced it"
            note="shown always — this is the trust mechanism"
            right={
              <span className="hidden items-center gap-1.5 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-[var(--color-muted)] sm:flex">
                <Database className="size-3" strokeWidth={1.5} aria-hidden /> read-only
              </span>
            }>
            <div className="h-[19rem]"><Sql text={ans.sql} play={active} /></div>
            <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--color-line)] px-4 py-2.5">
              <Table2 className="size-3 shrink-0 text-[var(--color-muted)]" strokeWidth={1.5} aria-hidden />
              {ans.joins.map((t) => (
                <span key={t} className="num border border-[var(--color-line)] px-1.5 py-0.5 text-[0.5625rem] text-[var(--color-paper-dim)]">
                  {t}
                </span>
              ))}
            </div>
          </Panel>
        </div>

        <div className="col-span-12 xl:col-span-6">
          <Panel title="Result" note={ans.foot}>
            <div className="h-[19rem] px-1 pb-1 pt-4"
              role="img"
              aria-label={`Result chart. ${ans.chart.map((c) => `${c.label}: ${fmt(c.value)}`).join('; ')}.`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ans.chart} layout="vertical" margin={{ top: 0, right: 76, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-line-soft)" horizontal={false} />
                  <XAxis type="number" domain={[0, max * 1.16]} tick={AXIS_TICK} tickLine={false}
                    axisLine={{ stroke: 'var(--color-line)' }} tickFormatter={fmt} />
                  <YAxis type="category" dataKey="label" tick={{ ...AXIS_TICK, fontSize: 9.5 }}
                    tickLine={false} axisLine={false} width={122} />
                  <Bar dataKey="value" isAnimationActive={false} barSize={16}>
                    {ans.chart.map((c) => (
                      <Cell key={c.label} fill={c.flag ? 'var(--color-signal)' : 'var(--color-gold)'} />
                    ))}
                    <LabelList dataKey="value" position="right"
                      formatter={(v: unknown) => (typeof v === 'number' ? fmt(v) : '')}
                      style={{ fill: 'var(--color-paper-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      </div>

      {/* why it works this way, stated plainly rather than implied */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 border border-[var(--color-line)] bg-[var(--color-panel)] px-5 py-4 lg:col-span-8">
          <p className="kicker mb-2.5">Why the query is on screen</p>
          <p className="max-w-[80ch] text-[0.8125rem] leading-relaxed text-[var(--color-paper-dim)]">
            An answer you cannot check is a claim. Every figure above came back from the database, and the
            query that fetched it is printed underneath so you can disagree with the logic rather than
            having to trust the sentence. A model that writes the query still cannot invent the number.
          </p>
        </div>
        <div className="col-span-12 border border-[var(--color-line)] bg-[var(--color-panel)] px-5 py-4 lg:col-span-4">
          <p className="kicker mb-2.5">Scope, honestly</p>
          <p className="text-[0.8125rem] leading-relaxed text-[var(--color-paper-dim)]">
            These three questions are prepared, with fixed queries and fixed answers. Open-ended natural
            language is not wired up, and we would rather show you three you can verify than a box that
            looks like it answers anything.
          </p>
        </div>
      </div>
    </div>
  )
}
