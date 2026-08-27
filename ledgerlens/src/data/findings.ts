import type { Finding, Pillar, Severity, FindingStatus } from './types'
import { makeRng, intBetween, between, pick, formatINR, daysBetween } from '../lib/utils'
import { vendors, vendorById } from './vendors'
import { pillars } from './detectors'
import { duplicatePairs, splitCase, otherSplitCases, HERO_PAIR, invoices } from './invoices'
import { skuById, rateCard, priceCreep, priceBook } from './skus'

/* 163 findings. The fourteen below are hand-authored because the narrative
   names them; the rest are composed deterministically from the same detector
   registry so the register behaves like a real working queue. */

const V = (id: string) => vendorById.get(id)!

/* ── 1. The eleven confirmed duplicate pairs ── */
const dupFindings: Finding[] = duplicatePairs.map((p, i) => {
  const v = V(p.vendorId)
  const gap = daysBetween(p.a.date, p.b.date)
  return {
    id: `F-D${String(i + 1).padStart(2, '0')}`,
    ruleId: gap <= 7 ? 'DUP-002' : 'DUP-004',
    pillar: 'Duplicates & Overpayment' as Pillar,
    severity: (p.amountAtRisk > 1_00_000 ? 'critical' : p.amountAtRisk > 50_000 ? 'high' : 'medium') as Severity,
    entities: { invoiceIds: [`${p.id}-A`, `${p.id}-B`], vendorId: p.vendorId },
    evidence: {
      invoiceNoA: p.a.no, invoiceNoB: p.b.no,
      dateA: p.a.date, dateB: p.b.date,
      daysApart: gap,
      amountA: p.amountAtRisk, amountB: p.amountAtRisk,
      amountDeltaPct: 0,
      lineItemsIdentical: p.items.length,
      matchScore: p.matchPct,
      vendorResolvedTo: v.canonicalId,
    },
    moneyAtRisk: p.amountAtRisk,
    confidence: p.matchPct,
    explanation: `${v.name} billed ${formatINR(p.amountAtRisk)} twice — ${p.a.no} on ${p.a.date}, then ${p.b.no} ${gap} days later, same ${p.items.length} line items, different invoice number. Both were paid.`,
    recommendedAction: { kind: 'recover', label: 'Raise recovery against the second payment', detail: `Issue a debit note to ${v.name} for ${formatINR(p.amountAtRisk)} referencing ${p.b.no}, or offset against the next open invoice.` },
    scoreContribution: [
      { component: 'Amount match within ±1%', points: 22 },
      { component: `Same vendor after entity resolution (${v.canonicalId})`, points: 14 },
      { component: `Line items identical (${p.items.length}/${p.items.length})`, points: 12 },
      { component: `Filed ${gap} days apart`, points: 8 },
    ],
    status: 'recovered' as FindingStatus,
    detectedAt: p.b.date,
  }
})

/* ── 2. The live case the ⚡ injection re-creates ── */
export const HERO_FINDING: Finding = {
  id: 'F-D00',
  ruleId: 'DUP-002',
  pillar: 'Duplicates & Overpayment',
  severity: 'critical',
  entities: { invoiceIds: ['INV-8842', 'INV-8790'], vendorId: HERO_PAIR.vendorId, poIds: ['PO-8801'] },
  evidence: {
    invoiceNoA: 'INV-8842', invoiceNoB: 'INV-8790',
    dateA: HERO_PAIR.duplicate.date, dateB: HERO_PAIR.original.date,
    daysApart: HERO_PAIR.daysApart,
    amountA: HERO_PAIR.amount, amountB: HERO_PAIR.amount,
    amountDeltaPct: 0,
    lineItemsIdentical: 4,
    matchScore: HERO_PAIR.matchPct,
    submittedAt: HERO_PAIR.duplicate.submittedAt,
    vendorResolvedTo: 'C-SHARMA',
  },
  moneyAtRisk: HERO_PAIR.amount,
  confidence: 0.96,
  explanation: 'Sharma Traders re-sent an unpaid invoice under a new number. INV-8842 carries the same four line items and the same total as INV-8790, filed six days earlier. Payment on INV-8790 has already cleared.',
  recommendedAction: { kind: 'block-payment', label: 'Hold payment on INV-8842', detail: 'Block the run, confirm INV-8790 cleared on 21 Aug, and send the vendor a reconciliation notice before releasing anything.' },
  scoreContribution: [
    { component: 'Near-duplicate — amount identical', points: 22 },
    { component: 'Unit price above peer median', points: 15 },
    { component: 'Filed 02:17 on a Monday (off-hours)', points: 9 },
    { component: 'Vendor already carries 11 recovered duplicates', points: 12 },
  ],
  status: 'open',
  detectedAt: HERO_PAIR.duplicate.date,
}

