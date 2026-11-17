import type { AuthStrategy } from 'payload'
import { JWTAuthentication } from 'payload'

import { SESSION_COOKIE } from './constants'

/**
 * Upload collections whose files are requested directly by the browser (`<img>`, `fetch`).
 * Payload's built-in JWT strategy only reads the CMS cookie, so these file routes need to
 * recognise the separate app session cookie as well.
 */
const PROTECTED_FILE_ROUTE =
  /^\/api\/(profile-photos|profile-photo-originals|memory-photos|memory-photo-sources|signature-entries|jersey-artworks|backups)\/file\//

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim()
      return value ? decodeURIComponent(value) : null
    }
  }
  return null
}

/**
 * Authenticates app users from the `__Host-app-session` cookie, but only on protected upload
 * file routes. Everywhere else (including `/admin`) Payload behaves exactly as before, so the
 * app session can never be mistaken for a CMS identity. Token verification is delegated to
 * Payload's own JWT strategy (signature, expiry and session checks).
 */
export const appSessionFileStrategy: AuthStrategy = {
  name: 'app-session-files',
  authenticate: async (args) => {
    const pathname = args.req?.pathname
    if (!pathname || !PROTECTED_FILE_ROUTE.test(pathname)) return { user: null }

    const token = readCookie(args.headers.get('cookie'), SESSION_COOKIE)
    if (!token) return { user: null }

    const result = await JWTAuthentication({
      ...args,
      headers: new Headers({ Authorization: `JWT ${token}`, DisableAutologin: 'true' }),
    })
    if (!result.user || result.user.collection !== 'users') return { user: null }
    return result
  },
}
