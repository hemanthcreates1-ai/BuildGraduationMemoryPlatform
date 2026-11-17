import Link from 'next/link'

import { SystemActions } from '@/components/admin/AdminActions'
import { getPayloadClient } from '@/lib/payload'
import { requirePageAdmin } from '@/lib/server/guards'

export default async function SystemPage() {
  const admin = await requirePageAdmin()
  const payload = await getPayloadClient()
  const [activity, uploads, moderation, backups] = await Promise.all([
    payload.find({
      collection: 'activity-logs',
      sort: '-createdAt',
      limit: 50,
      depth: 0,
      overrideAccess: false,
      user: admin,
    }),
    payload.find({
      collection: 'upload-records',
      sort: '-createdAt',
      limit: 50,
      depth: 0,
      overrideAccess: false,
      user: admin,
    }),
    payload.find({
      collection: 'moderation-records',
      sort: '-createdAt',
      limit: 50,
      depth: 0,
      overrideAccess: false,
      user: admin,
    }),
    payload.find({
      collection: 'backups',
      sort: '-createdAt',
      limit: 20,
      depth: 0,
      overrideAccess: false,
      user: admin,
    }),
  ])
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <p className="font-hand text-2xl text-rose-deep">operations</p>
      <h1 className="font-display text-4xl">System, logs & backups</h1>
      <div className="mt-8">
        <SystemActions />
      </div>
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Log
          title="Activity log"
          docs={activity.docs}
          fields={['event', 'actorLabel', 'summary']}
        />
        <Log
          title="Upload history & failures"
          docs={uploads.docs}
          fields={['kind', 'status', 'reason']}
        />
        <Log
          title="Moderation records"
          docs={moderation.docs}
          fields={['action', 'targetLabel', 'moderatorLabel']}
        />
        <section className="rounded-[1.5rem] border border-sand bg-paper p-6 shadow-paper">
          <h2 className="font-display text-2xl">Stored backups</h2>
          <div className="mt-4 space-y-3">
            {backups.docs.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl bg-linen p-3 text-sm"
              >
                <span>{item.label}</span>
                {item.url && (
                  <Link href={item.url} className="font-semibold text-rose-deep">
                    Download
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

function Log({ title, docs, fields }: { title: string; docs: object[]; fields: string[] }) {
  return (
    <section className="rounded-[1.5rem] border border-sand bg-paper p-6 shadow-paper">
      <h2 className="font-display text-2xl">{title}</h2>
      <div className="mt-4 max-h-[32rem] divide-y divide-sand/60 overflow-auto">
        {docs.map((value) => {
          const item = value as Record<string, unknown>
          return (
            <div key={String(item.id)} className="py-3 text-xs">
              <div className="flex flex-wrap gap-2">
                {fields.map((field) => (
                  <span key={field} className="rounded bg-linen px-2 py-1">
                    {String(item[field] ?? '—')}
                  </span>
                ))}
              </div>
              <time className="mt-1 block text-muted">
                {new Date(String(item.createdAt)).toLocaleString()}
              </time>
            </div>
          )
        })}
      </div>
    </section>
  )
}