/* ── 3. PO splitting ── */
const splitFindings: Finding[] = [
  {
    id: 'F-B01',
    ruleId: 'BEH-001',
    pillar: 'Behavioural Anomalies',
    severity: 'critical',
    entities: { invoiceIds: [], vendorId: splitCase.vendorId, poIds: splitCase.pos.map((p) => p.id) },
    evidence: {
      orderCount: splitCase.pos.length,
      eachAmount: 48_000,
      threshold: splitCase.threshold,
      windowDays: 5,
      window: splitCase.window,
      combined: splitCase.total,
      approver: splitCase.approver,
      bypassed: splitCase.bypassed,
      pos: splitCase.pos,
    },
    moneyAtRisk: splitCase.total,
    confidence: 0.93,
    explanation: 'Five purchase orders, ₹48,000 each, same vendor, same week — ₹2.4 lakh routed around director approval. Each order passes inspection on its own; the bypass only exists across all five.',
    recommendedAction: { kind: 'escalate', label: 'Escalate to internal audit', detail: 'Retrospective director review of PO-4471 through PO-4494, and a control change: aggregate a vendor’s orders over a rolling 7-day window before applying the threshold.' },
    scoreContribution: [
      { component: '5 orders within a 5-day window', points: 24 },
      { component: 'Each 96% of the ₹50,000 threshold', points: 20 },
      { component: 'Single approver on all five', points: 11 },
      { component: 'Vendor risk score 91', points: 8 },
    ],
    status: 'validated',
    detectedAt: '2026-03-16',
  },
  ...otherSplitCases.map((c, i) => ({
    id: `F-B0${i + 2}`,
    ruleId: 'BEH-001',
    pillar: 'Behavioural Anomalies' as Pillar,
    severity: 'high' as Severity,
    entities: { invoiceIds: [], vendorId: c.vendorId },
    evidence: { orderCount: c.count, eachAmount: c.each, threshold: 50_000, window: c.window, combined: c.total, approver: c.approver },
    moneyAtRisk: c.total,
    confidence: 0.86 - i * 0.03,
    explanation: `${V(c.vendorId).name}: ${c.count} orders of ${formatINR(c.each)} inside ${c.window}, each below the ₹50,000 sign-off. Combined ${formatINR(c.total)}.`,
    recommendedAction: { kind: 'investigate' as const, label: 'Review approval trail', detail: `Confirm whether ${c.approver} had authority for the aggregate value.` },
    scoreContribution: [
      { component: `${c.count} orders in one approval window`, points: 20 },
      { component: 'Each within 5% of the threshold', points: 18 },
      { component: 'Single approver', points: 9 },
    ],
    status: 'open' as FindingStatus,
    detectedAt: c.window.split('–')[1].trim().split(' ').slice(0, 3).join('-'),
  })),
]

/* ── 4. The vendor ring ── */
const ringFinding: Finding = {
  id: 'F-V01',
  ruleId: 'VND-001',
  pillar: 'Vendor Integrity & Collusion',
  severity: 'critical',
  entities: { invoiceIds: [], vendorId: 'V-004' },
  evidence: {
    sharedBankAccount: 'HDFC ****4471',
    vendorsOnAccount: ['Sharma Traders', 'Vetri Facility Services', 'Kaveri Sitecare Solutions'],
    sharedAddress: '17/3 Anna Nagar 4th Street, Madurai',
    employeeMatch: 'R. Muthukumar — Manager, Admin (registered address identical)',
    combinedSpendThroughRing: 5_29_60_000,
    exposureBasis: 'Facilities contracts billed by the ring with no independent site verification: 25 site-months x Rs 98,400 = Rs 24,60,000. The wider Rs 5.30 Cr of ring spend is under review, not claimed.',
    firstPoAfterOnboarding: '9 days',
    invoiceSequenceTell: 'VFS invoice numbers to Vaigai run 2201, 2202, 2203 … — this customer is the vendor’s only customer',
  },
  moneyAtRisk: 24_60_000,
  confidence: 0.91,
  explanation: 'Three vendors share bank account HDFC ****4471. Two share a registered address that also matches the HR record of the manager who approved 34 of their purchase orders.',
  recommendedAction: { kind: 'escalate', label: 'Freeze payments, refer to audit committee', detail: 'Suspend the three payee accounts, preserve the approval trail for R. Muthukumar, and commission an independent site verification of the facilities contracts.' },
  scoreContribution: [
    { component: 'Bank account shared across 3 vendors', points: 28 },
    { component: 'Registered address matches an employee', points: 24 },
    { component: 'Approver concentration — 34 POs, one approver', points: 14 },
    { component: 'Sequential invoice numbering (single-customer tell)', points: 11 },
  ],
  status: 'validated',
  detectedAt: '2026-07-29',
}

