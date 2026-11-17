import type { Metadata } from 'next'

import { ProfileEditor } from '@/components/profile/ProfileEditor'
import { AppHeader } from '@/components/site/AppHeader'
import { SiteFooter } from '@/components/site/SiteFooter'
import { getOwnProfile } from '@/lib/server/data'
import { requirePageUser } from '@/lib/server/guards'
import { notFound } from 'next/navigation'

export const metadata: Metadata = { title: 'My Profile' }

export default async function ProfilePage() {
  const user = await requirePageUser('/profile')
  const profile = await getOwnProfile(user)
  if (!profile) notFound()
  return (
    <>
      <AppHeader user={user} section="profile" />
      <main className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 paper-grain" />
        <p className="font-hand text-2xl text-rose-deep">your place in the yearbook</p>
        <h1 className="font-display text-4xl text-ink sm:text-5xl">My Profile</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Choose how you appear across the Batch Wall and your personal memory spaces.
        </p>
        <div className="mt-8">
          <ProfileEditor initial={profile} />
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
