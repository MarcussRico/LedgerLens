import type { ReactNode } from 'react'

/* Recharts' own tooltip is a rounded white box. This is the ledger version. */
export interface TipRow { label: string; value: string; colour?: string }

export function TipBox({ title, rows, foot }: { title?: string; rows: TipRow[]; foot?: ReactNode }) {
  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2">
      {title && <p className="num mb-1.5 text-[0.6875rem] text-[var(--color-paper)]">{title}</p>}
      <dl className="space-y-0.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline gap-4 text-[0.6875rem]">
            <dt className="flex items-center gap-1.5 text-[var(--color-muted)]">
              {r.colour && <span className="inline-block size-2" style={{ background: r.colour }} />}
              {r.label}
            </dt>
            <dd className="num ml-auto text-[var(--color-paper)]">{r.value}</dd>
          </div>
        ))}
      </dl>
      {foot && <p className="mt-1.5 border-t border-[var(--color-line-soft)] pt-1.5 text-[0.5625rem] uppercase tracking-[0.1em] text-[var(--color-muted)]">{foot}</p>}
    </div>
  )
}

/** Recharts hands content components a loosely-typed payload; narrow it here once. */
export interface TipProps<T> { active?: boolean; label?: string | number; payload?: { payload: T }[] }
export function tipData<T>(p: TipProps<T>): { label: string; datum: T } | null {
  if (!p.active || !p.payload?.length) return null
  return { label: String(p.label ?? ''), datum: p.payload[0].payload }
}

export const AXIS_TICK = { fill: 'var(--color-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' } as const
export const GRID = { stroke: 'var(--color-line-soft)' } as const
