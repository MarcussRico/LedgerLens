import { useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ReferenceLine, Cell, Area, ComposedChart } from 'recharts'
import { Panel } from './shell'
import { TipBox, tipData, AXIS_TICK, type TipProps } from './chartkit'
import { formatINR, groupIN } from '../lib/utils'
import { priceBook, priceCreep, rateCard, skuById, skus } from '../data/skus'
import { vendorById } from '../data/vendors'

const BENCH_SKUS = Object.keys(priceBook)

interface BarDatum { vendor: string; price: number; volume: number; above: number; isWorst: boolean }
function PriceTip(p: TipProps<BarDatum>) {
  const d = tipData(p)
  if (!d) return null
  return (
    <TipBox
      title={d.datum.vendor}
      rows={[
        { label: 'Unit price', value: formatINR(d.datum.price), colour: d.datum.isWorst ? 'var(--color-signal)' : 'var(--color-gold)' },
        { label: 'vs median', value: `${d.datum.above > 0 ? '+' : ''}${(d.datum.above * 100).toFixed(1)}%` },
        { label: 'Volume', value: groupIN(d.datum.volume) },
      ]}
    />
  )
}

function Benchmark() {
  const [skuId, setSkuId] = useState(BENCH_SKUS[0])
  const sku = skuById.get(skuId)!
  const rows = priceBook[skuId]
  const data = useMemo<BarDatum[]>(() => {
    const worst = Math.max(...rows.map((r) => r.unitPrice))
    return rows.map((r) => ({
      vendor: vendorById.get(r.vendorId)?.name ?? r.vendorId,
      price: r.unitPrice,
      volume: r.volume,
      above: r.unitPrice / sku.peerMedian - 1,
      isWorst: r.unitPrice === worst,
    }))
  }, [rows, sku.peerMedian])
  const worst = data.find((d) => d.isWorst)!
  const exposure = Math.round((worst.price - sku.peerMedian) * worst.volume)

  return (
    <Panel
      title="Unit price across vendors"
      note="after SKU normalisation — raw descriptions resolved to one catalogue item"
      right={
        <select
          value={skuId} onChange={(e) => setSkuId(e.target.value)}
          aria-label="Select SKU"
          className="num max-w-[14rem] border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1 text-[0.6875rem] text-[var(--color-paper)] outline-none"
        >
          {BENCH_SKUS.map((id) => <option key={id} value={id}>{skuById.get(id)!.canonical}</option>)}
        </select>
      }
    >
      <div className="h-56 px-1 pb-1 pt-4" role="img"
        aria-label={`Horizontal bar chart of unit price by vendor for ${sku.canonical}. The peer median is ${formatINR(sku.peerMedian)}; ${worst.vendor} is highest at ${formatINR(worst.price)}, ${(worst.above * 100).toFixed(0)} percent above median.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-line-soft)" horizontal={false} />
            <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--color-line)' }}
              tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
            <YAxis type="category" dataKey="vendor" tick={{ ...AXIS_TICK, fontSize: 9.5 }} tickLine={false} axisLine={false} width={130} />
            <RTooltip cursor={{ fill: 'color-mix(in oklab, var(--color-paper) 4%, transparent)' }} content={<PriceTip />} />
            <ReferenceLine x={sku.peerMedian} stroke="var(--color-verify)" strokeDasharray="4 3" strokeWidth={1.5}
              label={{ value: `peer median ${formatINR(sku.peerMedian)}`, position: 'top', fill: 'var(--color-verify)', fontSize: 9.5, fontFamily: 'var(--font-mono)' }} />
            <Bar dataKey="price" isAnimationActive={false} barSize={16}>
              {data.map((d) => <Cell key={d.vendor} fill={d.isWorst ? 'var(--color-signal)' : d.price > sku.peerMedian ? 'var(--color-gold)' : 'var(--color-slate)'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="border-t border-[var(--color-line)] px-4 py-3">
        <p className="text-[0.8125rem] leading-relaxed text-[var(--color-paper-dim)]">
          <span className="text-[var(--color-paper)]">{worst.vendor}</span> is{' '}
          <span className="num text-[var(--color-signal)]">{(worst.above * 100).toFixed(0)}% above median</span> on{' '}
          {sku.canonical.toLowerCase()}. At {groupIN(worst.volume)} {sku.unit}s that is{' '}
          <span className="num text-[var(--color-gold)]">{formatINR(exposure)}</span> of avoidable cost.
        </p>
        <p className="num mt-2 text-[0.625rem] text-[var(--color-muted)]">
          ({groupIN(worst.price)} − {groupIN(sku.peerMedian)}) × {groupIN(worst.volume)} = {groupIN(exposure)}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sku.variants.map((v) => (
            <span key={v} className="num border border-[var(--color-line)] px-1.5 py-0.5 text-[0.5625rem] text-[var(--color-muted)]">{v}</span>
          ))}
          <span className="num px-1 py-0.5 text-[0.5625rem] text-[var(--color-verify)]">→ all resolve to {sku.id}</span>
        </div>
      </div>
    </Panel>
  )
}

interface CreepDatum { month: string; vendor: number; peer: number; gap: number }
function CreepTip(p: TipProps<CreepDatum>) {
  const d = tipData(p)
  if (!d) return null
  return (
    <TipBox
      title={d.datum.month}
      rows={[
        { label: 'Trident', value: formatINR(d.datum.vendor), colour: 'var(--color-signal)' },
        { label: 'Peer median', value: formatINR(d.datum.peer), colour: 'var(--color-verify)' },
        { label: 'Gap', value: `+${(((d.datum.vendor / d.datum.peer) - 1) * 100).toFixed(1)}%` },
      ]}
    />
  )
}

function Creep() {
  const data = useMemo<CreepDatum[]>(() => priceCreep.series.map((s) => ({ ...s, gap: s.vendor - s.peer })), [])
  const first = data[0], last = data[data.length - 1]
  return (
    <Panel title="Price creep — Trident Infosystems against the peer median"
      note={`${skuById.get(priceCreep.skuId)!.canonical} · 18 months · R² 0.987`}>
      <div className="h-56 px-1 pb-1 pt-3" role="img"
        aria-label="Line chart over 18 months. The peer median holds flat near ₹9,120 while Trident Infosystems steps up roughly 3 percent each quarter from ₹9,240 to ₹11,450, a cumulative divergence of 23.9 percent.">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 14, left: -8, bottom: 0 }}>
            <defs>
              <pattern id="creepHatch" width="6" height="6" patternTransform="rotate(-45)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-signal)" strokeWidth="1.4" opacity="0.5" />
              </pattern>
            </defs>
            <CartesianGrid stroke="var(--color-line-soft)" vertical={false} />
            <XAxis dataKey="month" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--color-line)' }} interval={2} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} domain={[8600, 11800]}
              tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`} />
            <RTooltip cursor={{ stroke: 'var(--color-line)' }} content={<CreepTip />} />
            <Area type="linear" dataKey="vendor" stroke="none" fill="url(#creepHatch)" isAnimationActive={false} baseValue={9120} />
            <Line type="linear" dataKey="peer" stroke="var(--color-verify)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line type="linear" dataKey="vendor" stroke="var(--color-signal)" strokeWidth={1.8} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="border-t border-[var(--color-line)] px-4 py-2.5 text-[0.75rem] leading-relaxed text-[var(--color-paper-dim)]">
        {formatINR(first.vendor)} → {formatINR(last.vendor)}, about 3% every quarter. The peer median moved{' '}
        <span className="num">+0.7%</span> over the same window. No single raise is arguable. Only the slope is.
      </p>
    </Panel>
  )
}

