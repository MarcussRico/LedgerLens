import { useStore } from '../lib/store'
import { SECTIONS } from './TopBar'
import { cn } from '../lib/utils'

/* Toggled with P. What to say, and what to do next. */
const NOTES: Record<string, { say: string; next: string }> = {
  hero: {
    say: '“₹18.4 lakh recoverable on ₹42.6 crore of spend. Every rupee of that traces back to a document you can open.”',
    next: 'Scroll to 02. Do not stop on the hero — the counter has already landed.',
  },
  stakes: {
    say: '“The most common fraud-detection method in the world is still one person telling on another. Software catches almost none of it.”',
    next: 'Point at the 43% figure, then scroll into the pipeline.',
  },
  pipeline: {
    say: '“Four documents, four people, often four systems. Every gap is where money leaves.”',
    next: 'Let the pin run. Do not talk over the four captions.',
  },
  ways: {
    say: '“None of these need a criminal. The first one is just a vendor politely re-sending an invoice.”',
    next: 'Read card 04 aloud — the ₹48,000 × 5 one. It sets up the histogram later.',
  },
  root: {
    say: '“Humans review invoices one at a time. The problems only exist across thousands at once.”',
    next: 'Pause here. Then go straight into the product.',
  },
  product: {
    say: '“This is running now. Click anything.”',
    next: 'Open the top finding → evidence drawer → Draft recovery email. That is the sequence.',
  },
  engine: {
    say: '“Forty-two detectors, five pillars, every finding traceable to the source documents.”',
    next: 'Scroll horizontally through the five panels. Stop on Behavioural.',
  },
  architecture: {
    say: '“No language model ever produces a number in this system. Rules and statistics compute; the model only explains.”',
    next: 'Show the Finding interface. Eight lines is the whole contract.',
  },
  novelty: {
    say: '“Everyone here can group by invoice number. Nobody else can quote a precision figure.”',
    next: 'Land on the accuracy row, then go to Proof.',
  },
  proof: {
    say: '“We planted 150 labelled frauds, so precision is measured, not asserted. And we are weakest on price creep — 74% recall. I will say that before you find it.”',
    next: 'Naming the weakness is the move. Do not skip it.',
  },
  impact: {
    say: '“₹18.4 lakh, and here is the arithmetic for all three tiers.”',
    next: 'Hover any figure for the derivation tooltip if asked.',
  },
  close: {
    say: '“Humans review invoices one at a time. The problems only exist across thousands at once.”',
    next: 'Hit F. Let the injection run. Do not narrate it.',
  },
}

export function PresenterNotes() {
  const { notes, section } = useStore()
  if (!notes) return null
  const s = SECTIONS[section - 1]
  const n = NOTES[s?.id ?? 'hero'] ?? NOTES.hero
  return (
    <aside
      className={cn('fixed bottom-14 left-1/2 z-[130] w-[min(46rem,calc(100vw-2rem))] -translate-x-1/2',
        'border border-[var(--color-gold-soft)] bg-[color-mix(in_oklab,var(--color-ink)_94%,transparent)] px-5 py-4')}
      aria-label="Speaker notes"
    >
      <div className="flex items-baseline gap-3">
        <span className="num text-2xs text-[var(--color-gold)]">{s?.n ?? '01'}</span>
        <span className="text-[0.8125rem] text-[var(--color-paper)]">{s?.label ?? 'Hero'}</span>
        <span className="ml-auto font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-[var(--color-muted)]">P to hide · F inject · R replay · 1–9 jump</span>
      </div>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-[var(--color-paper)]">{n.say}</p>
      <p className="mt-2 border-t border-[var(--color-line)] pt-2 text-[0.75rem] text-[var(--color-paper-dim)]">
        <span className="kicker mr-2">Next</span>{n.next}
      </p>
    </aside>
  )
}
