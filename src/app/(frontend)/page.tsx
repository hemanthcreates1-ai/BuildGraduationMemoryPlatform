import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { BatchWall } from '@/components/batch/BatchWall'
import { AppHeader } from '@/components/site/AppHeader'
import { SiteFooter } from '@/components/site/SiteFooter'
import { ArrowRightIcon, PhotoIcon, ShirtIcon } from '@/components/ui/Icons'
import { EXPECTED_STUDENT_COUNT, TAGLINE } from '@/lib/constants'
import { getOwnProfile, getRoster } from '@/lib/server/data'
import { requirePageUser } from '@/lib/server/guards'

export const metadata: Metadata = { title: 'The Batch Wall' }

export default async function BatchWallPage() {
  const user = await requirePageUser('/')
  if (user.role === 'student' && !(await getOwnProfile(user))?.photo) redirect('/profile/setup')
  const roster = await getRoster(user)
  const roll = user.rollNumber

  return (
    <>
      <AppHeader user={user} section="batch" />
      <main className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] paper-grain" />
        <section className="relative mx-auto max-w-7xl px-4 pb-6 pt-10 sm:px-6 sm:pt-14">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="animate-rise">
              <p className="font-hand text-2xl text-rose-deep">experience 01</p>
              <h1 className="mt-1 font-display text-5xl font-medium tracking-tight text-ink sm:text-6xl">
                The Batch Wall
              </h1>
              <p className="mt-4 max-w-xl text-[0.72rem] font-semibold tracking-[0.26em] text-ink-soft">
                {TAGLINE}
              </p>
            </div>
            <div className="grid animate-rise grid-cols-2 gap-2 [animation-delay:100ms] sm:gap-3">
              {roll && (
                <>
                  <QuickLink
                    href={`/jersey/${roll}`}
                    icon={<ShirtIcon size={18} />}
                    label="My jersey"
                  />
                </>
              )}
              <QuickLink
                href="/memories"
                icon={<PhotoIcon size={18} />}
                label="Memory wall"
                accent
              />
            </div>
          </div>
          {user.role === 'admin' && roster.length !== EXPECTED_STUDENT_COUNT && (
            <p className="mt-6 rounded-2xl bg-blush px-4 py-3 text-sm text-ink">
              The roster currently has {roster.length} students; {EXPECTED_STUDENT_COUNT} are
              expected. Import pins.csv from the admin dashboard.
            </p>
          )}
        </section>

        <BatchWall roster={roster} viewerRoll={roll ?? null} />

        <section className="mx-auto mt-6 max-w-7xl px-4 sm:px-6">
          <Link
            href="/memories"
            className="group relative flex flex-col overflow-hidden rounded-[2rem] border border-sand/70 plaster px-7 py-10 shadow-paper sm:flex-row sm:items-center sm:justify-between sm:px-12"
          >
            <div className="relative">
              <p className="font-hand text-2xl text-rose-deep">experience 04</p>
              <h2 className="font-display text-3xl text-ink sm:text-4xl">The Memory Wall</h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-soft">
                One enormous wall of polaroids from all of us. Pin your photographs anywhere you
                like.
              </p>
            </div>
            <span className="relative mt-6 inline-flex items-center gap-2 self-start rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper transition group-hover:gap-3 sm:mt-0 sm:self-auto">
              Open the wall <ArrowRightIcon size={16} />
            </span>
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}

function QuickLink({
  href,
  icon,
  label,
  accent,
}: {
  href: string
  icon: React.ReactNode
  label: string
  accent?: boolean
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-2 rounded-2xl border px-3 py-3.5 text-center text-xs font-semibold tracking-wide transition hover:-translate-y-0.5 hover:shadow-paper sm:px-5 ${
        accent ? 'border-rose/50 bg-blush text-rose-deep' : 'border-sand/70 bg-paper text-ink-soft'
      }`}
    >
      {icon}
      {label}
    </Link>
  )
}
