import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CONTAINER } from '../../lib/layout'
import { CAPTIONS } from './captions'
import { FilmFallback } from './HowItWorks'
import { FrameLoader, loadManifest, POSTER, type Manifest } from './frames'

gsap.registerPlugin(ScrollTrigger)

const MOBILE_MAX = 767
const CTA_FROM = 0.93 // progress at which the closing CTA fades in (inside chapter 7)
const RISE = 16

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const kindFor = (): 'desktop' | 'mobile' => (window.innerWidth <= MOBILE_MAX ? 'mobile' : 'desktop')
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Opacity of chapter i at progress p: fade in over the first slice of its range, hold, fade out at the end.
 * The first chapter starts visible; the last one holds to the end. */
function chapterOpacity(p: number, i: number, ch: Manifest['chapters']): number {
  const { startProgress: a, endProgress: b } = ch[i]
  const fade = Math.min(0.03, (b - a) * 0.25)
  const fadeIn = i === 0 ? 1 : clamp01((p - a) / fade)
  const fadeOut = i === ch.length - 1 ? (p >= a ? 1 : 0) : clamp01((b - p) / fade)
  return p < a - fade || p > b + fade ? 0 : Math.min(fadeIn, fadeOut)
}

/**
 * Scroll-driven film: a 600vh section with a sticky full-viewport canvas. Scroll progress (GSAP ScrollTrigger,
 * scrub 0.5) picks one of ~180 frames from public/scroll/. The poster is the sticky container's CSS background,
 * so it's never blank while frames load. Falls back to a static list on reduced motion or load failure.
 */
