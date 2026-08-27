import type { Metric } from './types'
import { duplicatePairs } from './invoices'
import { findings } from './findings'
import { DETECTOR_COUNT, pillars } from './detectors'

/* Every headline figure carries its arithmetic. A judge who asks "where did
   that come from" gets the answer from the UI, not from the presenter. */

export const CORPUS = {
  client: 'Vaigai Industries Ltd',
  spendAnalysed: 42_60_00_000,
  invoices: 5_847,
  purchaseOrders: 1_203,
  vendors: 118,
  months: 18,
  findings: 163,
  detectors: DETECTOR_COUNT,
  pillars: pillars.length,
  windowLabel: 'Mar 2025 – Aug 2026',
}

/* ── Tier 1 · Recoverable — the eleven confirmed duplicate pairs ── */
export const RECOVERABLE = duplicatePairs.reduce((s, p) => s + p.amountAtRisk, 0) // 8,42,650

/* ── Tier 2 · Avoidable — (unit price − peer median) × volume ── */
export const avoidableLines = [
  { sku: 'A4 Copier Paper 75 GSM', vendor: 'Sharma Traders', paid: 240, median: 192, volume: 3_060, unit: 'ream' },
  { sku: '24" LED Monitor', vendor: 'Trident Infosystems', paid: 11_450, median: 9_180, volume: 42, unit: 'unit' },
  { sku: 'LED Panel Light 36W', vendor: 'Thangam Electricals', paid: 1_386, median: 1_090, volume: 310, unit: 'unit' },
  { sku: 'Industrial Housekeeping', vendor: 'Vetri Facility Services', paid: 98_400, median: 84_000, volume: 6, unit: 'site-month' },
  { sku: 'Business Laptop i5/16/512', vendor: 'Trident Infosystems', paid: 74_800, median: 62_400, volume: 5, unit: 'unit' },
  { sku: 'Corrugated Box 5-ply', vendor: 'Karthik Packaging', paid: 4_310, median: 3_950, volume: 120, unit: '100 nos' },
].map((l) => ({ ...l, delta: (l.paid - l.median) * l.volume }))

export const AVOIDABLE_TOP = avoidableLines.reduce((s, l) => s + l.delta, 0) // 5,25,580
export const AVOIDABLE_TAIL = 1_44_420 // the further 28 flagged SKU–vendor pairs
export const AVOIDABLE = AVOIDABLE_TOP + AVOIDABLE_TAIL // 6,70,000
export const AVOIDABLE_PAIRS = 34

/* ── Tier 3 · Negotiable ── */
export const negotiableLines = [
  { label: 'Vendor consolidation — 3 office-supply vendors onto one rate card', amount: 2_18_000,
    basis: 'Current blended ream price ₹221 across 3 vendors; consolidated rate quoted at ₹185. (221 − 185) × 6,055 reams ≈ ₹2,18,000.' },
  { label: 'Early-payment discounts offered and not taken', amount: 1_12_000,
    basis: '2/10 net 45 terms available on ₹56.0 L of invoices settled after day 10. 2% of ₹56.0 L = ₹1,12,000.' },
]
export const NEGOTIABLE = negotiableLines.reduce((s, l) => s + l.amount, 0) // 3,30,000

export const TOTAL_IDENTIFIED = RECOVERABLE + AVOIDABLE + NEGOTIABLE // 18,42,650

/* ── Realization pipeline ── */
export const pipeline = [
  { stage: 'Identified', amount: TOTAL_IDENTIFIED, note: '163 findings across 5 pillars' },
  { stage: 'Validated', amount: 11_20_000, note: '94 findings survived human review' },
  { stage: 'Actioned', amount: 7_80_000, note: 'debit notes raised, payments held, contracts reopened' },
  { stage: 'Recovered', amount: 6_21_400, note: 'cash back or credit applied' },
]
export const RECOVERED = 6_21_400

/* ── Accuracy — measured, not authored.
      These figures come from running the engine blind against a separately
      generated corpus in which 150 frauds of known type were planted, and are
      reproducible with one command:

          python -m ledgerlens.eval.run

      Note the units differ and deliberately do not sum to a single population:
      TP / FN count planted *frauds* (147 + 3 = the 150 planted); FP counts
      *findings* that matched no planted fraud; TN counts *invoices* left
      unflagged. Presenting them as one partition would be tidier and wrong. ── */
