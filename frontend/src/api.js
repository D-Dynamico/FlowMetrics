import { useEffect, useState } from 'react'

// Every block reads from the API through this one hook, so the loading and
// error states look the same everywhere and no component invents its own
// fetching. Paths are relative, which works unchanged in development (Vite
// proxies /api to uvicorn) and in the built app (FastAPI serves both).
export function useApi(path) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)

    fetch(path)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
        return response.json()
      })
      .then((json) => {
        if (!cancelled) setData(json)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })

    // Guards against a slow response for a previous order type landing after a
    // faster one for the current selection and overwriting it.
    return () => {
      cancelled = true
    }
  }, [path])

  return { data, error, loading: !data && !error }
}

// The order type toggle sends "all", which the API treats as no filter. Kept in
// one place so no caller has to remember the convention.
export function scopedPath(path, orderType) {
  if (orderType === 'all') return path
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}order_type=${orderType}`
}

// `/api/meta` never changes during a run and several blocks need it, so it is
// fetched once and shared. Without this each state dropdown would refetch the
// same payload.
let metaPromise = null

export function useMeta() {
  const [meta, setMeta] = useState(null)

  useEffect(() => {
    if (!metaPromise) {
      metaPromise = fetch('/api/meta').then((r) => r.json())
    }
    let cancelled = false
    metaPromise.then((json) => {
      if (!cancelled) setMeta(json)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return meta
}

// Nothing user-facing shows a bare two-letter code. The codes stay in the data
// and in every lookup key; only the label changes.
export function stateName(code, meta) {
  if (!code) return '—'
  const match = meta?.states?.find((s) => s.code === code)
  return match ? match.name : code
}

// Lanes arrive as "SP-RJ". Rendered as "São Paulo → Rio de Janeiro", with the
// arrow making the direction explicit — a hyphen reads as a pair, not a route.
export function laneName(lane, meta) {
  if (!lane) return '—'
  const [origin, destination] = lane.split('-')
  if (origin === destination) return `Within ${stateName(origin, meta)}`
  return `${stateName(origin, meta)} → ${stateName(destination, meta)}`
}

export const percent = (value, digits = 1) =>
  value == null ? '—' : `${(value * 100).toFixed(digits)}%`

export const number = (value) =>
  value == null ? '—' : value.toLocaleString('en-US')

export const days = (hours) => (hours == null ? '—' : `${(hours / 24).toFixed(1)} d`)
