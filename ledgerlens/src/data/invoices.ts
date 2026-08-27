import type { Invoice, LineItem, PurchaseOrder } from './types'
import { makeRng, intBetween, between, pick } from '../lib/utils'
import { skus, skuById } from './skus'
import { vendors } from './vendors'

/* ~240 fully-modelled invoices. They stand in for a 5,847-invoice corpus —
   the arrays below are the working subset the UI can open and interrogate,
   never a claim that 240 is the whole ledger. Every planted fraud lives here. */

const round2 = (n: number) => Math.round(n * 100) / 100

function money(items: LineItem[]) {
  const subtotal = items.reduce((s, li) => s + li.qty * li.unitPrice, 0)
  const tax = items.reduce((s, li) => s + li.qty * li.unitPrice * li.taxRate, 0)
  return { subtotal: Math.round(subtotal), tax: Math.round(tax), amount: Math.round(subtotal + tax) }
}

function li(skuId: string, qty: number, unitPrice: number, variantIdx = 0, taxRate = 0.18): LineItem {
  const s = skuById.get(skuId)!
  return { skuId, rawDescription: s.variants[variantIdx % s.variants.length], qty, unit: s.unit, unitPrice, hsn: s.hsn, taxRate }
}

/* ── The eleven confirmed duplicate pairs. Their `amount` values sum to
      ₹8,42,650 — the "Recoverable" tier, tier 1 of the savings model. ── */
export interface DupPair {
  id: string
  vendorId: string
  amountAtRisk: number
  a: { no: string; date: string; submittedAt: string }
  b: { no: string; date: string; submittedAt: string }
  items: LineItem[]
  matchPct: number
  recovered: boolean
}