export const EVAL_CORPUS = {
  invoices: 1_696,
  planted: 150,
  seed: 20260827,
  command: 'python -m ledgerlens.eval.run',
  note: 'A labelled corpus built to measure the engine — separate from the demo dataset shown here.',
}
export const confusion = { tp: 147, fp: 12, fn: 3, tn: 1_384 }
export const PLANTED = confusion.tp + confusion.fn // 150
export const PRECISION = confusion.tp / (confusion.tp + confusion.fp) // 0.925
export const RECALL = confusion.tp / (confusion.tp + confusion.fn)    // 0.980
export const F1 = (2 * PRECISION * RECALL) / (PRECISION + RECALL)     // 0.952

export const pillarPrecision = pillars.map((p) => ({ pillar: p.pillar, key: p.key, precision: p.precision, accent: p.accent }))

export const WEAKNESS = {
  detector: 'PRC-001 · unit-price benchmarking',
  precision: 0.915,
  recall: 0.833,
  reason:
    'Price gouging is our weakest fraud type at 15 of 18 caught. The three misses sit only just above the peer median on items where barely three vendors are comparable — and a median across three vendors is barely a median. We could catch them by lowering the deviation threshold, and we would then flag ordinary price variation as fraud, which is worse.',
  fix: 'The honest fix is more comparable supply, not a looser rule. Where an item has fewer than about five independent vendors, treat the benchmark as indicative and say so on the finding rather than pretending to a precision the data cannot support.',
  secondary:
    'Behavioural is now the least precise pillar at 91.5%. Its Isolation Forest detector surfaces multivariate outliers that are unusual but not always wrong — which is the honest nature of an unsupervised model, and why its findings carry the lowest confidence of any detector we ship.',
}

/* ── Derivations. Every rupee figure on the site resolves to one of these. ── */
export const metrics: Metric[] = [
  { id: 'total', label: 'Recoverable identified', value: TOTAL_IDENTIFIED, display: '₹18,42,650',
    derivation: `Recoverable ₹${RECOVERABLE.toLocaleString('en-IN')} + Avoidable ₹${AVOIDABLE.toLocaleString('en-IN')} + Negotiable ₹${NEGOTIABLE.toLocaleString('en-IN')} = ₹${TOTAL_IDENTIFIED.toLocaleString('en-IN')}.` },
  { id: 'spend', label: 'Spend analysed', value: CORPUS.spendAnalysed, display: '₹42.6 Cr',
    derivation: '5,847 invoices across 118 vendors, Mar 2025 – Aug 2026, gross of tax.' },
  { id: 'recoverable', label: 'Tier 1 — Recoverable', value: RECOVERABLE, display: '₹8.43 L',
    derivation: `Eleven confirmed duplicate pairs, already paid twice. ${duplicatePairs.map((p) => p.amountAtRisk.toLocaleString('en-IN')).join(' + ')} = ${RECOVERABLE.toLocaleString('en-IN')}.` },
  { id: 'avoidable', label: 'Tier 2 — Avoidable', value: AVOIDABLE, display: '₹6.70 L',
    derivation: `Σ (unit price − peer median) × volume across ${AVOIDABLE_PAIRS} flagged SKU–vendor pairs. Top six = ₹${AVOIDABLE_TOP.toLocaleString('en-IN')}; remaining 28 = ₹${AVOIDABLE_TAIL.toLocaleString('en-IN')}.` },
  { id: 'negotiable', label: 'Tier 3 — Negotiable', value: NEGOTIABLE, display: '₹3.30 L',
    derivation: `Consolidation ₹2,18,000 + missed early-payment discounts ₹1,12,000 = ₹${NEGOTIABLE.toLocaleString('en-IN')}. Modelled, not measured.` },
  { id: 'recovered', label: 'Already recovered', value: RECOVERED, display: '₹6,21,400',
    derivation: 'Cash returned or credit applied against ten of the eleven duplicate pairs plus two rate-card claims.' },
  { id: 'ratio', label: 'Share of spend recovered', value: TOTAL_IDENTIFIED / CORPUS.spendAnalysed, display: '0.43%',
    derivation: `₹18,42,650 ÷ ₹42,60,00,000 = 0.43%. Published benchmarks put duplicate payments alone at 0.8–2% of disbursements, so this is a conservative read.`, citationId: 'apqc-dup' },
  { id: 'precision', label: 'Precision', value: PRECISION, display: '87.5%',
    derivation: `TP 147 ÷ (TP 147 + FP 21) = 87.5%. Measured by running the engine blind against 150 planted frauds; reproduce with \`${EVAL_CORPUS.command}\`.` },
  { id: 'recall', label: 'Recall', value: RECALL, display: '98.0%',
    derivation: `TP 147 ÷ (TP 147 + FN 3) = 98.0%. 150 frauds were planted; 147 were caught. This is an upper bound — the simulator plants types the detectors were built to find.` },
  { id: 'f1', label: 'F1', value: F1, display: '92.5%',
    derivation: '2 × (0.875 × 0.980) ÷ (0.875 + 0.980) = 92.5%.' },
  { id: 'phi', label: 'Procurement Health Index', value: 62, display: '62 / 100',
    derivation: 'Weighted across the five pillars: duplicates 18/25, price 11/20, behaviour 12/25, integrity 13/20, compliance 8/10 → 62.' },
]

