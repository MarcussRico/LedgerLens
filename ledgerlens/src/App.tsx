import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as Toast from '@radix-ui/react-toast'
import { StoreProvider, useStore } from './lib/store'
import { Background } from './components/bg/Background'
import { TopBar, SyntheticBadge, SECTIONS } from './components/TopBar'
import { S01Hero } from './sections/S01Hero'
import { S02Stakes } from './sections/S02Stakes'
import { S04Ways } from './sections/S04Ways'
import { S05Root } from './sections/S05Root'
import { PresenterNotes } from './components/PresenterNotes'
import { useInjection, InjectionRig } from './components/Injection'

const S03Pipeline = lazy(() => import('./sections/S03Pipeline').then((m) => ({ default: m.S03Pipeline })))
const S06Product = lazy(() => import('./sections/S06Product').then((m) => ({ default: m.S06Product })))
const S07Engine = lazy(() => import('./sections/S07Engine').then((m) => ({ default: m.S07Engine })))
const S08Architecture = lazy(() => import('./sections/S08Architecture').then((m) => ({ default: m.S08Architecture })))
const S09Novelty = lazy(() => import('./sections/S09Novelty').then((m) => ({ default: m.S09Novelty })))
const S10Proof = lazy(() => import('./sections/S10Proof').then((m) => ({ default: m.S10Proof })))
const S11Impact = lazy(() => import('./sections/S11Impact').then((m) => ({ default: m.S11Impact })))
const S12Close = lazy(() => import('./sections/S12Close').then((m) => ({ default: m.S12Close })))

function Hold({ label }: { label: string }) {
  return (
    <div className="shell py-32">
      <p className="kicker">{label}</p>
      <div className="mt-6 h-px w-full bg-[var(--color-line)]" />
    </div>
  )
}

function Shell() {
  const { setSection, notes, setNotes } = useStore()
  const [dimBg, setDimBg] = useState(false)
  const inject = useInjection()
  const replayRef = useRef<() => void>(() => {})

  /* The constellation is the collusion graph, unlit. When the real graph
     arrives on screen this layer gets out of the way. */
  useEffect(() => {
    const el = document.getElementById('product')
    if (!el) return
    const io = new IntersectionObserver(([e]) => setDimBg(e.isIntersecting), { threshold: 0.08 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const jump = useCallback((n: number) => {
    const s = SECTIONS[n - 1]
    if (!s) return
    document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setSection(n)
  }, [setSection])

  /* Presenter controls. Live demo, projector, no mouse fumbling. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key >= '1' && e.key <= '9') { jump(Number(e.key)); return }
      const k = e.key.toLowerCase()
      if (k === 'f') { e.preventDefault(); inject() }
      else if (k === 'r') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('ll:replay-tickers'))
        replayRef.current()
      }
      else if (k === 'p') { e.preventDefault(); setNotes(!notes) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jump, inject, notes, setNotes])

  return (
    <>
      <Background dimConstellation={dimBg} />
      <TopBar onInject={inject} />
      <SyntheticBadge />
      <PresenterNotes />
      <InjectionRig />

      <main id="main" className="relative z-10">
        <S01Hero />
        <S02Stakes />
        <Suspense fallback={<Hold label="03 — Where the money leaks" />}><S03Pipeline /></Suspense>
        <S04Ways />
        <S05Root />
        <Suspense fallback={<Hold label="06 — The product" />}><S06Product /></Suspense>
        <Suspense fallback={<Hold label="07 — The detection engine" />}><S07Engine /></Suspense>
        <Suspense fallback={<Hold label="08 — How it works" />}><S08Architecture /></Suspense>
        <Suspense fallback={<Hold label="09 — Novelty" />}><S09Novelty /></Suspense>
        <Suspense fallback={<Hold label="10 — Proof and methodology" />}><S10Proof /></Suspense>
        <Suspense fallback={<Hold label="11 — Impact" />}><S11Impact /></Suspense>
        <Suspense fallback={<Hold label="12 — Coverage and close" />}><S12Close /></Suspense>
      </main>
    </>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Tooltip.Provider delayDuration={140} skipDelayDuration={300}>
        <Toast.Provider swipeDirection="right" duration={7000}>
          <Shell />
          <Toast.Viewport className="fixed bottom-6 right-6 z-[300] flex w-[min(26rem,calc(100vw-3rem))] flex-col gap-2 outline-none" />
        </Toast.Provider>
      </Tooltip.Provider>
    </StoreProvider>
  )
}
