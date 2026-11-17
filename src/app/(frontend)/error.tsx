'use client'

import Link from 'next/link'
import { useEffect } from 'react'

import { SignOutButton } from '@/components/site/SignOutButton'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="max-w-md rounded-[2rem] border border-sand bg-paper p-9 text-center shadow-paper">
        <p className="font-hand text-2xl text-rose-deep">oh no</p>
        <h1 className="mt-1 font-display text-3xl text-ink">Something went wrong</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          This page couldn&apos;t load right now. Your contributions are safe — they are stored on
          the server.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full border border-sand px-5 py-2.5 text-sm text-ink-soft"
          >
            Batch wall
          </Link>
          <SignOutButton />
        </div>
      </div>
    </main>
  )
}
