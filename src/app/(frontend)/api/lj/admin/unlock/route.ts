import { getPayloadClient } from '@/lib/payload'
import { logActivity } from '@/lib/server/activity'
import { actorLabel, requireAdmin } from '@/lib/server/guards'
import { assertSameOrigin, errorResponse, HttpError, json, readJson } from '@/lib/server/http'

export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    const admin = await requireAdmin()
    const body = await readJson<{ id?: unknown }>(request)
    if (typeof body.id !== 'string') throw new HttpError(400, 'Missing account.', 'validation')
    const payload = await getPayloadClient()
    const account = await payload.findByID({
      collection: 'users',
      id: body.id,
      depth: 0,
      overrideAccess: false,
      user: admin,
      disableErrors: true,
    })
    if (!account) throw new HttpError(404, 'Account not found.', 'not_found')
    await payload.unlock({
      collection: 'users',
      data: { username: account.username },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'moderation-records',
      data: {
        action: 'account-unlock',
        targetCollection: 'users',
        targetId: account.id,
        targetLabel: `Account ${account.rollNumber ?? account.username}`,
        moderator: admin.id,
        moderatorLabel: actorLabel(admin),
      },
      overrideAccess: false,
      user: admin,
    })
    logActivity({
      event: 'auth.account.unlocked',
      actor: admin,
      summary: `Unlocked ${account.rollNumber ?? account.username}`,
      targetCollection: 'users',
      targetId: account.id,
      request,
    })
    return json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
