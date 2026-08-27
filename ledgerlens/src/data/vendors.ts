import type { Vendor, Category } from './types'
import { makeRng, intBetween, between } from '../lib/utils'

/* 118 vendors. Deterministically composed from a fixed name pool so the demo is
   byte-identical on every reload, with the forensically-interesting vendors
   hand-authored: the Sharma alias triple, the HDFC ****4471 ring, and the
   phantom firm with sequential invoice numbering. */

const STATE = '33' // Tamil Nadu — Vaigai Industries is Madurai-registered
const PAN_L = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

function gstin(rng: () => number, pan: string): string {
  return `${STATE}${pan}${intBetween(rng, 1, 9)}Z${PAN_L[intBetween(rng, 0, 24)]}`
}
function pan(rng: () => number, tag: string): string {
  const four = tag.toUpperCase().replace(/[^A-Z]/g, '').padEnd(3, 'K').slice(0, 3)
  return `A${four}${PAN_L[intBetween(rng, 0, 24)]}${intBetween(rng, 1000, 9999)}${PAN_L[intBetween(rng, 0, 24)]}`
}

const FIRST = ['Sharma','Venkat','Iyer','Rajan','Balaji','Krishnan','Meenakshi','Ganesh','Anand','Subbu',
  'Nithya','Pandian','Chidambaram','Murugan','Selvam','Kannan','Devi','Ramesh','Kalyani','Arunachalam',
  'Thangam','Vetri','Sundar','Palani','Nataraj','Ilango','Mahesh','Bhaskar','Yamuna','Karthik'] as const
const SUFFIX = ['Traders','Enterprises','Industries','& Sons','Agencies','Supplies','Systems','Works',
  'Corporation','Distributors','Associates','Technologies','Marketing','Solutions','Packaging','Engineering'] as const
const CITIES = ['Madurai','Coimbatore','Chennai','Tiruppur','Salem','Trichy','Erode','Hosur','Sivakasi','Karur'] as const
const CATS: Category[] = ['IT Hardware','Office Supplies','Facilities & Maintenance','Logistics',
  'Raw Materials','Professional Services','Packaging','Electricals']

interface Seed {
  id: string; name: string; canonicalId?: string; cat: Category; bankKey?: string
  addr?: string; city?: string; risk?: number; spend?: number; inv?: number
  onboardedAt?: string; msme?: boolean; priceIndex?: number
}

