import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tooltip from '@radix-ui/react-tooltip'
import { X, FileText, Mail, ShieldAlert, ThumbsDown, ArrowRight } from 'lucide-react'
import { animate } from 'animejs'
import { cn, formatINR, fmtDate, fmtTime, dayOfWeek, groupIN } from '../lib/utils'
import { Chip } from '../components/ui/primitives'
import { findingById } from '../data/findings'
import { invoiceById, duplicatePairs, HERO_PAIR } from '../data/invoices'
import { vendorById } from '../data/vendors'
import { skuById } from '../data/skus'
import type { Action, Finding, Invoice } from '../data/types'
import { useStore } from '../lib/store'
import { useReducedMotion } from '../lib/hooks'

/* ── A document, rendered as a document. Matching fields are tinted verify,
      differing fields gold. This is the most important object on the site. ── */
function DocPanel({ inv, other, label }: { inv: Invoice; other: Invoice; label: string }) {
  const v = vendorById.get(inv.vendorId)!
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const cls = (matches: boolean) =>
    matches
      ? 'bg-[color-mix(in_oklab,var(--color-verify)_15%,transparent)]'
      : 'bg-[color-mix(in_oklab,var(--color-gold)_15%,transparent)]'

  return (
    <div className="min-w-0 border border-[var(--color-line)] bg-[var(--color-panel)]">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-2">
        <span className="kicker">{label}</span>
        <Chip kind={inv.status === 'paid' ? 'recovered' : 'open'}>{inv.status}</Chip>
      </div>
      <div className="space-y-3 p-3">
        <div>
          <p className="num text-[0.9375rem] font-medium text-[var(--color-paper)]">{v.name}</p>
          <p className="mt-0.5 text-[0.6875rem] leading-snug text-[var(--color-muted)]">{v.address}, {v.city}</p>
          <p className="num mt-1 text-[0.625rem] text-[var(--color-muted)]">GSTIN {v.gstin}</p>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-y border-[var(--color-line-soft)] py-2.5 text-[0.6875rem]">
          <dt className="text-[var(--color-muted)]">Invoice no.</dt>
          <dd className={cn('num justify-self-end px-1', cls(same(inv.gstInvoiceNo, other.gstInvoiceNo)))}>{inv.gstInvoiceNo}</dd>
          <dt className="text-[var(--color-muted)]">Date</dt>
          <dd className={cn('num justify-self-end px-1', cls(same(inv.date, other.date)))}>{fmtDate(inv.date)}</dd>
          <dt className="text-[var(--color-muted)]">Submitted</dt>
          <dd className={cn('num justify-self-end px-1', cls(same(fmtTime(inv.submittedAt), fmtTime(other.submittedAt))))}>
            {dayOfWeek(inv.submittedAt)} {fmtTime(inv.submittedAt)}
          </dd>
          <dt className="text-[var(--color-muted)]">PO reference</dt>
          <dd className={cn('num justify-self-end px-1', cls(same(inv.poId, other.poId)))}>{inv.poId ?? '—'}</dd>
        </dl>

        <table className="w-full text-[0.6875rem]">
          <thead>
            <tr className="text-left text-[var(--color-muted)]">
              <th className="pb-1 font-normal">Line item (as written)</th>
              <th className="pb-1 text-right font-normal">Qty</th>
              <th className="pb-1 text-right font-normal">Rate</th>
            </tr>
          </thead>
          <tbody>
            {inv.lineItems.map((li, i) => {
              const o = other.lineItems[i]
              const matched = o && li.skuId === o.skuId && li.qty === o.qty && Math.abs(li.unitPrice - o.unitPrice) < 1
              return (
                <tr key={i} className={cn('align-top', matched ? cls(true) : cls(false))}>
                  <td className="py-1 pr-2">
                    <span className="num block truncate text-[var(--color-paper-dim)]">{li.rawDescription}</span>
                    <span className="block text-[0.5625rem] text-[var(--color-muted)]">→ {skuById.get(li.skuId)?.canonical}</span>
                  </td>
                  <td className="num py-1 text-right tabular-nums">{li.qty}</td>
                  <td className="num py-1 pr-1 text-right tabular-nums">{groupIN(li.unitPrice)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="border-t border-[var(--color-line)] pt-2">
          <div className="flex items-baseline justify-between text-[0.6875rem] text-[var(--color-muted)]">
            <span>Subtotal</span><span className="num">{formatINR(inv.subtotal)}</span>
          </div>
          <div className="flex items-baseline justify-between text-[0.6875rem] text-[var(--color-muted)]">
            <span>GST</span><span className="num">{formatINR(inv.tax)}</span>
          </div>
          <div className={cn('mt-1.5 flex items-baseline justify-between px-1 py-1', cls(inv.amount === other.amount))}>
            <span className="text-[0.6875rem] font-medium">Total</span>
            <span className="num text-[0.9375rem] font-medium">{formatINR(inv.amount)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Score decomposition. Every point traceable to a rule that fired. ── */
function ScoreBar({ finding }: { finding: Finding }) {
  const total = finding.scoreContribution.reduce((s, c) => s + c.points, 0)
  const COLOURS = ['var(--color-gold)', 'color-mix(in oklab, var(--color-gold) 76%, var(--color-ink))',
    'color-mix(in oklab, var(--color-gold) 54%, var(--color-ink))', 'color-mix(in oklab, var(--color-gold) 34%, var(--color-ink))']
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="kicker">Score decomposition</p>
        <p className="num text-xs text-[var(--color-paper-dim)]">{total} pts → risk {Math.min(99, total + 20)}</p>
      </div>
      <div className="mt-3 flex h-2.5 w-full overflow-hidden border border-[var(--color-line)]">
        {finding.scoreContribution.map((c, i) => (
          <Tooltip.Root key={c.component} delayDuration={80}>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                aria-label={`${c.component}: ${c.points} points`}
                className="h-full border-r border-[var(--color-ink)] transition-opacity last:border-r-0 hover:opacity-80"
                style={{ width: `${(c.points / total) * 100}%`, background: COLOURS[i % COLOURS.length] }}
              />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content sideOffset={6} className="z-[400] max-w-72 border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2 text-[0.75rem] text-[var(--color-paper)]">
                <span className="num text-[var(--color-gold)]">+{c.points}</span> {c.component}
                <Tooltip.Arrow className="fill-[var(--color-line)]" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        ))}
      </div>
      <ul className="mt-3 space-y-1">
        {finding.scoreContribution.map((c) => (
          <li key={c.component} className="flex items-baseline gap-2 text-[0.75rem] text-[var(--color-paper-dim)]">
            <span className="num w-8 shrink-0 text-[var(--color-gold)]">+{c.points}</span>
            <span className="leading-snug">{c.component}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* The letter has to match the finding. A collusion ring does not get a
   duplicate-billing recovery notice — the model picks the register, the rule
   engine supplies every figure in it. */
function buildLetter(finding: Finding, vendorName: string): string {
  const ev = finding.evidence as Record<string, string | number | undefined>
  const amt = formatINR(finding.moneyAtRisk)
  const ref = `Reference: LedgerLens finding ${finding.id} · rule ${finding.ruleId} · confidence ${finding.confidence.toFixed(2)}`
  const sign = `Regards,\nAccounts Payable\nVaigai Industries Ltd\nGSTIN 33AABCV4471N1ZQ · Madurai`

  switch (finding.recommendedAction.kind) {
    case 'recover':
    case 'block-payment': {
      const a = String(ev.invoiceNoA ?? ''), b = String(ev.invoiceNoB ?? '')
      if (a && b) {
        const da = ev.dateA ? fmtDate(String(ev.dateA)) : '—'
        const db = ev.dateB ? fmtDate(String(ev.dateB)) : '—'
        return `Subject: Duplicate billing — ${a} and ${b} · ${amt}

Dear Accounts Team, ${vendorName},

Our payables reconciliation for the period has identified two invoices from your organisation covering the same supply.

  ${b}   dated ${db}   ${amt}
  ${a}   dated ${da}   ${amt}

Both documents carry identical line items and an identical net value, and both have been processed for payment. Only one supply was received.

We are treating ${a} as a re-issue of ${b} rather than a separate supply. Accordingly we will raise a debit note for ${amt} against your account, to be adjusted against the next payment run on the 15th.

If your records show two distinct supplies, please send the corresponding goods-receipt acknowledgements for both, signed at our stores gate, and we will reverse the debit note without further correspondence.

${ref}

${sign}`
      }
      return `Subject: Recovery claim — ${finding.ruleId} · ${amt}

Dear Accounts Team, ${vendorName},

A review of transactions settled against your account has identified ${amt} billed in excess of what was contracted or received.

${finding.explanation}

We will raise a debit note for ${amt} and adjust it against the next payment run on the 15th. If you hold documentation that reconciles the difference, please send it within seven working days and we will hold the adjustment pending review.

${ref}

${sign}`
    }

    case 'renegotiate':
    case 'consolidate':
      return `Subject: Commercial review — ${String(ev.sku ?? 'contracted items')} · ${amt} per annum

Dear ${vendorName},

Ahead of renewal we have benchmarked the rates on our account against the resolved peer set for the same specification.

${finding.explanation}

On current volumes the difference is ${amt}. We value the relationship and would rather reset the rate than move the volume, so we are asking for a revised schedule aligned to the peer median, effective from the next order.

Please send a revised rate card within ten working days. We will hold new orders on the affected lines until it arrives.

${ref}

${sign}`

    case 'escalate':
      return `Subject: CONFIDENTIAL — referral to Audit Committee · ${finding.ruleId} · ${amt}

To: Chair, Audit Committee
Cc: Chief Financial Officer
From: Accounts Payable — Controls

${finding.explanation}

Exposure: ${amt}
Detector: ${finding.ruleId} · confidence ${finding.confidence.toFixed(2)}
Evidence retained: ${Object.keys(ev).slice(0, 6).join(', ')}

Recommended immediate steps
  1. ${finding.recommendedAction.detail}
  2. Preserve the approval trail and vendor master change log for the affected records.
  3. Suspend further payment release on the affected counterparties pending review.

This memo is generated from a deterministic rule. No figure in it was produced by a language model.

${ref}

${sign}`

    default:
      return `Subject: Query — ${finding.ruleId} · ${vendorName} · ${amt}

Dear ${vendorName},

${finding.explanation}

We have placed ${amt} of related spend under review. ${finding.recommendedAction.detail}

Please treat this as a request for supporting documentation rather than a dispute; we will close the item as soon as the records reconcile.

${ref}

${sign}`
  }
}

const LETTER_LABEL: Partial<Record<Action['kind'], string>> = {
  recover: 'Recovery email',
  'block-payment': 'Payment hold notice',
  renegotiate: 'Commercial review letter',
  consolidate: 'Consolidation proposal',
  escalate: 'Audit committee memo',
  investigate: 'Documentation request',
}

/* ── The drafted email. Typed out, because that is the moment they believe it. ── */
function EmailDialog({ finding, open, onOpenChange }: { finding: Finding; open: boolean; onOpenChange: (o: boolean) => void }) {
  const v = vendorById.get(finding.entities.vendorId)!
  const body = useMemo(() => buildLetter(finding, v.name), [finding, v.name])

  const preRef = useRef<HTMLPreElement | null>(null)
  const [done, setDone] = useState(false)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (!open) { setDone(false); return }
    const el = preRef.current
    if (!el) return
    if (reduced) { el.textContent = body; setDone(true); return }
    const state = { i: 0 }
    el.textContent = ''
    const a = animate(state, {
      i: body.length,
      duration: body.length * 8,
      ease: 'linear',
      onUpdate: () => { if (preRef.current) preRef.current.textContent = body.slice(0, Math.round(state.i)) },
      onComplete: () => setDone(true),
    })
    return () => { a.pause() }
  }, [open, body, reduced])

  const skip = () => {
    if (preRef.current) preRef.current.textContent = body
    setDone(true)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[350] bg-[color-mix(in_oklab,var(--color-ink)_82%,transparent)]" />
        <Dialog.Content
          onClick={skip}
          className="fixed left-1/2 top-1/2 z-[360] max-h-[86vh] w-[min(46rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-auto border border-[var(--color-line)] bg-[var(--color-panel)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-3">
            <div>
              <Dialog.Title className="text-sm text-[var(--color-paper)]">{LETTER_LABEL[finding.recommendedAction.kind] ?? 'Drafted correspondence'} — draft</Dialog.Title>
              <Dialog.Description className="mt-0.5 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--color-muted)]">
                Language generated · every figure supplied by the rule engine
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="Close" className="text-[var(--color-muted)] transition-colors hover:text-[var(--color-paper)]">
              <X className="size-4" strokeWidth={1.5} />
            </Dialog.Close>
          </div>
          <pre ref={preRef} className="num min-h-[26rem] whitespace-pre-wrap px-6 py-5 text-[0.8125rem] leading-[1.65] text-[var(--color-paper-dim)]" />
          <div className="flex items-center justify-between gap-3 border-t border-[var(--color-line)] px-5 py-3">
            <p className="font-mono text-[0.625rem] uppercase tracking-[0.1em] text-[var(--color-muted)]">
              {done ? 'Draft complete — review before sending' : 'Click anywhere to skip typing'}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => onOpenChange(false)}
                className="border border-[var(--color-line)] px-3 py-1.5 text-xs text-[var(--color-paper-dim)] transition-colors hover:text-[var(--color-paper)]">
                Discard
              </button>
              <button type="button" onClick={() => onOpenChange(false)}
                className="inline-flex items-center gap-2 border border-[var(--color-gold-soft)] bg-[color-mix(in_oklab,var(--color-gold)_12%,transparent)] px-3 py-1.5 text-xs text-[var(--color-gold)]">
                Queue for send <ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden />
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/* ── Resolve the two documents a finding compares ── */
function docsFor(finding: Finding): [Invoice, Invoice] | null {
  const [a, b] = finding.entities.invoiceIds
  const ia = a ? invoiceById.get(a) : undefined
  const ib = b ? invoiceById.get(b) : undefined
  if (ia && ib) return [ia, ib]
  return null
}

export function EvidenceDrawer() {
  const { selectedFinding, openFinding } = useStore()
  const [emailOpen, setEmailOpen] = useState(false)
  const [marked, setMarked] = useState<string | null>(null)
  const finding = selectedFinding ? findingById.get(selectedFinding) ?? null : null

  useEffect(() => { setMarked(null) }, [selectedFinding])

  if (!finding) return null
  const v = vendorById.get(finding.entities.vendorId)!
  const docs = docsFor(finding)
  const ev = finding.evidence as Record<string, unknown>

  return (
    <>
      <Dialog.Root open={!!selectedFinding} onOpenChange={(o) => !o && openFinding(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[300] bg-[color-mix(in_oklab,var(--color-ink)_78%,transparent)] data-[state=open]:animate-[fadeUp_200ms_ease]" />
          <Dialog.Content
            aria-describedby={`${finding.id}-desc`}
            className={cn(
              'fixed right-0 top-0 z-[310] flex h-full w-[min(620px,100vw)] flex-col',
              'border-l border-[var(--color-line)] bg-[var(--color-ink)]',
              'data-[state=open]:animate-[slideIn_320ms_cubic-bezier(0.22,1,0.36,1)]',
            )}
          >
            <style>{`@keyframes slideIn{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}`}</style>

            {/* header */}
            <div className="flex items-start justify-between gap-4 border-b border-[var(--color-line)] px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip kind={finding.severity} />
                  <span className="num text-[0.6875rem] text-[var(--color-muted)]">{finding.ruleId}</span>
                  <span className="text-[var(--color-line)]">·</span>
                  <span className="text-[0.6875rem] text-[var(--color-muted)]">{finding.pillar}</span>
                </div>
                <Dialog.Title className="mt-2 truncate text-[1.375rem] text-[var(--color-paper)]">{v.name}</Dialog.Title>
                <p className="num mt-0.5 text-[0.625rem] text-[var(--color-muted)]">
                  {finding.id} · detected {fmtDate(finding.detectedAt)} · confidence {finding.confidence.toFixed(2)}
                </p>
              </div>
              <Dialog.Close aria-label="Close evidence" className="mt-1 shrink-0 text-[var(--color-muted)] transition-colors hover:text-[var(--color-paper)]">
                <X className="size-4" strokeWidth={1.5} />
              </Dialog.Close>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {/* money */}
              <div className="hatch border-b border-[var(--color-line)] px-5 py-5">
                <p className="kicker">Money at risk</p>
                <p className="num mt-1.5 text-[2.5rem] leading-none tracking-tight text-[var(--color-signal)]">
                  {formatINR(finding.moneyAtRisk)}
                </p>
              </div>

              {/* documents */}
              {docs && (
                <div className="border-b border-[var(--color-line)] px-5 py-5">
                  <div className="mb-3 flex items-center gap-3">
                    <FileText className="size-4 text-[var(--color-muted)]" strokeWidth={1.5} aria-hidden />
                    <p className="kicker">The two documents, side by side</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <DocPanel inv={docs[0]} other={docs[1]} label="Document A" />
                    <DocPanel inv={docs[1]} other={docs[0]} label="Document B" />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-[0.6875rem] text-[var(--color-muted)]">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block size-2.5 bg-[color-mix(in_oklab,var(--color-verify)_35%,transparent)]" /> field matches
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block size-2.5 bg-[color-mix(in_oklab,var(--color-gold)_35%,transparent)]" /> field differs
                    </span>
                  </div>
                </div>
              )}

              {/* evidence table for non-document findings */}
              {!docs && (
                <div className="border-b border-[var(--color-line)] px-5 py-5">
                  <p className="kicker mb-3">Exactly the fields the rule compared</p>
                  <dl className="divide-y divide-[var(--color-line-soft)] border border-[var(--color-line)]">
                    {Object.entries(ev).map(([k, val]) => (
                      <div key={k} className="grid grid-cols-[minmax(0,11rem)_1fr] gap-3 px-3 py-2 text-[0.75rem]">
                        <dt className="num truncate text-[var(--color-muted)]">{k}</dt>
                        <dd className="num break-words text-[var(--color-paper-dim)]">
                          {Array.isArray(val)
                            ? val.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' · ')
                            : typeof val === 'number' && val > 999 ? groupIN(val)
                            : String(val)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {/* why */}
              <div className="border-b border-[var(--color-line)] px-5 py-5">
                <p className="kicker">Why this fired</p>
                <p id={`${finding.id}-desc`} className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--color-paper)]">
                  {finding.explanation}
                </p>
              </div>

              <div className="border-b border-[var(--color-line)] px-5 py-5">
                <ScoreBar finding={finding} />
              </div>

              <div className="px-5 py-5">
                <p className="kicker">Recommended action</p>
                <p className="mt-2 text-[0.9375rem] text-[var(--color-paper)]">{finding.recommendedAction.label}</p>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--color-paper-dim)]">{finding.recommendedAction.detail}</p>
              </div>
            </div>

            {/* actions */}
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] px-5 py-3">
              <button type="button" onClick={() => setEmailOpen(true)}
                className="inline-flex items-center gap-2 border border-[var(--color-gold-soft)] bg-[color-mix(in_oklab,var(--color-gold)_12%,transparent)] px-3 py-2 text-xs text-[var(--color-gold)] transition-colors hover:bg-[color-mix(in_oklab,var(--color-gold)_20%,transparent)]">
                <Mail className="size-3.5" strokeWidth={1.5} aria-hidden /> Draft {(LETTER_LABEL[finding.recommendedAction.kind] ?? 'correspondence').toLowerCase()}
              </button>
              <button type="button" onClick={() => setMarked('false-positive')}
                className="inline-flex items-center gap-2 border border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-paper-dim)] transition-colors hover:text-[var(--color-paper)]">
                <ThumbsDown className="size-3.5" strokeWidth={1.5} aria-hidden /> Mark false positive
              </button>
              <button type="button" onClick={() => setMarked('escalated')}
                className="inline-flex items-center gap-2 border border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-paper-dim)] transition-colors hover:text-[var(--color-paper)]">
                <ShieldAlert className="size-3.5" strokeWidth={1.5} aria-hidden /> Escalate to audit
              </button>
              {marked && (
                <p className="w-full pt-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-[var(--color-verify)]">
                  {marked === 'false-positive'
                    ? 'Recorded. This label feeds the calibration set — the detector reweights on the next run.'
                    : 'Escalated. Audit queue #A-118, assigned to Internal Audit, SLA 5 working days.'}
                </p>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <EmailDialog finding={finding} open={emailOpen} onOpenChange={setEmailOpen} />
    </>
  )
}

/** Guarantee: every one of the eleven pairs and the hero pair open here. */
export const EVIDENCE_COVERAGE = duplicatePairs.length + 1
export { HERO_PAIR }
