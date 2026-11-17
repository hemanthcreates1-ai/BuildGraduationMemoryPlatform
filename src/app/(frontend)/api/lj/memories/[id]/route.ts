import { WALL } from '@/lib/constants'
import { getPayloadClient } from '@/lib/payload'
import { logActivity } from '@/lib/server/activity'
import { getWallPhotoForUser } from '@/lib/server/data'
import { requireStudent } from '@/lib/server/guards'
import { assertSameOrigin, errorResponse, HttpError, json, readJson } from '@/lib/server/http'

type Context = { params: Promise<{ id: string }> }

function finite(value: unknown, name: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpError(400, `Invalid ${name}.`, 'validation')
  }
  return value
}

/** Step 2: move/rotate the draft, and publish it when the classmate confirms. */
export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request)
    const user = await requireStudent()
    const { id } = await params
    const body = await readJson<{
      x?: unknown
      y?: unknown
      rotation?: unknown
      publish?: unknown
    }>(request, 2048)
    const x = finite(body.x, 'position')
    const y = finite(body.y, 'position')
    const rotation = finite(body.rotation, 'rotation')
    if (x < 0 || x > WALL.width || y < 0 || y > WALL.height) {
      throw new HttpError(400, 'Photos must stay on the wall.', 'out_of_bounds')
    }
    if (Math.abs(rotation) > WALL.maxRotation)
      throw new HttpError(400, 'Rotation is too large.', 'validation')
    const publish = body.publish === true
    const payload = await getPayloadClient()

    // Access control only lets a student update their own draft, so a published photo
    // (or someone else's) can never be changed here.
    const updated = await payload
      .update({
        collection: 'memory-photos',
        id,
        data: { x, y, rotation, ...(publish ? { status: 'published' } : {}) },
        overrideAccess: false,
        user,
        depth: 0,
      })
      .catch((error: unknown) => {
        const status = (error as { status?: number })?.status
        if (status === 403 || status === 404) {
          throw new HttpError(
            403,
            'This photograph is already pinned and can no longer be changed.',
            'locked',
          )
        }
        throw error
      })

    if (publish) {
      logActivity({
        event: 'memory.photo.published',
        actor: user,
        summary: `Pinned a photo to the memory wall at (${Math.round(x)}, ${Math.round(y)})`,
        targetCollection: 'memory-photos',
        targetId: updated.id,
        request,
      })
    }
    const photo = await getWallPhotoForUser(user, updated.id)
    return json({ ok: true, photo })
  } catch (error) {
    return errorResponse(error)
  }
}

/** Discard an unpublished draft (published photos can never be deleted by students). */
export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request)
    const user = await requireStudent()
    const { id } = await params
    const payload = await getPayloadClient()
    const draft = await payload.findByID({
      collection: 'memory-photos',
      id,
      depth: 0,
      overrideAccess: false,
      user,
      select: { status: true },
      disableErrors: true,
    })
    if (!draft || draft.status !== 'draft') {
      throw new HttpError(403, 'Only unpinned drafts can be discarded.', 'locked')
    }
    const system = await payload.findByID({
      collection: 'memory-photos',
      id,
      depth: 0,
      overrideAccess: true,
      select: { fullFile: true, originalFile: true },
    })
    await payload.delete({ collection: 'memory-photos', id, overrideAccess: false, user })
    for (const sourceId of [system.fullFile, system.originalFile]) {
      const value = sourceId && typeof sourceId === 'object' ? sourceId.id : sourceId
      if (value) {
        await payload
          .delete({ collection: 'memory-photo-sources', id: value, overrideAccess: true })
          .catch(() => undefined)
      }
    }
    logActivity({
      event: 'memory.photo.discarded',
      actor: user,
      summary: 'Discarded an unpinned draft photo',
      targetCollection: 'memory-photos',
      targetId: id,
      request,
    })
    return json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
