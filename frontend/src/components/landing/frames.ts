/** Scroll-film assets (public/scroll/, built by scroll-src/tools/build_film.py). */
export const SCROLL_BASE = `${import.meta.env.BASE_URL}scroll/`
export const POSTER = `${SCROLL_BASE}poster.webp`

export type FrameSet = { count: number; width: number; height: number }
export type Chapter = { scene: number; startProgress: number; endProgress: number }
export type Manifest = { desktop: FrameSet; mobile: FrameSet; duration: number; chapters: Chapter[] }

export async function loadManifest(signal?: AbortSignal): Promise<Manifest> {
  const res = await fetch(`${SCROLL_BASE}manifest.json`, { signal })
  if (!res.ok) throw new Error(`manifest ${res.status}`)
  const m = (await res.json()) as Manifest
  if (!m?.desktop?.count || !m?.mobile?.count || !Array.isArray(m.chapters) || m.chapters.length === 0) throw new Error('bad manifest')
  return m
}

export const frameUrl = (kind: 'desktop' | 'mobile', i: number) => `${SCROLL_BASE}${kind}/f_${String(i).padStart(4, '0')}.webp`

/** 1, then every 8th, then every 4th, then every 2nd, then the rest — so any scroll position soon has a near frame. */
export function loadOrder(count: number): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  const add = (i: number) => {
    if (i >= 1 && i <= count && !seen.has(i)) {
      seen.add(i)
      out.push(i)
    }
  }
  add(1)
  for (const step of [8, 4, 2, 1]) for (let i = 1; i <= count; i += step) add(i)
  add(count)
  return out
}

/**
 * Progressive frame loader. `first()` resolves when frame 1 is decoded (or rejects); the rest stream in with
 * limited concurrency. `nearest(i)` returns the closest decoded frame to i.
 */
export class FrameLoader {
  private images: (HTMLImageElement | null)[]
  private loaded: boolean[]
  private cancelled = false
  private kind: 'desktop' | 'mobile'
  private count: number
  private onLoad: (i: number) => void
  private concurrency: number
  constructor(kind: 'desktop' | 'mobile', count: number, onLoad: (i: number) => void, concurrency = 6) {
    this.kind = kind
    this.count = count
    this.onLoad = onLoad
    this.concurrency = concurrency
    this.images = Array(count + 1).fill(null)
    this.loaded = Array(count + 1).fill(false)
  }

  private load(i: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.decoding = 'async'
      img.dataset.i = String(i)
      img.onload = () => {
        const done = () => {
          if (this.cancelled) return resolve()
          this.images[i] = img
          this.loaded[i] = true
          this.onLoad(i)
          resolve()
        }
        if (img.decode) img.decode().then(done, done)
        else done()
      }
      img.onerror = () => reject(new Error(`frame ${i}`))
      img.src = frameUrl(this.kind, i)
    })
  }

  /** Load frame 1, then everything else in the background. Rejects only if frame 1 fails. */
  async start(): Promise<void> {
    await this.load(1)
    const queue = loadOrder(this.count).slice(1)
    const worker = async () => {
      while (!this.cancelled && queue.length) {
        const i = queue.shift()!
        await this.load(i).catch(() => {}) // a missing frame just means the neighbour is drawn
      }
    }
    void Promise.all(Array.from({ length: this.concurrency }, worker))
  }

  nearest(i: number): HTMLImageElement | null {
    for (let d = 0; d <= this.count; d++) {
      if (i - d >= 1 && this.loaded[i - d]) return this.images[i - d]
      if (i + d <= this.count && this.loaded[i + d]) return this.images[i + d]
    }
    return null
  }

  cancel() {
    this.cancelled = true
  }
}
