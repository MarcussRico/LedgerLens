import type { Sku } from './types'

/* The normalised catalogue. `variants` are the raw strings that appear on real
   documents — the reason a naive price comparison across departments is invalid.
   Resolution is a precondition, not a feature. */
export const skus: Sku[] = [
  { id: 'SKU-1001', canonical: 'A4 Copier Paper 75 GSM · 500 sheets', unit: 'ream', hsn: '4802', category: 'Office Supplies', peerMedian: 192,
    variants: ['A4 PAPER 75GSM RM', 'Copier paper A-4 (75 gsm) 500sh', 'Paper, A4, white, 75gsm', 'A4 SHEET REAM 75', 'XEROX PAPER A4'] },
  { id: 'SKU-1002', canonical: 'Ballpoint Pen · Blue · 0.7mm', unit: 'box of 50', hsn: '9608', category: 'Office Supplies', peerMedian: 268,
    variants: ['PEN BALL BLUE 0.7', 'Blue ball pen box(50)', 'B/P PEN BLU'] },
  { id: 'SKU-2001', canonical: 'Business Laptop · i5 / 16GB / 512GB SSD', unit: 'unit', hsn: '8471', category: 'IT Hardware', peerMedian: 62_400,
    variants: ['LAPTOP i5 16GB 512 SSD', 'Notebook computer intel i5 gen13', 'Laptop - Corporate spec (i5/16/512)', 'LTP-I5-16-512'] },
  { id: 'SKU-2002', canonical: '24" LED Monitor · 1920×1080 · IPS', unit: 'unit', hsn: '8528', category: 'IT Hardware', peerMedian: 9_180,
    variants: ['MONITOR 24 FHD IPS', '24 inch LED display 1080p', 'Screen 24" IPS FHD'] },
  { id: 'SKU-2003', canonical: 'Managed Gigabit Switch · 24-port', unit: 'unit', hsn: '8517', category: 'IT Hardware', peerMedian: 27_600,
    variants: ['SWITCH 24P GIG MANAGED', 'Network switch 24 port gigabit', '24-PORT L2 SWITCH'] },
  { id: 'SKU-3001', canonical: 'Industrial Housekeeping · per site-month', unit: 'site-month', hsn: '9985', category: 'Facilities & Maintenance', peerMedian: 84_000,
    variants: ['SITE MAINTENANCE MONTHLY', 'Housekeeping services - plant', 'Facility upkeep (monthly)', 'SITE MAINT'] },
  { id: 'SKU-3002', canonical: 'HVAC Preventive Maintenance Visit', unit: 'visit', hsn: '9987', category: 'Facilities & Maintenance', peerMedian: 14_500,
    variants: ['AC PM VISIT', 'HVAC preventive maint. call', 'Aircon servicing visit'] },
  { id: 'SKU-4001', canonical: 'Corrugated Box · 5-ply · 400×300×250mm', unit: '100 nos', hsn: '4819', category: 'Packaging', peerMedian: 3_950,
    variants: ['CORRUGATED BOX 5PLY 400X300X250', '5 ply carton 40x30x25 cm', 'BOX 5-PLY LARGE'] },
  { id: 'SKU-4002', canonical: 'Stretch Wrap Film · 23 micron', unit: 'roll', hsn: '3920', category: 'Packaging', peerMedian: 1_240,
    variants: ['STRETCH FILM 23MIC', 'Pallet wrap 23 micron roll', 'LLDPE wrap film'] },
  { id: 'SKU-5001', canonical: 'MS Angle 50×50×6mm', unit: 'MT', hsn: '7216', category: 'Raw Materials', peerMedian: 58_200,
    variants: ['MS ANGLE 50X50X6', 'Mild steel angle 50mm 6mm', 'ANGLE-MS-50'] },
  { id: 'SKU-5002', canonical: 'HR Coil · 2.5mm', unit: 'MT', hsn: '7208', category: 'Raw Materials', peerMedian: 54_800,
    variants: ['HR COIL 2.5MM', 'Hot rolled coil 2.5', 'HRC-2.5'] },
  { id: 'SKU-6001', canonical: 'LED Panel Light 36W · 2×2', unit: 'unit', hsn: '9405', category: 'Electricals', peerMedian: 1_090,
    variants: ['LED PANEL 36W 2X2', 'Panel light LED 36 watt', 'LIGHT-LED-36'] },
  { id: 'SKU-6002', canonical: 'Copper Cable 4 sq mm · FRLS', unit: '100 m', hsn: '8544', category: 'Electricals', peerMedian: 7_320,
    variants: ['CABLE CU 4SQMM FRLS', 'Copper wire 4 sq.mm FRLS 100mtr', 'CU-CBL-4'] },
  { id: 'SKU-7001', canonical: 'Full Truck Load · Madurai → Chennai', unit: 'trip', hsn: '9965', category: 'Logistics', peerMedian: 21_400,
    variants: ['FTL MDU-MAA', 'Truck full load Madurai to Chennai', 'TRANSPORT MDU>CHN'] },
  { id: 'SKU-8001', canonical: 'Statutory Compliance Retainer', unit: 'month', hsn: '9982', category: 'Professional Services', peerMedian: 1_45_000,
    variants: ['COMPLIANCE RETAINER MONTHLY', 'Professional retainer - compliance', 'ADVISORY RETAINER'] },
]

