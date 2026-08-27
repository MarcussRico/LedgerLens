import type { GraphNode, GraphEdge } from './types'

/* Precomputed layout — a force simulation was run once offline and the settled
   positions frozen. It renders identically every time and costs nothing at idle.
   Coordinates are in a 1000 × 620 viewBox. */

export const graphNodes: GraphNode[] = [
  // ── the ring ──
  { id: 'bank-4471', kind: 'bank', label: 'HDFC ****4471', sub: 'payee account', x: 498, y: 300, risk: 98, ring: true },
  { id: 'V-001', kind: 'vendor', label: 'Sharma Traders', sub: '₹3.18 Cr · 214 invoices', x: 352, y: 210, risk: 91, ring: true },
  { id: 'V-004', kind: 'vendor', label: 'Vetri Facility Services', sub: '₹1.43 Cr · 88 invoices', x: 646, y: 214, risk: 94, ring: true },
  { id: 'V-005', kind: 'vendor', label: 'Kaveri Sitecare Solutions', sub: '₹68.9 L · 41 invoices', x: 636, y: 400, risk: 96, ring: true },
  { id: 'addr-anna', kind: 'address', label: '17/3 Anna Nagar 4th St', sub: 'Madurai 625020', x: 786, y: 306, risk: 92, ring: true },
  { id: 'emp-muthu', kind: 'employee', label: 'R. Muthukumar', sub: 'Manager, Admin · approver', x: 866, y: 178, risk: 89, ring: true },
  { id: 'V-002', kind: 'vendor', label: 'M/s Sharma Traders Pvt Ltd', sub: 'alias · ₹91.2 L', x: 216, y: 128, risk: 88, ring: true },
  { id: 'V-003', kind: 'vendor', label: 'SHARMA TRADERS PVT LTD', sub: 'alias · ₹44.8 L', x: 196, y: 286, risk: 86, ring: true },

  // ── ordinary neighbourhood ──
  { id: 'V-009', kind: 'vendor', label: 'Cortex Computing', sub: '₹4.86 Cr', x: 132, y: 452, risk: 44 },
  { id: 'V-010', kind: 'vendor', label: 'Trident Infosystems', sub: '₹3.93 Cr', x: 268, y: 512, risk: 71 },
  { id: 'V-011', kind: 'vendor', label: 'Meridian Logistics', sub: '₹2.72 Cr', x: 424, y: 546, risk: 36 },
  { id: 'V-014', kind: 'vendor', label: 'Suriya Metal Works', sub: '₹5.64 Cr', x: 592, y: 546, risk: 41 },
  { id: 'V-012', kind: 'vendor', label: 'Ilango Packaging', sub: '₹1.89 Cr', x: 742, y: 500, risk: 29 },
  { id: 'V-008', kind: 'vendor', label: 'Pallava Stationers', sub: '₹74.6 L', x: 96, y: 196, risk: 18 },
  { id: 'V-007', kind: 'vendor', label: 'Nandhini Office Mart', sub: '₹1.02 Cr', x: 148, y: 68, risk: 22 },
  { id: 'V-017', kind: 'vendor', label: 'Nexa Consulting', sub: '₹1.32 Cr', x: 400, y: 74, risk: 77 },
  { id: 'V-013', kind: 'vendor', label: 'Thangam Electricals', sub: '₹1.24 Cr', x: 880, y: 452, risk: 63 },
  { id: 'bank-9083', kind: 'bank', label: 'ICICI ****9083', sub: 'payee account', x: 316, y: 386, risk: 34 },
  { id: 'bank-2210', kind: 'bank', label: 'AXIS ****2210', sub: 'payee account', x: 700, y: 92, risk: 21 },
  { id: 'emp-anitha', kind: 'employee', label: 'S. Anitha', sub: 'Manager, Facilities', x: 924, y: 292, risk: 31 },
  { id: 'addr-gst', kind: 'address', label: '44 GST Road', sub: 'Chennai 600045', x: 60, y: 330, risk: 12 },
]

export const graphEdges: GraphEdge[] = [
  { a: 'V-001', b: 'bank-4471', kind: 'bank', ring: true },
  { a: 'V-004', b: 'bank-4471', kind: 'bank', ring: true },
  { a: 'V-005', b: 'bank-4471', kind: 'bank', ring: true },
  { a: 'V-004', b: 'addr-anna', kind: 'address', ring: true },
  { a: 'V-005', b: 'addr-anna', kind: 'address', ring: true },
  { a: 'addr-anna', b: 'emp-muthu', kind: 'address', ring: true },
  { a: 'emp-muthu', b: 'V-001', kind: 'payment', ring: true },
  { a: 'V-001', b: 'V-002', kind: 'pan', ring: true },
  { a: 'V-001', b: 'V-003', kind: 'pan', ring: true },
  { a: 'V-002', b: 'bank-4471', kind: 'bank', ring: true },
  { a: 'V-003', b: 'bank-4471', kind: 'bank', ring: true },

  { a: 'V-009', b: 'bank-9083', kind: 'bank' },
  { a: 'V-010', b: 'bank-9083', kind: 'bank' },
  { a: 'V-011', b: 'bank-2210', kind: 'bank' },
  { a: 'V-017', b: 'bank-2210', kind: 'bank' },
  { a: 'V-008', b: 'addr-gst', kind: 'address' },
  { a: 'V-013', b: 'emp-anitha', kind: 'phone' },
  { a: 'V-012', b: 'V-014', kind: 'phone' },
  { a: 'V-007', b: 'V-008', kind: 'pan' },
  { a: 'V-014', b: 'bank-9083', kind: 'bank' },
]

export const RING_IDS = new Set(graphNodes.filter((n) => n.ring).map((n) => n.id))

export const nodeById = new Map(graphNodes.map((n) => [n.id, n]))
