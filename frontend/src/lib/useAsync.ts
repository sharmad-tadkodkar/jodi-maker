import { useCallback, useEffect, useState, type DependencyList } from 'react'

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
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
