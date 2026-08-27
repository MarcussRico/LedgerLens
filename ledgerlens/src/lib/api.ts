/**
 * Client for the LedgerLens engine.
 *
 * Nothing here runs unless a user deliberately uploads a file. The demo dataset
 * on this page is bundled client-side and never touches the network, so a dead
 * venue connection costs the rehearsed pitch nothing — it only disables this
 * one optional panel.
 */

export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ??
  'https://ledgerlens-api-production-8ed9.up.railway.app'

export type SourceKind = 'invoices' | 'pos' | 'grns' | 'vendors' | 'lines' | 'employees'

export const SOURCE_KINDS: { id: SourceKind; label: string; hint: string }[] = [
  { id: 'invoices', label: 'Invoices', hint: 'invoice no · vendor · date · amount' },
  { id: 'pos', label: 'Purchase orders', hint: 'PO no · vendor · date · amount · approver' },
  { id: 'grns', label: 'Goods receipts', hint: 'GRN no · PO no · received qty' },
  { id: 'vendors', label: 'Vendor master', hint: 'vendor · GSTIN · PAN · bank · address' },
  { id: 'lines', label: 'Invoice line items', hint: 'invoice no · description · qty · rate' },
  { id: 'employees', label: 'Employee master', hint: 'employee · address · phone · bank' },
]

export interface ColumnMapping {
  source: string
  target: string
  method: 'exact' | 'alias' | 'value-shape' | 'llm'
  confidence: number
}

export interface KindMapping {
  kind: string
  mapped: ColumnMapping[]
  unmapped: string[]
  llmUsed: boolean
}

export interface ApiFinding {
  id: string
  ruleId: string
  pillar: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  entities: {
    invoiceIds: string[]
    vendorId: string | null
    poIds: string[]
    skuIds: string[]
    employeeIds: string[]
  }
  evidence: Record<string, unknown>
  moneyAtRisk: number
  confidence: number
  explanation: string
  recommendedAction: { kind: string; label: string; detail: string }
  scoreContribution: { component: string; points: number; ruleId: string | null }[]
  detectedAt: string | null
}

export interface IntegrityCheck {
  name: string
  score: number
  weight: number
  observed: string
  expected: string
  verdict: string
  applicable: boolean
}

export interface DataIntegrity {
  score: number
  band: string
  headline: string
  sampleSize: number
  checks: IntegrityCheck[]
}

export interface AuditTrail {
  version: string
  algorithm: string
  corpusFingerprint: string
  root: string
  findings: number
  note: string
  chain?: { findingId: string; ruleId: string; contentHash: string; link: string }[]
}

export interface AnalyseResponse {
  meta: {
    client: string
    elapsedSeconds: number
    detectorsRun: number
    detectorsRegistered: number
    zeroTrust: boolean
    llmUsedForMapping: boolean
    note: string
  }
  ingest: {
    mappings: Record<string, KindMapping>
    rowCounts: Record<string, number>
    rejectedCounts: Record<string, number>
    rejectReasons: Record<string, Record<string, number>>
    vendorMerges: { basis: string; value: string; vendorIds: string[]; names?: string[] }[]
    resolution: {
      vendorRecords: number
      resolvedEntities: number
      skusResolved: number
      rawSkuVariants: number
    }
  }
  rejected: { count: number; reasons: Record<string, number> }
  corpus: {
    invoices: number
    purchaseOrders: number
    vendors: number
    lineItems: number
    skusResolved: number
    spendAnalysed: number
    spendDisplay: string
  }
  dataIntegrity: DataIntegrity
  audit: AuditTrail
  findings: ApiFinding[]
  savings: {
    tiers: {
      name: string
      confidence: string
      amount: number
      display: string
      events: number
      findingsContributing: number
      derivation: string
      lines: { label: string; amount: number; display: string; ruleIds: string[]; basis: string }[]
    }[]
    total: number
    totalDisplay: string
    spendDisplay: string
    shareOfSpend: number
    derivation: string
  }
  riskScores: {
    subjectId: string
    subjectName: string
    score: number
    band: string
    findings: number
    moneyAtRisk: number
    derivation: string
    pillars: { pillar: string; prefix: string; points: number; maxPoints: number; findings: number }[]
  }[]
  healthIndex: { score: number; band: string; derivation: string }
}

export interface HealthResponse {
  status: string
  detectors: number
  pillars: number
  llmAvailable: boolean
  llmRole: string
}

export class ApiError extends Error {
  status?: number
  hint?: string
  constructor(message: string, status?: number, hint?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.hint = hint
  }
}

async function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await p(ctrl.signal)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(
        `The engine did not respond within ${Math.round(ms / 1000)}s.`,
        undefined,
        'It sleeps when idle and takes a few seconds to wake. Try once more.',
      )
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function checkHealth(timeoutMs = 20_000): Promise<HealthResponse> {
  return withTimeout(async (signal) => {
    const res = await fetch(`${API_BASE}/api/health`, { signal })
    if (!res.ok) throw new ApiError(`Engine returned ${res.status}`, res.status)
    return (await res.json()) as HealthResponse
  }, timeoutMs)
}

export interface AnalyseOptions {
  approvalThreshold?: number
  zeroTrust?: boolean
  clientName?: string
  useLlm?: boolean
}