/* ── 5. Price intelligence ── */
const priceFindings: Finding[] = rateCard.map((r, i) => {
  const s = skuById.get(r.skuId)!
  const delta = (r.invoiced - r.contracted) * r.units
  return {
    id: `F-P${String(i + 1).padStart(2, '0')}`,
    ruleId: 'PRC-005',
    pillar: 'Price & Vendor Intelligence' as Pillar,
    severity: (delta > 2_00_000 ? 'critical' : delta > 60_000 ? 'high' : 'medium') as Severity,
    entities: { invoiceIds: [], vendorId: r.vendorId },
    evidence: { sku: s.canonical, contractedRate: r.contracted, invoicedRate: r.invoiced, units: r.units, overbillPerUnit: r.invoiced - r.contracted, total: delta, peerMedian: s.peerMedian },
    moneyAtRisk: delta,
    confidence: 0.97,
    explanation: `${V(r.vendorId).name} invoiced ${s.canonical} at ${formatINR(r.invoiced)} against a contracted rate of ${formatINR(r.contracted)} — ${formatINR(r.invoiced - r.contracted)} per ${s.unit} across ${r.units} ${s.unit}s.`,
    recommendedAction: { kind: 'recover' as const, label: 'Claim the contract differential', detail: `Raise a debit note for ${formatINR(delta)} citing the rate card, and reprice open POs to the contracted rate.` },
    scoreContribution: [
      { component: 'Invoiced above signed rate card', points: 26 },
      { component: `${(((r.invoiced - r.contracted) / r.contracted) * 100).toFixed(1)}% over contract`, points: 14 },
      { component: 'Repeated across multiple invoices', points: 9 },
    ],
    status: (i < 2 ? 'actioned' : 'open') as FindingStatus,
    detectedAt: '2026-06-14',
  }
})

const creepFinding: Finding = {
  id: 'F-P06',
  ruleId: 'PRC-003',
  pillar: 'Price & Vendor Intelligence',
  severity: 'high',
  entities: { invoiceIds: [], vendorId: priceCreep.vendorId },
  evidence: {
    sku: skuById.get(priceCreep.skuId)!.canonical,
    startRate: priceCreep.series[0].vendor,
    endRate: priceCreep.series[priceCreep.series.length - 1].vendor,
    peerMedianDrift: '+0.7% over 18 months',
    vendorDrift: '+23.9% over 18 months',
    quarterlyStep: '≈3.0% every quarter',
    windowMonths: 18,
    r2: 0.987,
  },
  moneyAtRisk: 95_340,
  confidence: 0.88,
  explanation: 'Trident Infosystems raised the monitor unit price roughly 3% every quarter for six quarters. Each raise is too small to trigger anything. Against a flat peer median, the cumulative gap is 23.9%.',
  recommendedAction: { kind: 'renegotiate', label: 'Reset to peer median at renewal', detail: 'Open renegotiation citing the 18-month regression and the ₹9,180 peer median; the best-price counterfactual puts the annual saving at ₹95,340.' },
  scoreContribution: [
    { component: 'Monotonic price increase over 6 quarters', points: 21 },
    { component: 'Divergence from peer median > 20%', points: 18 },
    { component: 'Regression fit R² = 0.987', points: 7 },
  ],
  status: 'validated',
  detectedAt: '2026-08-02',
}

