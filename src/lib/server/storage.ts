import type { Payload } from 'payload'
import { createPayloadRequest } from 'payload'

type UploadDoc = { id: string; filename?: string | null; prefix?: string | null }

/**
 * Reads a stored file's bytes through the collection's storage handler (the same path Payload
 * uses internally for image transforms). Used where the browser needs same-origin bytes, e.g.
 * WebGL textures, which cannot read cross-origin signed storage redirects without CORS.
 */
export async function readStoredFile(payload: Payload, collectionSlug: string, doc: UploadDoc) {
  if (!doc.filename) return null
  const collection = payload.collections[collectionSlug as keyof typeof payload.collections]
  const handlers = collection?.config.upload ? (collection.config.upload.handlers ?? []) : []
  const req = await createPayloadRequest({ payload, user: null })
  for (const handler of handlers) {
    const response = await handler(req, {
      doc: doc as never,
      headers: new Headers(),
      params: {
        collection: collectionSlug,
        filename: doc.filename,
        operation: 'transform',
        prefix: doc.prefix ?? undefined,
      },
    })
    if (response instanceof Response) return response
  }
  return null
}
