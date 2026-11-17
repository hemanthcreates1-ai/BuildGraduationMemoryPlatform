import { NextResponse } from 'next/server'
import { APIError, ValidationError } from 'payload'

export class HttpError extends Error {
  status: number
  code: string
  fields?: Record<string, string>

  constructor(status: number, message: string, code = 'error', fields?: Record<string, string>) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
  }
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('Cache-Control', 'no-store')
  return NextResponse.json(data, { ...init, headers })
}

/** Maps any thrown error to a safe JSON response; internal details are never exposed. */
export function errorResponse(
  error: unknown,
  fallbackMessage = 'Something went wrong. Please try again.',
) {
  if (error instanceof HttpError) {
    return json(
      { ok: false, error: error.message, code: error.code, fields: error.fields },
      { status: error.status },
    )
  }
  if (error instanceof ValidationError) {
    const fields: Record<string, string> = {}
    for (const item of error.data?.errors ?? []) {
      if (item.path) fields[String(item.path)] = item.message
    }
    const duplicate = Object.keys(fields).includes('submissionId')
    return json(
      {
        ok: false,
        code: duplicate ? 'duplicate' : 'validation',
        error: duplicate ? 'This was already submitted.' : 'Some details need attention.',
        fields,
      },
      { status: duplicate ? 409 : 400 },
    )
  }
  if (error instanceof APIError && error.status && error.status < 500) {
    return json({ ok: false, code: 'rejected', error: error.message }, { status: error.status })
  }
  console.error('[the-last-jersey] request failed:', error instanceof Error ? error.message : error)
  return json({ ok: false, code: 'server', error: fallbackMessage }, { status: 500 })
}

function hostOf(value: string | null | undefined) {
  if (!value) return null
  try {
    return new URL(value).host
  } catch {
    return null
  }
}

/**
 * CSRF defence for cookie-authenticated writes. Browsers send Sec-Fetch-Site on every request;
 * anything but same-origin is rejected. Older browsers fall back to an Origin host check.
 */
export function assertSameOrigin(request: Request) {
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite) {
    if (fetchSite === 'same-origin') return
    throw new HttpError(403, 'This request was blocked for your security.', 'cross_site')
  }
  const origin = request.headers.get('origin')
  if (!origin) return
  const originHost = hostOf(origin)
  const allowed = new Set(
    [
      request.headers.get('x-forwarded-host'),
      request.headers.get('host'),
      hostOf(process.env.NEXT_PUBLIC_SITE_URL),
      hostOf(process.env.FIGMA_PUBLIC_URL),
    ].filter(Boolean) as string[],
  )
  if (!originHost || !allowed.has(originHost)) {
    throw new HttpError(403, 'This request was blocked for your security.', 'cross_origin')
  }
}

export function clientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim().slice(0, 64)
  return (request.headers.get('x-real-ip') ?? 'unknown').slice(0, 64)
}

export function userAgent(request: Request) {
  return (request.headers.get('user-agent') ?? '').slice(0, 300)
}

export async function readJson<T = Record<string, unknown>>(
  request: Request,
  maxBytes = 64_000,
): Promise<T> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'Expected a JSON request.', 'unsupported_media_type')
  }
  const text = await request.text()
  if (text.length > maxBytes) throw new HttpError(413, 'Request is too large.', 'too_large')
  try {
    return JSON.parse(text) as T
  } catch {
    throw new HttpError(400, 'Malformed request.', 'bad_json')
  }
}

export async function readMultipart(request: Request, maxBytes: number) {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared && declared > maxBytes + 64_000) {
    throw new HttpError(413, 'That file is too large to upload.', 'too_large')
  }
  try {
    return await request.formData()
  } catch {
    throw new HttpError(400, 'The upload could not be read. Please try again.', 'bad_multipart')
  }
}

export function stringField(form: FormData, name: string, max = 200): string {
  const value = form.get(name)
  if (typeof value !== 'string') return ''
  return value.slice(0, max)
}

export const SUBMISSION_ID = /^[A-Za-z0-9-]{16,64}$/

export function requireSubmissionId(value: unknown): string {
  if (typeof value !== 'string' || !SUBMISSION_ID.test(value)) {
    throw new HttpError(
      400,
      'Missing submission key. Please refresh and try again.',
      'bad_submission_id',
    )
  }
  return value
}