export async function analyse(
  files: { file: File; kind: SourceKind }[],
  opts: AnalyseOptions = {},
  timeoutMs = 120_000,
): Promise<AnalyseResponse> {
  if (!files.length) throw new ApiError('Add at least one file.')
  const body = new FormData()
  for (const { file } of files) body.append('files', file)
  body.append('kinds', files.map((f) => f.kind).join(','))
  body.append('approval_threshold', String(opts.approvalThreshold ?? 50_000))
  body.append('zero_trust', String(opts.zeroTrust ?? false))
  body.append('client_name', opts.clientName ?? 'Your organisation')
  body.append('use_llm', String(opts.useLlm ?? true))

  return withTimeout(async (signal) => {
    let res: Response
    try {
      res = await fetch(`${API_BASE}/api/analyse`, { method: 'POST', body, signal })
    } catch {
      throw new ApiError(
        'Could not reach the engine.',
        undefined,
        'This panel is the only part of the page that needs a network. Everything else on this site is bundled and still works.',
      )
    }
    if (!res.ok) {
      let detail = `Engine returned ${res.status}`
      try {
        const j = await res.json()
        if (typeof j?.detail === 'string') detail = j.detail
      } catch { /* keep the status-code message */ }
      throw new ApiError(detail, res.status)
    }
    return (await res.json()) as AnalyseResponse
  }, timeoutMs)
}

/* ── the bundled sample ────────────────────────────────────────────────────
   Six real files served from this site's own origin, not a toy built in the
   browser: 1,008 invoices, 915 POs, 1,008 line items, 160 vendor records. They
   are fetched only when someone asks for them, so a plain page load still
   makes no request at all. */

export interface SampleFile {
  name: string
  kind: SourceKind
  rows: number
  bytes: number
}

export const SAMPLE_FILES: SampleFile[] = [
  { name: 'invoices.csv', kind: 'invoices', rows: 1008, bytes: 146_000 },
  { name: 'pos.csv', kind: 'pos', rows: 915, bytes: 71_000 },
  { name: 'grns.csv', kind: 'grns', rows: 915, bytes: 33_000 },
  { name: 'lines.csv', kind: 'lines', rows: 1008, bytes: 54_000 },
  { name: 'vendors.csv', kind: 'vendors', rows: 160, bytes: 25_000 },
  { name: 'employees.csv', kind: 'employees', rows: 18, bytes: 1_300 },
]

/** The planted frauds, so a reader can mark our homework rather than trust us. */
export const GROUND_TRUTH_URL = '/samples/ground_truth.csv'

export const sampleUrl = (name: string) => `/samples/${name}`

export async function fetchSample(
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ file: File; kind: SourceKind }[]> {
  const out: { file: File; kind: SourceKind }[] = []
  for (const [i, spec] of SAMPLE_FILES.entries()) {
    const res = await fetch(sampleUrl(spec.name))
    if (!res.ok) {
      throw new ApiError(
        `Could not load ${spec.name} (${res.status}).`,
        res.status,
        'The sample ships with this site, so this usually means a stale cache — reload and try again.',
      )
    }
    const text = await res.text()
    out.push({ file: new File([text], spec.name, { type: 'text/csv' }), kind: spec.kind })
    onProgress?.(i + 1, SAMPLE_FILES.length)
  }
  return out
}

/* ── language-only endpoints ───────────────────────────────────────────────
   The engine drafts and explains. It is forbidden from arithmetic: every
   figure in a returned letter was passed in, already computed by a rule. */

export interface DraftRequest {
  kind: 'recovery-email' | 'audit-memo' | 'commercial-review'
  vendorName: string
  ruleId: string
  moneyAtRisk: number
  evidence: Record<string, unknown>
  clientName?: string
}

export async function draftLetter(req: DraftRequest, timeoutMs = 60_000): Promise<string> {
  return withTimeout(async (signal) => {
    let res: Response
    try {
      res = await fetch(`${API_BASE}/api/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: req.kind,
          vendor_name: req.vendorName,
          rule_id: req.ruleId,
          money_at_risk: req.moneyAtRisk,
          evidence: req.evidence,
          client_name: req.clientName ?? 'Vaigai Industries Ltd',
        }),
        signal,
      })
    } catch {
      throw new ApiError('Could not reach the engine.', undefined,
        'Falling back to the deterministic template, which is always correct.')
    }
    if (!res.ok) {
      throw new ApiError(`Engine returned ${res.status}`, res.status,
        res.status === 503 ? 'Drafting needs the language model, which is not configured.' : undefined)
    }
    const j = (await res.json()) as { draft: string }
    return j.draft
  }, timeoutMs)
}

export interface ExplainRequest {
  explanation: string
  evidence: Record<string, unknown>
  ruleId: string
  moneyAtRisk: number
  vendorName?: string
  audience?: string
}

export async function explainFinding(req: ExplainRequest, timeoutMs = 45_000): Promise<string> {
  return withTimeout(async (signal) => {
    const res = await fetch(`${API_BASE}/api/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        explanation: req.explanation,
        evidence: req.evidence,
        rule_id: req.ruleId,
        money_at_risk: req.moneyAtRisk,
        vendor_name: req.vendorName ?? null,
        audience: req.audience ?? 'finance manager',
      }),
      signal,
    })
    if (!res.ok) throw new ApiError(`Engine returned ${res.status}`, res.status)
    const j = (await res.json()) as { explanation: string; source: string }
    return j.explanation
  }, timeoutMs)
}
