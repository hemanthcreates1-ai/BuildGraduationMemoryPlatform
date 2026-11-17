/**
 * Shared, non-secret constants used by both server and browser code.
 * Never put credentials or private values in this file.
 */

export const APP_NAME = 'THE LAST JERSEY'
export const TAGLINE = '84 PEOPLE. ONE BATCH. A LIFETIME OF MEMORIES.'
export const CREDIT = 'MADE BY ft.middlebenchers'

/** The roster in pins.csv must contain exactly this many students. */
export const EXPECTED_STUDENT_COUNT = 84

/** Administrator username. The password only ever comes from the server-side ADMIN_PASSWORD env var. */
export const ADMIN_USERNAME = 'HEMANTHHK.7'

/** HTTP-only app session cookie (separate from the Payload CMS cookie). */
export const SESSION_COOKIE = '__Host-app-session'
/** 30 days, matches the users collection token expiration. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

/** Roll numbers look like 23X51A05H0 / 24X55A0501. */
export const ROLL_NUMBER_PATTERN = /^[0-9]{2}[A-Z0-9]{8}$/

export function normalizeRollNumber(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

/* ------------------------------------------------------------------ */
/* Jersey                                                              */
/* ------------------------------------------------------------------ */

/** Square ink-layer texture resolution. Stored with every artwork so it can change later. */
export const JERSEY_TEXTURE_SIZE = 2048
/** Identifies the UV layout of the procedural garment that every stored layer was painted for. */
export const JERSEY_UV_LAYOUT = 'tlj-tee-v1'
export const JERSEY_MAX_LAYER_BYTES = 4_500_000

export const INK_COLORS = [
  { name: 'Ink black', hex: '#1f1b18' },
  { name: 'Midnight navy', hex: '#1e2f6b' },
  { name: 'Royal blue', hex: '#2459d6' },
  { name: 'Sky', hex: '#3aa0d8' },
  { name: 'Forest', hex: '#1f6b3a' },
  { name: 'Crimson', hex: '#b3202b' },
  { name: 'Rose', hex: '#e0486f' },
  { name: 'Blush pink', hex: '#f08fb0' },
  { name: 'Violet', hex: '#6d3fc0' },
  { name: 'Sunset orange', hex: '#e8692a' },
  { name: 'Marigold', hex: '#d9a21b' },
  { name: 'Cocoa', hex: '#6b3d22' },
] as const

/** Brush diameters in millimetres on the garment surface. */
export const JERSEY_BRUSH_SIZES_MM = [2, 4, 7, 12, 20] as const

/* ------------------------------------------------------------------ */
/* Messages & signatures                                               */
/* ------------------------------------------------------------------ */

export const MESSAGE_MAX_LENGTH = 600
export const SIGNATURE_CANVAS = { width: 1200, height: 800 } as const
export const SIGNATURE_MAX_BYTES = 3_000_000
export const SIGNATURE_BRUSH_SIZES = [3, 6, 10, 16] as const

/* ------------------------------------------------------------------ */
/* Memory wall                                                         */
/* ------------------------------------------------------------------ */

/** World coordinate space of the memory wall. Coordinates never depend on screen size. */
export const WALL = {
  width: 16000,
  height: 10000,
  /** Legacy/default frame size. New uploads derive their frame from the photograph's ratio. */
  frameWidth: 240,
  frameHeight: 312,
  border: 14,
  bottomBorder: 44,
  maxPhotoSide: 420,
  maxRotation: 15,
} as const

/** Profile-photo upload limit. */
export const PHOTO_DIRECT_UPLOAD_MAX_BYTES = 4_400_000
/** Memory Wall photographs may be up to 15 MB and are never cropped. */
export const MEMORY_PHOTO_MAX_BYTES = 15_000_000
export const PHOTO_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const PHOTO_ACCEPT_ATTRIBUTE = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'

/** Keep Polaroids similarly weighted while allowing their frames to follow any source ratio. */
export function polaroidFrameSize(imageWidth: number, imageHeight: number) {
  const width = Math.max(1, imageWidth)
  const height = Math.max(1, imageHeight)
  const ratio = width / height
  const legacyWindowArea =
    (WALL.frameWidth - WALL.border * 2) * (WALL.frameHeight - WALL.border - WALL.bottomBorder)
  const idealWidth = Math.sqrt(legacyWindowArea * ratio)
  const idealHeight = idealWidth / ratio
  const scale = Math.min(1, WALL.maxPhotoSide / idealWidth, WALL.maxPhotoSide / idealHeight)
  const photoWidth = Math.max(1, Math.round(idealWidth * scale))
  const photoHeight = Math.max(1, Math.round(idealHeight * scale))
  return {
    width: photoWidth + WALL.border * 2,
    height: photoHeight + WALL.border + WALL.bottomBorder,
  }
}

export type ContributionCollection =
  | 'jersey-artworks'
  | 'jersey-messages'
  | 'signature-entries'
  | 'memory-photos'
