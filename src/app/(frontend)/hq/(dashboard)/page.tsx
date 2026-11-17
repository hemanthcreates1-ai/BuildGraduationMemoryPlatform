import Link from 'next/link'

import { getPayloadClient } from '@/lib/payload'
import { requirePageAdmin } from '@/lib/server/guards'

export default async function AdminOverviewPage() {
  const admin = await requirePageAdmin()
  const payload = await getPayloadClient()
  const slugs = [
    'users',
    'profile-photos',
    'jersey-artworks',
    'jersey-messages',
    'signature-entries',
    'memory-photos',
  ] as const
  const counts = Object.fromEntries(
    await Promise.all(
      slugs.map(async (slug) => [
        slug,
        (await payload.count({ collection: slug, overrideAccess: false, user: admin })).totalDocs,
      ]),
    ),
  )
  const { docs: activity } = await payload.find({
    collection: 'activity-logs',
    sort: '-createdAt',
    limit: 12,
    depth: 0,
    overrideAccess: false,
    user: admin,
  })
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <p className="font-hand text-2xl text-rose-deep">private operations</p>
      <h1 className="font-display text-4xl">Administrator Dashboard</h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ['Students', Number(counts.users) - 1, '/hq/roster'],
          ['Profile photos', counts['profile-photos'], '/hq/roster'],
          ['Jersey drawings', counts['jersey-artworks'], '/hq/contributions'],
          ['Typed messages', counts['jersey-messages'], '/hq/contributions'],
          ['Signatures', counts['signature-entries'], '/hq/contributions'],
          ['Memory photos', counts['memory-photos'], '/hq/contributions'],
        ].map(([label, count, href]) => (
          <Link
            key={String(label)}
            href={String(href)}
            className="rounded-[1.5rem] border border-sand bg-paper p-6 shadow-paper transition hover:-translate-y-0.5"
          >
            <p className="text-xs font-semibold tracking-[0.16em] text-muted">{label}</p>
            <p className="mt-2 font-display text-4xl">{Number(count)}</p>
          </Link>
        ))}
      </div>
      <section className="mt-10 rounded-[1.5rem] border border-sand bg-paper p-6 shadow-paper">
        <h2 className="font-display text-2xl">Recent activity</h2>
        <div className="mt-4 divide-y divide-sand/60">
          {activity.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm"
            >
              <span className="font-semibold text-ink">{entry.event}</span>
              <span className="text-ink-soft">{entry.summary}</span>
              <span className="ml-auto text-xs text-muted">
                {new Date(entry.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
