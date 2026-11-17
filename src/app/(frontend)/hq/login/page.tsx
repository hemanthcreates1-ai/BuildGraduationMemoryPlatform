import type { Metadata } from 'next'
import { Suspense } from 'react'

import { LoginForm } from '@/components/auth/LoginForm'
import { SiteFooter } from '@/components/site/SiteFooter'
import { ShieldIcon } from '@/components/ui/Icons'

export const metadata: Metadata = { title: 'Administrator sign in' }

export default function AdminLoginPage() {
  return (
    <main className="relative flex min-h-screen flex-col bg-linen">
      <div className="pointer-events-none absolute inset-0 paper-grain" />
      <div className="relative flex flex-1 items-center justify-center px-5 py-16">
        <div className="w-full max-w-md animate-rise rounded-[2rem] border border-sand bg-paper p-8 shadow-lift sm:p-10">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-paper">
            <ShieldIcon size={22} />
          </span>
          <h1 className="mt-5 font-display text-3xl text-ink">Administrator</h1>
          <p className="mt-2 text-sm text-ink-soft">THE LAST JERSEY · private dashboard</p>
          <div className="mt-8">
            <Suspense fallback={<div className="h-72" />}>
              <LoginForm variant="admin" />
            </Suspense>
          </div>
        </div>
      </div>
      <SiteFooter className="relative" />
    </main>
  )
}
