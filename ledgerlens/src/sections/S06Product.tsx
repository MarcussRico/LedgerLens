import { lazy, Suspense } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { LayoutGrid, ListTree, Tag, Share2, Activity, SlidersHorizontal, MessageSquareCode, Circle, Upload } from 'lucide-react'
import { Reveal } from '../components/ui/primitives'
import { cn } from '../lib/utils'
import { useStore } from '../lib/store'
import { CommandCenter } from '../dashboard/CommandCenter'
import { Register } from '../dashboard/Register'
import { EvidenceDrawer } from '../dashboard/EvidenceDrawer'
import { CORPUS } from '../data/metrics'

const PriceIntelligence = lazy(() => import('../dashboard/PriceIntelligence').then((m) => ({ default: m.PriceIntelligence })))
const VendorGraph = lazy(() => import('../dashboard/VendorGraph').then((m) => ({ default: m.VendorGraph })))
const PatternLab = lazy(() => import('../dashboard/PatternLab').then((m) => ({ default: m.PatternLab })))
const RiskStudio = lazy(() => import('../dashboard/RiskStudio').then((m) => ({ default: m.RiskStudio })))
const AskLedgerLens = lazy(() => import('../dashboard/AskLedgerLens').then((m) => ({ default: m.AskLedgerLens })))
const AnalyseYourData = lazy(() => import('../dashboard/AnalyseYourData').then((m) => ({ default: m.AnalyseYourData })))

const VIEWS = [
  { id: 'command', label: 'Command Center', icon: LayoutGrid },
  { id: 'register', label: 'Findings Register', icon: ListTree },
  { id: 'price', label: 'Price Intelligence', icon: Tag },
  { id: 'graph', label: 'Vendor Integrity', icon: Share2 },
  { id: 'patterns', label: 'Pattern Lab', icon: Activity },
  { id: 'risk', label: 'Risk Score Studio', icon: SlidersHorizontal },
  { id: 'ask', label: 'Ask LedgerLens', icon: MessageSquareCode },
  { id: 'upload', label: 'Analyse your data', icon: Upload },
] as const

function Loading() {
  return (
    <div className="flex h-72 items-center justify-center">
      <p className="kicker animate-pulse">Loading view…</p>
    </div>
  )
}

export function S06Product() {
  const { view, setView } = useStore()

  return (
    <section id="product" data-section="06" className="relative" style={{ paddingBlock: 'clamp(4rem, 9vh, 7rem)' }}>
      <div className="shell">
        <Reveal>
          <p className="kicker">06 — The product</p>
          <p className="mt-4 max-w-[46ch] text-[clamp(1.375rem,3vw,2rem)] leading-[1.15]" style={{ fontFamily: 'var(--font-display)' }}>
            This is running now. Click anything.
          </p>
        </Reveal>
      </div>

      <Reveal delay={0.06}>
        <div className="mt-10 px-[max(0px,calc((100vw-1720px)/2))]">
          <div id="app-chrome"
            className="mx-3 overflow-hidden border border-[var(--color-line)] bg-[var(--color-ink)] sm:mx-5">
            {/* title bar */}
            <div className="flex min-w-0 items-center gap-3 overflow-hidden border-b border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-2.5">
              <div className="flex shrink-0 gap-1.5" aria-hidden>
                {['var(--color-signal)', 'var(--color-gold)', 'var(--color-verify)'].map((c) => (
                  <Circle key={c} className="size-2.5" style={{ color: c }} strokeWidth={1.5} />
                ))}
              </div>
              <span className="num min-w-0 truncate text-[0.6875rem] text-[var(--color-paper-dim)]">LedgerLens — {CORPUS.client}</span>
              <span className="hidden shrink-0 font-mono text-[0.625rem] text-[var(--color-muted)] lg:inline">
                {CORPUS.windowLabel} · {CORPUS.invoices.toLocaleString('en-IN')} invoices · {CORPUS.vendors} vendors
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                <span className="inline-block size-1.5 rounded-full bg-[var(--color-verify)]" aria-hidden />
                <span className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-[var(--color-muted)]">Analysis complete</span>
              </span>
            </div>

            <Tabs.Root value={view} onValueChange={setView} orientation="vertical" className="flex min-w-0 flex-col lg:flex-row">
              {/* sidebar */}
              <Tabs.List
                aria-label="Application views"
                className="flex w-full min-w-0 gap-px overflow-x-auto border-b border-[var(--color-line)] bg-[var(--color-panel)] lg:w-56 lg:shrink-0 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r"
              >
                {VIEWS.map((v) => (
                  <Tabs.Trigger
                    key={v.id} value={v.id}
                    className={cn(
                      'group flex shrink-0 items-center gap-2.5 whitespace-nowrap px-4 py-3 text-left text-[0.75rem] transition-colors',
                      'text-[var(--color-muted)] hover:text-[var(--color-paper-dim)]',
                      'data-[state=active]:bg-[var(--color-ink)] data-[state=active]:text-[var(--color-paper)]',
                      'lg:border-l-2 lg:border-l-transparent data-[state=active]:lg:border-l-[var(--color-gold)]',
                    )}
                  >
                    <v.icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                    {v.label}
                  </Tabs.Trigger>
                ))}
                <div className="hidden flex-1 lg:block" />
                <div className="hidden border-t border-[var(--color-line)] px-4 py-3 lg:block">
                  <p className="font-mono text-[0.5625rem] uppercase leading-relaxed tracking-[0.1em] text-[var(--color-muted)]">
                    {CORPUS.detectors} detectors<br />{CORPUS.findings} findings<br />5 pillars
                    <br /><span className="text-[var(--color-verify)]">demo runs offline</span>
                  </p>
                </div>
              </Tabs.List>

              {/* content */}
              <div className="min-w-0 flex-1 bg-[var(--color-ink)] p-3 sm:p-4">
                <Tabs.Content value="command" className="outline-none"><CommandCenter /></Tabs.Content>
                <Tabs.Content value="register" className="outline-none">
                  <div className="h-[min(74vh,44rem)]"><Register /></div>
                </Tabs.Content>
                <Tabs.Content value="price" className="outline-none">
                  <Suspense fallback={<Loading />}><PriceIntelligence /></Suspense>
                </Tabs.Content>
                <Tabs.Content value="graph" className="outline-none">
                  <Suspense fallback={<Loading />}><VendorGraph /></Suspense>
                </Tabs.Content>
                <Tabs.Content value="patterns" className="outline-none">
                  <Suspense fallback={<Loading />}><PatternLab /></Suspense>
                </Tabs.Content>
                <Tabs.Content value="risk" className="outline-none">
                  <Suspense fallback={<Loading />}><RiskStudio /></Suspense>
                </Tabs.Content>
                <Tabs.Content value="ask" className="outline-none">
                  <Suspense fallback={<Loading />}><AskLedgerLens /></Suspense>
                </Tabs.Content>
                <Tabs.Content value="upload" className="outline-none">
                  <Suspense fallback={<Loading />}><AnalyseYourData /></Suspense>
                </Tabs.Content>
              </div>
            </Tabs.Root>
          </div>
        </div>
      </Reveal>

      <EvidenceDrawer />
    </section>
  )
}
