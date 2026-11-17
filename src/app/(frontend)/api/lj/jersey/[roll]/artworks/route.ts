import { randomUUID } from 'node:crypto'

import { JERSEY_MAX_LAYER_BYTES, JERSEY_TEXTURE_SIZE, JERSEY_UV_LAYOUT } from '@/lib/constants'
import { getPayloadClient } from '@/lib/payload'
import { logActivity, recordUpload } from '@/lib/server/activity'
import {
  existingSubmission,
  isDuplicateSubmission,
  parseCount,
  parseInkColors,
  parseRegions,
} from '@/lib/server/contributions'
import { getStudentByRoll, layerUrl } from '@/lib/server/data'
import { requireStudent } from '@/lib/server/guards'
import {
  assertSameOrigin,
  errorResponse,
  HttpError,
  json,
  readMultipart,
  requireSubmissionId,
} from '@/lib/server/http'
import { fileToBuffer, sanitizeDrawingPng } from '@/lib/server/images'
import { rateLimit } from '@/lib/server/rate-limit'
import type { AppUser } from '@/lib/app-auth'

type Context = { params: Promise<{ roll: string }> }

const layerResponse = (doc: Record<string, unknown>, duplicate = false) =>
  json(
    {
      ok: true,
      duplicate,
      layer: {
        id: String(doc.id),
        createdAt: String(doc.createdAt),
        url: layerUrl(String(doc.id)),
      },
    },
    { status: duplicate ? 200 : 201 },
  )

export async function POST(request: Request, { params }: Context) {
  let user: AppUser | null = null
  let file: File | null = null
  let submissionId = ''
  try {
    assertSameOrigin(request)
    user = await requireStudent()
    const { roll } = await params
    const owner = await getStudentByRoll(user, roll)
    if (!owner) throw new HttpError(404, 'That classmate could not be found.', 'not_found')

    const form = await readMultipart(request, JERSEY_MAX_LAYER_BYTES)
    submissionId = requireSubmissionId(form.get('submissionId'))
    const payload = await getPayloadClient()

    const existing = await existingSubmission(payload, 'jersey-artworks', submissionId, user)
    if (existing) return layerResponse(existing, true)

    rateLimit(`artwork:${user.id}`, 15, 10 * 60_000)

    const entry = form.get('file')
    if (!(entry instanceof File))
      throw new HttpError(400, 'No drawing was attached.', 'missing_file')
    file = entry
    const bytes = await fileToBuffer(entry, JERSEY_MAX_LAYER_BYTES)
    const png = await sanitizeDrawingPng(bytes, {
      width: JERSEY_TEXTURE_SIZE,
      height: JERSEY_TEXTURE_SIZE,
    })
    if (!png) throw new HttpError(422, 'Draw something on the jersey before submitting.', 'empty')

    const doc = await payload.create({
      collection: 'jersey-artworks',
      draft: false,
      data: {
        jerseyOwner: owner.id,
        contributor: user.id,
        submissionId,
        status: 'published',
        strokeCount: parseCount(form.get('strokeCount')),
        inkColors: parseInkColors(form.get('inkColors')),
        regions: parseRegions(form.get('regions')),
        textureSize: JERSEY_TEXTURE_SIZE,
        uvLayout: JERSEY_UV_LAYOUT,
      },
      file: { data: png, mimetype: 'image/png', name: `${randomUUID()}.png`, size: png.length },
      overrideAccess: false,
      user,
      depth: 0,
      context: { serverWrite: true },
    })

    logActivity({
      event: 'jersey.artwork.created',
      actor: user,
      summary: `Drew on ${owner.rollNumber}'s jersey`,
      targetCollection: 'jersey-artworks',
      targetId: doc.id,
      request,
    })
    recordUpload({
      kind: 'jersey-artwork',
      status: 'success',
      file: { name: 'jersey-layer.png', type: 'image/png', size: png.length },
      actor: user,
      relatedCollection: 'jersey-artworks',
      relatedId: doc.id,
    })
    return layerResponse(doc as unknown as Record<string, unknown>)
  } catch (error) {
    if (user && submissionId && isDuplicateSubmission(error)) {
      const payload = await getPayloadClient()
      const existing = await existingSubmission(
        payload,
        'jersey-artworks',
        submissionId,
        user,
      ).catch(() => null)
      if (existing) return layerResponse(existing, true)
    }
    if (user) {
      recordUpload({
        kind: 'jersey-artwork',
        status: error instanceof HttpError && error.status < 500 ? 'rejected' : 'failed',
        reason: error instanceof Error ? error.message : 'Unknown error',
        file: file ? { name: 'jersey-layer.png', type: file.type, size: file.size } : null,
        actor: user,
      })
    }
    return errorResponse(
      error,
      'Your drawing could not be saved. It is still on this device — please try again.',
    )
  }
}
