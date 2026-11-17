import { randomUUID } from 'node:crypto'

import { normalizeRollNumber, PHOTO_DIRECT_UPLOAD_MAX_BYTES } from '@/lib/constants'
import { getPayloadClient } from '@/lib/payload'
import { logActivity, recordUpload } from '@/lib/server/activity'
import { actorLabel, requireAdmin } from '@/lib/server/guards'
import {
  assertSameOrigin,
  errorResponse,
  HttpError,
  json,
  readJson,
  readMultipart,
  stringField,
} from '@/lib/server/http'
import { buildPortrait, fileToBuffer, inspectImage, MIME_BY_FORMAT } from '@/lib/server/images'
import type { AppUser } from '@/lib/app-auth'

async function findStudent(admin: AppUser, rollInput: string) {
  const roll = normalizeRollNumber(rollInput)
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'users',
    where: { and: [{ rollNumber: { equals: roll } }, { role: { equals: 'student' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user: admin,
  })
  const student = docs[0]
  if (!student) throw new HttpError(404, `No student with roll number ${roll}.`, 'not_found')
  return { payload, student, roll }
}

const photoIdOf = (value: unknown) =>
  value && typeof value === 'object'
    ? String((value as { id: string }).id)
    : value
      ? String(value)
      : null

/** Upload or replace the portrait for one roll number (explicit assignment, never guessed). */
export async function POST(request: Request) {
  let admin: AppUser | null = null
  let file: File | null = null
  const createdDocs: { collection: 'profile-photos' | 'profile-photo-originals'; id: string }[] = []
  try {
    assertSameOrigin(request)
    admin = await requireAdmin()
    const form = await readMultipart(request, PHOTO_DIRECT_UPLOAD_MAX_BYTES)
    const { payload, student, roll } = await findStudent(admin, stringField(form, 'roll', 20))
    const entry = form.get('file')
    if (!(entry instanceof File))
      throw new HttpError(400, 'Choose a photo to upload.', 'missing_file')
    file = entry
    const bytes = await fileToBuffer(entry, PHOTO_DIRECT_UPLOAD_MAX_BYTES)
    const info = await inspectImage(bytes, ['jpeg', 'png', 'webp'])
    const portrait = await buildPortrait(bytes)
    const previousPhoto =
      student.profilePhoto && typeof student.profilePhoto === 'object'
        ? student.profilePhoto
        : student.profilePhoto
          ? await payload.findByID({
              collection: 'profile-photos',
              id: student.profilePhoto,
              depth: 1,
              overrideAccess: false,
              user: admin,
            })
          : null
    const previous = photoIdOf(previousPhoto)
    const previousOriginal =
      previousPhoto && typeof previousPhoto === 'object'
        ? photoIdOf(previousPhoto.originalFile)
        : null
    const ext = info.format === 'jpeg' ? 'jpg' : info.format
    const original = await payload.create({
      collection: 'profile-photo-originals',
      draft: false,
      data: { student: student.id, sourceFilename: entry.name.slice(0, 200) },
      file: {
        data: bytes,
        mimetype: MIME_BY_FORMAT[info.format],
        name: `${randomUUID()}-original.${ext}`,
        size: bytes.length,
      },
      overrideAccess: false,
      user: admin,
      depth: 0,
      context: { serverWrite: true },
    })
    createdDocs.push({ collection: 'profile-photo-originals', id: original.id })

    const photo = await payload.create({
      collection: 'profile-photos',
      draft: false,
      data: {
        label: roll,
        student: student.id,
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
      user: admin,
      depth: 0,
      context: { serverWrite: true },
    })
    createdDocs.push({ collection: 'profile-photos', id: photo.id })
    await payload.update({
      collection: 'users',
      id: student.id,
      data: { profilePhoto: photo.id },
      overrideAccess: false,
      user: admin,
      depth: 0,
    })
    createdDocs.length = 0
    if (previous && previous !== photo.id) {
      await payload
        .delete({ collection: 'profile-photos', id: previous, overrideAccess: false, user: admin })
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
    await payload.create({
      collection: 'moderation-records',
      data: {
        action: 'profile-photo-set',
        targetCollection: 'users',
        targetId: student.id,
        targetLabel: `Profile photo for ${roll}`,
        moderator: admin.id,
        moderatorLabel: actorLabel(admin),
        snapshot: { roll, sourceFilename: entry.name, replacedPhoto: previous },
      },
      overrideAccess: false,
      user: admin,
    })
    recordUpload({
      kind: 'profile-photo',
      status: 'success',
      file: { name: entry.name, type: entry.type, size: entry.size },
      actor: admin,
      relatedCollection: 'profile-photos',
      relatedId: photo.id,
    })
    logActivity({
      event: 'profile.photo.set',
      actor: admin,
      summary: `${previous ? 'Replaced' : 'Added'} profile photo for ${roll}`,
      targetCollection: 'users',
      targetId: student.id,
      request,
    })
    return json({ ok: true, roll, photo: { id: photo.id, url: photo.url } }, { status: 201 })
  } catch (error) {
    if (createdDocs.length) {
      const payload = await getPayloadClient()
      for (const item of createdDocs.reverse()) {
        await payload
          .delete({ collection: item.collection, id: item.id, overrideAccess: true })
          .catch(() => undefined)
      }
    }
    if (admin) {
      recordUpload({
        kind: 'profile-photo',
        status: error instanceof HttpError && error.status < 500 ? 'rejected' : 'failed',
        reason: error instanceof Error ? error.message : 'Unknown error',
        file: file ? { name: file.name, type: file.type, size: file.size } : null,
        actor: admin,
      })
    }
    return errorResponse(error)
  }
}

/** Remove an incorrect portrait; the student falls back to the monogram avatar. */
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request)
    const admin = await requireAdmin()
    const body = await readJson<{ roll?: unknown }>(request)
    const { payload, student, roll } = await findStudent(
      admin,
      typeof body.roll === 'string' ? body.roll : '',
    )
    const previous = photoIdOf(student.profilePhoto)
    if (!previous) return json({ ok: true, roll })
    await payload.update({
      collection: 'users',
      id: student.id,
      data: { profilePhoto: null },
      overrideAccess: false,
      user: admin,
      depth: 0,
    })
    await payload
      .delete({ collection: 'profile-photos', id: previous, overrideAccess: false, user: admin })
      .catch(() => undefined)
    await payload.create({
      collection: 'moderation-records',
      data: {
        action: 'profile-photo-removed',
        targetCollection: 'users',
        targetId: student.id,
        targetLabel: `Profile photo for ${roll}`,
        moderator: admin.id,
        moderatorLabel: actorLabel(admin),
        snapshot: { roll, removedPhoto: previous },
      },
      overrideAccess: false,
      user: admin,
    })
    logActivity({
      event: 'profile.photo.removed',
      level: 'warn',
      actor: admin,
      summary: `Removed profile photo for ${roll}`,
      targetCollection: 'users',
      targetId: student.id,
      request,
    })
    return json({ ok: true, roll })
  } catch (error) {
    return errorResponse(error)
  }
}
