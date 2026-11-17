'use client'

export type ApiError = {
  ok: false
  error: string
  code?: string
  fields?: Record<string, string>
  status: number
}
export type ApiResult<T> = ({ ok: true } & T) | ApiError

async function parse<T>(response: Response): Promise<ApiResult<T>> {
  let body: Record<string, unknown> = {}
  try {
    body = await response.json()
  } catch {
    // non-JSON (e.g. proxy error page)
  }
  if (response.ok && body.ok !== false) return { ...(body as T), ok: true } as ApiResult<T>
  return {
    ok: false,
    status: response.status,
    error:
      typeof body.error === 'string'
        ? body.error
        : response.status === 401
          ? 'Your session has ended. Please sign in again.'
          : 'Something went wrong. Please try again.',
    code: typeof body.code === 'string' ? body.code : undefined,
    fields: (body.fields as Record<string, string>) ?? undefined,
  }
}

const networkError = (): ApiError => ({
  ok: false,
  status: 0,
  code: 'network',
  error: "You appear to be offline. Nothing was lost — try again when you're connected.",
})

export async function apiJson<T>(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  try {
    const response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    })
    return await parse<T>(response)
  } catch {
    return networkError()
  }
}

export async function apiGet<T>(url: string) {
  try {
    return await parse<T>(await fetch(url, { credentials: 'same-origin', cache: 'no-store' }))
  } catch {
    return networkError()
  }
}

/** Multipart upload with progress (fetch has no upload progress events). */
export function apiUpload<T>(url: string, form: FormData, onProgress?: (fraction: number) => void) {
  return new Promise<ApiResult<T>>((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.withCredentials = true
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total)
    }
    xhr.onerror = () => resolve(networkError())
    xhr.ontimeout = () => resolve(networkError())
    xhr.onload = () => {
      const response = new Response(xhr.responseText, {
        status: xhr.status,
        headers: { 'content-type': 'application/json' },
      })
      parse<T>(response).then(resolve)
    }
    xhr.timeout = 120_000
    xhr.send(form)
  })
}

export function newSubmissionId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}