export const duplicatePairs: DupPair[] = [
  { id: 'DP-01', vendorId: 'V-001', amountAtRisk: 1_86_400, matchPct: 0.97, recovered: true,
    a: { no: 'INV-7412', date: '2026-02-09', submittedAt: '2026-02-09T11:24:00' },
    b: { no: 'INV-7461', date: '2026-02-14', submittedAt: '2026-02-14T18:52:00' },
    items: [li('SKU-1001', 620, 240, 0), li('SKU-1002', 140, 268, 1)] },
  { id: 'DP-02', vendorId: 'V-010', amountAtRisk: 1_42_800, matchPct: 0.96, recovered: true,
    a: { no: 'TIS/25-26/0884', date: '2025-11-21', submittedAt: '2025-11-21T16:03:00' },
    b: { no: 'TIS/25-26/0918', date: '2025-11-27', submittedAt: '2025-11-27T21:41:00' },
    items: [li('SKU-2002', 12, 10_410, 0)] },
  { id: 'DP-03', vendorId: 'V-004', amountAtRisk: 98_750, matchPct: 0.94, recovered: true,
    a: { no: 'VFS-2201', date: '2026-04-02', submittedAt: '2026-04-02T10:11:00' },
    b: { no: 'VFS-2210', date: '2026-04-06', submittedAt: '2026-04-06T23:18:00' },
    items: [li('SKU-3001', 1, 83_686, 0)] },
  { id: 'DP-04', vendorId: 'V-013', amountAtRisk: 87_300, matchPct: 0.95, recovered: true,
    a: { no: 'TE/1188', date: '2025-09-15', submittedAt: '2025-09-15T14:47:00' },
    b: { no: 'TE/1I88', date: '2025-09-19', submittedAt: '2025-09-19T09:22:00' },
    items: [li('SKU-6001', 40, 1_386, 0), li('SKU-6002', 3, 7_320, 1)] },
  { id: 'DP-05', vendorId: 'V-011', amountAtRisk: 74_600, matchPct: 0.93, recovered: true,
    a: { no: 'MLP-30441', date: '2026-01-08', submittedAt: '2026-01-08T08:35:00' },
    b: { no: 'MLP-30414', date: '2026-01-13', submittedAt: '2026-01-13T19:57:00' },
    items: [li('SKU-7001', 3, 21_060, 0)] },
  { id: 'DP-06', vendorId: 'V-014', amountAtRisk: 68_200, matchPct: 0.92, recovered: true,
    a: { no: 'SMW/6602', date: '2025-07-24', submittedAt: '2025-07-24T12:09:00' },
    b: { no: 'SMW/6620', date: '2025-07-30', submittedAt: '2025-07-30T17:44:00' },
    items: [li('SKU-5001', 1, 57_797, 0)] },
  { id: 'DP-07', vendorId: 'V-002', amountAtRisk: 55_400, matchPct: 0.98, recovered: true,
    a: { no: 'ST-4471', date: '2026-05-11', submittedAt: '2026-05-11T15:20:00' },
    b: { no: 'STPL-4471', date: '2026-05-16', submittedAt: '2026-05-16T02:14:00' },
    items: [li('SKU-1001', 196, 240, 1)] },
  { id: 'DP-08', vendorId: 'V-020', amountAtRisk: 48_900, matchPct: 0.91, recovered: true,
    a: { no: 'VPS/9012', date: '2025-12-03', submittedAt: '2025-12-03T11:02:00' },
    b: { no: 'VPS/9021', date: '2025-12-09', submittedAt: '2025-12-09T20:36:00' },
    items: [li('SKU-6002', 6, 6_907, 0)] },
  { id: 'DP-09', vendorId: 'V-012', amountAtRisk: 39_500, matchPct: 0.90, recovered: true,
    a: { no: 'IPW-1750', date: '2026-03-19', submittedAt: '2026-03-19T13:41:00' },
    b: { no: 'IPW-1705', date: '2026-03-24', submittedAt: '2026-03-24T22:08:00' },
    items: [li('SKU-4001', 9, 3_720, 0)] },
  { id: 'DP-10', vendorId: 'V-017', amountAtRisk: 24_300, matchPct: 0.89, recovered: true,
    a: { no: 'NCP-0231', date: '2026-06-02', submittedAt: '2026-06-02T09:15:00' },
    b: { no: 'NCP-0213', date: '2026-06-07', submittedAt: '2026-06-07T18:03:00' },
    items: [li('SKU-8001', 1, 20_593, 0)] },
  { id: 'DP-11', vendorId: 'V-019', amountAtRisk: 16_500, matchPct: 0.88, recovered: true,
    a: { no: 'ARP/552', date: '2025-10-17', submittedAt: '2025-10-17T10:50:00' },
    b: { no: 'ARP/525', date: '2025-10-22', submittedAt: '2025-10-22T21:29:00' },
    items: [li('SKU-4002', 12, 1_165, 1)] },
]

/** The pair the demo opens on, and the one the ⚡ injection re-creates live. */
export const HERO_PAIR = {
  vendorId: 'V-001',
  amount: 1_24_500,
  original: { no: 'INV-8790', date: '2026-08-18', submittedAt: '2026-08-18T11:42:00' },
  duplicate: { no: 'INV-8842', date: '2026-08-24', submittedAt: '2026-08-24T02:17:00' },
  items: [
    li('SKU-1001', 310, 240, 0),
    li('SKU-1002', 42, 268, 0),
    li('SKU-4002', 14, 1_240, 0),
    li('SKU-6001', 18, 1_090, 0),
  ],
  matchPct: 0.96,
  daysApart: 6,
}

/* ── PO splitting: ₹2,40,000 routed around the ₹50,000 director threshold ── */
export const splitCase = {
  vendorId: 'V-001',
  threshold: 50_000,
  approver: 'R. Muthukumar (Manager, Admin)',
  bypassed: 'Director — Finance',
  window: '12–16 Mar 2026',
  pos: [
    { id: 'PO-4471', date: '2026-03-12', amount: 48_000 },
    { id: 'PO-4478', date: '2026-03-13', amount: 48_000 },
    { id: 'PO-4483', date: '2026-03-13', amount: 48_000 },
    { id: 'PO-4491', date: '2026-03-16', amount: 48_000 },
    { id: 'PO-4494', date: '2026-03-16', amount: 48_000 },
  ],
  total: 2_40_000,
}