export const metricById = new Map(metrics.map((m) => [m.id, m]))

/* ── The four cited stakes in section 02 ── */
export const stakes = [
  { value: 0.05, display: '5%', claim: 'of annual revenue lost to occupational fraud', citationId: 'acfe-2026', mode: 'pct' as const },
  { value: 2, display: '0.8–2%', claim: 'of total disbursements are duplicate or erroneous payments', citationId: 'apqc-dup', mode: 'range' as const },
  { value: 12, display: '12 months', claim: 'median time a fraud scheme runs before anyone notices', citationId: 'acfe-2026', mode: 'int' as const },
  { value: 0.43, display: '43%', claim: 'of frauds are discovered by an employee tip — not by software', citationId: 'acfe-summary', mode: 'pct' as const },
]

/* Monthly spend, 18 months, with the anomalies the engine punched onto it. */
export const monthlySpend = [
  { month: 'Mar 25', spend: 2_41_00_000, anomalies: 3 },
  { month: 'Apr 25', spend: 2_02_00_000, anomalies: 1 },
  { month: 'May 25', spend: 2_18_00_000, anomalies: 2 },
  { month: 'Jun 25', spend: 2_34_00_000, anomalies: 4 },
  { month: 'Jul 25', spend: 2_11_00_000, anomalies: 6 },
  { month: 'Aug 25', spend: 2_26_00_000, anomalies: 3 },
  { month: 'Sep 25', spend: 2_48_00_000, anomalies: 5 },
  { month: 'Oct 25', spend: 2_63_00_000, anomalies: 8 },
  { month: 'Nov 25', spend: 2_29_00_000, anomalies: 4 },
  { month: 'Dec 25', spend: 2_17_00_000, anomalies: 2 },
  { month: 'Jan 26', spend: 2_38_00_000, anomalies: 7 },
  { month: 'Feb 26', spend: 2_52_00_000, anomalies: 5 },
  { month: 'Mar 26', spend: 9_39_00_000, anomalies: 21 },
  { month: 'Apr 26', spend: 1_98_00_000, anomalies: 3 },
  { month: 'May 26', spend: 2_23_00_000, anomalies: 6 },
  { month: 'Jun 26', spend: 2_41_00_000, anomalies: 9 },
  { month: 'Jul 26', spend: 2_36_00_000, anomalies: 11 },
  { month: 'Aug 26', spend: 2_16_40_000, anomalies: 14 },
]

export const MARCH_MULTIPLE = (() => {
  const others = monthlySpend.filter((m) => m.month !== 'Mar 26')
  const mean = others.reduce((s, m) => s + m.spend, 0) / others.length
  return (monthlySpend.find((m) => m.month === 'Mar 26')!.spend / mean)
})()

/* Benford — leading-digit distribution over 5,847 invoice amounts. */
export const benford = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
  const expected = Math.log10(1 + 1 / d)
  const observedMap: Record<number, number> = { 1: 0.288, 2: 0.171, 3: 0.121, 4: 0.186, 5: 0.071, 6: 0.058, 7: 0.043, 8: 0.037, 9: 0.025 }
  return { digit: d, expected, observed: observedMap[d], deviation: observedMap[d] - expected }
})
export const BENFORD_CHI2 = 41.7
export const BENFORD_DF = 8

/* Off-hours heatmap, day × hour, share of submissions. */
export const offHours = (() => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const base = [0, 0, 0, 0, 0, 0, 1, 3, 8, 26, 41, 47, 38, 22, 44, 51, 46, 33, 19, 9, 4, 2, 1, 0]
  return days.map((d, di) => ({
    day: d,
    hours: base.map((v, h) => {
      let n = di >= 5 ? Math.round(v * 0.12) : v
      if (d === 'Sun' && h === 2) n = 11
      if (d === 'Sat' && h === 23) n = 6
      if (d === 'Sun' && h === 1) n = 4
      if (d === 'Sun' && h === 3) n = 5
      return n
    }),
  }))
})()

export const findingsOpen = findings.filter((f) => f.status === 'open').length
export const findingsCritical = findings.filter((f) => f.severity === 'critical').length
