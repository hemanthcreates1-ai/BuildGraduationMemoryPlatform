'use client'

import { useEffect } from 'react'

const KEY = 'tlj:last-session-refresh'
const DAY = 24 * 60 * 60 * 1000

/** Rolls the 30-day session forward at most once a day so regular visitors stay signed in. */
export function SessionKeeper() {
  useEffect(() => {
    try {
      const last = Number(window.localStorage.getItem(KEY) ?? '0')
      if (Date.now() - last < DAY) return
      window.localStorage.setItem(KEY, String(Date.now()))
    } catch {
      // storage unavailable (private mode) — refreshing occasionally is still fine
    }
    fetch('/api/lj/auth/refresh', { method: 'POST', credentials: 'same-origin' }).catch(
      () => undefined,
    )
  }, [])
  return null
}
