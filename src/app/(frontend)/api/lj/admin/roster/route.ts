import { encodeCredential } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { logActivity, recordUpload } from '@/lib/server/activity'
import { requireAdmin } from '@/lib/server/guards'
import {
  assertSameOrigin,
  errorResponse,
  HttpError,
  json,
  readMultipart,
  stringField,
} from '@/lib/server/http'
import { parseRosterCsv } from '@/lib/server/roster-csv'
import type { AppUser } from '@/lib/app-auth'

/**
 * pins.csv import. `preview` validates and compares with the stored roster without writing.
 * `apply` creates missing students and, only when explicitly requested, resets PINs to the
 * CSV values. Students are never deleted. The CSV itself is never stored.
 */
export async function POST(request: Request) {
  let admin: AppUser | null = null
  let fileMeta: { name: string; type: string; size: number } | null = null
  try {
    assertSameOrigin(request)
    admin = await requireAdmin()
    const form = await readMultipart(request, 200_000)
    const entry = form.get('file')
    if (!(entry instanceof File))
      throw new HttpError(400, 'Choose pins.csv to upload.', 'missing_file')
    fileMeta = { name: entry.name, type: entry.type, size: entry.size }
    if (entry.size > 200_000)
      throw new HttpError(413, 'That file is too large for a roster.', 'too_large')
    const mode = stringField(form, 'mode', 10) === 'apply' ? 'apply' : 'preview'
    const resetPins = stringField(form, 'resetPins', 4) === '1'

    const report = parseRosterCsv(await entry.text())
    const payload = await getPayloadClient()
    const { docs: existing } = await payload.find({
      collection: 'users',
      where: { role: { equals: 'student' } },
      limit: 500,
      depth: 0,
      overrideAccess: false,
      user: admin,
      select: { rollNumber: true },
    })
    const stored = new Map(existing.map((doc) => [doc.rollNumber ?? '', doc.id]))
    const csvRolls = new Set(report.rows.map((row) => row.roll))
    const toCreate = report.rows.filter((row) => !stored.has(row.roll))
    const notInCsv = [...stored.keys()].filter((roll) => roll && !csvRolls.has(roll))
    const summary = {
      header: report.header,
      records: report.rows.length,
      errors: report.errors,
      warnings: report.warnings,
      toCreate: toCreate.map((row) => row.roll),
      alreadyPresent: report.rows.length - toCreate.length,
      storedNotInCsv: notInCsv,
    }

    if (mode === 'preview' || !report.ok) {
      if (mode === 'apply') {
        recordUpload({
          kind: 'roster-import',
          status: 'rejected',
          reason: report.errors[0],
          file: fileMeta,
          actor: admin,
        })
      }
      return json({ ok: report.ok, mode, applied: false, summary })
    }

    let created = 0
    let pinsReset = 0
    const failures: string[] = []
    for (const row of report.rows) {
      const id = stored.get(row.roll)
      try {
        if (!id) {
          await payload.create({
            collection: 'users',
            data: {
              username: row.roll.toLowerCase(),
              password: encodeCredential(row.roll, row.pin),
              role: 'student',
              rollNumber: row.roll,
              rosterOrder: row.line - 1,
            },
            overrideAccess: false,
            user: admin,
            depth: 0,
          })
          created++
        } else if (resetPins) {
          await payload.update({
            collection: 'users',
            id,
            data: { password: encodeCredential(row.roll, row.pin), rosterOrder: row.line - 1 },
            overrideAccess: false,
            user: admin,
            depth: 0,
          })
          pinsReset++
        }
      } catch (error) {
        failures.push(`${row.roll}: ${error instanceof Error ? error.message : 'failed'}`)
      }
    }
    recordUpload({
      kind: 'roster-import',
      status: failures.length ? 'failed' : 'success',
      reason: failures.length
        ? `${failures.length} row(s) failed`
        : `created ${created}, PINs reset ${pinsReset}`,
      file: fileMeta,
      actor: admin,
    })
    logActivity({
      event: 'roster.import',
      level: failures.length ? 'error' : 'info',
      actor: admin,
      summary: `Roster import: ${created} created, ${pinsReset} PIN(s) reset${failures.length ? `, ${failures.length} failed` : ''}`,
      request,
    })
    return json({
      ok: failures.length === 0,
      mode,
      applied: true,
      created,
      pinsReset,
      failures,
      summary,
    })
  } catch (error) {
    if (admin && fileMeta) {
      recordUpload({
        kind: 'roster-import',
        status: 'failed',
        reason: error instanceof Error ? error.message : 'failed',
        file: fileMeta,
        actor: admin,
      })
    }
    return errorResponse(error)
  }
}
