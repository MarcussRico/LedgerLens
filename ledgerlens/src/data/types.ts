export type Pillar =
  | 'Duplicates & Overpayment'
  | 'Price & Vendor Intelligence'
  | 'Behavioural Anomalies'
  | 'Vendor Integrity & Collusion'
  | 'Compliance & Process'

export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type FindingStatus = 'open' | 'validated' | 'actioned' | 'recovered' | 'dismissed'

export interface Action {
  kind: 'recover' | 'renegotiate' | 'block-payment' | 'investigate' | 'consolidate' | 'escalate'
  label: string
  detail: string
}

export interface Finding {
  id: string
  ruleId: string
  pillar: Pillar
  severity: Severity
  entities: { invoiceIds: string[]; vendorId: string; poIds?: string[] }
  evidence: Record<string, unknown>
  moneyAtRisk: number
  confidence: number
  explanation: string
  recommendedAction: Action
  scoreContribution: { component: string; points: number }[]
  status: FindingStatus
  detectedAt: string
}

export interface Scorecard {
  priceIndex: number      // 100 = peer median
  onTimePct: number
  defectPct: number
  disputeRate: number
}

export interface Vendor {
  id: string
  name: string
  canonicalId: string      // entity-resolution target; aliases share this
  gstin: string
  pan: string
  bankMasked: string
  bankKey: string          // resolved bank identity — shared keys are the collusion tell
  address: string
  city: string
  phone: string
  emailDomain: string
  onboardedAt: string
  category: Category
  scorecard: Scorecard
  riskScore: number
  spend: number
  invoiceCount: number
  msmeRegistered: boolean
}

export type Category =
  | 'IT Hardware' | 'Office Supplies' | 'Facilities & Maintenance' | 'Logistics'
  | 'Raw Materials' | 'Professional Services' | 'Packaging' | 'Electricals'

export interface LineItem {
  skuId: string
  rawDescription: string   // as written on the document, before normalisation
  qty: number
  unit: string
  unitPrice: number
  hsn: string
  taxRate: number
}

export interface Invoice {
  id: string
  gstInvoiceNo: string
  vendorId: string
  poId?: string
  date: string             // ISO date
  submittedAt: string      // ISO datetime — drives off-hours detection
  lineItems: LineItem[]
  subtotal: number
  tax: number
  amount: number
  status: 'paid' | 'approved' | 'pending' | 'held' | 'disputed'
  paidAt?: string
  flagged: boolean
}

export interface PurchaseOrder {
  id: string
  vendorId: string
  date: string
  amount: number
  approvalThreshold: number
  approver: string
  requisitionBy: string
  grnReceived: boolean
  grnQty?: number
  poQty?: number
}

export interface Sku {
  id: string
  canonical: string
  unit: string
  hsn: string
  category: Category
  peerMedian: number
  variants: string[]       // the raw strings that resolve to this SKU
}

export type GraphNodeKind = 'vendor' | 'employee' | 'bank' | 'address'
export interface GraphNode {
  id: string
  kind: GraphNodeKind
  label: string
  sub?: string
  x: number
  y: number
  risk: number
  ring?: boolean
}
export interface GraphEdge { a: string; b: string; kind: 'bank' | 'address' | 'pan' | 'phone' | 'payment'; ring?: boolean }

export interface Citation {
  id: string
  label: string
  publisher: string
  year: number
  url: string
}

export interface Metric {
  id: string
  label: string
  value: number
  display: string
  derivation: string
  citationId?: string
}
