import { ArrowUpRight, Code2 } from 'lucide-react'
import { CORPUS, PRECISION, RECALL, EVAL_CORPUS } from '../data/metrics'
import { citations } from '../data/citations'
import { API_BASE } from '../lib/api'

const REPO = 'https://github.com/MarcussRico/LedgerLens'

const COLUMNS: { title: string; items: { label: string; href?: string; note?: string }[] }[] = [
  {
    title: 'The engine',
    items: [
      { label: `${CORPUS.detectors} detectors · 5 pillars`, href: `${API_BASE}/api/detectors` },
      { label: 'Health and status', href: `${API_BASE}/api/health` },
      { label: 'Source', href: REPO },
    ],
  },
  {
    title: 'Verify it yourself',
    items: [
      { label: EVAL_CORPUS.command, note: 'reproduces the accuracy figures' },
      { label: `seed ${EVAL_CORPUS.seed}`, note: 'same corpus, same result' },
      { label: `${(PRECISION * 100).toFixed(1)}% precision · ${(RECALL * 100).toFixed(1)}% recall`, note: `against ${EVAL_CORPUS.planted} planted frauds` },
    ],
  },
]

export function Footer() {
  return (
    <footer className="relative z-10 mt-16 border-t border-[var(--color-line)]">
      <div className="shell" style={{ paddingBlock: 'clamp(3rem, 7vh, 5rem)' }}>
        <div className="grid grid-cols-12 gap-x-8 gap-y-10">
          {/* identity */}
          <div className="col-span-12 lg:col-span-4">
            <p className="num text-xs tracking-[0.2em] text-[var(--color-paper)]">LEDGERLENS</p>
            <p className="mt-4 max-w-[36ch] text-[0.875rem] leading-relaxed text-[var(--color-paper-dim)]">
              Humans review invoices one at a time. The problems only exist across thousands at once.
            </p>
            <p className="mt-5 max-w-[40ch] text-[0.75rem] leading-relaxed text-[var(--color-muted)]">
              Rules and statistics compute every figure here. The language model maps schemas,
              explains and drafts — it never produces a number.
            </p>
            <a href={REPO} target="_blank" rel="noreferrer"
              className="group mt-6 inline-flex items-center gap-2 border border-[var(--color-line)] px-3 py-2 text-[0.75rem] text-[var(--color-paper-dim)] transition-colors hover:border-[var(--color-paper-dim)] hover:text-[var(--color-paper)]">
              <Code2 className="size-3.5" strokeWidth={1.5} aria-hidden />
              View the source
              <ArrowUpRight className="size-3 opacity-60 transition-opacity group-hover:opacity-100" strokeWidth={1.5} aria-hidden />
            </a>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title} className="col-span-6 lg:col-span-2">
              <p className="kicker">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.items.map((it) => (
                  <li key={it.label}>
                    {it.href ? (
                      <a href={it.href} target="_blank" rel="noreferrer"
                        className="group inline-flex items-start gap-1.5 text-[0.75rem] leading-snug text-[var(--color-paper-dim)] transition-colors hover:text-[var(--color-paper)]">
                        <span className="min-w-0">{it.label}</span>
                        <ArrowUpRight className="mt-[3px] size-3 shrink-0 opacity-50 transition-opacity group-hover:opacity-100" strokeWidth={1.5} aria-hidden />
                      </a>
                    ) : (
                      <span className="num block text-[0.6875rem] leading-snug text-[var(--color-paper-dim)]">{it.label}</span>
                    )}
                    {it.note && <span className="mt-0.5 block text-[0.625rem] text-[var(--color-muted)]">{it.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* sources */}
          <div className="col-span-12 lg:col-span-4">
            <p className="kicker">Every statistic on this page</p>
            <ul className="mt-4 space-y-2">
              {citations.map((c) => (
                <li key={c.id}>
                  <a href={c.url} target="_blank" rel="noreferrer"
                    className="group flex items-start gap-2 text-[0.6875rem] leading-snug text-[var(--color-paper-dim)] transition-colors hover:text-[var(--color-paper)]">
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    <span className="num shrink-0 text-[var(--color-muted)]">{c.year}</span>
                    <ArrowUpRight className="mt-[2px] size-3 shrink-0 opacity-50 transition-opacity group-hover:opacity-100" strokeWidth={1.5} aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* the disclosures that have to be unmissable */}
        <div className="mt-14 border-t border-[var(--color-line)] pt-6">
          <p className="max-w-[92ch] text-[0.75rem] leading-relaxed text-[var(--color-muted)]">
            <span className="text-[var(--color-paper-dim)]">Demo dataset — synthetic, generated for evaluation.</span>{' '}
            Vaigai Industries Ltd, its vendors, invoices, GSTINs and employees are fictional and were
            generated for this demonstration. Nothing here is a real company&rsquo;s books, and no finding
            on this page describes a real person or business. Findings are claims requiring review, never
            verdicts — the engine describes what the data is consistent with and does not allege
            wrongdoing by anyone.
          </p>
          <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--color-muted)]">
            <span>LedgerLens · procurement forensics</span>
            <span className="text-[var(--color-line)]">·</span>
            <span>The demo runs offline; only “Analyse your data” calls the engine</span>
            <span className="ml-auto normal-case tracking-normal text-[var(--color-line)]">
              {CORPUS.windowLabel}
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
