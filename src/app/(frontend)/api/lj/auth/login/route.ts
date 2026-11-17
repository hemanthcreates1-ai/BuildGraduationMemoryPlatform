import { after } from 'next/server'
import { LockedAuth } from 'payload'

import { appAuth, isAdminUsername, SESSION_COOKIE_OPTIONS, SESSION_MAX_AGE } from '@/lib/app-auth'
import { SESSION_COOKIE } from '@/lib/constants'
import { getPayloadClient } from '@/lib/payload'
import { logActivity, logActivityNow } from '@/lib/server/activity'
import {
  assertSameOrigin,
  clientIp,
  errorResponse,
  HttpError,
  json,
  readJson,
} from '@/lib/server/http'
import { assertLoginAllowed, rateLimit } from '@/lib/server/rate-limit'

export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    const ip = clientIp(request)
    rateLimit(`login:${ip}`, 20, 60_000, 'Too many attempts. Please wait a minute and try again.')

    const body = await readJson<{ username?: unknown; secret?: unknown }>(request, 4096)
    const username = typeof body.username === 'string' ? body.username.replace(/\s+/g, '') : ''
    const secret = typeof body.secret === 'string' ? body.secret.trim() : ''
    if (!username || username.length > 40 || !secret || secret.length > 128) {
      throw new HttpError(400, 'Enter your roll number and PIN.', 'validation')
    }

    await assertLoginAllowed(ip)

    let session: Awaited<ReturnType<typeof appAuth.login>>
    try {
      session = await appAuth.login(username, secret)
    } catch (error) {
      const locked =
        error instanceof LockedAuth || (error as { name?: string })?.name === 'LockedAuth'
      await logActivityNow({
        event: 'auth.login.failed',
        level: 'warn',
        actorText: username.slice(0, 40).toUpperCase(),
        summary: locked ? 'Sign-in blocked: account temporarily locked' : 'Incorrect credentials',
        request,
        details: { locked },
      })
      if (locked) {
        throw new HttpError(
          423,
          'Too many incorrect attempts. This account is locked for 15 minutes.',
          'locked',
        )
      }
      throw new HttpError(
        401,
        isAdminUsername(username)
          ? 'Incorrect username or password.'
          : "That roll number and PIN don't match. Check both and try again.",
        'invalid_credentials',
      )
    }

    const { user, token } = session
    after(async () => {
      const payload = await getPayloadClient()
      await payload
        .update({
          collection: 'users',
          id: user.id,
          data: { lastLoginAt: new Date().toISOString(), loginCount: (user.loginCount ?? 0) + 1 },
          overrideAccess: true,
          depth: 0,
        })
        .catch(() => undefined)
    })
    logActivity({ event: 'auth.login.success', actor: user, summary: 'Signed in', request })

    const needsProfile = user.role === 'student' && !user.profilePhoto
    const response = json({
      ok: true,
      role: user.role,
      needsProfile,
      redirect: user.role === 'admin' ? '/hq' : needsProfile ? '/profile/setup' : '/',
    })
    response.cookies.set(SESSION_COOKIE, token, {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: SESSION_MAX_AGE,
    })
    return response
  } catch (error) {
    return errorResponse(error)
  }
}
