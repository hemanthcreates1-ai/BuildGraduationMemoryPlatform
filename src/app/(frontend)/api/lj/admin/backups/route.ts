import { randomUUID } from 'node:crypto'

import type { CollectionSlug } from 'payload'

import { getPayloadClient } from '@/lib/payload'
import { logActivity, recordUpload } from '@/lib/server/activity'
import { actorLabel, requireAdmin } from '@/lib/server/guards'
import { assertSameOrigin, errorResponse, json } from '@/lib/server/http'

const SNAPSHOT_COLLECTIONS: CollectionSlug[] = [
  'users',
  'profile-photos',
  'jersey-artworks',
  'jersey-messages',
  'signature-entries',
  'memory-photos',
  'memory-photo-sources',
  'moderation-records',
  'upload-records',
  'activity-logs',
]

/**
 * Creates a JSON snapshot of every record (contributors included, password hashes excluded)
 * and stores it privately in object storage. Files themselves stay in object storage; the
 * snapshot records each file's name and URL so everything can be re-linked.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    const admin = await requireAdmin()
    const payload = await getPayloadClient()
    const collections: Record<string, unknown[]> = {}
    const counts: Record<string, number> = {}
    for (const slug of SNAPSHOT_COLLECTIONS) {
      const result = await payload.find({
        collection: slug,
        pagination: false,
        depth: 0,
        sort: 'createdAt',
        overrideAccess: false,
        user: admin,
        ...(slug === 'activity-logs' ? { limit: 20000, pagination: true } : {}),
      })
      collections[slug] = result.docs
      counts[slug] = result.docs.length
    }
    const snapshot = {
      app: 'the-last-jersey',
      format: 1,
      createdAt: new Date().toISOString(),
      createdBy: actorLabel(admin),
      note: 'Password hashes and sessions are never included. Re-import credentials from pins.csv.',
      counts,
      collections,
    }
    const data = Buffer.from(JSON.stringify(snapshot))
    const label = `Backup ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`
    const doc = await payload.create({
      collection: 'backups',
      data: { label, createdBy: admin.id, createdByLabel: actorLabel(admin), counts },
      file: {
        data,
        mimetype: 'application/json',
        name: `the-last-jersey-backup-${randomUUID()}.json`,
        size: data.length,
      },
      overrideAccess: false,
      user: admin,
      depth: 0,
    })
    recordUpload({
      kind: 'backup',
      status: 'success',
      file: { name: doc.filename ?? 'backup.json', type: 'application/json', size: data.length },
      actor: admin,
      relatedCollection: 'backups',
      relatedId: doc.id,
    })
    logActivity({
      event: 'system.backup.created',
      actor: admin,
      summary: label,
      targetCollection: 'backups',
      targetId: doc.id,
      request,
      details: counts,
    })
    return json(
      { ok: true, backup: { id: doc.id, label, url: doc.url, counts, sizeBytes: data.length } },
      { status: 201 },
    )
  } catch (error) {
    return errorResponse(error, 'The backup could not be created.')
  }
}
