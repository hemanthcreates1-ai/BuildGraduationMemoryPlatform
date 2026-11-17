'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { apiJson } from '@/lib/client/api'

import { ArrowRightIcon, EyeIcon, LockIcon } from '../ui/Icons'

function safeNext(value: string | null, fallback: string) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/api'))
    return fallback
  return value
}

export function LoginForm({ variant = 'student' }: { variant?: 'student' | 'admin' }) {
  const router = useRouter()
  const params = useSearchParams()
  const [username, setUsername] = useState('')
  const [secret, setSecret] = useState('')
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isAdmin = variant === 'admin'

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!username.trim() || !secret.trim()) {
      setError(
        isAdmin
          ? 'Enter the administrator username and password.'
          : 'Enter your roll number and PIN.',
      )
      return
    }
    setBusy(true)
    const result = await apiJson<{ role: string; redirect: string; needsProfile: boolean }>(
      '/api/lj/auth/login',
      'POST',
      {
        username: username.trim(),
        secret,
      },
    )
    if (!result.ok) {
      setBusy(false)
      setError(result.error)
      return
    }
    const destination =
      result.role === 'admin'
        ? safeNext(params.get('next'), '/hq')
        : result.needsProfile
          ? '/profile/setup'
          : safeNext(params.get('next'), '/')
    router.replace(destination.startsWith('/hq') && result.role !== 'admin' ? '/' : destination)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <label htmlFor="username" className="text-xs font-semibold tracking-[0.18em] text-muted">
          {isAdmin ? 'USERNAME' : 'ROLL NUMBER'}
        </label>
        <input
          id="username"
          name="username"
          value={username}
          onChange={(event) =>
            setUsername(isAdmin ? event.target.value : event.target.value.toUpperCase())
          }
          autoComplete="username"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder={isAdmin ? 'Administrator username' : 'e.g. 23X51A05H0'}
          className="w-full rounded-2xl border border-sand bg-paper px-4 py-3.5 font-display text-lg tracking-[0.12em] text-ink outline-none transition placeholder:font-sans placeholder:text-base placeholder:tracking-normal placeholder:text-taupe focus:border-rose-deep focus:ring-4 focus:ring-blush"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="secret" className="text-xs font-semibold tracking-[0.18em] text-muted">
          {isAdmin ? 'PASSWORD' : 'YOUR PIN'}
        </label>
        <div className="relative">
          <input
            id="secret"
            name="secret"
            type={reveal ? 'text' : 'password'}
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            autoComplete="current-password"
            inputMode={isAdmin ? 'text' : 'numeric'}
            placeholder={isAdmin ? 'Password' : 'PIN shared with you'}
            className="w-full rounded-2xl border border-sand bg-paper px-4 py-3.5 pr-12 text-lg tracking-[0.2em] text-ink outline-none transition placeholder:text-base placeholder:tracking-normal placeholder:text-taupe focus:border-rose-deep focus:ring-4 focus:ring-blush"
          />
          <button
            type="button"
            onClick={() => setReveal((value) => !value)}
            className="absolute inset-y-0 right-2 my-auto h-9 w-9 rounded-full text-muted transition hover:bg-beige hover:text-ink"
            aria-label={reveal ? 'Hide' : 'Show'}
            aria-pressed={reveal}
          >
            <EyeIcon size={18} className="mx-auto" />
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-blush px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-4 text-sm font-semibold tracking-[0.16em] text-paper shadow-lift transition hover:bg-[#3a302a] disabled:opacity-60"
      >
        {busy ? 'OPENING…' : isAdmin ? 'SIGN IN' : 'ENTER THE ARCHIVE'}
        {!busy && <ArrowRightIcon size={18} className="transition group-hover:translate-x-0.5" />}
      </button>
      <p className="flex items-center justify-center gap-2 text-xs text-muted">
        <LockIcon size={14} />
        {isAdmin
          ? 'Restricted area. Every sign-in is logged.'
          : 'Private to our batch. Forgot your PIN? Ask the batch admin.'}
      </p>
    </form>
  )
}
