import { useEffect, useRef, useState, type ReactNode } from 'react'

const FALLBACK_MS = 2500

/**
 * Scroll-reveal that can never leave a section blank:
 *  - renders visible by default (no JS / SSR / print / screenshots → visible);
 *  - JS only hides it when motion is allowed, IntersectionObserver exists and the element starts below the fold;
 *  - reveals at a low threshold (5%, 10% early margin), and a timer reveals it anyway if the observer never fires.
 */
export default function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'idle' | 'pending' | 'shown'>('idle')

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced || typeof IntersectionObserver === 'undefined') return
    if (el.getBoundingClientRect().top < window.innerHeight) return // already on screen: never hide it
    setState('pending')
    const show = () => setState('shown')
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && show(), {
      threshold: 0.05,
      rootMargin: '0px 0px 10% 0px',
    })
    io.observe(el)
    const t = setTimeout(show, FALLBACK_MS)
    return () => {
      io.disconnect()
      clearTimeout(t)
    }
  }, [])

  return (
    <div
      ref={ref}
      data-reveal={state}
      className={`transition-[opacity,translate] duration-500 ease-out data-[reveal=pending]:translate-y-3 data-[reveal=pending]:opacity-0 print:!translate-y-0 print:!opacity-100 ${className ?? ''}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}
