import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, User, Landmark, MapPin } from 'lucide-react'
import { Panel } from './shell'
import { cn, formatINR, groupIN } from '../lib/utils'
import { graphNodes, graphEdges, nodeById } from '../data/graph'
import { vendorById, vendors } from '../data/vendors'
import { drawPath } from '../lib/hooks'
import { useInView, useReducedMotion } from '../lib/hooks'
import type { GraphNode } from '../data/types'

const KIND_ICON = { vendor: Building2, employee: User, bank: Landmark, address: MapPin } as const
const KIND_LABEL = { vendor: 'Vendor', employee: 'Employee', bank: 'Bank account', address: 'Address' } as const

function Scorecard({ node }: { node: GraphNode }) {
  const v = node.kind === 'vendor' ? vendorById.get(node.id) : undefined
  const Icon = KIND_ICON[node.kind]
  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-panel)]">
      <div className={cn('flex items-start gap-3 border-b border-[var(--color-line)] px-4 py-3', node.ring && 'hatch')}>
        <Icon className={cn('mt-0.5 size-4 shrink-0', node.ring ? 'text-[var(--color-signal)]' : 'text-[var(--color-slate)]')} strokeWidth={1.5} aria-hidden />
        <div className="min-w-0">
          <p className="kicker">{KIND_LABEL[node.kind]}</p>
          <p className="mt-0.5 truncate text-[0.9375rem] text-[var(--color-paper)]">{node.label}</p>
          {node.sub && <p className="num mt-0.5 truncate text-[0.625rem] text-[var(--color-muted)]">{node.sub}</p>}
        </div>
        <span className={cn('num ml-auto shrink-0 text-[1.375rem] leading-none', node.risk > 70 ? 'text-[var(--color-signal)]' : node.risk > 40 ? 'text-[var(--color-gold)]' : 'text-[var(--color-verify)]')}>
          {node.risk}
        </span>
      </div>

      {v ? (
        <dl className="divide-y divide-[var(--color-line-soft)]">
          {[
            ['GSTIN', v.gstin],
            ['PAN', v.pan],
            ['Bank', v.bankMasked],
            ['Onboarded', v.onboardedAt],
            ['Resolved entity', v.canonicalId],
            ['Price index', `${v.scorecard.priceIndex} (100 = peer median)`],
            ['On-time delivery', `${v.scorecard.onTimePct}%`],
            ['Defect rate', `${v.scorecard.defectPct}%`],
            ['Dispute rate', `${v.scorecard.disputeRate}%`],
            ['Spend', formatINR(v.spend, 'compact')],
            ['Invoices', groupIN(v.invoiceCount)],
            ['MSME registered', v.msmeRegistered ? 'Yes — 45-day rule applies' : 'No'],
          ].map(([k, val]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 px-4 py-1.5 text-[0.6875rem]">
              <dt className="text-[var(--color-muted)]">{k}</dt>
              <dd className="num truncate text-right text-[var(--color-paper-dim)]">{val}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="px-4 py-3">
          <p className="text-[0.75rem] leading-relaxed text-[var(--color-paper-dim)]">
            {node.kind === 'bank' && 'Three payee accounts resolve to this single bank identity. Vendors sharing a payee account are, for payment purposes, one counterparty.'}
            {node.kind === 'address' && 'Two vendor master records and one HR record carry this address. The join was made on normalised street, locality and PIN.'}
            {node.kind === 'employee' && 'Approver on 34 purchase orders to vendors registered at their own address. Segregation of duties is not satisfied.'}
          </p>
        </div>
      )}
    </div>
  )
}

export function VendorGraph() {
  const [selected, setSelected] = useState<string>('bank-4471')
  const [ref, inView] = useInView<HTMLDivElement>('-10% 0px')
  const svgRef = useRef<SVGSVGElement | null>(null)
  const reduced = useReducedMotion()
  const node = nodeById.get(selected)!

  useEffect(() => {
    if (!inView || reduced) return
    const svg = svgRef.current
    if (!svg) return
    const lines = Array.from(svg.querySelectorAll<SVGLineElement>('[data-edge]'))
    const anims = lines.map((l, i) => drawPath(l, 520, i * 28))
    return () => anims.forEach((a) => a.pause())
  }, [inView, reduced])

  const neighbours = useMemo(() => {
    const set = new Set<string>()
    for (const e of graphEdges) {
      if (e.a === selected) set.add(e.b)
      if (e.b === selected) set.add(e.a)
    }
    return set
  }, [selected])

  const ringSpend = vendors.filter((v) => ['V-001', 'V-002', 'V-003', 'V-004', 'V-005'].includes(v.id)).reduce((s, v) => s + v.spend, 0)

  return (
    <div className="grid grid-cols-12 items-start gap-4">
      <div className="col-span-12 xl:col-span-8">
        <Panel title="Vendor integrity graph" note="vendors · employees · bank accounts · addresses, joined on resolved attributes">
          <div ref={ref} className="p-2">
            <svg ref={svgRef} viewBox="0 0 1000 620" className="w-full" role="img"
              aria-label="Network graph. Three vendors and two aliases share bank account HDFC ****4471; two of them share a registered address that also matches an employee's HR record.">
              {graphEdges.map((e, i) => {
                const a = nodeById.get(e.a)!, b = nodeById.get(e.b)!
                const active = e.a === selected || e.b === selected
                return (
                  <line
                    key={i} data-edge
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={e.ring ? 'var(--color-signal)' : 'var(--color-line)'}
                    strokeWidth={active ? 1.8 : e.ring ? 1.2 : 0.9}
                    opacity={active ? 1 : e.ring ? 0.72 : 0.5}
                  />
                )
              })}

              {graphNodes.map((n) => {
                const isSel = n.id === selected
                const isNb = neighbours.has(n.id)
                const r = n.kind === 'bank' ? 13 : n.kind === 'vendor' ? 10 : 9
                const colour = n.ring ? 'var(--color-signal)' : n.risk > 60 ? 'var(--color-gold)' : 'var(--color-slate)'
                return (
                  <g key={n.id} className="cursor-pointer" onClick={() => setSelected(n.id)}
                    role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(n.id) } }}
                    aria-label={`${KIND_LABEL[n.kind]}: ${n.label}`}>
                    {isSel && <circle cx={n.x} cy={n.y} r={r + 8} fill="none" stroke={colour} strokeWidth="1" opacity="0.55" />}
                    {n.kind === 'bank'
                      ? <rect x={n.x - r} y={n.y - r} width={r * 2} height={r * 2} fill="var(--color-ink)" stroke={colour} strokeWidth={isSel ? 2 : 1.4} transform={`rotate(45 ${n.x} ${n.y})`} />
                      : n.kind === 'employee'
                        ? <rect x={n.x - r} y={n.y - r} width={r * 2} height={r * 2} fill="var(--color-ink)" stroke={colour} strokeWidth={isSel ? 2 : 1.4} />
                        : <circle cx={n.x} cy={n.y} r={r} fill="var(--color-ink)" stroke={colour} strokeWidth={isSel ? 2 : 1.4} />}
                    <text x={n.x} y={n.y + r + 14} textAnchor="middle"
                      fill={isSel || isNb ? 'var(--color-paper)' : 'var(--color-muted)'}
                      fontSize="10.5" fontFamily="var(--font-sans)">{n.label}</text>
                  </g>
                )
              })}
            </svg>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-[var(--color-line)] px-4 py-2.5 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-[var(--color-muted)]">
            <span className="flex items-center gap-1.5"><span className="inline-block size-2 rotate-45 border border-[var(--color-signal)]" /> bank account</span>
            <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full border border-[var(--color-slate)]" /> vendor</span>
            <span className="flex items-center gap-1.5"><span className="inline-block size-2 border border-[var(--color-slate)]" /> employee / address</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-px w-4 bg-[var(--color-signal)]" /> flagged ring</span>
          </div>
        </Panel>
      </div>

      <div className="col-span-12 space-y-4 xl:col-span-4">
        <div className="hatch border border-[var(--color-signal-dim)] bg-[var(--color-panel)] px-4 py-3">
          <p className="kicker text-[var(--color-signal)]">Ring VND-001</p>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--color-paper)]">
            Three vendors share bank account <span className="num">HDFC ****4471</span>. Two share a registered
            address that also matches the HR record of the manager who approved 34 of their purchase orders.
          </p>
          <p className="num mt-3 text-[1.375rem] text-[var(--color-signal)]">{formatINR(ringSpend, 'compact')}</p>
          <p className="mt-0.5 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-[var(--color-muted)]">combined spend through the ring</p>
        </div>
        <Scorecard node={node} />
      </div>
    </div>
  )
}
