import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { JerseyMessages } from '@/components/jersey/JerseyMessages'
import { JerseyStudio } from '@/components/jersey/JerseyStudio'
import { AppHeader } from '@/components/site/AppHeader'
import { Avatar } from '@/components/site/Avatar'
import { SiteFooter } from '@/components/site/SiteFooter'
import {
  getJerseyLayers,
  getJerseyMessages,
  getOwnProfile,
  getStudentByRoll,
} from '@/lib/server/data'
import { requirePageUser } from '@/lib/server/guards'

type Props = { params: Promise<{ roll: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { roll } = await params
  return { title: `${decodeURIComponent(roll).toUpperCase()}'s Jersey` }
}

export default async function JerseyPage({ params }: Props) {
  const { roll } = await params
  const user = await requirePageUser(`/jersey/${roll}`)
  if (user.role === 'student' && !(await getOwnProfile(user))?.photo) redirect('/profile/setup')
  const student = await getStudentByRoll(user, roll)
  if (!student) notFound()
  const [layers, messages] = await Promise.all([
    getJerseyLayers(user, student.id),
    getJerseyMessages(user, student.id),
  ])

  return (
    <>
      <AppHeader user={user} section="jersey" />
      <main className="mx-auto max-w-7xl overflow-x-hidden px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex items-center gap-4">
          <Avatar roll={student.rollNumber} photo={student.photo} size={54} />
          <div className="min-w-0">
            <p className="font-hand text-xl text-rose-deep">experience 02</p>
            <h1 className="break-words font-display text-3xl text-ink sm:text-4xl">
              {student.rollNumber}&apos;s Last Jersey
            </h1>
          </div>
          <span className="ml-auto hidden rounded-full border border-sand bg-paper px-4 py-2 text-xs text-muted sm:block">
            {layers.length} permanent ink {layers.length === 1 ? 'layer' : 'layers'}
          </span>
        </div>
        <JerseyStudio roll={student.rollNumber} layers={layers} />
        <JerseyMessages roll={student.rollNumber} initial={messages} />
      </main>
      <SiteFooter />
    </>
  )
}
