import type { CollectionSlug } from 'payload'

import { getPayloadClient } from '@/lib/payload'
import { logActivity } from '@/lib/server/activity'
import { actorLabel, requireAdmin } from '@/lib/server/guards'
import { assertSameOrigin, errorResponse, HttpError, json, readJson } from '@/lib/server/http'

const TARGETS = {
  'jersey-artworks': { owner: 'jerseyOwner', person: 'contributor', label: 'Jersey drawing' },
  'jersey-messages': { owner: 'jerseyOwner', person: 'contributor', label: 'Jersey message' },
  'signature-entries': { owner: 'wallOwner', person: 'contributor', label: 'Signature wall entry' },
  'memory-photos': { owner: null, person: 'uploader', label: 'Memory wall photo' },
} as const

type Target = keyof typeof TARGETS

function rollOf(value: unknown) {
  if (value && typeof value === 'object') {
    const user = value as { rollNumber?: string | null; username?: string }
    return user.rollNumber ?? user.username ?? null
  }
  return null
}

/** Post-publication moderation: remove (hide) or restore a contribution, with an audit record. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    const admin = await requireAdmin()
    const body = await readJson<{
      collection?: unknown
      id?: unknown
      action?: unknown
      reason?: unknown
    }>(request)
    const collection = body.collection as Target
    if (!(collection in TARGETS)) throw new HttpError(400, 'Unknown content type.', 'validation')
    if (typeof body.id !== 'string' || !body.id)
      throw new HttpError(400, 'Missing item.', 'validation')
    const action =
      body.action === 'restore' ? 'restore' : body.action === 'remove' ? 'remove' : null
    if (!action) throw new HttpError(400, 'Unknown action.', 'validation')
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''

    const payload = await getPayloadClient()
    const meta = TARGETS[collection]
    const before = (await payload.findByID({
      collection: collection as CollectionSlug,
      id: body.id,
      depth: 1,
      overrideAccess: false,
      user: admin,
      disableErrors: true,
    })) as Record<string, unknown> | null
    if (!before) throw new HttpError(404, 'That item no longer exists.', 'not_found')

    const current = before.status as string
    if (action === 'remove' && current === 'removed') return json({ ok: true, status: current })
    if (action === 'restore' && current !== 'removed') return json({ ok: true, status: current })
    if (action === 'remove' && current === 'draft') {
      throw new HttpError(
        400,
        'Drafts are not visible to anyone yet; nothing to remove.',
        'validation',
      )
    }
    const nextStatus = action === 'remove' ? 'removed' : 'published'

    await payload.update({
      collection: collection as CollectionSlug,
      id: body.id,
      data: { status: nextStatus } as never,
      overrideAccess: false,
      user: admin,
      depth: 0,
    })

    const ownerRoll = meta.owner ? rollOf(before[meta.owner]) : null
    const personRoll = rollOf(before[meta.person])
    const targetLabel = `${meta.label}${ownerRoll ? ` for ${ownerRoll}` : ''}${personRoll ? ` by ${personRoll}` : ''}`
    await payload.create({
      collection: 'moderation-records',
      data: {
        action,
        targetCollection: collection,
        targetId: body.id,
        targetLabel,
        reason,
        moderator: admin.id,
        moderatorLabel: actorLabel(admin),
        snapshot: {
          previousStatus: current,
          newStatus: nextStatus,
          owner: ownerRoll,
          contributor: personRoll,
          createdAt: before.createdAt,
          message: collection === 'jersey-messages' ? before.message : undefined,
          filename: before.filename,
        },
      },
      overrideAccess: false,
      user: admin,
    })
    logActivity({
      event: `moderation.${action}`,
      level: 'warn',
      actor: admin,
      summary: `${action === 'remove' ? 'Removed' : 'Restored'} ${targetLabel}`,
      targetCollection: collection,
      targetId: body.id,
      request,
      details: { reason },
    })
    return json({ ok: true, status: nextStatus })
  } catch (error) {
    return errorResponse(error)
  }
}
