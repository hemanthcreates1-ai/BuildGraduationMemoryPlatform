import { appAuth, SESSION_COOKIE_OPTIONS, SESSION_MAX_AGE } from '@/lib/app-auth'
import { SESSION_COOKIE } from '@/lib/constants'
import { assertSameOrigin, errorResponse, json } from '@/lib/server/http'

/** Rolls the session forward so classmates who keep visiting stay signed in. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    const refreshed = await appAuth.refresh().catch(() => null)
    if (!refreshed) return json({ ok: false, signedIn: Boolean(await appAuth.getCurrentUser()) })
    const response = json({ ok: true })
    response.cookies.set(SESSION_COOKIE, refreshed.token, {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: SESSION_MAX_AGE,
    })
    return response
  } catch (error) {
    return errorResponse(error)
  }
}
