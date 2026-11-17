import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { ProfileEditor } from '@/components/profile/ProfileEditor'
import { SiteFooter } from '@/components/site/SiteFooter'
import { getOwnProfile } from '@/lib/server/data'
import { requirePageUser } from '@/lib/server/guards'

export const metadata: Metadata = { title: 'Set up your profile' }

export default async function ProfileSetupPage() {
  const user = await requirePageUser('/profile/setup')
  const profile = await getOwnProfile(user)
  if (!profile) redirect('/')
  if (profile.photo) redirect('/profile')
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 paper-grain" />
      <div className="relative mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="mb-8 text-center">
          <p className="font-hand text-2xl text-rose-deep">one quick thing before you enter</p>
          <h1 className="mt-1 font-display text-4xl text-ink sm:text-5xl">Set up your profile</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">
            Add your yearbook photograph. It will be linked permanently to {profile.rollNumber}.
          </p>
        </div>
        <ProfileEditor initial={profile} setup />
      </div>
      <SiteFooter className="relative" />
    </main>
  )
}
