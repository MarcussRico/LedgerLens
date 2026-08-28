import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Upload, FileSpreadsheet, X, Play, AlertTriangle, CircleCheck, Loader2,
  Sparkle, Download, ChevronDown, FileDown, Fingerprint,
} from 'lucide-react'
import { Panel } from './shell'
import { Chip } from '../components/ui/primitives'
import { cn, formatINR, groupIN } from '../lib/utils'
import {
  analyse, checkHealth, fetchSample, SAMPLE_FILES, GROUND_TRUTH_URL, sampleUrl,
  SOURCE_KINDS, ApiError, currentHost, API_HOSTS,
  type AnalyseResponse, type ApiFinding, type SourceKind, type HealthResponse,
} from '../lib/api'
import { useStore } from '../lib/store'

/* ── file staging ─────────────────────────────────────────────────────── */
interface Staged { file: File; kind: SourceKind; id: string }

function guessKind(name: string): SourceKind {
  const n = name.toLowerCase()
  if (/vendor|supplier|party/.test(n)) return 'vendors'
  if (/grn|receipt|goods/.test(n)) return 'grns'
  if (/line|item|detail/.test(n)) return 'lines'
  if (/employee|staff|hr/.test(n)) return 'employees'
  if (/\bpo\b|order/.test(n)) return 'pos'
  return 'invoices'
}

const METHOD_STYLE: Record<string, { label: string; className: string }> = {
  exact: { label: 'exact', className: 'text-[var(--color-verify)] border-[var(--color-verify)]' },
  alias: { label: 'alias', className: 'text-[var(--color-slate)] border-[var(--color-slate)]' },
  'value-shape': { label: 'value shape', className: 'text-[var(--color-clay)] border-[var(--color-clay)]' },
  llm: { label: 'llm', className: 'text-[var(--color-gold)] border-[var(--color-gold-soft)]' },
}

/* ── the mapping table: the moment a judge sees their own columns land ── */
function MappingReport({ result }: { result: AnalyseResponse }) {
  const entries = Object.entries(result.ingest.mappings)
  if (!entries.length) return null
  return (
    <Panel title="How your columns were read"
      note="deterministic first · the model is asked only about what is left over">
      <div className="divide-y divide-[var(--color-line-soft)]">
        {entries.map(([kind, m]) => (
          <div key={kind} className="px-4 py-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="kicker text-[var(--color-paper-dim)]">{kind}</span>
              <span className="num text-[0.625rem] text-[var(--color-muted)]">
                {m.mapped.length} mapped{m.unmapped.length ? ` · ${m.unmapped.length} unused` : ''}
              </span>
              {m.llmUsed && (
                <span className="inline-flex items-center gap-1 border border-[var(--color-gold-soft)] px-1.5 py-[1px] font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-[var(--color-gold)]">
                  <Sparkle className="size-2.5" strokeWidth={1.5} aria-hidden /> model used for the leftovers
                </span>
              )}
            </div>
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {m.mapped.map((c) => (
                <li key={c.source} className="flex items-center gap-2 text-[0.6875rem]">
                  <span className="num min-w-0 flex-1 truncate text-[var(--color-paper)]">{c.source}</span>
                  <span className="shrink-0 text-[var(--color-line)]">→</span>
                  <span className="num w-32 shrink-0 truncate text-[var(--color-paper-dim)]">{c.target}</span>
                  <span className={cn('shrink-0 border px-1 py-[1px] font-mono text-[0.5rem] uppercase tracking-[0.08em]',
                    METHOD_STYLE[c.method]?.className)}>
                    {METHOD_STYLE[c.method]?.label ?? c.method}
                  </span>
                </li>
              ))}
            </ul>
            {m.unmapped.length > 0 && (
              <p className="mt-2 text-[0.625rem] leading-relaxed text-[var(--color-muted)]">
                Not used: {m.unmapped.join(' · ')}. Nothing was guessed into a field it did not fit.
              </p>
            )}
          </div>
        ))}
      </div>
    </Panel>
  )
}

