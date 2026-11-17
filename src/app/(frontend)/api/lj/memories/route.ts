import { randomUUID } from 'node:crypto'

import type { AppUser } from '@/lib/app-auth'
import { MEMORY_PHOTO_MAX_BYTES, polaroidFrameSize, WALL } from '@/lib/constants'
import { getPayloadClient } from '@/lib/payload'
import { logActivity, recordUpload } from '@/lib/server/activity'
import { existingSubmission, isDuplicateSubmission } from '@/lib/server/contributions'
import { getWallPhotoForUser, getWallPhotos } from '@/lib/server/data'
import { requireStudent, requireUser } from '@/lib/server/guards'
import {
  assertSameOrigin,
  errorResponse,
  HttpError,
  json,
  readMultipart,
  requireSubmissionId,
  stringField,
} from '@/lib/server/http'
import {
  buildMemoryVariants,
  fileToBuffer,
  inspectImage,
  MIME_BY_FORMAT,
} from '@/lib/server/images'
import { rateLimit } from '@/lib/server/rate-limit'

export async function GET() {
  try {
    const user = await requireUser()
    const photos = await getWallPhotos(user)
    return json({ ok: true, photos })
  } catch (error) {
    return errorResponse(error)
  }
}

const DAILY_LIMIT = 40

function numberField(form: FormData, name: string, fallback: number) {
  const value = Number.parseFloat(stringField(form, name, 32))
  return Number.isFinite(value) ? value : fallback
}

/**
 * Step 1 of the memory wall flow: validate and store the photograph (original + optimized
 * versions) and create an unpublished draft that only the uploader can see and position.
 */
export async function POST(request: Request) {
  let user: AppUser | null = null
  let file: File | null = null
  let submissionId = ''
  const createdSources: string[] = []
  try {
    assertSameOrigin(request)
    user = await requireStudent()
    const form = await readMultipart(request, MEMORY_PHOTO_MAX_BYTES)
    submissionId = requireSubmissionId(form.get('submissionId'))
    const payload = await getPayloadClient()

    const existing = await existingSubmission(payload, 'memory-photos', submissionId, user)
    if (existing) {
      const photo = await getWallPhotoForUser(user, String(existing.id))
      if (photo) return json({ ok: true, duplicate: true, photo })
    }

    rateLimit(`photo:${user.id}`, 12, 10 * 60_000)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { totalDocs: today } = await payload.count({
      collection: 'memory-photos',
      where: { and: [{ uploader: { equals: user.id } }, { createdAt: { greater_than: since } }] },
      overrideAccess: true,
    })
    if (today >= DAILY_LIMIT) {
      throw new HttpError(
        429,
        `You've added ${DAILY_LIMIT} photos today — come back tomorrow for more.`,
        'daily_limit',
      )
    }

    const entry = form.get('file')
    if (!(entry instanceof File))
      throw new HttpError(400, 'Choose a photograph to upload.', 'missing_file')
    file = entry
    const bytes = await fileToBuffer(entry, MEMORY_PHOTO_MAX_BYTES)
    const info = await inspectImage(bytes, ['jpeg', 'png', 'webp'])
    const variants = await buildMemoryVariants(bytes)
    const ext = info.format === 'jpeg' ? 'jpg' : info.format
    const key = randomUUID()

    const original = await payload.create({
      collection: 'memory-photo-sources',
      draft: false,
      data: { kind: 'original', visibility: 'draft', owner: user.id },
      file: {
        data: bytes,
        mimetype: MIME_BY_FORMAT[info.format],
        name: `${key}-original.${ext}`,
        size: bytes.length,
      },
      overrideAccess: false,
      user,
      depth: 0,
      context: { serverWrite: true },
    })
    createdSources.push(original.id)
    const full = await payload.create({
      collection: 'memory-photo-sources',
      draft: false,
      data: { kind: 'full', visibility: 'draft', owner: user.id },
      file: {
        data: variants.full,
        mimetype: 'image/webp',
        name: `${key}-full.webp`,
        size: variants.full.length,
      },
      overrideAccess: false,
      user,
      depth: 0,
      context: { serverWrite: true },
    })
    createdSources.push(full.id)

    const frame = polaroidFrameSize(variants.fullWidth, variants.fullHeight)
    const maxX = WALL.width - frame.width / 2
    const maxY = WALL.height - frame.height / 2
    const doc = await payload.create({
      collection: 'memory-photos',
      data: {
        status: 'draft',
        uploader: user.id,
        submissionId,
        x: Math.min(maxX, Math.max(frame.width / 2, numberField(form, 'x', WALL.width / 2))),
        y: Math.min(maxY, Math.max(frame.height / 2, numberField(form, 'y', WALL.height / 2))),
        rotation: Math.max(
          -WALL.maxRotation,
          Math.min(WALL.maxRotation, numberField(form, 'rotation', 0)),
        ),
        frameWidth: frame.width,
        frameHeight: frame.height,
        placeholder: variants.placeholder,
        dominantColor: variants.dominantColor,
        fullFile: full.id,
        originalFile: original.id,
        originalInfo: {
          width: info.width,
          height: info.height,
          format: info.format,
          bytes: bytes.length,
          browserOptimized: stringField(form, 'browserOptimized', 4) === '1',
          clientOriginalBytes: Math.max(
            0,
            Math.round(numberField(form, 'clientOriginalBytes', bytes.length)),
          ),
        },
      },
      file: {
        data: variants.display,
        mimetype: 'image/webp',
        name: `${key}.webp`,
        size: variants.display.length,
      },
      overrideAccess: false,
      user,
      depth: 0,
      context: { serverWrite: true },
    })
    createdSources.length = 0

    recordUpload({
      kind: 'memory-photo',
      status: 'success',
      file: { name: entry.name, type: entry.type, size: entry.size },
      actor: user,
      relatedCollection: 'memory-photos',
      relatedId: doc.id,
    })
    logActivity({
      event: 'memory.photo.uploaded',
      actor: user,
      summary: 'Uploaded a memory wall photo (draft)',
      targetCollection: 'memory-photos',
      targetId: doc.id,
      request,
    })
    const photo = await getWallPhotoForUser(user, doc.id)
    return json({ ok: true, photo }, { status: 201 })
  } catch (error) {
    // Compensating cleanup: the managed database has no multi-document transactions.
    if (createdSources.length) {
      const payload = await getPayloadClient()
      for (const id of createdSources) {
        await payload
          .delete({ collection: 'memory-photo-sources', id, overrideAccess: true })
          .catch(() => undefined)
      }
    }
    if (user && submissionId && isDuplicateSubmission(error)) {
      const payload = await getPayloadClient()
      const existing = await existingSubmission(payload, 'memory-photos', submissionId, user).catch(
        () => null,
      )
      const photo = existing ? await getWallPhotoForUser(user, String(existing.id)) : null
      if (photo) return json({ ok: true, duplicate: true, photo })
    }
    if (user) {
      recordUpload({
        kind: 'memory-photo',
        status: error instanceof HttpError && error.status < 500 ? 'rejected' : 'failed',
        reason: error instanceof Error ? error.message : 'Unknown error',
        file: file ? { name: file.name, type: file.type, size: file.size } : null,
        actor: user,
      })
    }
    return errorResponse(
      error,
      'The photo could not be uploaded. Please check your connection and try again.',
    )
  }
}
