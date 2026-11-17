import { cookies } from 'next/headers'
import type { Payload } from 'payload'
import { createPayloadRequest, JWTAuthentication, logoutOperation, refreshOperation } from 'payload'
import { cache } from 'react'

import type { User } from '@/payload-types'

import { syncAdminAccount } from './admin-bootstrap'
import { ADMIN_USERNAME, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from './constants'
import { getPayloadClient } from './payload'

export type AppUser = User & { collection: 'users'; _sid?: string }

/**
 * The app session cookie. `SameSite=None; Partitioned` lets it work inside the cross-site Make
 * preview iframe (CHIPS) as well as on the published site; every state-changing route also
 * verifies Origin / Sec-Fetch-Site (see `assertSameOrigin`).
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none' as const,
  path: '/',
  partitioned: true,
}

export const isAdminUsername = (username: string) =>
  username.trim().toLowerCase() === ADMIN_USERNAME.toLowerCase()

/**
 * Payload requires passwords of at least 3 characters, but pins.csv contains shorter PINs.
 * Every student PIN is therefore hashed in the namespaced form `pin:<PIN>`. Students still type
 * exactly the PIN from pins.csv; this encoding is applied consistently on import and login.
 */
export function encodeCredential(username: string, secret: string) {
  return isAdminUsername(username) ? secret : `pin:${secret}`
}

export function createAppAuth(collection: 'users') {
  /**
   * Validates only the app token, only against this collection, using isolated headers that
   * never contain the CMS cookie. Payload's own JWT strategy performs the signature, expiry and
   * server-side session checks; calling it directly keeps CMS strategies out of the picture.
   */
  async function resolveToken(payload: Payload, token: string): Promise<AppUser | null> {
    const authHeaders = new Headers({ Authorization: `JWT ${token}`, DisableAutologin: 'true' })
    const { user } = await JWTAuthentication({
      headers: authHeaders,
      payload,
      strategyName: 'local-jwt',
    })
    if (!user || user.collection !== collection) return null
    return user as unknown as AppUser
  }

  const getCurrentUser = cache(async (): Promise<AppUser | null> => {
    const token = (await cookies()).get(SESSION_COOKIE)?.value
    if (!token) return null
    try {
      return await resolveToken(await getPayloadClient(), token)
    } catch {
      return null
    }
  })

  async function login(usernameInput: string, secret: string) {
    const payload = await getPayloadClient()
    const username = usernameInput.trim().toLowerCase()
    // Lazily (re)applies ADMIN_PASSWORD in case the server started before it was configured.
    if (isAdminUsername(username)) await syncAdminAccount(payload)
    const result = await payload.login({
      collection,
      data: { username, password: encodeCredential(username, secret) },
      depth: 0,
      overrideAccess: true,
    })
    if (!result.token || !result.user) throw new Error('Login did not return a session token')
    return { token: result.token, user: result.user as unknown as AppUser, exp: result.exp }
  }

  /** Revokes the server-side session (Payload sessions) for the current cookie. */
  async function revokeCurrentSession() {
    const token = (await cookies()).get(SESSION_COOKIE)?.value
    if (!token) return null
    const payload = await getPayloadClient()
    const user = await resolveToken(payload, token)
    if (!user) return null
    const req = await createPayloadRequest({ payload, user: user as never })
    await logoutOperation({ collection: payload.collections[collection], req })
    return user
  }

  /** Extends the current session and returns a fresh token, or null when not signed in. */
  async function refresh() {
    const token = (await cookies()).get(SESSION_COOKIE)?.value
    if (!token) return null
    const payload = await getPayloadClient()
    const user = await resolveToken(payload, token)
    if (!user) return null
    const req = await createPayloadRequest({
      payload,
      user: user as never,
      req: { headers: new Headers({ Authorization: `JWT ${token}` }) },
    })
    const result = await refreshOperation({ collection: payload.collections[collection], req })
    return result.refreshedToken ? { token: result.refreshedToken, user } : null
  }

  return { getCurrentUser, login, refresh, resolveToken, revokeCurrentSession }
}

export const appAuth = createAppAuth('users')
export const SESSION_MAX_AGE = SESSION_MAX_AGE_SECONDS