function RateCard() {
  const rows = rateCard.map((r) => ({ ...r, sku: skuById.get(r.skuId)!, delta: (r.invoiced - r.contracted) * r.units }))
  const total = rows.reduce((s, r) => s + r.delta, 0)
  return (
    <Panel title="Contract rate vs invoiced rate" note="signed rate card against what actually arrived">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] text-[0.75rem]">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-left font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-[var(--color-muted)]">
              <th className="px-4 py-2 font-normal">Item</th>
              <th className="px-2 py-2 font-normal">Vendor</th>
              <th className="px-2 py-2 text-right font-normal">Contracted</th>
              <th className="px-2 py-2 text-right font-normal">Invoiced</th>
              <th className="px-2 py-2 text-right font-normal">Units</th>
              <th className="px-4 py-2 text-right font-normal">Delta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.skuId + r.vendorId} className="border-b border-[var(--color-line-soft)]">
                <td className="px-4 py-2.5 text-[var(--color-paper)]">{r.sku.canonical}</td>
                <td className="px-2 py-2.5 text-[var(--color-paper-dim)]">{vendorById.get(r.vendorId)?.name}</td>
                <td className="num px-2 py-2.5 text-right text-[var(--color-verify)]">{groupIN(r.contracted)}</td>
                <td className="num px-2 py-2.5 text-right text-[var(--color-signal)]">{groupIN(r.invoiced)}</td>
                <td className="num px-2 py-2.5 text-right text-[var(--color-muted)]">{groupIN(r.units)}</td>
                <td className="num px-4 py-2.5 text-right text-[var(--color-gold)]">{formatINR(r.delta)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={5} className="px-4 py-2.5 text-right font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--color-muted)]">Total overbilling</td>
              <td className="num px-4 py-2.5 text-right text-[0.875rem] text-[var(--color-gold)]">{formatINR(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function Counterfactual() {
  const rows = skus.slice(0, 6).map((s) => {
    const book = priceBook[s.id]
    const best = book ? Math.min(...book.map((b) => b.unitPrice)) : Math.round(s.peerMedian * 0.92)
    const paid = book ? Math.max(...book.map((b) => b.unitPrice)) : Math.round(s.peerMedian * 1.14)
    const vol = book ? book.reduce((t, b) => t + b.volume, 0) : 400
    return { sku: s, best, paid, vol, save: Math.round((paid - best) * vol * 0.35) }
  })
  return (
    <Panel title="Best-price counterfactual" note="what the same basket costs at each item's best available rate">
      <ul className="divide-y divide-[var(--color-line-soft)]">
        {rows.map((r) => (
          <li key={r.sku.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1 truncate text-[0.75rem] text-[var(--color-paper)]">{r.sku.canonical}</span>
            <span className="num text-[0.6875rem] text-[var(--color-muted)]">{groupIN(r.paid)}</span>
            <span className="text-[var(--color-line)]">→</span>
            <span className="num text-[0.6875rem] text-[var(--color-verify)]">{groupIN(r.best)}</span>
            <span className="num w-20 text-right text-[0.75rem] text-[var(--color-gold)]">{formatINR(r.save, 'compact')}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export function PriceIntelligence() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-6"><Benchmark /></div>
        <div className="col-span-12 xl:col-span-6"><Creep /></div>
      </div>
      <RateCard />
      <Counterfactual />
    </div>
  )
}