export const otherSplitCases = [
  { vendorId: 'V-004', count: 4, each: 49_200, total: 1_96_800, window: '04–09 Jun 2026', approver: 'S. Anitha (Manager, Facilities)' },
  { vendorId: 'V-010', count: 3, each: 49_500, total: 1_48_500, window: '21–24 Jan 2026', approver: 'K. Prakash (Manager, IT)' },
  { vendorId: 'V-017', count: 6, each: 47_800, total: 2_86_800, window: '11–19 Oct 2025', approver: 'R. Muthukumar (Manager, Admin)' },
]

/* ── Corpus generation ─────────────────────────────────────────────────── */
const rng = makeRng(0x5AF3)
const STATUSES: Invoice['status'][] = ['paid', 'paid', 'paid', 'approved', 'pending', 'held', 'disputed']

function isoDate(offsetDays: number): string {
  const base = Date.UTC(2025, 2, 1) // 01 Mar 2025 → 18 months to Aug 2026
  const d = new Date(base + offsetDays * 86400000)
  return d.toISOString().slice(0, 10)
}

function makeInvoice(i: number): Invoice {
  const v = vendors[intBetween(rng, 0, vendors.length - 1)]
  const day = intBetween(rng, 0, 545)
  const date = isoDate(day)
  // 8% of submissions land off-hours; that skew is what the behavioural pillar reads
  const offHours = rng() < 0.08
  const hh = offHours ? intBetween(rng, 0, 4) : intBetween(rng, 9, 19)
  const mm = intBetween(rng, 0, 59)
  const catSkus = skus.filter((s) => s.category === v.category)
  const pool = catSkus.length ? catSkus : skus
  const n = intBetween(rng, 1, 3)
  const items: LineItem[] = []
  for (let k = 0; k < n; k++) {
    const s = pick(rng, pool)
    const drift = between(rng, 0.9, 1.28)
    items.push(li(s.id, intBetween(rng, 1, s.peerMedian > 20000 ? 6 : 220), Math.round(s.peerMedian * drift), intBetween(rng, 0, 4)))
  }
  const { subtotal, tax, amount } = money(items)
  const status = pick(rng, STATUSES)
  return {
    id: `INV-${3000 + i * 7}`,
    gstInvoiceNo: `${v.id.replace('V-', '')}/${date.slice(2, 4)}-${String(Number(date.slice(2, 4)) + 1)}/${1000 + i}`,
    vendorId: v.id,
    poId: rng() > 0.14 ? `PO-${2000 + i * 3}` : undefined,
    date,
    submittedAt: `${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`,
    lineItems: items,
    subtotal, tax, amount,
    status,
    paidAt: status === 'paid' ? isoDate(day + intBetween(rng, 12, 74)) : undefined,
    flagged: false,
  }
}

function pairToInvoices(p: DupPair): Invoice[] {
  const { subtotal, tax } = money(p.items)
  const scale = p.amountAtRisk / (subtotal + tax)
  const items = p.items.map((it) => ({ ...it, unitPrice: Math.round(it.unitPrice * scale) }))
  const m = money(items)
  const v = vendors.find((x) => x.id === p.vendorId)!
  const mk = (side: DupPair['a'], suffix: string): Invoice => ({
    id: `${p.id}-${suffix}`,
    gstInvoiceNo: side.no,
    vendorId: v.id,
    poId: `PO-${3300 + Number(p.id.slice(3)) * 4}`,
    date: side.date,
    submittedAt: side.submittedAt,
    lineItems: items,
    subtotal: m.subtotal, tax: m.tax, amount: m.amount,
    status: suffix === 'A' ? 'paid' : 'paid',
    paidAt: side.date,
    flagged: true,
  })
  return [mk(p.a, 'A'), mk(p.b, 'B')]
}

