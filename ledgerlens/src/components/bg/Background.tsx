import { useEffect, useRef } from 'react'
import { motion, useScroll, useSpring, useTransform } from 'motion/react'
import { makeRng } from '../../lib/utils'
import { useReducedMotion } from '../../lib/hooks'

/* Three fixed layers. Together they must stay under ~4% CPU at idle. */

/** Layer 1 — the accounting paper the whole site is printed on. */
function LedgerGrid() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        backgroundImage: `
          repeating-linear-gradient(to bottom, color-mix(in oklab, var(--color-line-soft) 40%, transparent) 0 1px, transparent 1px 32px),
          repeating-linear-gradient(to right, color-mix(in oklab, var(--color-line-soft) 20%, transparent) 0 1px, transparent 1px calc(100% / 12))
        `,
        backgroundSize: '100% 32px, min(1440px, 100%) 100%',
        backgroundPosition: 'center top, center top',
        backgroundRepeat: 'repeat, repeat-y',
      }}
    />
  )
}

/**
 * Layer 2 — the constellation. This is a visual echo of the vendor-collusion
 * graph: the same object, unlit. It fades out when the real graph takes over.
 */
function Constellation({ dimmed }: { dimmed: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const rng = makeRng(0x1ED9E70)
    const N = 44
    const nodes = Array.from({ length: N }, () => ({
      bx: rng(), by: rng(),
      ax: 0.02 + rng() * 0.05, ay: 0.02 + rng() * 0.05,
      px: rng() * Math.PI * 2, py: rng() * Math.PI * 2,
      sx: 0.00006 + rng() * 0.00012, sy: 0.00006 + rng() * 0.00012,
    }))

    let w = 0, h = 0, dpr = 1
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth; h = canvas.clientHeight
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const pts = new Array(N).fill(0).map(() => ({ x: 0, y: 0 }))
    let raf = 0
    let last = 0

    const frame = (t: number) => {
      // 30fps is plenty for a 5.5%-opacity layer and halves its cost
      if (t - last < 33) { raf = requestAnimationFrame(frame); return }
      last = t
      ctx.clearRect(0, 0, w, h)
      for (let i = 0; i < N; i++) {
        const n = nodes[i]
        pts[i].x = (n.bx + n.ax * Math.sin(t * n.sx + n.px)) * w
        pts[i].y = (n.by + n.ay * Math.cos(t * n.sy + n.py)) * h
      }
      ctx.lineWidth = 0.5
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y
          const d2 = dx * dx + dy * dy
          if (d2 > 180 * 180) continue
          const a = 1 - Math.sqrt(d2) / 180
          ctx.strokeStyle = `rgba(107,131,148,${(a * 0.85).toFixed(3)})`
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke()
        }
      }
      ctx.fillStyle = '#E9E5DC'
      for (let i = 0; i < N; i++) {
        ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 1.5, 0, Math.PI * 2); ctx.fill()
      }
      raf = requestAnimationFrame(frame)
    }

    if (reduced) frame(0) // one static frame, no loop
    else raf = requestAnimationFrame(frame)

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [reduced])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      style={{
        opacity: dimmed ? 0 : 0.055,
        transition: 'opacity 900ms cubic-bezier(0.22,1,0.36,1)',
      }}
    />
  )
}

/** Layer 3 — the scroll wash. It carries the narrative arc, not decoration. */
function ScrollWash() {
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll()
  const p = useSpring(scrollYProgress, { stiffness: 60, damping: 24, restDelta: 0.001 })

  const colour = useTransform(p, [0, 0.2, 0.45, 0.75, 1], [
    'rgba(107,131,148,0.028)',   // the problem, unlit
    'rgba(107,131,148,0.032)',
    'rgba(196,80,58,0.040)',     // the leakage
    'rgba(201,162,39,0.050)',    // the money found
    'rgba(91,143,110,0.040)',    // proof and resolution
  ])
  const y = useTransform(p, [0, 1], ['-6%', '10%'])
  const bg = useTransform(colour, (c) => `radial-gradient(78% 58% at 50% 38%, ${c}, transparent 72%)`)

  if (reduced) {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0"
        style={{ background: 'radial-gradient(75% 55% at 50% 40%, rgba(201,162,39,0.04), transparent 70%)' }} />
    )
  }

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        y,
        background: bg,
      }}
    />
  )
}

/** Grain. This is what stops a dark site reading as flat plastic. */
function Grain() {
  return (
    <svg aria-hidden className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      style={{ opacity: 0.025, mixBlendMode: 'overlay' }}>
      <filter id="ll-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#ll-grain)" />
    </svg>
  )
}

export function Background({ dimConstellation }: { dimConstellation: boolean }) {
  return (
    <>
      <LedgerGrid />
      <Constellation dimmed={dimConstellation} />
      <ScrollWash />
      <Grain />
      {/* vignette — keeps the edges from glowing on a projector */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0"
        style={{ background: 'radial-gradient(120% 90% at 50% 30%, transparent 55%, rgba(0,0,0,0.45))' }} />
    </>
  )
}
