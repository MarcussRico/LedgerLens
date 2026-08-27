import { useCallback, useEffect, useRef, useState } from 'react'
import * as Toast from '@radix-ui/react-toast'
import { createTimeline } from 'animejs'
import { AlertTriangle, FileSearch, Mail, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { formatINR, fmtDate, cn } from '../lib/utils'
import { HERO_PAIR } from '../data/invoices'
import { HERO_FINDING } from '../data/findings'
import { vendorById } from '../data/vendors'
import { useReducedMotion } from '../lib/hooks'

/* ── The closing move. 6.5 seconds, rehearsed, and replayable — because it
      will be clicked more than once. ── */

const STATUS_LINES = [
  'Resolving vendor identity…',
  'Normalising line items…',
  'Matching against 5,847 records…',
  'Running 42 detectors…',
]

let externalTrigger: (() => void) | null = null

export function useInjection() {
  return useCallback(() => { externalTrigger?.() }, [])
}

export function InjectionRig() {
  const { phase, setPhase, statusLine, setStatusLine, commitInjection, reset, setView, openFinding } = useStore()
  const [toastOpen, setToastOpen] = useState(false)
  const [alertOpen, setAlertOpen] = useState(false)
  const tlRef = useRef<ReturnType<typeof createTimeline> | null>(null)
  const reduced = useReducedMotion()
  const v = vendorById.get(HERO_PAIR.vendorId)!

  const run = useCallback(() => {
    tlRef.current?.pause()
    tlRef.current = null
    reset()
    setAlertOpen(false)
    setToastOpen(false)

    // t=0.0 — the document arrives
    requestAnimationFrame(() => {
      setPhase('incoming')
      setToastOpen(true)
      setView('command')
    })

    // The product section is lazy — if its chunk has not landed yet, aim at the
    // section wrapper and try again once it has.
    const scrollToChrome = (attempt = 0) => {
      const el = document.getElementById('app-chrome') ?? document.getElementById('product')
      el?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
      if (!document.getElementById('app-chrome') && attempt < 6) {
        window.setTimeout(() => scrollToChrome(attempt + 1), 220)
      }
    }

    // 6.5 seconds, to the frame. Rehearse it.
    const tl = createTimeline({ autoplay: true })
      .call(() => scrollToChrome(), 400)
      .call(() => { setPhase('scanning'); setStatusLine(STATUS_LINES[0]) }, 1200)
      .call(() => setStatusLine(STATUS_LINES[1]), 1800)
      .call(() => setStatusLine(STATUS_LINES[2]), 2400)
      .call(() => setStatusLine(STATUS_LINES[3]), 3000)
      .call(() => { setPhase('flagged'); setStatusLine('Rule DUP-002 fired — duplicate payment risk.') }, 3600)
      .call(() => { setPhase('alerted'); setAlertOpen(true) }, 3900)
      .call(() => commitInjection(), 4600)
      .call(() => setStatusLine(''), 6500)

    tlRef.current = tl
  }, [reset, setPhase, setStatusLine, commitInjection, setView, reduced])

  useEffect(() => {
    externalTrigger = run
    return () => { externalTrigger = null }
  }, [run])

  useEffect(() => () => { tlRef.current?.pause() }, [])

  return (
    <>
      <Toast.Root
        open={toastOpen}
        onOpenChange={setToastOpen}
        className="border border-[var(--color-gold-soft)] bg-[var(--color-panel)] p-4 data-[state=open]:animate-[slideUp_320ms_cubic-bezier(0.22,1,0.36,1)]"
      >
        <style>{`@keyframes slideUp{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}`}</style>
        <div className="flex items-start gap-3">
          <FileSearch className="mt-0.5 size-4 shrink-0 text-[var(--color-gold)]" strokeWidth={1.5} aria-hidden />
          <div className="min-w-0">
            <Toast.Title className="kicker text-[var(--color-gold)]">Incoming document</Toast.Title>
            <Toast.Description className="num mt-1 text-[0.8125rem] text-[var(--color-paper)]">
              {HERO_PAIR.duplicate.no} · {v.name} · {formatINR(HERO_PAIR.amount)} · {fmtDate(HERO_PAIR.duplicate.date, true)}
            </Toast.Description>
            {statusLine && (
              <p className="num mt-2 text-[0.6875rem] text-[var(--color-slate)]" aria-live="polite">{statusLine}</p>
            )}
          </div>
          <Toast.Close aria-label="Dismiss" className="ml-auto shrink-0 text-[var(--color-muted)] hover:text-[var(--color-paper)]">
            <X className="size-3.5" strokeWidth={1.5} />
          </Toast.Close>
        </div>
      </Toast.Root>

      {/* The alert card. It stays on screen. */}
      {alertOpen && (
        <div
          role="alert"
          className={cn(
            'fixed bottom-6 left-6 z-[300] w-[min(30rem,calc(100vw-3rem))]',
            'border border-[var(--color-signal)] bg-[var(--color-panel)]',
            !reduced && 'animate-[slideUp_320ms_cubic-bezier(0.22,1,0.36,1)]',
          )}
        >
          <div className="hatch flex items-start gap-3 border-b border-[var(--color-signal-dim)] px-4 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-signal)]" strokeWidth={1.5} aria-hidden />
            <div className="min-w-0">
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--color-signal)]">
                Duplicate payment risk — 96% match
              </p>
              <p className="num mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--color-paper)]">
                {HERO_PAIR.duplicate.no} ({formatINR(HERO_PAIR.amount)}, {fmtDate(HERO_PAIR.duplicate.date, true)})
                {' '}↔{' '}
                {HERO_PAIR.original.no} ({formatINR(HERO_PAIR.amount)}, {fmtDate(HERO_PAIR.original.date, true)})
              </p>
              <p className="mt-1.5 text-[0.75rem] leading-relaxed text-[var(--color-paper-dim)]">
                Same vendor · same 4 line items · 6 days apart · different invoice number
              </p>
              <p className="num mt-1.5 text-[0.6875rem] text-[var(--color-muted)]">
                Rule {HERO_FINDING.ruleId} · Confidence {HERO_FINDING.confidence.toFixed(2)} · {formatINR(HERO_PAIR.amount)} at risk
              </p>
            </div>
            <button type="button" onClick={() => setAlertOpen(false)} aria-label="Dismiss alert"
              className="ml-auto shrink-0 text-[var(--color-muted)] transition-colors hover:text-[var(--color-paper)]">
              <X className="size-3.5" strokeWidth={1.5} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 px-4 py-3">
            <button type="button"
              onClick={() => { setView('register'); openFinding(HERO_FINDING.id) }}
              className="inline-flex items-center gap-2 border border-[var(--color-signal-dim)] bg-[color-mix(in_oklab,var(--color-signal)_12%,transparent)] px-3 py-1.5 text-xs text-[var(--color-signal)] transition-colors hover:bg-[color-mix(in_oklab,var(--color-signal)_20%,transparent)]">
              <FileSearch className="size-3.5" strokeWidth={1.5} aria-hidden /> View evidence
            </button>
            <button type="button"
              onClick={() => { setView('register'); openFinding(HERO_FINDING.id) }}
              className="inline-flex items-center gap-2 border border-[var(--color-line)] px-3 py-1.5 text-xs text-[var(--color-paper-dim)] transition-colors hover:text-[var(--color-paper)]">
              <Mail className="size-3.5" strokeWidth={1.5} aria-hidden /> Draft recovery email
            </button>
          </div>
        </div>
      )}

      {/* status strip inside the chrome, driven by phase */}
      {phase !== 'idle' && statusLine && (
        <div className="pointer-events-none fixed inset-x-0 top-14 z-[115] flex justify-center">
          <p className="num border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-1.5 text-[0.6875rem] text-[var(--color-slate)]">
            {statusLine}
          </p>
        </div>
      )}
    </>
  )
}
