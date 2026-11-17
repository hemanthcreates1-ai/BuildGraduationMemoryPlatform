import Image from 'next/image'

import { ProfileAdminActions, UnlockButton } from '@/components/admin/AdminActions'
import { PortraitFallback } from '@/components/site/Avatar'
import { getPayloadClient } from '@/lib/payload'
import { requirePageAdmin } from '@/lib/server/guards'

export default async function AdminRosterPage() {
  const admin = await requirePageAdmin()
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'users',
    where: { role: { equals: 'student' } },
    sort: 'rosterOrder',
    limit: 200,
    depth: 1,
    overrideAccess: false,
    user: admin,
  })
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <p className="font-hand text-2xl text-rose-deep">all 84 classmates</p>
      <h1 className="font-display text-4xl">Profiles & roster</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Explicit photo assignment by roll number. Nothing is matched or guessed automatically.
      </p>
      <div className="mt-7 overflow-x-auto rounded-[1.5rem] border border-sand bg-paper shadow-paper">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-linen text-xs tracking-[0.12em] text-muted">
            <tr>
              <th className="p-4">PROFILE</th>
              <th>ROLL NUMBER</th>
              <th>LOGIN STATUS</th>
              <th>PHOTO MANAGEMENT</th>
              <th>ACCOUNT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand/60">
            {docs.map((student) => {
              const photo =
                student.profilePhoto && typeof student.profilePhoto === 'object'
                  ? student.profilePhoto
                  : null
              return (
                <tr key={student.id}>
                  <td className="p-3">
                    <div className="relative h-16 w-13 overflow-hidden rounded-lg bg-linen">
                      {photo?.url ? (
                        <Image
                          src={photo.url}
                          alt={`Portrait of ${student.rollNumber}`}
                          fill
                          sizes="52px"
                          className="object-cover"
                        />
                      ) : (
                        <PortraitFallback roll={student.rollNumber ?? '—'} />
                      )}
                    </div>
                  </td>
                  <td className="font-semibold tracking-[0.08em]">{student.rollNumber}</td>
                  <td>
                    <p>
                      {student.loginCount ? `${student.loginCount} login(s)` : 'Never logged in'}
                    </p>
                    <p className="text-xs text-muted">
                      {student.lastLoginAt ? new Date(student.lastLoginAt).toLocaleString() : '—'}
                    </p>
                  </td>
                  <td>
                    <ProfileAdminActions
                      roll={student.rollNumber ?? ''}
                      hasPhoto={Boolean(photo?.url)}
                    />
                  </td>
                  <td>
                    <UnlockButton id={student.id} roll={student.rollNumber ?? student.username} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </main>
  )
}