/* Hand-authored: every vendor the narrative names must be reachable from the UI. */
const SEEDS: Seed[] = [
  { id: 'V-001', name: 'Sharma Traders', canonicalId: 'C-SHARMA', cat: 'Office Supplies',
    bankKey: 'HDFC-4471', city: 'Madurai', risk: 91, spend: 3_18_40_000, inv: 214, priceIndex: 134,
    onboardedAt: '2023-11-02', msme: true },
  { id: 'V-002', name: 'M/s Sharma Traders Pvt Ltd', canonicalId: 'C-SHARMA', cat: 'Office Supplies',
    bankKey: 'HDFC-4471', city: 'Madurai', risk: 88, spend: 91_20_000, inv: 63, priceIndex: 131,
    onboardedAt: '2024-01-17', msme: true },
  { id: 'V-003', name: 'SHARMA TRADERS PVT LTD', canonicalId: 'C-SHARMA', cat: 'Office Supplies',
    bankKey: 'HDFC-4471', city: 'Madurai', risk: 86, spend: 44_80_000, inv: 31, priceIndex: 129,
    onboardedAt: '2024-06-04', msme: true },
  { id: 'V-004', name: 'Vetri Facility Services', canonicalId: 'C-VETRI', cat: 'Facilities & Maintenance',
    bankKey: 'HDFC-4471', city: 'Madurai', risk: 94, spend: 1_42_60_000, inv: 88,
    addr: '17/3 Anna Nagar 4th Street', onboardedAt: '2024-02-09', priceIndex: 118 },
  { id: 'V-005', name: 'Kaveri Sitecare Solutions', canonicalId: 'C-KAVERI', cat: 'Facilities & Maintenance',
    bankKey: 'HDFC-4471', city: 'Madurai', risk: 96, spend: 68_90_000, inv: 41,
    addr: '17/3 Anna Nagar 4th Street', onboardedAt: '2024-08-21', priceIndex: 122 },
  { id: 'V-006', name: 'Aruna Infratech', canonicalId: 'C-ARUNA', cat: 'Facilities & Maintenance',
    bankKey: 'ICICI-9083', city: 'Madurai', risk: 84, spend: 39_40_000, inv: 27,
    onboardedAt: '2024-09-30', priceIndex: 112 },
  { id: 'V-007', name: 'Nandhini Office Mart', canonicalId: 'C-NANDHINI', cat: 'Office Supplies',
    city: 'Coimbatore', risk: 22, spend: 1_02_30_000, inv: 141, priceIndex: 97 },
  { id: 'V-008', name: 'Pallava Stationers', canonicalId: 'C-PALLAVA', cat: 'Office Supplies',
    city: 'Chennai', risk: 18, spend: 74_60_000, inv: 118, priceIndex: 92 },
  { id: 'V-009', name: 'Cortex Computing Systems', canonicalId: 'C-CORTEX', cat: 'IT Hardware',
    city: 'Chennai', risk: 44, spend: 4_86_20_000, inv: 96, priceIndex: 108 },
  { id: 'V-010', name: 'Trident Infosystems', canonicalId: 'C-TRIDENT', cat: 'IT Hardware',
    city: 'Coimbatore', risk: 71, spend: 3_92_70_000, inv: 74, priceIndex: 126 },
  { id: 'V-011', name: 'Meridian Logistics Pvt Ltd', canonicalId: 'C-MERIDIAN', cat: 'Logistics',
    city: 'Tiruppur', risk: 36, spend: 2_71_50_000, inv: 203, priceIndex: 101 },
  { id: 'V-012', name: 'Ilango Packaging Works', canonicalId: 'C-ILANGO', cat: 'Packaging',
    city: 'Sivakasi', risk: 29, spend: 1_88_90_000, inv: 167, priceIndex: 95 },
  { id: 'V-013', name: 'Thangam Electricals', canonicalId: 'C-THANGAM', cat: 'Electricals',
    city: 'Madurai', risk: 63, spend: 1_24_10_000, inv: 92, priceIndex: 119 },
  { id: 'V-014', name: 'Suriya Metal Works', canonicalId: 'C-SURIYA', cat: 'Raw Materials',
    city: 'Salem', risk: 41, spend: 5_63_80_000, inv: 148, priceIndex: 103 },
  { id: 'V-015', name: 'Kalyani Steel Traders', canonicalId: 'C-KALYANI', cat: 'Raw Materials',
    city: 'Trichy', risk: 55, spend: 4_18_30_000, inv: 131, priceIndex: 111 },
  { id: 'V-016', name: 'Bharathi Advisory LLP', canonicalId: 'C-BHARATHI', cat: 'Professional Services',
    city: 'Chennai', risk: 48, spend: 96_40_000, inv: 34, priceIndex: 106 },
  { id: 'V-017', name: 'Nexa Consulting Partners', canonicalId: 'C-NEXA', cat: 'Professional Services',
    city: 'Chennai', risk: 77, spend: 1_31_70_000, inv: 29, priceIndex: 141,
    onboardedAt: '2024-10-11' },
  { id: 'V-018', name: 'Ponvandu Transport Co', canonicalId: 'C-PONVANDU', cat: 'Logistics',
    city: 'Madurai', risk: 33, spend: 1_46_20_000, inv: 189, priceIndex: 99, msme: true },
  { id: 'V-019', name: 'Anaimalai Rubber & Poly', canonicalId: 'C-ANAIMALAI', cat: 'Packaging',
    city: 'Erode', risk: 26, spend: 88_70_000, inv: 104, priceIndex: 94, msme: true },
  { id: 'V-020', name: 'Velan Powergrid Supplies', canonicalId: 'C-VELAN', cat: 'Electricals',
    city: 'Hosur', risk: 58, spend: 1_79_30_000, inv: 87, priceIndex: 114 },
]

