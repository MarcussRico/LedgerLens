import { useMemo, useState } from 'react'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import { ArrowUpDown, Search } from 'lucide-react'
import { Chip } from '../components/ui/primitives'
import { cn, formatINR, fmtDate } from '../lib/utils'
import { findings, SEVERITY_ORDER } from '../data/findings'
import { pillars } from '../data/detectors'
import { vendorById } from '../data/vendors'
import { useStore } from '../lib/store'
import { HERO_FINDING } from '../data/findings'
import type { Finding } from '../data/types'

type SortKey = 'severity' | 'money' | 'confidence' | 'vendor' | 'date'

const COLS: { key: SortKey | null; label: string; className: string }[] = [
  { key: 'severity', label: 'Sev', className: 'w-[4.5rem]' },
  { key: null, label: 'Rule', className: 'w-[5.5rem]' },
  { key: 'vendor', label: 'Vendor', className: 'min-w-0 flex-1' },
  { key: null, label: 'Pillar', className: 'hidden xl:block w-[13rem]' },
  { key: 'money', label: '₹ at risk', className: 'w-[6.5rem] text-right' },
  { key: 'confidence', label: 'Conf', className: 'w-[3.5rem] text-right' },
  { key: 'date', label: 'Detected', className: 'hidden lg:block w-[6.5rem] text-right' },
  { key: null, label: 'Status', className: 'w-[5.5rem] text-right' },
]