const benchFindings: Finding[] = Object.entries(priceBook).slice(0, 4).map(([skuId, rows], i) => {
  const s = skuById.get(skuId)!
  const worst = [...rows].sort((a, b) => b.unitPrice - a.unitPrice)[0]
  const delta = (worst.unitPrice - s.peerMedian) * worst.volume
  return {
    id: `F-P${String(i + 7).padStart(2, '0')}`,
    ruleId: 'PRC-001',
    pillar: 'Price & Vendor Intelligence' as Pillar,
    severity: (delta > 1_00_000 ? 'high' : 'medium') as Severity,
    entities: { invoiceIds: [], vendorId: worst.vendorId },
    evidence: { sku: s.canonical, paid: worst.unitPrice, peerMedian: s.peerMedian, volume: worst.volume, abovePct: (worst.unitPrice / s.peerMedian - 1), total: delta, comparedVendors: rows.length },
    moneyAtRisk: delta,
    confidence: 0.92,
    explanation: `${V(worst.vendorId).name} charges ${formatINR(worst.unitPrice)} per ${s.unit} for ${s.canonical}; the peer median across ${rows.length} vendors is ${formatINR(s.peerMedian)}. On ${worst.volume} ${s.unit}s that is ${formatINR(delta)}.`,
    recommendedAction: { kind: 'consolidate' as const, label: 'Move volume to the median vendor', detail: `Shift the ${s.canonical} line to the lowest compliant vendor at renewal; the counterfactual saving is ${formatINR(delta)}.` },
    scoreContribution: [
      { component: 'Unit price above peer median', points: 19 },
      { component: 'SKU resolved from raw description', points: 10 },
      { component: 'Sustained across the full window', points: 8 },
    ],
    status: 'open' as FindingStatus,
    detectedAt: '2026-07-11',
  }
})

/* ── 6. Compliance ── */
const complianceFindings: Finding[] = [
  {
    id: 'F-C01', ruleId: 'CMP-002', pillar: 'Compliance & Process', severity: 'critical',
    entities: { invoiceIds: ['DP-07-A', 'DP-07-B'], vendorId: 'V-002' },
    evidence: { gstin: V('V-002').gstin, invoiceNo: 'ST-4471', financialYear: '2026-27', occurrences: 2, statute: 'Rule 46(b), CGST Rules 2017 — invoice numbers must be unique per GSTIN per financial year' },
    moneyAtRisk: 55_400, confidence: 0.99,
    explanation: 'Invoice number ST-4471 appears twice against one GSTIN inside financial year 2026-27. Under Rule 46(b) that is not unusual — it is impossible.',
    recommendedAction: { kind: 'block-payment', label: 'Reject and demand reissue', detail: 'Return both documents for reissue with compliant numbering and withhold input-tax credit until corrected.' },
    scoreContribution: [{ component: 'Duplicate GST invoice number, same FY, same GSTIN', points: 30 }, { component: 'Both documents paid', points: 12 }],
    status: 'actioned', detectedAt: '2026-05-16',
  },
  {
    id: 'F-C02', ruleId: 'CMP-004', pillar: 'Compliance & Process', severity: 'high',
    entities: { invoiceIds: [], vendorId: 'V-018' },
    evidence: { statute: 'Income Tax Act s.43B(h)', limitDays: 45, breaches: 7, worstDelayDays: 96, exposedAmount: 38_40_000, disallowanceRisk: 'Expenditure disallowed in AY 2026-27 unless paid before filing' },
    moneyAtRisk: 2_18_000, confidence: 0.98,
    explanation: 'Seven payments to MSME-registered vendors cleared beyond the 45-day statutory limit, the worst at 96 days. Under s.43B(h) the expenditure is disallowed for the year unless settled before filing.',
    recommendedAction: { kind: 'escalate', label: 'Clear before the filing date', detail: 'Settle the ₹38.4 L of overdue MSME payables before the return is filed; the tax cost of disallowance at 25% is ₹2.18 lakh.' },
    scoreContribution: [{ component: 'MSME payment beyond 45 days', points: 24 }, { component: '7 separate breaches', points: 11 }, { component: 'Filing deadline inside 60 days', points: 8 }],
    status: 'open', detectedAt: '2026-08-11',
  },
  {
    id: 'F-C03', ruleId: 'CMP-001', pillar: 'Compliance & Process', severity: 'high',
    entities: { invoiceIds: [], vendorId: 'V-014', poIds: ['PO-2130'] },
    evidence: { poQty: 240, grnQty: 208, invoicedQty: 240, unitPrice: 58_200, shortfall: 32, threeWayResult: 'quantity mismatch: invoice matches PO, GRN does not' },
    moneyAtRisk: 1_86_240, confidence: 0.96,
    explanation: 'PO-2130 ordered 240 units, the goods-receipt note records 208, the invoice bills 240. Thirty-two units were paid for and never received.',
    recommendedAction: { kind: 'recover', label: 'Recover the 32-unit shortfall', detail: 'Debit note for ₹1,86,240 against the short delivery, and hold the vendor’s next payment run pending physical verification.' },
    scoreContribution: [{ component: 'Three-way match failure on quantity', points: 25 }, { component: '13.3% short delivery', points: 13 }, { component: 'Invoice paid before GRN reconciliation', points: 9 }],
    status: 'validated', detectedAt: '2026-04-27',
  },
]

