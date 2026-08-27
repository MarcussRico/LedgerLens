import { useEffect, useRef, useState, useCallback } from 'react'
import { animate, utils } from 'animejs'

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/** Fires once when the element crosses into view. */
export function useInView<T extends Element>(margin = '-15% 0px', once = true) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true)
          if (once) io.disconnect()
        } else if (!once) setInView(false)
      },
      { rootMargin: margin, threshold: 0.01 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [margin, once])
  return [ref, inView] as const
}

/**
 * anime.js-driven number counter. Motion never counts; anime never lays out.
 * Returns a ref for the span plus a replay handle for the presenter `R` key.
 */
export function useCountUp(
  to: number,
  opts: { duration?: number; format: (n: number) => string; enabled: boolean; delay?: number },
) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const fromRef = useRef(0)
  const { duration = 1400, format, enabled, delay = 0 } = opts

  // Callers pass an inline formatter; holding it in a ref keeps the animation
  // from restarting on every parent render.
  const fmt = useRef(format)
  fmt.current = format
  const anim = useRef<ReturnType<typeof animate> | null>(null)

  const run = useCallback((from = 0, target = to) => {
    const el = ref.current
    if (!el) return
    anim.current?.pause()
    const state = { v: from }
    el.style.willChange = 'contents'
    anim.current = animate(state, {
      v: target,
      duration,
      delay,
      ease: 'outExpo',
      onUpdate: () => { if (ref.current) ref.current.textContent = fmt.current(state.v) },
      onComplete: () => { if (ref.current) { ref.current.textContent = fmt.current(target); ref.current.style.willChange = '' } },
    })
    fromRef.current = target
  }, [to, duration, delay])

  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = fmt.current(to); fromRef.current = to; return
    }
    run(0, to)
    return () => { anim.current?.pause() }
  }, [enabled, to, run])

  /** Count from the current value to a new target — used by the injection. */
  const retarget = useCallback((next: number) => run(fromRef.current, next), [run])

  return { ref, replay: () => run(0, to), retarget }
}

/** rAF-throttled pointer position within an element, in 0–1 space. */
export function usePointerEdge<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const move = (e: PointerEvent) => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const r = el.getBoundingClientRect()
        el.style.setProperty('--px', `${((e.clientX - r.left) / r.width) * 100}%`)
        el.style.setProperty('--py', `${((e.clientY - r.top) / r.height) * 100}%`)
      })
    }
    const enter = () => el.style.setProperty('--edge', '1')
    const leave = () => { el.style.setProperty('--edge', '0'); if (frame) cancelAnimationFrame(frame); frame = 0 }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerenter', enter)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerenter', enter)
      el.removeEventListener('pointerleave', leave)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])
  return ref
}

/** Draws an SVG path via stroke-dashoffset. */
export function drawPath(el: SVGGeometryElement, duration = 620, delay = 0) {
  const len = el.getTotalLength()
  utils.set(el, { strokeDasharray: len, strokeDashoffset: len })
  return animate(el, { strokeDashoffset: 0, duration, delay, ease: 'outExpo' })
}
