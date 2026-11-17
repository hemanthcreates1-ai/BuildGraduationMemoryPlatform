import Image from 'next/image'

import { ModerateButton } from '@/components/admin/AdminActions'
import { getPayloadClient } from '@/lib/payload'
import { requirePageAdmin } from '@/lib/server/guards'

const person = (value: unknown) =>
  value && typeof value === 'object'
    ? ((value as { rollNumber?: string | null; username?: string }).rollNumber ??
      (value as { username?: string }).username)
    : String(value ?? 'unknown')

export default async function ContributionsPage() {
  const admin = await requirePageAdmin()
  const payload = await getPayloadClient()
  const [art, messages, signatures, photos] = await Promise.all([
    payload.find({
      collection: 'jersey-artworks',
      sort: '-createdAt',
      limit: 100,
      depth: 1,
      overrideAccess: false,
      user: admin,
    }),
    payload.find({
      collection: 'jersey-messages',
      sort: '-createdAt',
      limit: 100,
      depth: 1,
      overrideAccess: false,
      user: admin,
    }),
    payload.find({
      collection: 'signature-entries',
      sort: '-createdAt',
      limit: 100,
      depth: 1,
      overrideAccess: false,
      user: admin,
    }),
    payload.find({
      collection: 'memory-photos',
      sort: '-createdAt',
      limit: 100,
      depth: 1,
      overrideAccess: false,
      user: admin,
    }),
  ])
  const rows = [
    ...art.docs.map((doc) => ({
      type: 'Jersey drawing',
      collection: 'jersey-artworks',
      doc,
      target: person(doc.jerseyOwner),
      author: person(doc.contributor),
      preview: doc.url,
      text: '',
    })),
    ...messages.docs.map((doc) => ({
      type: 'Jersey message',
      collection: 'jersey-messages',
      doc,
      target: person(doc.jerseyOwner),
      author: person(doc.contributor),
      preview: null,
      text: doc.message,
    })),
    ...signatures.docs.map((doc) => ({
      type: 'Signature',
      collection: 'signature-entries',
      doc,
      target: person(doc.wallOwner),
      author: person(doc.contributor),
      preview: doc.url,
      text: '',
    })),
    ...photos.docs.map((doc) => ({
      type: 'Memory photo',
      collection: 'memory-photos',
      doc,
      target: 'Shared wall',
      author: person(doc.uploader),
      preview: doc.url,
      text: '',
    })),
  ].sort((a, b) => +new Date(b.doc.createdAt) - +new Date(a.doc.createdAt))
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <p className="font-hand text-2xl text-rose-deep">private attribution</p>
      <h1 className="font-display text-4xl">Contributions & moderation</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Contributor identities shown here never appear in student-facing APIs.
      </p>
      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ type, collection, doc, target, author, preview, text }) => (
          <article
            key={`${collection}-${doc.id}`}
            className="rounded-[1.5rem] border border-sand bg-paper p-5 shadow-paper"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold tracking-[0.14em] text-muted">
                {type.toUpperCase()}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs ${doc.status === 'removed' ? 'bg-blush text-rose-deep' : 'bg-linen text-moss'}`}
              >
                {doc.status}
              </span>
            </div>
            {preview && (
              <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-xl bg-linen">
                <Image
                  src={preview}
                  alt={`${type} preview`}
                  fill
                  sizes="33vw"
                  className="object-contain"
                />
              </div>
            )}
            {text && (
              <p className="mt-4 line-clamp-5 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                {text}
              </p>
            )}
            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-muted">Target</dt>
                <dd className="font-semibold">{target}</dd>
              </div>
              <div>
                <dt className="text-muted">Private contributor</dt>
                <dd className="font-semibold">{author}</dd>
              </div>
            </dl>
            <div className="mt-4 flex items-center justify-between">
              <time className="text-xs text-muted">{new Date(doc.createdAt).toLocaleString()}</time>
              {doc.status !== 'draft' && (
                <ModerateButton
                  collection={collection}
                  id={doc.id}
                  removed={doc.status === 'removed'}
                />
              )}
            </div>
          </article>
        ))}
      </div>
    </main>
  )
}