function buildGenerated(): Vendor[] {
  const rng = makeRng(0x1EDC1E)
  const out: Vendor[] = []
  for (let i = SEEDS.length; i < 118; i++) {
    const id = `V-${String(i + 1).padStart(3, '0')}`
    const nm = `${FIRST[i % FIRST.length]} ${SUFFIX[(i * 5 + 3) % SUFFIX.length]}`
    const cat = CATS[(i * 3) % CATS.length]
    const risk = Math.round(between(rng, 8, 68))
    out.push(mk({
      id, name: nm, canonicalId: `C-G${i}`, cat, risk,
      city: CITIES[i % CITIES.length],
      spend: Math.round(between(rng, 6, 210)) * 1_00_000,
      inv: intBetween(rng, 6, 92),
      priceIndex: Math.round(between(rng, 86, 118)),
      msme: rng() > 0.62,
    }, rng))
  }
  return out
}

function mk(s: Seed, rng: () => number): Vendor {
  const p = pan(rng, s.name)
  const bankKey = s.bankKey ?? `${['HDFC','ICICI','AXIS','SBIN','KVBL','IOBA'][intBetween(rng, 0, 5)]}-${intBetween(rng, 1000, 9999)}`
  const priceIndex = s.priceIndex ?? Math.round(between(rng, 88, 116))
  return {
    id: s.id,
    name: s.name,
    canonicalId: s.canonicalId ?? s.id,
    gstin: gstin(rng, p),
    pan: p,
    bankMasked: `${bankKey.split('-')[0]} ****${bankKey.split('-')[1]}`,
    bankKey,
    address: s.addr ?? `${intBetween(rng, 2, 188)}/${intBetween(rng, 1, 9)} ${['Bypass Road','GST Road','Mill Street','Industrial Estate','Kamarajar Salai','South Gate'][intBetween(rng, 0, 5)]}`,
    city: s.city ?? CITIES[intBetween(rng, 0, CITIES.length - 1)],
    phone: `+91 ${intBetween(rng, 70, 99)}${intBetween(rng, 100, 999)} ${intBetween(rng, 10000, 99999)}`,
    emailDomain: s.name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) + '.co.in',
    onboardedAt: s.onboardedAt ?? `202${intBetween(rng, 0, 3)}-${String(intBetween(rng, 1, 12)).padStart(2, '0')}-${String(intBetween(rng, 1, 28)).padStart(2, '0')}`,
    category: s.cat,
    scorecard: {
      priceIndex,
      onTimePct: Math.round(between(rng, 58, 99)),
      defectPct: Number(between(rng, 0.1, 6.4).toFixed(1)),
      disputeRate: Number(between(rng, 0, 9).toFixed(1)),
    },
    riskScore: s.risk ?? Math.round(between(rng, 10, 60)),
    spend: s.spend ?? Math.round(between(rng, 5, 180)) * 1_00_000,
    invoiceCount: s.inv ?? intBetween(rng, 5, 90),
    msmeRegistered: s.msme ?? false,
  }
}

const seedRng = makeRng(0xC0FFEE)
export const vendors: Vendor[] = [...SEEDS.map((s) => mk(s, seedRng)), ...buildGenerated()]

export const vendorById = new Map(vendors.map((v) => [v.id, v]))
export const vendorName = (id: string) => vendorById.get(id)?.name ?? id

/** Entity resolution: aliases collapsed to one commercial counterparty. */
export const resolvedEntities = (() => {
  const m = new Map<string, Vendor[]>()
  for (const v of vendors) {
    const list = m.get(v.canonicalId) ?? []
    list.push(v)
    m.set(v.canonicalId, list)
  }
  return m
})()

export const aliasGroups = [...resolvedEntities.values()].filter((g) => g.length > 1)
