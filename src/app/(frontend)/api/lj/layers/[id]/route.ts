import { getPayloadClient } from '@/lib/payload'
import { requireUser } from '@/lib/server/guards'
import { errorResponse, HttpError } from '@/lib/server/http'
import { readStoredFile } from '@/lib/server/storage'

type Context = { params: Promise<{ id: string }> }

/**
 * Streams a jersey ink layer from object storage as same-origin bytes so WebGL can use it as a
 * texture. Access rules still apply: classmates only receive published layers.
 */
export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireUser()
    const { id } = await params
    if (!/^[0-9a-f-]{20,40}$/i.test(id)) throw new HttpError(404, 'Not found', 'not_found')
    const payload = await getPayloadClient()
    const doc = await payload.findByID({
      collection: 'jersey-artworks',
      id,
      depth: 0,
      overrideAccess: false,
      user,
      select: { filename: true, prefix: true },
      disableErrors: true,
    })
    if (!doc?.filename) throw new HttpError(404, 'Not found', 'not_found')
    const upstream = await readStoredFile(payload, 'jersey-artworks', {
      id: doc.id,
      filename: doc.filename,
      prefix: doc.prefix,
    })
    if (!upstream || !upstream.ok || !upstream.body) {
      throw new HttpError(502, 'The drawing could not be loaded from storage.', 'storage')
    }
    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'image/png',
        // Layers are immutable once submitted; `private` keeps them out of shared caches.
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
