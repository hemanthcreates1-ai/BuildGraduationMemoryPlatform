import type { Metadata } from 'next'
import { Suspense } from 'react'

import { LoginForm } from '@/components/auth/LoginForm'
import { LoginHero } from '@/components/auth/LoginHero'
import { SiteFooter } from '@/components/site/SiteFooter'
import { TAGLINE } from '@/lib/constants'

export const metadata: Metadata = { title: 'Sign in' }

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 paper-grain" />
      <div className="pointer-events-none absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-blush/70 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -right-32 h-[30rem] w-[30rem] rounded-full bg-beige blur-3xl" />

      <div className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:py-16">
        <section className="animate-rise text-center lg:text-left">
          <p className="font-hand text-2xl text-rose-deep">class memory archive</p>
          <h1 className="mt-2 font-display text-5xl font-medium leading-[0.95] tracking-[0.04em] text-ink sm:text-6xl lg:text-7xl">
            THE LAST
            <br />
            JERSEY
          </h1>
          <p className="mx-auto mt-5 max-w-md text-xs font-semibold leading-relaxed tracking-[0.26em] text-ink-soft lg:mx-0">
            {TAGLINE}
          </p>
          <div className="mt-8 hidden lg:block">
            <LoginHero />
          </div>
        </section>

        <section className="animate-rise [animation-delay:120ms]">
          <div className="mx-auto w-full max-w-md rounded-[2rem] border border-sand/70 bg-paper/90 p-7 shadow-lift backdrop-blur sm:p-9">
            <h2 className="font-display text-3xl text-ink">Welcome back</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Sign in with your roll number and the PIN shared with you to open the batch wall, the
              jerseys and the memory wall.
            </p>
            <div className="mt-7">
              <Suspense fallback={<div className="h-72" />}>
                <LoginForm />
              </Suspense>
            </div>
          </div>
          <div className="mt-8 lg:hidden">
            <LoginHero />
          </div>
        </section>
      </div>
      <SiteFooter className="relative" />
    </main>
  )
}