function ResolutionReport({ result }: { result: AnalyseResponse }) {
  const r = result.ingest.resolution
  const merges = result.ingest.vendorMerges ?? []
  const collapsed = r.vendorRecords - r.resolvedEntities
  return (
    <Panel title="Resolution" note="run once, before any detector — comparisons are invalid without it">
      <div className="grid grid-cols-2 gap-px border-b border-[var(--color-line)] bg-[var(--color-line)]">
        <div className="bg-[var(--color-panel)] px-4 py-3">
          <p className="num text-[1.375rem] text-[var(--color-paper)]">
            {r.vendorRecords} <span className="text-[var(--color-muted)]">→</span>{' '}
            <span className="text-[var(--color-verify)]">{r.resolvedEntities}</span>
          </p>
          <p className="mt-1 text-[0.625rem] text-[var(--color-muted)]">
            vendor records → real counterparties
            {collapsed > 0 && ` · ${collapsed} alias${collapsed > 1 ? 'es' : ''} collapsed`}
          </p>
        </div>
        <div className="bg-[var(--color-panel)] px-4 py-3">
          <p className="num text-[1.375rem] text-[var(--color-paper)]">
            {r.rawSkuVariants} <span className="text-[var(--color-muted)]">→</span>{' '}
            <span className="text-[var(--color-verify)]">{r.skusResolved}</span>
          </p>
          <p className="mt-1 text-[0.625rem] text-[var(--color-muted)]">
            raw descriptions → catalogue items
          </p>
        </div>
      </div>
      {merges.length > 0 && (
        <ul className="divide-y divide-[var(--color-line-soft)]">
          {merges.slice(0, 8).map((m, i) => {
            const isRing = m.basis.includes('unmerged')
            return (
              <li key={i} className="flex items-start gap-3 px-4 py-2">
                <span className={cn('mt-[3px] inline-block size-1.5 shrink-0 rounded-full',
                  isRing ? 'bg-[var(--color-signal)]' : 'bg-[var(--color-verify)]')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.6875rem] text-[var(--color-paper)]">
                    {isRing ? 'Kept separate — ring candidate' : m.basis}
                  </span>
                  <span className="num block truncate text-[0.5625rem] text-[var(--color-muted)]">
                    {(m.names ?? m.vendorIds).join(' · ')}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <p className="border-t border-[var(--color-line)] px-4 py-2.5 text-[0.6875rem] leading-relaxed text-[var(--color-paper-dim)]">
        A shared GSTIN or PAN merges two records into one entity. A shared <em className="not-italic text-[var(--color-paper)]">bank account</em>{' '}
        between differently-named vendors deliberately does not — that is the collusion signal, and merging it would erase the finding.
      </p>
    </Panel>
  )
}

function FindingsTable({ findings }: { findings: ApiFinding[] }) {
  const [pillar, setPillar] = useState<string | null>(null)
  const pillars = useMemo(
    () => [...new Set(findings.map((f) => f.pillar))].sort(), [findings])
  const rows = useMemo(
    () => (pillar ? findings.filter((f) => f.pillar === pillar) : findings)
      .slice().sort((a, b) => b.moneyAtRisk - a.moneyAtRisk),
    [findings, pillar])
  const [open, setOpen] = useState<string | null>(null)

  return (
    <Panel title={`${findings.length} findings`} note="from your file · click a row for the evidence the rule compared">
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--color-line)] px-3 py-2">
        <button type="button" onClick={() => setPillar(null)}
          className={cn('border px-2 py-1 font-mono text-[0.5625rem] uppercase tracking-[0.1em] transition-colors',
            !pillar ? 'border-[var(--color-gold-soft)] text-[var(--color-gold)]'
                    : 'border-[var(--color-line)] text-[var(--color-muted)] hover:text-[var(--color-paper-dim)]')}>
          All {findings.length}
        </button>
        {pillars.map((p) => (
          <button key={p} type="button" onClick={() => setPillar(pillar === p ? null : p)}
            className={cn('border px-2 py-1 font-mono text-[0.5625rem] uppercase tracking-[0.1em] transition-colors',
              pillar === p ? 'border-[var(--color-gold-soft)] text-[var(--color-gold)]'
                           : 'border-[var(--color-line)] text-[var(--color-muted)] hover:text-[var(--color-paper-dim)]')}>
            {p.split(' ')[0]} {findings.filter((f) => f.pillar === p).length}
          </button>
        ))}
      </div>
      <ul className="max-h-[30rem] overflow-y-auto">
        {rows.map((f) => (
          <li key={f.id} className="border-b border-[var(--color-line-soft)] last:border-b-0">
            <button type="button" onClick={() => setOpen(open === f.id ? null : f.id)}
              className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-panel-2)]">
              <span className="w-[4.5rem] shrink-0 pt-[2px]"><Chip kind={f.severity} /></span>
              <span className="num w-[4.5rem] shrink-0 pt-[3px] text-[0.625rem] text-[var(--color-slate)]">{f.ruleId}</span>
              <span className="min-w-0 flex-1 text-[0.75rem] leading-snug text-[var(--color-paper-dim)]">
                {f.explanation}
              </span>
              <span className="num w-[5.5rem] shrink-0 pt-[2px] text-right text-[0.75rem] text-[var(--color-gold)]">
                {formatINR(f.moneyAtRisk, 'compact')}
              </span>
              <ChevronDown className={cn('mt-1 size-3.5 shrink-0 text-[var(--color-line)] transition-transform',
                open === f.id && 'rotate-180')} strokeWidth={1.5} aria-hidden />
            </button>
            {open === f.id && (
              <div className="border-t border-[var(--color-line-soft)] bg-[var(--color-panel-2)] px-3 py-3">
                <p className="kicker mb-2">Exactly the fields the rule compared</p>
                <dl className="grid gap-x-5 gap-y-1 sm:grid-cols-2">
                  {Object.entries(f.evidence).map(([k, v]) => (
                    <div key={k} className="flex items-baseline gap-2 text-[0.625rem]">
                      <dt className="num shrink-0 text-[var(--color-muted)]">{k}</dt>
                      <dd className="num ml-auto truncate text-right text-[var(--color-paper-dim)]">
                        {Array.isArray(v) ? v.map(String).join(' · ')
                          : typeof v === 'object' && v !== null ? JSON.stringify(v)
                          : typeof v === 'number' && Math.abs(v) > 999 ? groupIN(v)
                          : String(v)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 border-t border-[var(--color-line)] pt-2 text-[0.6875rem] text-[var(--color-paper)]">
                  {f.recommendedAction.label}
                </p>
                <p className="mt-1 text-[0.625rem] leading-relaxed text-[var(--color-muted)]">
                  {f.recommendedAction.detail}
                </p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function SavingsPanel({ result }: { result: AnalyseResponse }) {
  const s = result.savings
  return (
    <Panel title="Savings" note="deduplicated by economic event — corroboration is not more money">
      <div className="hatch-gold border-b border-[var(--color-line)] px-4 py-4">
        <p className="kicker">Total identified</p>
        <p className="num mt-1.5 text-[2rem] leading-none text-[var(--color-gold)]">{s.totalDisplay}</p>
        <p className="mt-2 text-[0.6875rem] leading-relaxed text-[var(--color-paper-dim)]">{s.derivation}</p>
      </div>
      {s.tiers.map((t) => (
        <div key={t.name} className="border-b border-[var(--color-line-soft)] px-4 py-3 last:border-b-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[0.8125rem] text-[var(--color-paper)]">{t.name}</span>
            <span className="num text-[0.9375rem] text-[var(--color-gold)]">{t.display}</span>
          </div>
          <p className="mt-1 text-[0.625rem] leading-relaxed text-[var(--color-muted)]">{t.derivation}</p>
        </div>
      ))}
    </Panel>
  )
}

/* ── finding zero: is the ledger itself credible? ─────────────────────── */
function IntegrityPanel({ result }: { result: AnalyseResponse }) {
  const di = result.dataIntegrity
  if (!di) return null
  const colour = di.score >= 85 ? 'var(--color-verify)'
    : di.score >= 70 ? 'var(--color-gold)'
    : di.score >= 50 ? 'var(--color-clay)' : 'var(--color-signal)'
  const usable = di.checks.filter((c) => c.applicable && c.weight > 0)
  return (
    <Panel title="Finding zero — is this ledger credible?"
      note="graded before anything in it is interpreted">
      <div className="flex flex-wrap items-start gap-5 border-b border-[var(--color-line)] px-4 py-4">
        <div className="shrink-0">
          <p className="num text-[2.75rem] leading-none" style={{ color: colour }}>
            {di.score}<span className="text-[0.4em] text-[var(--color-muted)]">/100</span>
          </p>
          <p className="mt-1 font-mono text-[0.5625rem] uppercase tracking-[0.1em]" style={{ color: colour }}>
            {di.band}
          </p>
        </div>
        <p className="min-w-[16rem] flex-1 text-[0.8125rem] leading-relaxed text-[var(--color-paper-dim)]">
          {di.headline}
        </p>
      </div>
      <ul className="divide-y divide-[var(--color-line-soft)]">
        {usable.map((c) => (
          <li key={c.name} className="px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="w-52 shrink-0 truncate text-[0.75rem] text-[var(--color-paper)]">{c.name}</span>
              <span className="h-[3px] flex-1 bg-[var(--color-panel-2)]">
                <span className="block h-full" style={{
                  width: `${Math.round(c.score * 100)}%`,
                  background: c.score >= 0.7 ? 'var(--color-verify)'
                    : c.score >= 0.4 ? 'var(--color-gold)' : 'var(--color-signal)',
                }} />
              </span>
              <span className="num w-9 shrink-0 text-right text-[0.6875rem] text-[var(--color-paper-dim)]">
                {c.score.toFixed(2)}
              </span>
            </div>
            <p className="mt-1 pl-0 text-[0.625rem] leading-relaxed text-[var(--color-muted)] sm:pl-[13.5rem]">
              <span className="num text-[var(--color-paper-dim)]">{c.observed}</span>
              {' · expected '}{c.expected}. {c.verdict}
            </p>
          </li>
        ))}
      </ul>
      <p className="border-t border-[var(--color-line)] px-4 py-2.5 text-[0.6875rem] leading-relaxed text-[var(--color-paper-dim)]">
        Every test here is a mathematical invariant — it holds for genuine accounting data whatever the
        business does, so none of it needs to trust the client&rsquo;s own history. If a ledger fails these,
        read everything below it in that light.
      </p>
    </Panel>
  )
}

/* ── the receipt ──────────────────────────────────────────────────────── */
function AuditPanel({ result }: { result: AnalyseResponse }) {
  const a = result.audit
  if (!a) return null
  return (
    <Panel title="Audit trail" note={`${a.algorithm} · ${a.version}`}>
      <div className="space-y-2.5 px-4 py-3.5">
        <div>
          <p className="kicker mb-1 flex items-center gap-1.5">
            <Fingerprint className="size-3" strokeWidth={1.5} aria-hidden /> Run root
          </p>
          <p className="num break-all text-[0.6875rem] leading-relaxed text-[var(--color-verify)]">{a.root}</p>
        </div>
        <div>
          <p className="kicker mb-1">Corpus fingerprint</p>
          <p className="num break-all text-[0.625rem] leading-relaxed text-[var(--color-paper-dim)]">
            {a.corpusFingerprint}
          </p>
        </div>
        <p className="border-t border-[var(--color-line)] pt-2.5 text-[0.6875rem] leading-relaxed text-[var(--color-muted)]">
          {a.findings} findings hashed over their own content and chained in a fixed order. {a.note}
        </p>
      </div>
    </Panel>
  )
}

/* ── the panel ────────────────────────────────────────────────────────── */
export function AnalyseYourData() {
  const { setView } = useStore()
  const [staged, setStaged] = useState<Staged[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AnalyseResponse | null>(null)
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null)
  const [health, setHealth] = useState<HealthResponse | 'down' | null>(null)
  const [threshold, setThreshold] = useState(50_000)
  const [zeroTrust, setZeroTrust] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let alive = true
    checkHealth().then((h) => alive && setHealth(h)).catch(() => alive && setHealth('down'))
    return () => { alive = false }
  }, [])

  const addFiles = useCallback((files: FileList | File[]) => {
    const next = Array.from(files).map((file) => ({
      file, kind: guessKind(file.name), id: `${file.name}-${file.size}-${Math.round(file.lastModified)}`,
    }))
    setStaged((prev) => {
      const seen = new Set(prev.map((p) => p.id))
      return [...prev, ...next.filter((n) => !seen.has(n.id))]
    })
    setError(null)
  }, [])

  const [loadingSample, setLoadingSample] = useState<string | null>(null)

  const loadSample = useCallback(async () => {
    setResult(null); setError(null); setLoadingSample('0 / 6')
    try {
      const files = await fetchSample((n, total) => setLoadingSample(`${n} / ${total}`))
      setStaged(files.map(({ file, kind }) => ({ file, kind, id: `sample-${file.name}` })))
    } catch (err) {
      const e = err as ApiError
      setError({ message: e.message ?? 'Could not load the sample.', hint: e.hint })
    } finally {
      setLoadingSample(null)
    }
  }, [])

  const run = useCallback(async () => {
    setBusy(true); setError(null); setResult(null)
    try {
      const r = await analyse(staged.map(({ file, kind }) => ({ file, kind })),
        { approvalThreshold: threshold, zeroTrust })
      setResult(r)
    } catch (err) {
      const e = err as ApiError
      setError({ message: e.message ?? 'Something went wrong.', hint: e.hint })
    } finally {
      setBusy(false)
    }
  }, [staged, threshold, zeroTrust])

  return (
    <div className="space-y-4">
      {/* the honest framing, stated up front */}
      <div className="border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className={cn('inline-block size-1.5 rounded-full',
            health === 'down' ? 'bg-[var(--color-signal)]'
              : health ? 'bg-[var(--color-verify)]' : 'bg-[var(--color-muted)]')} aria-hidden />
          <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--color-muted)]">
            {health === 'down' ? 'Engine unreachable'
              : health ? `Engine live · ${health.detectors} detectors · ${health.pillars} pillars`
              : 'Checking the engine…'}
          </span>
          <span className="num text-[0.5625rem] text-[var(--color-line)]">
            {currentHost().replace('https://', '')}
            {API_HOSTS.length > 1 && ` · ${API_HOSTS.length} deployments, automatic failover`}
          </span>
        </div>
        <p className="mt-2 max-w-[86ch] text-[0.75rem] leading-relaxed text-[var(--color-paper-dim)]">
          Everything else on this page is bundled and runs with no network at all. This panel is the one
          exception: it sends your file to the engine, which runs the same {health && health !== 'down' ? health.detectors : 42} detectors
          for real and returns findings computed by rules and statistics. Nothing here is pre-recorded.
        </p>
        {health === 'down' && (
          <p className="mt-2 text-[0.75rem] text-[var(--color-signal)]">
            The engine is not answering. The rest of the demo is unaffected — it never needed it.
          </p>
        )}
      </div>

      {/* items-start matters: Panel carries h-full, so a stretched grid row
          makes every stacked panel claim the full row height and the column
          overflows its section. Sizing the cell to content breaks that. */}
      <div className="grid grid-cols-12 items-start gap-4">
        {/* ── input ── */}
        {/* the results run long; keep the controls in reach while reading them */}
        <div className="col-span-12 lg:sticky lg:top-20 lg:col-span-5">
          <Panel title="Your data" note="CSV or Excel · nothing is stored server-side">
            <div className="p-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
                role="button" tabIndex={0}
                aria-label="Add procurement files"
                className={cn('flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-4 py-8 text-center transition-colors',
                  dragging ? 'border-[var(--color-gold)] bg-[color-mix(in_oklab,var(--color-gold)_7%,transparent)]'
                           : 'border-[var(--color-line)] hover:border-[var(--color-paper-dim)]')}>
                <Upload className="size-5 text-[var(--color-muted)]" strokeWidth={1.5} aria-hidden />
                <p className="text-[0.8125rem] text-[var(--color-paper)]">Drop invoices, POs, GRNs or a vendor master</p>
                <p className="text-[0.6875rem] text-[var(--color-muted)]">
                  Your column names do not have to match anything.
                </p>
              </div>
              <input ref={inputRef} type="file" multiple accept=".csv,.xlsx,.xls,.json" className="sr-only"
                onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />

              <div className="mt-4 border border-[var(--color-line)] px-3 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="kicker">No file to hand?</p>
                  <span className="num text-[0.5625rem] text-[var(--color-muted)]">4,024 rows · 6 files</span>
                </div>
                <p className="mt-2 text-[0.6875rem] leading-relaxed text-[var(--color-paper-dim)]">
                  A real procurement export with ERP headers, DD/MM dates, lakh-grouped money and
                  free-text item descriptions — and 34 frauds planted in it.
                </p>
                <button type="button" onClick={loadSample} disabled={!!loadingSample}
                  className={cn('mt-3 inline-flex w-full items-center justify-center gap-2 border px-3 py-2 text-[0.75rem] transition-colors',
                    'border-[var(--color-slate)] text-[var(--color-slate)] hover:border-[var(--color-paper-dim)] hover:text-[var(--color-paper)]',
                    'disabled:cursor-not-allowed disabled:opacity-50')}>
                  {loadingSample
                    ? <><Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} aria-hidden /> Loading {loadingSample}</>
                    : <><Download className="size-3.5" strokeWidth={1.5} aria-hidden /> Load the sample dataset</>}
                </button>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {SAMPLE_FILES.map((f) => (
                    <a key={f.name} href={sampleUrl(f.name)} download
                      className="num inline-flex items-center gap-1 text-[0.5625rem] text-[var(--color-muted)] underline decoration-dotted underline-offset-2 transition-colors hover:text-[var(--color-paper-dim)]">
                      <FileDown className="size-2.5" strokeWidth={1.5} aria-hidden />{f.name}
                    </a>
                  ))}
                </div>
                <a href={GROUND_TRUTH_URL} download
                  className="num mt-2 inline-flex items-center gap-1 text-[0.5625rem] text-[var(--color-verify)] underline decoration-dotted underline-offset-2">
                  <FileDown className="size-2.5" strokeWidth={1.5} aria-hidden />
                  ground_truth.csv — what was planted, so you can mark our homework
                </a>
              </div>

              {staged.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {staged.map((s, i) => (
                    <li key={s.id} className="flex items-center gap-2 border border-[var(--color-line)] px-2.5 py-2">
                      <FileSpreadsheet className="size-3.5 shrink-0 text-[var(--color-muted)]" strokeWidth={1.5} aria-hidden />
                      <span className="num min-w-0 flex-1 truncate text-[0.6875rem] text-[var(--color-paper)]">{s.file.name}</span>
                      <select
                        value={s.kind}
                        aria-label={`What kind of file is ${s.file.name}?`}
                        onChange={(e) => setStaged((prev) => prev.map((p, j) =>
                          j === i ? { ...p, kind: e.target.value as SourceKind } : p))}
                        className="num shrink-0 border border-[var(--color-line)] bg-[var(--color-panel-2)] px-1.5 py-0.5 text-[0.625rem] text-[var(--color-paper-dim)] outline-none">
                        {SOURCE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                      </select>
                      <button type="button" aria-label={`Remove ${s.file.name}`}
                        onClick={() => setStaged((prev) => prev.filter((_, j) => j !== i))}
                        className="shrink-0 text-[var(--color-muted)] transition-colors hover:text-[var(--color-signal)]">
                        <X className="size-3.5" strokeWidth={1.5} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-5 space-y-3 border-t border-[var(--color-line)] pt-4">
                <label className="flex items-center gap-3 text-[0.6875rem] text-[var(--color-paper-dim)]">
                  <span className="w-40 shrink-0">Approval threshold</span>
                  <input type="number" value={threshold} min={0} step={5000}
                    onChange={(e) => setThreshold(Number(e.target.value) || 0)}
                    className="num w-28 border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1 text-[var(--color-paper)] outline-none" />
                  <span className="text-[var(--color-muted)]">{formatINR(threshold, 'compact')}</span>
                </label>
                <label className="flex items-start gap-3 text-[0.6875rem] text-[var(--color-paper-dim)]">
                  <input type="checkbox" checked={zeroTrust} onChange={(e) => setZeroTrust(e.target.checked)}
                    className="mt-[3px] accent-[var(--color-gold)]" />
                  <span>
                    <span className="text-[var(--color-paper)]">Zero-trust mode</span> — assume the history itself
                    may be forged. Runs only detectors that need no baseline: mathematical invariants, statutory
                    checks and structural facts.
                  </span>
                </label>
              </div>

              <button type="button" onClick={run} disabled={!staged.length || busy || health === 'down'}
                className={cn('mt-5 inline-flex w-full items-center justify-center gap-2 border px-4 py-2.5 text-[0.8125rem] transition-colors',
                  'border-[var(--color-gold-soft)] bg-[color-mix(in_oklab,var(--color-gold)_12%,transparent)] text-[var(--color-gold)]',
                  'hover:bg-[color-mix(in_oklab,var(--color-gold)_20%,transparent)]',
                  'disabled:cursor-not-allowed disabled:opacity-40')}>
                {busy ? <><Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden /> Running {health && health !== 'down' ? health.detectors : 42} detectors…</>
                      : <><Play className="size-4" strokeWidth={1.5} aria-hidden /> Analyse</>}
              </button>

              {error && (
                <div className="mt-4 border border-[var(--color-signal-dim)] px-3 py-2.5">
                  <p className="flex items-start gap-2 text-[0.75rem] text-[var(--color-signal)]">
                    <AlertTriangle className="mt-[2px] size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                    {error.message}
                  </p>
                  {error.hint && <p className="mt-1.5 pl-5 text-[0.6875rem] leading-relaxed text-[var(--color-paper-dim)]">{error.hint}</p>}
                </div>
              )}
            </div>
          </Panel>
        </div>

        {/* ── output ── */}
        <div className="col-span-12 space-y-4 lg:col-span-7">
          {!result && !busy && (
            <Panel>
              <div className="flex min-h-[22rem] flex-col items-center justify-center gap-3 px-8 text-center">
                <p className="max-w-[42ch] text-[0.875rem] leading-relaxed text-[var(--color-muted)]">
                  Give it a file and it will show you which of your columns it understood, how many of your
                  vendor records were actually the same counterparty, and what the detectors found — with the
                  evidence each rule compared.
                </p>
                <button type="button" onClick={() => setView('command')}
                  className="text-[0.6875rem] text-[var(--color-slate)] underline decoration-dotted underline-offset-4 hover:text-[var(--color-paper)]">
                  or go back to the worked demo dataset
                </button>
              </div>
            </Panel>
          )}

          {busy && (
            <Panel>
              <div className="flex min-h-[22rem] flex-col items-center justify-center gap-3">
                <Loader2 className="size-5 animate-spin text-[var(--color-gold)]" strokeWidth={1.5} aria-hidden />
                <p className="num text-[0.75rem] text-[var(--color-paper-dim)]">
                  Reading · resolving · detecting
                </p>
                <p className="max-w-[36ch] text-center text-[0.6875rem] leading-relaxed text-[var(--color-muted)]">
                  First run after an idle period wakes the container, which takes a few seconds longer.
                </p>
              </div>
            </Panel>
          )}

          {result && (
            <>
              <div className="grid grid-cols-2 gap-px border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-4">
                {[
                  { k: 'Findings', v: String(result.findings.length), s: `${result.meta.detectorsRun} detectors ran` },
                  { k: 'Recoverable', v: result.savings.totalDisplay, s: `${result.savings.shareOfSpend.toFixed(2)}% of spend` },
                  { k: 'Spend read', v: result.corpus.spendDisplay, s: `${groupIN(result.corpus.invoices)} invoices` },
                  { k: 'Elapsed', v: `${result.meta.elapsedSeconds.toFixed(2)}s`, s: 'end to end' },
                ].map((t) => (
                  <div key={t.k} className="bg-[var(--color-panel)] px-3 py-3">
                    <p className="kicker truncate">{t.k}</p>
                    <p className="num mt-1.5 truncate text-[1.125rem] leading-none text-[var(--color-gold)]">{t.v}</p>
                    <p className="mt-1 truncate text-[0.5625rem] text-[var(--color-muted)]">{t.s}</p>
                  </div>
                ))}
              </div>

              {result.rejected.count > 0 && (
                <div className="border border-[var(--color-signal-dim)] px-4 py-3">
                  <p className="flex items-center gap-2 text-[0.75rem] text-[var(--color-signal)]">
                    <AlertTriangle className="size-3.5" strokeWidth={1.5} aria-hidden />
                    {result.rejected.count} row{result.rejected.count > 1 ? 's' : ''} could not be trusted and
                    {result.rejected.count > 1 ? ' were' : ' was'} set aside — never silently dropped.
                  </p>
                  <ul className="mt-2 space-y-0.5">
                    {Object.entries(result.rejected.reasons).map(([reason, n]) => (
                      <li key={reason} className="num text-[0.625rem] text-[var(--color-paper-dim)]">
                        {n} × {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <IntegrityPanel result={result} />
              <MappingReport result={result} />
              <ResolutionReport result={result} />
              {result.findings.length > 0
                ? <FindingsTable findings={result.findings} />
                : (
                  <Panel>
                    <div className="flex items-center gap-3 px-4 py-6">
                      <CircleCheck className="size-4 shrink-0 text-[var(--color-verify)]" strokeWidth={1.5} aria-hidden />
                      <p className="text-[0.8125rem] leading-relaxed text-[var(--color-paper-dim)]">
                        No detector fired on this file. That is a real result, not an error — with a small
                        sample there is often nothing across records for a relational rule to see.
                      </p>
                    </div>
                  </Panel>
                )}
              <SavingsPanel result={result} />
              <AuditPanel result={result} />
              <p className="px-1 text-[0.625rem] leading-relaxed text-[var(--color-muted)]">
                {result.meta.note} The model was used {result.meta.llmUsedForMapping ? '' : 'not '}
                for column mapping on this run, and for nothing else.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
