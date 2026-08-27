import { createContext, useContext, useMemo, useState, useCallback, type ReactNode } from 'react'
import { TOTAL_IDENTIFIED, CORPUS } from '../data/metrics'
import { HERO_PAIR } from '../data/invoices'

export type InjectPhase = 'idle' | 'incoming' | 'scanning' | 'flagged' | 'alerted'

interface Store {
  phase: InjectPhase
  setPhase: (p: InjectPhase) => void
  statusLine: string
  setStatusLine: (s: string) => void
  injected: boolean
  total: number
  findingCount: number
  reset: () => void
  commitInjection: () => void
  view: string
  setView: (v: string) => void
  selectedFinding: string | null
  openFinding: (id: string | null) => void
  notes: boolean
  setNotes: (v: boolean) => void
  section: number
  setSection: (n: number) => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<InjectPhase>('idle')
  const [statusLine, setStatusLine] = useState('')
  const [injected, setInjected] = useState(false)
  const [view, setView] = useState('command')
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null)
  const [notes, setNotes] = useState(false)
  const [section, setSection] = useState(1)

  const reset = useCallback(() => {
    setPhase('idle'); setStatusLine(''); setInjected(false)
  }, [])
  const commitInjection = useCallback(() => setInjected(true), [])

  const value = useMemo<Store>(() => ({
    phase, setPhase, statusLine, setStatusLine,
    injected,
    total: injected ? TOTAL_IDENTIFIED + HERO_PAIR.amount : TOTAL_IDENTIFIED,
    findingCount: injected ? CORPUS.findings + 1 : CORPUS.findings,
    reset, commitInjection,
    view, setView,
    selectedFinding, openFinding: setSelectedFinding,
    notes, setNotes, section, setSection,
  }), [phase, statusLine, injected, reset, commitInjection, view, selectedFinding, notes, section])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const c = useContext(Ctx)
  if (!c) throw new Error('useStore must be used inside StoreProvider')
  return c
}
