import sharp, { type Metadata } from 'sharp'

import { HttpError } from './http'

sharp.cache(false)

export type ImageFormat = 'jpeg' | 'png' | 'webp'

const MAGIC: Record<ImageFormat, (bytes: Buffer) => boolean> = {
  jpeg: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: (b) =>
    b.length > 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a,
  webp: (b) =>
    b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
}

export const MIME_BY_FORMAT: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export function sniffFormat(bytes: Buffer): ImageFormat | null {
  for (const format of Object.keys(MAGIC) as ImageFormat[]) {
    if (MAGIC[format](bytes)) return format
  }
  return null
}

export async function fileToBuffer(file: File, maxBytes: number): Promise<Buffer> {
  if (file.size === 0) throw new HttpError(400, 'That file is empty.', 'empty_file')
  if (file.size > maxBytes) throw new HttpError(413, 'That file is too large.', 'too_large')
  return Buffer.from(await file.arrayBuffer())
}

/**
 * Server-side validation: the bytes must really be an allowed image type (magic bytes, not the
 * file name or browser-declared MIME type) and must decode completely without errors.
 */
export async function inspectImage(bytes: Buffer, allowed: ImageFormat[]) {
  const sniffed = sniffFormat(bytes)
  if (!sniffed || !allowed.includes(sniffed)) {
    throw new HttpError(415, 'Please choose a JPG, PNG or WebP image.', 'unsupported_type')
  }
  let meta: Metadata
  try {
    meta = await sharp(bytes, { failOn: 'error', limitInputPixels: 80_000_000 }).metadata()
    // Decode every pixel (at low cost) to catch truncated or corrupt files.
    await sharp(bytes, { failOn: 'error', limitInputPixels: 80_000_000 })
      .resize(32, 32, { fit: 'inside' })
      .raw()
      .toBuffer()
  } catch {
    throw new HttpError(
      422,
      'This image appears to be damaged and could not be read.',
      'corrupt_image',
    )
  }
  if (!meta.width || !meta.height || meta.format !== sniffed) {
    throw new HttpError(422, 'This image could not be read.', 'corrupt_image')
  }
  if ((meta.pages ?? 1) > 1) {
    throw new HttpError(415, 'Animated images are not supported.', 'animated')
  }
  return { format: sniffed, width: meta.width, height: meta.height, orientation: meta.orientation }
}

/** Memory wall variants preserve the complete auto-oriented image without cropping. */
export async function buildMemoryVariants(bytes: Buffer) {
  const base = () => sharp(bytes, { failOn: 'error', limitInputPixels: 80_000_000 }).rotate()

  const display = await base()
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer()

  const full = await base()
    .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85, effort: 4 })
    .toBuffer({ resolveWithObject: true })

  const tiny = await base().resize(24, 24, { fit: 'inside' }).webp({ quality: 45 }).toBuffer()

  const stats = await base().resize(64, 64, { fit: 'inside' }).stats()
  const { r, g, b } = stats.dominant
  const dominantColor = `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`

  return {
    display,
    full: full.data,
    fullWidth: full.info.width,
    fullHeight: full.info.height,
    placeholder: `data:image/webp;base64,${tiny.toString('base64')}`,
    dominantColor,
  }
}

export type PortraitCrop = { centerX: number; centerY: number; zoom: number }

/**
 * Yearbook portrait: 4:5 crop using the student's preview position. Coordinates are normalized
 * against the auto-oriented image and clamped again server-side.
 */
export async function buildPortrait(bytes: Buffer, crop?: PortraitCrop) {
  if (!crop) {
    return sharp(bytes, { failOn: 'error', limitInputPixels: 80_000_000 })
      .rotate()
      .resize(640, 800, { fit: 'cover', position: sharp.strategy.attention })
      .webp({ quality: 84, effort: 4 })
      .toBuffer()
  }

  const oriented = await sharp(bytes, { failOn: 'error', limitInputPixels: 80_000_000 })
    .rotate()
    .toBuffer({ resolveWithObject: true })
  const width = oriented.info.width
  const height = oriented.info.height
  const centerX = Math.max(0, Math.min(1, crop.centerX))
  const centerY = Math.max(0, Math.min(1, crop.centerY))
  const zoom = Math.max(1, Math.min(4, crop.zoom))
  const baseWidth = Math.min(width, height * 0.8)
  const baseHeight = baseWidth / 0.8
  const cropWidth = Math.max(1, Math.round(baseWidth / zoom))
  const cropHeight = Math.max(1, Math.round(baseHeight / zoom))
  const left = Math.max(0, Math.min(width - cropWidth, Math.round(centerX * width - cropWidth / 2)))
  const top = Math.max(
    0,
    Math.min(height - cropHeight, Math.round(centerY * height - cropHeight / 2)),
  )

  return sharp(oriented.data)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize(640, 800, { fit: 'fill' })
    .webp({ quality: 84, effort: 4 })
    .toBuffer()
}

/**
 * Validates a transparent PNG drawing produced by the in-browser canvas and re-encodes it so no
 * ancillary data from the client is stored. Returns null when the drawing is completely empty.
 */
export async function sanitizeDrawingPng(
  bytes: Buffer,
  expected: { width: number; height: number },
) {
  if (sniffFormat(bytes) !== 'png') {
    throw new HttpError(415, 'The drawing could not be read.', 'unsupported_type')
  }
  let meta: Metadata
  try {
    meta = await sharp(bytes, { failOn: 'error' }).metadata()
  } catch {
    throw new HttpError(422, 'The drawing appears to be damaged.', 'corrupt_image')
  }
  if (meta.width !== expected.width || meta.height !== expected.height) {
    throw new HttpError(422, 'The drawing has unexpected dimensions.', 'bad_dimensions')
  }
  const image = sharp(bytes, { failOn: 'error' }).ensureAlpha()
  const stats = await image.clone().stats()
  const alpha = stats.channels[3]
  if (!alpha || alpha.max === 0) return null
  return image.png({ compressionLevel: 8, effort: 6 }).toBuffer()
}
