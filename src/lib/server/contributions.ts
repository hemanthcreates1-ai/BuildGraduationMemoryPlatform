import type { Payload } from 'payload'
import { ValidationError } from 'payload'

import type { AppUser } from '../app-auth'
import { INK_COLORS } from '../constants'
import { findSubmission } from './data'
import { HttpError } from './http'

export type SubmissionCollection =
  | 'jersey-artworks'
  | 'jersey-messages'
  | 'signature-entries'
  | 'memory-photos'

export function isDuplicateSubmission(error: unknown) {
  return (
    error instanceof ValidationError &&
    (error.data?.errors ?? []).some((item) => String(item.path) === 'submissionId')
  )
}

/**
 * Idempotent retries: if this submission key already exists and belongs to the same classmate,
 * return the stored record instead of creating a second one.
 */
export async function existingSubmission(
  payload: Payload,
  collection: SubmissionCollection,
  submissionId: string,
  user: AppUser,
) {
  const found = await findSubmission(payload, collection, submissionId)
  if (!found) return null
  if (found.creatorId !== user.id) {
    throw new HttpError(
      409,
      'This submission key is already in use. Please refresh and try again.',
      'conflict',
    )
  }
  return found.doc
}

const PALETTE = new Set<string>(INK_COLORS.map((color) => color.hex))
const REGIONS = new Set(['front', 'back', 'left-sleeve', 'right-sleeve', 'collar', 'hem'])

export function parseInkColors(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return ''
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => PALETTE.has(item))
    .slice(0, 12)
    .join(',')
}

export function parseRegions(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return ''
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => REGIONS.has(item)),
    ),
  ].join(',')
}

export function parseCount(value: FormDataEntryValue | null, max = 100_000) {
  const number = typeof value === 'string' ? Number.parseInt(value, 10) : 0
  return Number.isFinite(number) ? Math.min(max, Math.max(0, number)) : 0
}

export function cleanMessage(input: unknown) {
  if (typeof input !== 'string') return ''
  return (
    input
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim()
  )
}