export function Register() {
  const { openFinding, injected } = useStore()
  const [pillarFilter, setPillarFilter] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('money')
  const [dir, setDir] = useState<1 | -1>(-1)
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    const all: Finding[] = injected ? [HERO_FINDING, ...findings.filter((f) => f.id !== HERO_FINDING.id)] : findings
    const filtered = all.filter((f) => {
      if (pillarFilter && f.pillar !== pillarFilter) return false
      if (!q) return true
      const v = vendorById.get(f.entities.vendorId)?.name ?? ''
      return `${f.id} ${f.ruleId} ${v} ${f.explanation}`.toLowerCase().includes(q.toLowerCase())
    })
    const cmp: Record<SortKey, (a: Finding, b: Finding) => number> = {
      severity: (a, b) => SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity),
      money: (a, b) => a.moneyAtRisk - b.moneyAtRisk,
      confidence: (a, b) => a.confidence - b.confidence,
      vendor: (a, b) => (vendorById.get(a.entities.vendorId)?.name ?? '').localeCompare(vendorById.get(b.entities.vendorId)?.name ?? ''),
      date: (a, b) => a.detectedAt.localeCompare(b.detectedAt),
    }
    return [...filtered].sort((a, b) => cmp[sort](a, b) * dir)
  }, [pillarFilter, sort, dir, q, injected])

  const money = rows.reduce((s, f) => s + f.moneyAtRisk, 0)

  const toggle = (k: SortKey | null) => {
    if (!k) return
    if (k === sort) setDir((d) => (d === 1 ? -1 : 1))
    else { setSort(k); setDir(-1) }
  }

  return (
    <div className="flex h-full min-h-0 flex-col border border-[var(--color-line)] bg-[var(--color-panel)]">
      {/* filters */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line)] px-3 py-2.5">
        <button type="button" onClick={() => setPillarFilter(null)}
          className={cn('border px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] transition-colors',
            !pillarFilter ? 'border-[var(--color-gold-soft)] text-[var(--color-gold)]' : 'border-[var(--color-line)] text-[var(--color-muted)] hover:text-[var(--color-paper-dim)]')}>
          All {rows.length === findings.length ? findings.length : ''}
        </button>
        {pillars.map((p) => (
          <button key={p.key} type="button" onClick={() => setPillarFilter(pillarFilter === p.pillar ? null : p.pillar)}
            className={cn('border px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] transition-colors',
              pillarFilter === p.pillar ? 'border-[var(--color-gold-soft)] text-[var(--color-gold)]' : 'border-[var(--color-line)] text-[var(--color-muted)] hover:text-[var(--color-paper-dim)]')}>
            {p.pillar.split(' ')[0]} <span className="opacity-60">{p.findings}</span>
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 border border-[var(--color-line)] px-2 py-1">
          <Search className="size-3.5 text-[var(--color-muted)]" strokeWidth={1.5} aria-hidden />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="vendor, rule, finding id"
            aria-label="Search findings"
            className="num w-40 bg-transparent text-[0.6875rem] text-[var(--color-paper)] outline-none placeholder:text-[var(--color-muted)]"
          />
        </label>
      </div>

      {/* head */}
      <div className="flex items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-1.5">
        {COLS.map((c) => (
          <button key={c.label} type="button" onClick={() => toggle(c.key)} disabled={!c.key}
            className={cn('group flex items-center gap-1 font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-[var(--color-muted)]',
              c.key && 'hover:text-[var(--color-paper-dim)]', c.className,
              c.className.includes('text-right') && 'justify-end')}>
            {c.label}
            {c.key === sort && <ArrowUpDown className="size-2.5 text-[var(--color-gold)]" strokeWidth={2} aria-hidden />}
          </button>
        ))}
      </div>

      {/* rows */}
      <ScrollArea.Root className="min-h-0 flex-1 overflow-hidden" type="always">
        <ScrollArea.Viewport className="h-full w-full">
          {rows.map((f) => {
            const v = vendorById.get(f.entities.vendorId)!
            const isNew = injected && f.id === HERO_FINDING.id
            return (
              <button
                key={f.id} type="button" onClick={() => openFinding(f.id)}
                className={cn(
                  'flex w-full items-center gap-3 border-b border-[var(--color-line-soft)] px-3 py-2 text-left transition-colors hover:bg-[var(--color-panel-2)]',
                  isNew && 'border-l-2 border-l-[var(--color-signal)] bg-[color-mix(in_oklab,var(--color-signal)_7%,transparent)]',
                )}
              >
                <span className="w-[4.5rem] shrink-0"><Chip kind={f.severity} /></span>
                <span className="num w-[5.5rem] shrink-0 text-[0.6875rem] text-[var(--color-slate)]">{f.ruleId}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.75rem] text-[var(--color-paper)]">{v.name}</span>
                  <span className="block truncate text-[0.625rem] text-[var(--color-muted)]">{f.explanation}</span>
                </span>
                <span className="hidden w-[13rem] shrink-0 truncate text-[0.6875rem] text-[var(--color-paper-dim)] xl:block">{f.pillar}</span>
                <span className="num w-[6.5rem] shrink-0 text-right text-[0.75rem] text-[var(--color-gold)]">{formatINR(f.moneyAtRisk, 'compact')}</span>
                <span className="num w-[3.5rem] shrink-0 text-right text-[0.6875rem] text-[var(--color-paper-dim)]">{f.confidence.toFixed(2)}</span>
                <span className="num hidden w-[6.5rem] shrink-0 text-right text-[0.625rem] text-[var(--color-muted)] lg:block">{fmtDate(f.detectedAt, true)}</span>
                <span className="w-[5.5rem] shrink-0 text-right"><Chip kind={f.status} /></span>
              </button>
            )
          })}
          {!rows.length && <p className="px-4 py-10 text-center text-xs text-[var(--color-muted)]">No findings match that filter.</p>}
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" className="flex w-2 touch-none select-none bg-[var(--color-panel-2)]">
          <ScrollArea.Thumb className="flex-1 bg-[var(--color-line)]" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>

      <div className="flex items-center justify-between border-t border-[var(--color-line)] px-3 py-2 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-[var(--color-muted)]">
        <span>{rows.length} findings shown{pillarFilter ? ` · ${pillarFilter}` : ''}</span>
        <span className="flex items-center gap-3">
          <span className="normal-case tracking-normal text-[var(--color-muted)]">exposure under review — not the recoverable figure</span>
          <span className="text-[var(--color-gold)]">{formatINR(money)}</span>
        </span>
      </div>
    </div>
  )
}