export const skuById = new Map(skus.map((s) => [s.id, s]))

/** Reverse index: every raw variant string → canonical SKU id. */
export const variantIndex = (() => {
  const m = new Map<string, string>()
  for (const s of skus) for (const v of s.variants) m.set(v.toLowerCase(), s.id)
  return m
})()

export const normaliseDescription = (raw: string): string | undefined => variantIndex.get(raw.toLowerCase())

/** Unit prices actually invoiced per vendor for the SKUs the demo interrogates. */
export const priceBook: Record<string, { vendorId: string; unitPrice: number; volume: number }[]> = {
  'SKU-1001': [
    { vendorId: 'V-008', unitPrice: 178, volume: 2_140 },
    { vendorId: 'V-007', unitPrice: 186, volume: 1_820 },
    { vendorId: 'V-021', unitPrice: 192, volume: 640 },
    { vendorId: 'V-003', unitPrice: 226, volume: 410 },
    { vendorId: 'V-001', unitPrice: 240, volume: 3_060 },
  ],
  'SKU-2001': [
    { vendorId: 'V-009', unitPrice: 58_900, volume: 84 },
    { vendorId: 'V-026', unitPrice: 61_200, volume: 22 },
    { vendorId: 'V-010', unitPrice: 74_800, volume: 5 },
  ],
  'SKU-2002': [
    { vendorId: 'V-009', unitPrice: 8_640, volume: 190 },
    { vendorId: 'V-026', unitPrice: 9_180, volume: 61 },
    { vendorId: 'V-010', unitPrice: 11_450, volume: 42 },
  ],
  'SKU-3001': [
    { vendorId: 'V-006', unitPrice: 79_500, volume: 18 },
    { vendorId: 'V-030', unitPrice: 84_000, volume: 12 },
    { vendorId: 'V-004', unitPrice: 98_400, volume: 6 },
    { vendorId: 'V-005', unitPrice: 1_04_200, volume: 21 },
  ],
  'SKU-4001': [
    { vendorId: 'V-019', unitPrice: 3_720, volume: 880 },
    { vendorId: 'V-012', unitPrice: 3_950, volume: 1_240 },
    { vendorId: 'V-034', unitPrice: 4_310, volume: 120 },
  ],
  'SKU-6001': [
    { vendorId: 'V-041', unitPrice: 1_020, volume: 1_400 },
    { vendorId: 'V-020', unitPrice: 1_090, volume: 2_100 },
    { vendorId: 'V-013', unitPrice: 1_386, volume: 310 },
  ],
}

/** 18 months of unit price for the price-creep case (Trident vs peer median). */
export const priceCreep = {
  skuId: 'SKU-2002',
  vendorId: 'V-010',
  series: [
    { month: 'Mar 25', vendor: 9_240, peer: 9_120 },
    { month: 'Apr 25', vendor: 9_240, peer: 9_100 },
    { month: 'May 25', vendor: 9_520, peer: 9_140 },
    { month: 'Jun 25', vendor: 9_520, peer: 9_060 },
    { month: 'Jul 25', vendor: 9_810, peer: 9_080 },
    { month: 'Aug 25', vendor: 9_810, peer: 9_150 },
    { month: 'Sep 25', vendor: 10_100, peer: 9_120 },
    { month: 'Oct 25', vendor: 10_100, peer: 9_040 },
    { month: 'Nov 25', vendor: 10_410, peer: 9_090 },
    { month: 'Dec 25', vendor: 10_410, peer: 9_180 },
    { month: 'Jan 26', vendor: 10_720, peer: 9_160 },
    { month: 'Feb 26', vendor: 10_720, peer: 9_110 },
    { month: 'Mar 26', vendor: 11_040, peer: 9_130 },
    { month: 'Apr 26', vendor: 11_040, peer: 9_070 },
    { month: 'May 26', vendor: 11_370, peer: 9_120 },
    { month: 'Jun 26', vendor: 11_370, peer: 9_190 },
    { month: 'Jul 26', vendor: 11_450, peer: 9_150 },
    { month: 'Aug 26', vendor: 11_450, peer: 9_180 },
  ],
}

/** Contract rate card vs what was actually invoiced. */
export const rateCard = [
  { skuId: 'SKU-2002', vendorId: 'V-010', contracted: 9_400, invoiced: 11_450, units: 42 },
  { skuId: 'SKU-3001', vendorId: 'V-004', contracted: 86_000, invoiced: 98_400, units: 6 },
  { skuId: 'SKU-1001', vendorId: 'V-001', contracted: 205, invoiced: 240, units: 3_060 },
  { skuId: 'SKU-6001', vendorId: 'V-013', contracted: 1_150, invoiced: 1_386, units: 310 },
  { skuId: 'SKU-2001', vendorId: 'V-010', contracted: 68_000, invoiced: 74_800, units: 5 },
]
