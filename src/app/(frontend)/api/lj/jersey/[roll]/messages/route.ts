import { MESSAGE_MAX_LENGTH } from '@/lib/constants'
import { getPayloadClient } from '@/lib/payload'
import { logActivity } from '@/lib/server/activity'
import { cleanMessage, existingSubmission, isDuplicateSubmission } from '@/lib/server/contributions'
import { getStudentByRoll } from '@/lib/server/data'
import { requireStudent } from '@/lib/server/guards'
import {
  assertSameOrigin,
  errorResponse,
  HttpError,
  json,
  readJson,
  requireSubmissionId,
} from '@/lib/server/http'
import { rateLimit } from '@/lib/server/rate-limit'
import type { AppUser } from '@/lib/app-auth'

type Context = { params: Promise<{ roll: string }> }

const messageResponse = (doc: Record<string, unknown>, duplicate = false) =>
  json(
    {
      ok: true,
      duplicate,
      message: {
        id: String(doc.id),
        message: String(doc.message),
        createdAt: String(doc.createdAt),
      },
    },
    { status: duplicate ? 200 : 201 },
  )

export async function POST(request: Request, { params }: Context) {
  let user: AppUser | null = null
  let submissionId = ''
  try {
    assertSameOrigin(request)
    user = await requireStudent()
    const { roll } = await params
    const owner = await getStudentByRoll(user, roll)
    if (!owner) throw new HttpError(404, 'That classmate could not be found.', 'not_found')

    const body = await readJson<{ message?: unknown; submissionId?: unknown }>(request, 16_000)
    submissionId = requireSubmissionId(body.submissionId)
    const payload = await getPayloadClient()
    const existing = await existingSubmission(payload, 'jersey-messages', submissionId, user)
    if (existing) return messageResponse(existing, true)

    const message = cleanMessage(body.message)
    if (!message)
      throw new HttpError(400, 'Write a message first.', 'validation', { message: 'Required' })
    if (message.length > MESSAGE_MAX_LENGTH) {
      throw new HttpError(
        400,
        `Messages can be up to ${MESSAGE_MAX_LENGTH} characters.`,
        'validation',
        {
          message: 'Too long',
        },
      )
    }
    rateLimit(`message:${user.id}`, 30, 10 * 60_000)

    const doc = await payload.create({
      collection: 'jersey-messages',
      draft: false,
      data: {
        jerseyOwner: owner.id,
        contributor: user.id,
        submissionId,
        status: 'published',
        message,
      },
      overrideAccess: false,
      user,
      depth: 0,
      context: { serverWrite: true },
    })
    logActivity({
      event: 'jersey.message.created',
      actor: user,
      summary: `Left a message on ${owner.rollNumber}'s jersey`,
      targetCollection: 'jersey-messages',
      targetId: doc.id,
      request,
    })
    return messageResponse(doc as unknown as Record<string, unknown>)
  } catch (error) {
    if (user && submissionId && isDuplicateSubmission(error)) {
      const payload = await getPayloadClient()
      const existing = await existingSubmission(
        payload,
        'jersey-messages',
        submissionId,
        user,
      ).catch(() => null)
      if (existing) return messageResponse(existing, true)
    }
    return errorResponse(error, 'Your message could not be saved. Please try again.')
  }
}
