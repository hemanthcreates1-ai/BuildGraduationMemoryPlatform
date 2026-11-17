import { randomUUID } from 'node:crypto'

import type { AppUser } from '@/lib/app-auth'
import { PHOTO_DIRECT_UPLOAD_MAX_BYTES } from '@/lib/constants'
import { getPayloadClient } from '@/lib/payload'
import { logActivity, recordUpload } from '@/lib/server/activity'
import { getOwnProfile } from '@/lib/server/data'
import { requireStudent } from '@/lib/server/guards'
import {
  assertSameOrigin,
  errorResponse,
  HttpError,
  json,
  readMultipart,
  stringField,
} from '@/lib/server/http'
import {
  buildPortrait,
  fileToBuffer,
  inspectImage,
  MIME_BY_FORMAT,
  type PortraitCrop,
} from '@/lib/server/images'
import { rateLimit } from '@/lib/server/rate-limit'

const photoIdOf = (value: unknown) =>
  value && typeof value === 'object'
    ? String((value as { id: string }).id)
    : value
      ? String(value)
      : null

const finite = (value: string, fallback: number) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function GET() {
  try {
    const user = await requireStudent()
    return json({ ok: true, profile: await getOwnProfile(user) })
  } catch (error) {
    return errorResponse(error)
  }
}

/**
 * Student self-service profile photo endpoint.
 *
 * There is deliberately no roll-number parameter. Ownership is always derived from the
 * authenticated app session, so changing form fields or the URL cannot target another account.
 */
export async function POST(request: Request) {
  let user: AppUser | null = null
  let file: File | null = null
  const created: { collection: 'profile-photos' | 'profile-photo-originals'; id: string }[] = []
  try {
    assertSameOrigin(request)
    user = await requireStudent()
    rateLimit(`profile-photo:${user.id}`, 8, 30 * 60_000)
    const form = await readMultipart(request, PHOTO_DIRECT_UPLOAD_MAX_BYTES)
    const entry = form.get('file')
    if (!(entry instanceof File)) {
      throw new HttpError(400, 'Choose a JPG, PNG or WebP photograph.', 'missing_file')
    }
    file = entry
    const bytes = await fileToBuffer(entry, PHOTO_DIRECT_UPLOAD_MAX_BYTES)
    const info = await inspectImage(bytes, ['jpeg', 'png', 'webp'])
    const crop: PortraitCrop = {
      centerX: finite(stringField(form, 'centerX', 32), 0.5),
      centerY: finite(stringField(form, 'centerY', 32), 0.5),
      zoom: finite(stringField(form, 'zoom', 32), 1),
    }
    const portrait = await buildPortrait(bytes, crop)
    const payload = await getPayloadClient()
    const before = await payload.findByID({
      collection: 'users',
      id: user.id,
      depth: 1,
      overrideAccess: false,
      user,
      select: { profilePhoto: true, rollNumber: true },
      populate: {
        'profile-photos': { originalFile: true },
        'profile-photo-originals': { filename: true },
      },
    })
    const previousPhoto = photoIdOf(before.profilePhoto)
    const previousOriginal =
      before.profilePhoto && typeof before.profilePhoto === 'object'
        ? photoIdOf(before.profilePhoto.originalFile)
        : null
    const roll = before.rollNumber ?? user.rollNumber
    if (!roll) throw new HttpError(422, 'This account has no roll number.', 'invalid_account')

    const ext = info.format === 'jpeg' ? 'jpg' : info.format
    const original = await payload.create({
      collection: 'profile-photo-originals',
      draft: false,
      data: { student: user.id, sourceFilename: entry.name.slice(0, 200) },
      file: {
        data: bytes,
        mimetype: MIME_BY_FORMAT[info.format],
        name: `${randomUUID()}-original.${ext}`,
        size: bytes.length,
      },
      overrideAccess: false,
      user,
      depth: 0,
      context: { serverWrite: true },
    })
    created.push({ collection: 'profile-photo-originals', id: original.id })

    const cropped = await payload.create({
      collection: 'profile-photos',
      draft: false,
      data: {
        label: roll,
        student: user.id,
        alt: `Portrait of ${roll}`,
        sourceFilename: entry.name.slice(0, 200),
        originalFile: original.id,
      },
      file: {
        data: portrait,
        mimetype: 'image/webp',
        name: `${randomUUID()}.webp`,
        size: portrait.length,
      },
      overrideAccess: false,
      user,
      depth: 0,
      context: { serverWrite: true },
    })
    created.push({ collection: 'profile-photos', id: cropped.id })

    await payload.update({
      collection: 'users',
      id: user.id,
      data: { profilePhoto: cropped.id },
      overrideAccess: false,
      user,
      depth: 0,
    })
    created.length = 0

    // Delete only after the account points at the replacement. Failed cleanup leaves an
    // unreferenced private file, never a broken profile.
    if (previousPhoto && previousPhoto !== cropped.id) {
      await payload
        .delete({ collection: 'profile-photos', id: previousPhoto, overrideAccess: true })
        .catch(() => undefined)
    }
    if (previousOriginal && previousOriginal !== original.id) {
      await payload
        .delete({
          collection: 'profile-photo-originals',
          id: previousOriginal,
          overrideAccess: true,
        })
        .catch(() => undefined)
    }

    recordUpload({
      kind: 'profile-photo',
      status: 'success',
      file: { name: entry.name, type: entry.type, size: entry.size },
      actor: user,
      relatedCollection: 'profile-photos',
      relatedId: cropped.id,
    })
    logActivity({
      event: previousPhoto ? 'profile.photo.replaced.self' : 'profile.photo.created.self',
      actor: user,
      summary: `${previousPhoto ? 'Replaced' : 'Set up'} own profile photo`,
      targetCollection: 'users',
      targetId: user.id,
      request,
    })
    return json(
      {
        ok: true,
        profile: {
          id: user.id,
          rollNumber: roll,
          photo: { url: cropped.url, width: cropped.width ?? 640, height: cropped.height ?? 800 },
        },
      },
      { status: 201 },
    )
  } catch (error) {
    if (created.length) {
      const payload = await getPayloadClient()
      for (const item of created.reverse()) {
        await payload
          .delete({ collection: item.collection, id: item.id, overrideAccess: true })
          .catch(() => undefined)
      }
    }
    if (user) {
      recordUpload({
        kind: 'profile-photo',
        status: error instanceof HttpError && error.status < 500 ? 'rejected' : 'failed',
        reason: error instanceof Error ? error.message : 'Unknown error',
        file: file ? { name: file.name, type: file.type, size: file.size } : null,
        actor: user,
      })
    }
    return errorResponse(error, 'Your profile photograph could not be saved. Please try again.')
  }
}
