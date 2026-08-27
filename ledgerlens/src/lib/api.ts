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

/** A realistic messy file, so someone with no data to hand can still try it. */
export function sampleInvoicesCsv(): string {
  return [
    'Doc Ref,Party Code,PO Number,Txn Dt,Gross Val,Tax Amt,GST Invoice No,Status,Booked Under,Sanctioned By,Payment Dt',
    'INV-8790,V-001,PO-8801,18/08/2026,"1,24,500",19000,INV-8790,paid,Admin Stores,R. Muthukumar,21/08/2026',
    'INV-8842,V-001,PO-8801,24/08/2026,"1,24,500",19000,INV-8842,held,Admin Stores,R. Muthukumar,',
    'INV-7412,V-001,PO-3304,09/02/2026,"1,86,400",28434,INV-7412,paid,Admin Stores,R. Muthukumar,14/02/2026',
    'INV-7461,V-002,PO-3304,14/02/2026,"1,86,400",28434,INV-7461,paid,Admin Stores,R. Muthukumar,20/02/2026',
    'TIS-0884,V-010,PO-3312,21/11/2025,"1,42,800",21783,TIS/25-26/0884,paid,IT,K. Prakash,28/11/2025',
    'TIS-0918,V-010,PO-3312,27/11/2025,"1,42,800",21783,TIS/25-26/0918,paid,IT,K. Prakash,03/12/2025',
    'TE-1188,V-013,PO-3320,15/09/2025,"87,300",13317,TE/1188,paid,Facilities,S. Anitha,22/09/2025',
    'TE-1I88,V-013,PO-3320,19/09/2025,"87,300",13317,TE/1I88,paid,Facilities,S. Anitha,26/09/2025',
    'INV-5001,V-009,PO-4001,03/06/2026,"4,80,000",73220,INV-5001,paid,IT,K. Prakash,10/06/2026',
    'INV-5002,V-008,PO-4002,11/06/2026,"96,000",14644,INV-5002,paid,Admin Stores,D. Lakshmi,18/06/2026',
  ].join('\n')
}

export function sampleVendorsCsv(): string {
  return [
    'Vendor Code,Supplier Name,GSTIN,PAN,Account Number,Registered Address,Contact No,Vendor Since,MSME',
    'V-001,Sharma Traders,33AABCS1234N1Z5,AABCS1234N,HDFC-4471,"17/3 Anna Nagar 4th Street, Madurai",+91 98765 43210,02/11/2023,Yes',
    'V-002,M/s Sharma Traders Pvt Ltd,33AABCS1234N1Z5,AABCS1234N,HDFC 4471,"17/3 Anna Nagar 4th Street, Madurai",+91 98765 43210,17/01/2024,Yes',
    'V-008,Pallava Stationers,33AABCP5678M1Z9,AABCP5678M,IOBA-2231,"44 GST Road, Chennai",+91 90000 11111,12/05/2022,No',
    'V-009,Cortex Computing Systems,33AABCC9012L1Z3,AABCC9012L,ICICI-9083,"12 Mount Road, Chennai",+91 90000 22222,08/03/2022,No',
    'V-010,Trident Infosystems,33AABCT3456K1Z7,AABCT3456K,ICICI-9083,"9 Avinashi Road, Coimbatore",+91 90000 33333,19/07/2023,No',
    'V-013,Thangam Electricals,33AABCT7890J1Z1,AABCT7890J,KVBL-5567,"88 South Gate, Madurai",+91 90000 44444,25/09/2022,Yes',
  ].join('\n')
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