/* ── 7. Behavioural: Benford, off-hours, year-end ── */
const behaviouralFindings: Finding[] = [
  {
    id: 'F-B10', ruleId: 'BEH-003', pillar: 'Behavioural Anomalies', severity: 'high',
    entities: { invoiceIds: [], vendorId: 'V-004' },
    evidence: { test: "Benford's Law, leading digit", chiSquare: 41.7, df: 8, pValue: '<0.001', worstDigit: 4, expectedPct: 0.097, observedPct: 0.186, sampleSize: 1_284 },
    moneyAtRisk: 0, confidence: 0.84,
    explanation: 'Leading digit 4 appears in 18.6% of this vendor’s invoice amounts against an expected 9.7%. χ² = 41.7 on 8 degrees of freedom, p < 0.001 — amounts are being chosen, not incurred.',
    recommendedAction: { kind: 'investigate', label: 'Sample-test the ₹4x,xxx cluster', detail: 'Pull 20 invoices beginning with 4 and verify each against a goods-receipt note and a physical site record.' },
    scoreContribution: [{ component: 'Benford deviation p < 0.001', points: 18 }, { component: 'Concentration below approval threshold', points: 15 }],
    status: 'validated', detectedAt: '2026-08-05',
  },
  {
    id: 'F-B11', ruleId: 'BEH-007', pillar: 'Behavioural Anomalies', severity: 'medium',
    entities: { invoiceIds: [], vendorId: 'V-009' },
    evidence: { month: 'March', multipleOfMean: 4.1, monthlyMean: 2_29_02_353, marchSpend: 9_39_00_000, yearsObserved: 2, unusedBudgetHypothesis: true },
    moneyAtRisk: 4_10_000, confidence: 0.79,
    explanation: 'March spend runs 4.1× the monthly mean, in both observed years. Budget that would otherwise lapse is being converted into inventory nobody asked for.',
    recommendedAction: { kind: 'investigate', label: 'Review March requisitions against demand', detail: 'Match March purchase requisitions to consumption over the following quarter; carry-forward the budget instead of dumping it.' },
    scoreContribution: [{ component: 'Year-end spend 4.1× mean', points: 16 }, { component: 'Repeats across both fiscal years', points: 10 }],
    status: 'open', detectedAt: '2026-04-04',
  },
  {
    id: 'F-B12', ruleId: 'BEH-005', pillar: 'Behavioural Anomalies', severity: 'medium',
    entities: { invoiceIds: ['INV-8842'], vendorId: 'V-005' },
    evidence: { offHoursInvoices: 63, corpusShare: 0.011, vendorShare: 0.34, worstSlot: 'Sunday 02:00–03:00', slotCount: 11, exposureBasis: 'Value of the eleven Sunday-night filings only: ₹2,40,000. The vendor\u2019s wider spend is not claimed.' },
    moneyAtRisk: 2_40_000, confidence: 0.72,
    explanation: '34% of this vendor’s invoices are filed between midnight and 4am, eleven of them in the Sunday 02:00 slot. Across the corpus the off-hours share is 1.1%.',
    recommendedAction: { kind: 'investigate', label: 'Verify who is filing and when', detail: 'Pull submission IP and user for the eleven Sunday-night filings and reconcile against the approver’s roster.' },
    scoreContribution: [{ component: 'Off-hours submission rate 31× corpus', points: 14 }, { component: 'Clustered in one slot', points: 9 }],
    status: 'open', detectedAt: '2026-07-19',
  },
]

