import type { Pillar } from './types'

export interface Detector { id: string; name: string; flagship?: boolean; note?: string }
export interface PillarSpec {
  n: number
  key: string
  pillar: Pillar
  blurb: string
  detectors: Detector[]
  accent: 'gold' | 'slate' | 'signal' | 'clay' | 'verify'
  precision: number
  findings: number
}

export const pillars: PillarSpec[] = [
  {
    n: 1, key: 'dup', pillar: 'Duplicates & Overpayment', accent: 'gold', precision: 0.947, findings: 41,
    blurb: 'The largest category of leakage, and almost never fraud. Somebody re-sent an invoice and both copies got paid.',
    detectors: [
      { id: 'DUP-002', name: 'Near-duplicate matching', flagship: true, note: 'Same vendor · amount within ±1% · date within 7 days · different invoice number.' },
      { id: 'DUP-004', name: 'Transposition-tolerant invoice numbers', flagship: true, note: 'Levenshtein ≤ 2 on the normalised number. Catches INV-1042 against INV-I042.' },
      { id: 'DUP-007', name: 'Cross-alias duplicates', flagship: true, note: 'Only visible after vendor entity resolution: the same bill arriving under two trading names.' },
      { id: 'DUP-001', name: 'Exact duplicate' },
      { id: 'DUP-003', name: 'Same goods billed on two POs' },
      { id: 'DUP-005', name: 'Credit note raised but never applied' },
      { id: 'DUP-006', name: 'Paid before goods received' },
      { id: 'DUP-008', name: 'Expense reimbursement double-dip' },
    ],
  },
  {
    n: 2, key: 'price', pillar: 'Price & Vendor Intelligence', accent: 'slate', precision: 0.971, findings: 38,
    blurb: 'You cannot compare a price until you know two documents are describing the same thing. Resolution comes first.',
    detectors: [
      { id: 'PRC-001', name: 'Unit-price benchmarking across vendors', flagship: true, note: 'Runs after SKU normalisation. Peer median per SKU, deviation in rupees and percent.' },
      { id: 'PRC-003', name: 'Price-creep regression', flagship: true, note: 'Ordinary least squares on unit price against the peer median over an 18-month window.' },
      { id: 'PRC-005', name: 'Contract rate-card violation', flagship: true, note: 'Invoiced rate against the signed rate card, overbilling delta stated in rupees.' },
      { id: 'PRC-002', name: 'Volume paradox — larger orders at higher unit price' },
      { id: 'PRC-004', name: 'Best-price counterfactual' },
      { id: 'PRC-006', name: 'Vendor consolidation opportunity' },
      { id: 'PRC-007', name: 'Tail-spend concentration' },
      { id: 'PRC-008', name: 'Missed early-payment discount' },
      { id: 'PRC-009', name: 'Lead-time-adjusted true cost' },
    ],
  },
  {
    n: 3, key: 'behav', pillar: 'Behavioural Anomalies', accent: 'signal', precision: 0.936, findings: 47,
    blurb: 'No single transaction is wrong. The shape of the distribution is wrong.',
    detectors: [
      { id: 'BEH-001', name: 'PO splitting', flagship: true, note: 'n orders · one vendor · one approval window · each sitting below the sign-off threshold.' },
      { id: 'BEH-002', name: 'Threshold-hugging distribution analysis', flagship: true, note: 'Mass just under a limit against the expected density either side of it.' },
      { id: 'BEH-003', name: "Benford's Law on leading digits", flagship: true, note: 'χ² against the expected log-distribution. Digit 4 over-represented at p < 0.001.' },
      { id: 'BEH-004', name: 'Round-number bias' },
      { id: 'BEH-005', name: 'Off-hours submission' },
      { id: 'BEH-006', name: 'Weekend and public-holiday filing' },
      { id: 'BEH-007', name: 'Fiscal year-end spend dumping' },
      { id: 'BEH-008', name: 'Maverick (off-contract) spend' },
      { id: 'BEH-009', name: 'Quantity absurdity against headcount' },
      { id: 'BEH-010', name: 'Emergency-procurement abuse' },
      { id: 'BEH-011', name: 'Isolation Forest multivariate outliers' },
    ],
  },
  {
    n: 4, key: 'ring', pillar: 'Vendor Integrity & Collusion', accent: 'clay', precision: 0.778, findings: 22,
    blurb: 'These facts live in three systems owned by three teams. Nobody joins vendor master data to HR records at 11pm.',
    detectors: [
      { id: 'VND-001', name: 'Shared-attribute vendor rings', flagship: true, note: 'Bank account · PAN · address · phone · email domain, resolved into connected components.' },
      { id: 'VND-003', name: 'Vendor ↔ employee links', flagship: true, note: 'Vendor master joined to HR records on address, phone, bank and surname.' },
      { id: 'VND-005', name: 'Bank-account change before a large payment', flagship: true, note: 'Any change to payee bank details within 30 days of a payment above ₹1 lakh.' },
      { id: 'VND-002', name: 'Vendor created shortly before first large PO' },
      { id: 'VND-004', name: 'Sequential invoice numbering to a single customer' },
      { id: 'VND-006', name: 'Bid rotation and single-bidder awards' },
      { id: 'VND-007', name: 'Approver concentration' },
      { id: 'VND-008', name: 'Dormant vendor reactivation' },
    ],
  },
  {
    n: 5, key: 'comp', pillar: 'Compliance & Process', accent: 'verify', precision: 0.978, findings: 15,
    blurb: 'India-specific, statutory, and unarguable. These findings do not require anyone to agree with a model.',
    detectors: [
      { id: 'CMP-001', name: 'Three-way match', flagship: true, note: 'PO ↔ GRN ↔ Invoice reconciled on quantity, unit price and payment terms.' },
      { id: 'CMP-002', name: 'Duplicate GST invoice number within one financial year', flagship: true, note: 'For a single GSTIN this is statutorily impossible. It is not a heuristic.' },
      { id: 'CMP-004', name: 'MSME 45-day payment breach', flagship: true, note: 'Section 43B(h) — payment to a registered MSME beyond 45 days is disallowed as expenditure.' },
      { id: 'CMP-003', name: 'Invoice without PO, or exceeding PO tolerance' },
      { id: 'CMP-005', name: 'Tax rate inconsistent with HSN code' },
      { id: 'CMP-006', name: 'Segregation-of-duties breach' },
    ],
  },
]

export const DETECTOR_COUNT = pillars.reduce((s, p) => s + p.detectors.length, 0)
export const allDetectors = pillars.flatMap((p) => p.detectors.map((d) => ({ ...d, pillar: p.pillar, key: p.key })))