export const heroInvoices: Invoice[] = (() => {
  const m = money(HERO_PAIR.items)
  const scale = HERO_PAIR.amount / m.amount
  const items = HERO_PAIR.items.map((it) => ({ ...it, unitPrice: round2(it.unitPrice * scale) }))
  const mm = money(items)
  const base = {
    vendorId: HERO_PAIR.vendorId, poId: 'PO-8801', lineItems: items,
    subtotal: mm.subtotal, tax: mm.tax, amount: HERO_PAIR.amount, flagged: true,
  }
  return [
    { ...base, id: 'INV-8790', gstInvoiceNo: 'INV-8790', date: HERO_PAIR.original.date, submittedAt: HERO_PAIR.original.submittedAt, status: 'paid' as const, paidAt: '2026-08-21' },
    { ...base, id: 'INV-8842', gstInvoiceNo: 'INV-8842', date: HERO_PAIR.duplicate.date, submittedAt: HERO_PAIR.duplicate.submittedAt, status: 'held' as const },
  ]
})()

export const invoices: Invoice[] = [
  ...heroInvoices,
  ...duplicatePairs.flatMap(pairToInvoices),
  ...Array.from({ length: 216 }, (_, i) => makeInvoice(i)),
]

export const invoiceById = new Map(invoices.map((iv) => [iv.id, iv]))

/* ── Purchase orders ───────────────────────────────────────────────────── */
const poRng = makeRng(0x0DEF)
const APPROVERS = ['R. Muthukumar', 'S. Anitha', 'K. Prakash', 'D. Lakshmi', 'V. Sundaram', 'A. Fathima', 'Director — Finance'] as const

export const purchaseOrders: PurchaseOrder[] = [
  ...splitCase.pos.map((p) => ({
    id: p.id, vendorId: splitCase.vendorId, date: p.date, amount: p.amount,
    approvalThreshold: 50_000, approver: splitCase.approver, requisitionBy: 'Admin — Stores',
    grnReceived: true, grnQty: 200, poQty: 200,
  })),
  ...Array.from({ length: 420 }, (_, i) => {
    const v = vendors[intBetween(poRng, 0, vendors.length - 1)]
    const roll = poRng()
    let amount: number
    if (roll < 0.22) {
      // threshold-hugging band: deliberately parked below the ₹50,000 sign-off
      amount = intBetween(poRng, 43_500, 49_800)
    } else if (roll < 0.80) {
      // ordinary small purchases — skewed toward the low end
      amount = Math.round(5_000 + 74_000 * Math.pow(poRng(), 1.7))
      // purchases that would land just above the limit get restructured, not approved
      if (amount > 50_000 && amount < 62_000 && poRng() < 0.72) amount = intBetween(poRng, 45_000, 49_600)
    } else {
      amount = Math.round(between(poRng, 82_000, 9_40_000))
    }
    const poQty = intBetween(poRng, 5, 400)
    const shortGrn = poRng() < 0.09
    return {
      id: `PO-${2000 + i * 3}`,
      vendorId: v.id,
      date: isoDate(intBetween(poRng, 0, 545)),
      amount,
      approvalThreshold: 50_000,
      approver: APPROVERS[intBetween(poRng, 0, APPROVERS.length - 1)],
      requisitionBy: `${v.category} — Requisition`,
      grnReceived: poRng() > 0.07,
      poQty,
      grnQty: shortGrn ? poQty - intBetween(poRng, 1, 40) : poQty,
    }
  }),
]

/** PO amount distribution below ₹80,000, in ₹5,000 buckets.
    Scaled from the modelled subset to the 1,203-PO corpus, shape preserved. */
export const poHistogram = (() => {
  const BUCKETS = 16
  const buckets = Array.from({ length: BUCKETS }, (_, i) => ({ lo: i * 5_000, hi: (i + 1) * 5_000, count: 0 }))
  let inRange = 0
  for (const po of purchaseOrders) {
    if (po.amount >= 80_000) continue
    inRange++
    buckets[Math.min(BUCKETS - 1, Math.floor(po.amount / 5_000))].count++
  }
  const scale = (1203 * 0.86) / Math.max(1, inRange)
  return buckets.map((b) => ({ ...b, count: Math.round(b.count * scale) }))
})()

export const THRESHOLD = 50_000
