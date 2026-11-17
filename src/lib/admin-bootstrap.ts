import { createHmac } from 'node:crypto'

import type { Payload } from 'payload'

import { ADMIN_USERNAME } from './constants'

/**
 * Ensures the app administrator account exists and that its stored PBKDF2 hash matches the
 * server-side ADMIN_PASSWORD environment variable. The plaintext is never stored or logged:
 * Payload hashes it, and an HMAC fingerprint (keyed with the server secret) records which
 * value was applied so the hash is only regenerated when the env var changes.
 */
export async function syncAdminAccount(payload: Payload): Promise<void> {
  const password = process.env.ADMIN_PASSWORD
  if (!password) {
    payload.logger.warn(
      '[the-last-jersey] ADMIN_PASSWORD is not configured; the administrator account cannot sign in.',
    )
    return
  }

  const username = ADMIN_USERNAME.toLowerCase()
  const fingerprint = createHmac('sha256', payload.secret)
    .update(`${username}\u0000${password}`)
    .digest('hex')

  try {
    const { docs } = await payload.find({
      collection: 'users',
      where: { username: { equals: username } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    })
    const existing = docs[0] as
      | { id: string; role?: string; credentialFingerprint?: string }
      | undefined

    if (!existing) {
      await payload.create({
        collection: 'users',
        data: { username, password, role: 'admin', credentialFingerprint: fingerprint },
        overrideAccess: true,
      })
      payload.logger.info('[the-last-jersey] Administrator account created.')
      return
    }

    if (existing.credentialFingerprint !== fingerprint || existing.role !== 'admin') {
      await payload.update({
        collection: 'users',
        id: existing.id,
        data: { password, role: 'admin', credentialFingerprint: fingerprint },
        overrideAccess: true,
      })
      payload.logger.info(
        '[the-last-jersey] Administrator password synchronised from ADMIN_PASSWORD.',
      )
    }
  } catch (error) {
    payload.logger.error({
      err: error instanceof Error ? error.message : String(error),
      msg: '[the-last-jersey] Could not synchronise the administrator account.',
    })
  }
}
