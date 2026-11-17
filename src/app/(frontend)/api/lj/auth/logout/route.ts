import { appAuth, SESSION_COOKIE_OPTIONS } from '@/lib/app-auth'
import { SESSION_COOKIE } from '@/lib/constants'
import { logActivity } from '@/lib/server/activity'
import { assertSameOrigin, errorResponse, json } from '@/lib/server/http'

export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    let user = null
    try {
      user = await appAuth.revokeCurrentSession()
    } catch {
      // The cookie is cleared below regardless; an already-expired session needs no revocation.
    }
    if (user) logActivity({ event: 'auth.logout', actor: user, summary: 'Signed out', request })
    const response = json({ ok: true })
    response.cookies.set(SESSION_COOKIE, '', { ...SESSION_COOKIE_OPTIONS, maxAge: 0 })
    return response
  } catch (error) {
    return errorResponse(error)
  }
}