export default function ScrollFilm({ cta }: { cta: { to: string; label: string } }) {
  const [fallback, setFallback] = useState(prefersReducedMotion)
  const [manifest, setManifest] = useState<Manifest>()
  const [kind, setKind] = useState<'desktop' | 'mobile'>(() => (typeof window === 'undefined' ? 'desktop' : kindFor()))
  const section = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const captions = useRef<(HTMLDivElement | null)[]>([])
  const dots = useRef<(HTMLSpanElement | null)[]>([])
  const ctaRef = useRef<HTMLDivElement>(null)

  // Manifest (or fall back)
  useEffect(() => {
    if (fallback) return
    const ac = new AbortController()
    loadManifest(ac.signal).then(setManifest, (e) => !ac.signal.aborted && (console.warn('scroll film:', e), setFallback(true)))
    return () => ac.abort()
  }, [fallback])

  // Desktop ↔ mobile frame set when the viewport crosses 768px (resize, orientation change)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`)
    const onChange = () => setKind(kindFor())
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Lenis smooth scrolling, synced with ScrollTrigger. Skipped on touch (native momentum is better there).
  useEffect(() => {
    if (fallback || window.matchMedia('(pointer: coarse)').matches) return
    const lenis = new Lenis({ autoRaf: false, lerp: 0.12 })
    lenis.on('scroll', ScrollTrigger.update)
    const tick = (t: number) => lenis.raf(t * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    return () => {
      gsap.ticker.remove(tick)
      gsap.ticker.lagSmoothing(500, 33)
      lenis.destroy()
    }
  }, [fallback])

  // Frames + scroll → draw
  useEffect(() => {
    if (fallback || !manifest || !section.current || !stage.current || !canvas.current) return
    const set = manifest[kind]
    const cv = canvas.current
    const ctx2d = cv.getContext('2d')
    if (!ctx2d) return setFallback(true)
    const st = stage.current
    let target = 1
    let drawn: HTMLImageElement | null = null
    let drawnIndex = 0
    let raf = 0

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = st.clientWidth
      const h = st.clientHeight
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr)
        cv.height = Math.round(h * dpr)
        drawn = null // force redraw at the new size
      }
    }
    const draw = () => {
      raf = 0
      const img = loader.nearest(target)
      if (!img || (img === drawn && cv.width)) return
      const cw = cv.width
      const ch = cv.height
      const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight) // cover
      const w = img.naturalWidth * s
      const h = img.naturalHeight * s
      ctx2d.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h)
      drawn = img
      drawnIndex = Number(img.dataset.i)
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(draw)
    }

    const loader = new FrameLoader(kind, set.count, (i) => {
      // a frame closer to the target than the one on screen → redraw
      if (!drawn || Math.abs(i - target) < Math.abs(drawnIndex - target)) schedule()
    })
    const render = (p: number) => {
      const next = 1 + Math.round(p * (set.count - 1))
      if (next !== target) {
        target = next
        schedule()
      }
      manifest.chapters.forEach((_, i) => {
        const el = captions.current[i]
        if (!el) return
        const o = chapterOpacity(p, i, manifest.chapters)
        el.style.opacity = String(o)
        el.style.transform = `translate3d(0, ${(1 - o) * RISE}px, 0)`
        el.style.visibility = o > 0.001 ? 'visible' : 'hidden'
        const dot = dots.current[i]
        if (dot) {
          const passed = p >= manifest.chapters[i].startProgress
          const current = passed && (i === manifest.chapters.length - 1 || p < manifest.chapters[i + 1].startProgress)
          dot.dataset.state = current ? 'current' : passed ? 'passed' : 'ahead'
        }
      })
      if (ctaRef.current) {
        const o = clamp01((p - CTA_FROM) / 0.04)
        ctaRef.current.style.opacity = String(o)
        ctaRef.current.style.transform = `translate3d(0, ${(1 - o) * RISE}px, 0)`
        ctaRef.current.style.pointerEvents = o > 0.5 ? 'auto' : 'none'
      }
    }

    size()
    render(0)
    const ro = new ResizeObserver(() => {
      size()
      schedule()
    })
    ro.observe(st)

    const state = { p: 0 }
    const gctx = gsap.context(() => {
      gsap.to(state, {
        p: 1,
        ease: 'none',
        onUpdate: () => render(state.p),
        scrollTrigger: { trigger: section.current, start: 'top top', end: 'bottom bottom', scrub: 0.5, invalidateOnRefresh: true },
      })
    }, section)

    let alive = true
    loader.start().then(
      () => alive && (schedule(), ScrollTrigger.refresh()),
      (e) => alive && (console.warn('scroll film:', e), setFallback(true)),
    )

    return () => {
      alive = false
      loader.cancel()
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
      gctx.revert() // kills the tween + ScrollTrigger: nothing left behind on route change
    }
  }, [fallback, manifest, kind])

  if (fallback) {
    return (
      <section aria-label="How Jodi works" className={CONTAINER}>
        <FilmFallback />
      </section>
    )
  }

  const chapters = manifest?.chapters ?? CAPTIONS.map((_, i) => ({ scene: i + 1, startProgress: i / 7, endProgress: (i + 1) / 7 }))

  return (
    <section ref={section} aria-label="How Jodi works" className="relative" style={{ height: '600vh' }}>
      <div
        ref={stage}
        className="sticky top-0 h-[100svh] w-full overflow-hidden bg-cream bg-cover bg-center"
        style={{ backgroundImage: `url(${POSTER})` }}
      >
        <canvas ref={canvas} aria-hidden className="absolute inset-0 size-full" />

        {/* soft ivory scrim behind the captions: bottom third (desktop) / bottom (mobile) */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-cream via-cream/80 to-transparent md:h-[42%]" />

        <div className="absolute inset-x-0 bottom-0 px-6 pb-28 md:px-12 md:pb-16 lg:px-20">
          <div className="mx-auto max-w-6xl">
            <div className="relative">
            {CAPTIONS.map((c, i) => (
              <div
                key={c.eyebrow}
                ref={(el) => {
                  captions.current[i] = el
                }}
                className="absolute inset-x-0 bottom-0 will-change-[opacity,transform]"
                style={{ opacity: i === 0 ? 1 : 0, visibility: i === 0 ? 'visible' : 'hidden' }}
              >
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-gold-700">{c.eyebrow}</p>
                <p className="max-w-3xl font-display text-[clamp(28px,4.2vw,52px)] leading-[1.12] text-ink">{c.text}</p>
              </div>
            ))}
            {/* reserve height for the tallest caption so the block doesn't collapse */}
            <div aria-hidden className="invisible">
              <p className="mb-2 text-xs">&nbsp;</p>
              <p className="max-w-3xl font-display text-[clamp(28px,4.2vw,52px)] leading-[1.12]">{CAPTIONS[2].text}</p>
            </div>
            </div>
            <div ref={ctaRef} className="mt-6" style={{ opacity: 0, pointerEvents: 'none' }}>
              <Link
                to={cta.to}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-brand-600 px-7 text-sm font-medium text-white shadow-lg hover:bg-brand-700"
              >
                Meet your matchmaker
              </Link>
            </div>
          </div>
        </div>

        {/* progress rail: right edge (desktop), top (mobile, below the header) */}
        <ol
          aria-label="Chapters"
          className="absolute top-[72px] left-1/2 flex -translate-x-1/2 gap-2 md:top-1/2 md:right-6 md:left-auto md:translate-x-0 md:-translate-y-1/2 md:flex-col md:gap-3"
        >
          <span aria-hidden className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-ink/15 md:top-0 md:left-1/2 md:h-full md:w-px md:-translate-x-1/2 md:translate-y-0" />
          {chapters.map((c, i) => (
            <li key={c.scene} className="relative">
              <span
                ref={(el) => {
                  dots.current[i] = el
                }}
                data-state={i === 0 ? 'current' : 'ahead'}
                className="block size-2.5 rounded-full border border-brand-600/60 bg-cream transition-all duration-300 data-[state=current]:scale-125 data-[state=current]:bg-brand-600 data-[state=passed]:bg-brand-600/70"
              />
              <span className="sr-only">{CAPTIONS[i].eyebrow}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
