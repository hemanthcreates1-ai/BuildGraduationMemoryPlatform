'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { apiJson } from '@/lib/client/api'

import { LogoutIcon } from '../ui/Icons'

export function SignOutButton({
  redirectTo = '/login',
  compact = false,
}: {
  redirectTo?: string
  compact?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        await apiJson('/api/lj/auth/logout', 'POST')
        router.replace(redirectTo)
        router.refresh()
      }}
      className="inline-flex items-center gap-2 rounded-full border border-sand/80 bg-paper/80 px-3 py-1.5 text-sm text-ink-soft transition hover:border-rose hover:text-ink disabled:opacity-60"
    >
      <LogoutIcon size={16} />
      {compact ? (
        <span className="sr-only">Sign out</span>
      ) : (
        <span>{busy ? 'Signing out…' : 'Sign out'}</span>
      )}
    </button>
  )
}
