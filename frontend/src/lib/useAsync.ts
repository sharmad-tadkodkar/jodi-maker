import { useCallback, useEffect, useState, type DependencyList } from 'react'

/** For the hidden demo panel: the backend's detail if there is one, else the raw text. */
export function rawError(e: unknown): string {
  return apiDetail(e) ?? (e instanceof Error ? e.message : String(e))
}

// client.ts throws `Error("<METHOD> <path> → <status>: <body>")`; FastAPI bodies look like {"detail": "..."}.
const API_ERROR = /→ (\d{3}): ([\s\S]*)$/

/** HTTP status of a failed API call, if it was one. */
export function httpStatus(e: unknown): number | undefined {
  const m = e instanceof Error ? API_ERROR.exec(e.message) : null
  return m ? Number(m[1]) : undefined
}

/** The backend's `detail` message for a failed call (409s etc. are written for humans). */
export function apiDetail(e: unknown): string | undefined {
  const m = e instanceof Error ? API_ERROR.exec(e.message) : null
  if (!m) return undefined
  try {
    const d = JSON.parse(m[2]).detail
    return typeof d === 'string' ? d : undefined
  } catch {
    return undefined
  }
}

/**
 * What users see: always calm, never raw server text (FRONTEND_GUIDE). 403/409 carry a human-readable
 * `detail` ("The decision opens on Day 7…"), so those are shown; everything else gets a calm generic line.
 */
export function errorMessage(e: unknown): string {
  console.error(e)
  const status = httpStatus(e)
  const detail = apiDetail(e)
  if ((status === 403 || status === 409) && detail) return detail
  return e instanceof TypeError
    ? "Can't reach your matchmaker right now — check your connection and try again."
    : 'Your matchmaker hit a snag — please try again.'
}

/** Load data on mount (and whenever `deps` change). Stale responses are dropped. */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let live = true
    setLoading(true)
    setError(undefined)
    load()
      .then((d) => live && setData(d))
      .catch((e) => live && setError(errorMessage(e)))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { data, error, loading, reload, setData }
}
