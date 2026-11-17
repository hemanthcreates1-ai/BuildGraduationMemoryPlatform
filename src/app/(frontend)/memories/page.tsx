import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { MemoryWall } from '@/components/memories/MemoryWall'
import { AppHeader } from '@/components/site/AppHeader'
import { getOwnProfile, getWallPhotos } from '@/lib/server/data'
import { requirePageUser } from '@/lib/server/guards'

export const metadata: Metadata = { title: 'The Memory Wall' }

export default async function MemoriesPage() {
  const user = await requirePageUser('/memories')
  if (user.role === 'student' && !(await getOwnProfile(user))?.photo) redirect('/profile/setup')
  const photos = await getWallPhotos(user)
  return (
    <>
      <AppHeader user={user} section="memories" />
      <main>
        <MemoryWall initial={photos} />
      </main>
    </>
  )
}