/* ── 8. Filler, deterministic, so the register reads like a real queue ── */
const rng = makeRng(0x1A7E)
const HANDS = [HERO_FINDING, ...dupFindings, ...splitFindings, ringFinding, ...priceFindings, creepFinding, ...benchFindings, ...complianceFindings, ...behaviouralFindings]
const TARGET = 163
const perPillarTarget: Record<string, number> = Object.fromEntries(pillars.map((p) => [p.pillar, p.findings]))

const EXPLAIN: Record<string, (v: string, m: number) => string> = {
  'Duplicates & Overpayment': (v, m) => `${v}: two invoices within 7 days for the same amount under different numbers, ${formatINR(m)} exposed.`,
  'Price & Vendor Intelligence': (v, m) => `${v} sits above the peer median on a resolved SKU; ${formatINR(m)} of avoidable cost at current volume.`,
  'Behavioural Anomalies': (v, m) => `${v} shows a distribution anomaly against its own 18-month baseline; ${formatINR(m)} of spend in the affected band.`,
  'Vendor Integrity & Collusion': (v, m) => `${v} shares a master-data attribute with another payee; ${formatINR(m)} routed through the shared identity.`,
  'Compliance & Process': (v, m) => `${v}: process control not satisfied on this document set; ${formatINR(m)} of spend affected.`,
}
const ACTIONS: Record<string, { kind: Finding['recommendedAction']['kind']; label: string }> = {
  'Duplicates & Overpayment': { kind: 'recover', label: 'Raise recovery' },
  'Price & Vendor Intelligence': { kind: 'renegotiate', label: 'Renegotiate at renewal' },
  'Behavioural Anomalies': { kind: 'investigate', label: 'Open an investigation' },
  'Vendor Integrity & Collusion': { kind: 'escalate', label: 'Escalate to audit' },
  'Compliance & Process': { kind: 'block-payment', label: 'Hold the payment run' },
}

function filler(): Finding[] {
  const out: Finding[] = []
  const counts: Record<string, number> = {}
  for (const f of HANDS) counts[f.pillar] = (counts[f.pillar] ?? 0) + 1
  let n = 0
  for (const p of pillars) {
    const need = perPillarTarget[p.pillar] - (counts[p.pillar] ?? 0)
    for (let i = 0; i < need; i++) {
      n++
      const v = vendors[intBetween(rng, 0, vendors.length - 1)]
      const det = pick(rng, p.detectors)
      const money = Math.round(between(rng, 4_000, 3_20_000) / 50) * 50
      const conf = Number(between(rng, 0.61, 0.95).toFixed(2))
      const sev: Severity = money > 2_00_000 ? 'high' : money > 80_000 ? 'medium' : 'low'
      const st: FindingStatus = pick(rng, ['open', 'open', 'open', 'validated', 'actioned', 'dismissed'] as FindingStatus[])
      out.push({
        id: `F-X${String(n).padStart(3, '0')}`,
        ruleId: det.id,
        pillar: p.pillar,
        severity: sev,
        entities: { invoiceIds: [], vendorId: v.id },
        evidence: { detector: det.name, vendor: v.name, baselineWindowMonths: 18, deviationSigma: Number(between(rng, 2.1, 5.8).toFixed(2)) },
        moneyAtRisk: money,
        confidence: conf,
        explanation: EXPLAIN[p.pillar](v.name, money),
        recommendedAction: { ...ACTIONS[p.pillar], detail: `${det.name} fired on ${v.name}. Review the underlying documents before acting.` },
        scoreContribution: [
          { component: det.name, points: Math.round(between(rng, 9, 22)) },
          { component: 'Vendor baseline deviation', points: Math.round(between(rng, 4, 12)) },
        ],
        status: st,
        detectedAt: invoices[intBetween(rng, 0, invoices.length - 1)].date,
      })
    }
  }
  return out
}

export const findings: Finding[] = [...HANDS, ...filler()].slice(0, TARGET)
export const findingById = new Map(findings.map((f) => [f.id, f]))

/** The five findings the Command Center leads with, by rupee value. */
export const topFindings = [...findings].sort((a, b) => b.moneyAtRisk - a.moneyAtRisk).slice(0, 5)

export const findingsByPillar = pillars.map((p) => ({
  pillar: p.pillar,
  key: p.key,
  count: findings.filter((f) => f.pillar === p.pillar).length,
  money: findings.filter((f) => f.pillar === p.pillar).reduce((s, f) => s + f.moneyAtRisk, 0),
}))

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low']
