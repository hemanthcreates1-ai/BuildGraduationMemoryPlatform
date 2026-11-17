import { getPayloadClient } from '../payload'
import { HttpError } from './http'

type Bucket = number[]
const globalBuckets = globalThis as unknown as { __ljRateBuckets?: Map<string, Bucket> }
const buckets = (globalBuckets.__ljRateBuckets ??= new Map<string, Bucket>())

/**
 * Sliding-window limiter kept in process memory. It smooths bursts per server instance; the
 * durable protections are Payload's per-account lockout and the database-backed login throttle.
 */
export function rateLimit(key: string, limit: number, windowMs: number, message?: string) {
  const now = Date.now()
  const bucket = (buckets.get(key) ?? []).filter((time) => now - time < windowMs)
  if (bucket.length >= limit) {
    buckets.set(key, bucket)
    const retryAfter = Math.ceil((windowMs - (now - bucket[0]!)) / 1000)
    throw new HttpError(
      429,
      message ?? `You're doing that a little too often. Try again in ${retryAfter} seconds.`,
      'rate_limited',
    )
  }
  bucket.push(now)
  buckets.set(key, bucket)
  if (buckets.size > 5000) {
    for (const [bucketKey, times] of buckets) {
      if (!times.some((time) => now - time < windowMs)) buckets.delete(bucketKey)
    }
  }
}

export const LOGIN_IP_WINDOW_MS = 15 * 60 * 1000
export const LOGIN_IP_MAX_FAILURES = 25

/** Database-backed brute-force throttle: counts recent failed logins from this IP. */
export async function assertLoginAllowed(ip: string) {
  if (!ip || ip === 'unknown') return
  const payload = await getPayloadClient()
  const since = new Date(Date.now() - LOGIN_IP_WINDOW_MS).toISOString()
  const { totalDocs } = await payload.count({
    collection: 'activity-logs',
    where: {
      and: [
        { event: { equals: 'auth.login.failed' } },
        { ip: { equals: ip } },
        { createdAt: { greater_than: since } },
      ],
    },
    overrideAccess: true,
  })
  if (totalDocs >= LOGIN_IP_MAX_FAILURES) {
    throw new HttpError(
      429,
      'Too many sign-in attempts from this network. Please wait 15 minutes and try again.',
      'ip_throttled',
    )
  }
}
