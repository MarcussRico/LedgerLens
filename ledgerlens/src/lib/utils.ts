import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* ── Deterministic PRNG (mulberry32). No Math.random anywhere in this app:
      a rehearsed demo must never be surprised by its own background. ── */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const pick = <T,>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]
export const between = (rng: () => number, lo: number, hi: number) => lo + rng() * (hi - lo)
export const intBetween = (rng: () => number, lo: number, hi: number) => Math.floor(between(rng, lo, hi + 1))

/* ── Indian number formatting ──
   18432650 → "₹1.84 Cr" · 1832500 → "₹18.33 L" · 48000 → "₹48,000"      */
export function formatINR(n: number, style: 'full' | 'compact' = 'full'): string {
  const neg = n < 0
  const v = Math.abs(n)
  let out: string
  if (style === 'compact') {
    if (v >= 1_00_00_000) out = `₹${(v / 1_00_00_000).toFixed(2)} Cr`
    else if (v >= 1_00_000) out = `₹${(v / 1_00_000).toFixed(2)} L`
    else if (v >= 1_000) out = `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(v))}`
    else out = `₹${Math.round(v)}`
  } else {
    out = `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(v))}`
  }
  return neg ? `−${out}` : out
}

/** Digit-group an integer in the Indian system without the ₹ sign. */
export const groupIN = (n: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n))

export const pct = (n: number, dp = 1) => `${(n * 100).toFixed(dp)}%`

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const
/** '2025-03-12' → '12 Mar 2025' (or '12 Mar' when short). */
export function fmtDate(iso: string, short = false): string {
  const [y, m, d] = iso.split('-').map(Number)
  return short ? `${d} ${MONTHS[m - 1]}` : `${d} ${MONTHS[m - 1]} ${y}`
}
export function fmtTime(iso: string): string {
  const t = iso.split('T')[1] ?? '00:00'
  return t.slice(0, 5)
}
export const dayOfWeek = (iso: string) =>
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(iso.split('T')[0] + 'T00:00:00Z').getUTCDay()]

export function daysBetween(a: string, b: string): number {
  const da = Date.parse(a.split('T')[0] + 'T00:00:00Z')
  const db = Date.parse(b.split('T')[0] + 'T00:00:00Z')
  return Math.round(Math.abs(db - da) / 86400000)
}

/** Levenshtein — used by the transposition-tolerant invoice-number detector. */
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
