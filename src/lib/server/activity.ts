import { after } from 'next/server'
import type { Payload } from 'payload'

import type { AppUser } from '../app-auth'
import { getPayloadClient } from '../payload'
import { actorLabel } from './guards'
import { clientIp, userAgent } from './http'

type ActivityEntry = {
  event: string
  level?: 'info' | 'warn' | 'error'
  summary?: string
  actor?: AppUser | null
  actorText?: string
  targetCollection?: string
  targetId?: string
  details?: Record<string, unknown>
  request?: Request
}

async function writeActivity(payload: Payload, entry: ActivityEntry) {
  try {
    await payload.create({
      collection: 'activity-logs',
      data: {
        event: entry.event,
        level: entry.level ?? 'info',
        summary: entry.summary?.slice(0, 300),
        actor: entry.actor?.id,
        actorLabel: entry.actorText ?? actorLabel(entry.actor),
        targetCollection: entry.targetCollection,
        targetId: entry.targetId,
        ip: entry.request ? clientIp(entry.request) : undefined,
        userAgent: entry.request ? userAgent(entry.request) : undefined,
        details: entry.details,
      },
      overrideAccess: true,
    })
  } catch (error) {
    payload.logger.error({
      msg: '[the-last-jersey] could not write activity log',
      err: error instanceof Error ? error.message : String(error),
    })
  }
}

/** Audit log write that runs after the response has been sent. */
export function logActivity(entry: ActivityEntry) {
  after(async () => writeActivity(await getPayloadClient(), entry))
}

/** Audit log write that must be persisted before continuing (e.g. failed logins). */
export async function logActivityNow(entry: ActivityEntry) {
  await writeActivity(await getPayloadClient(), entry)
}

type UploadEntry = {
  kind:
    | 'memory-photo'
    | 'jersey-artwork'
    | 'signature'
    | 'profile-photo'
    | 'roster-import'
    | 'backup'
  status: 'success' | 'rejected' | 'failed'
  reason?: string
  file?: { name?: string; type?: string; size?: number } | null
  actor?: AppUser | null
  relatedCollection?: string
  relatedId?: string
}

export function recordUpload(entry: UploadEntry) {
  after(async () => {
    const payload = await getPayloadClient()
    try {
      await payload.create({
        collection: 'upload-records',
        data: {
          kind: entry.kind,
          status: entry.status,
          reason: entry.reason?.slice(0, 300),
          originalFilename: entry.file?.name?.slice(0, 200),
          mimeType: entry.file?.type?.slice(0, 100),
          sizeBytes: entry.file?.size,
          actor: entry.actor?.id,
          actorLabel: actorLabel(entry.actor),
          relatedCollection: entry.relatedCollection,
          relatedId: entry.relatedId,
        },
        overrideAccess: true,
      })
    } catch (error) {
      payload.logger.error({
        msg: '[the-last-jersey] could not write upload record',
        err: error instanceof Error ? error.message : String(error),
      })
    }
  })
}
