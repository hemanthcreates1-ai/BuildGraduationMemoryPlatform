/**
 * Flat sewing pattern of the T-shirt (centimetres, y up, origin at the centre of the hem).
 * Both the 3D geometry and the texture atlas are derived from this single definition, so a
 * stored ink layer always maps to the same spot on the garment (UV layout "tlj-tee-v1").
 */

export type Vec2 = { x: number; y: number }

const deg = Math.PI / 180

export const P = (() => {
  const hemHalf = 25.5
  const U = { x: 26.2, y: 45 } // underarm
  const S = { x: 22.6, y: 70.2 } // shoulder point
  const N = { x: 9.6, y: 72.6 } // side neck point
  const sleeveAngle = 20 * deg // below horizontal, in the flat pattern
  const sleeveTop = 21
  const cuffWidth = 16
  const d = { x: Math.cos(sleeveAngle), y: -Math.sin(sleeveAngle) }
  const n = { x: -Math.sin(sleeveAngle), y: -Math.cos(sleeveAngle) }
  const C1 = { x: S.x + sleeveTop * d.x, y: S.y + sleeveTop * d.y } // cuff, top fold side
  const C2 = { x: C1.x + cuffWidth * n.x, y: C1.y + cuffWidth * n.y } // cuff, underarm side
  return {
    hemHalf,
    U,
    S,
    N,
    C1,
    C2,
    frontNeckDrop: 9.0,
    backNeckDrop: 2.2,
    /** Extra downward bend applied to the sleeves in 3D. */
    sleeveBend: 24 * deg,
    hemBand: 2.4,
    cuffBand: 2.0,
  }
})()

/** Side seam half-width at height y (slight waist shaping, flaring into the underarm). */
export function sideX(y: number) {
  const t = Math.min(1, Math.max(0, y / P.U.y))
  return P.hemHalf - 0.7 * Math.sin(Math.PI * t) + (P.U.x - P.hemHalf) * t * t * t
}

/** Neckline: u in [-1, 1] runs from the left neck point through the centre to the right one. */
export function neckPoint(u: number, side: 'front' | 'back'): Vec2 {
  const theta = (u * Math.PI) / 2
  const drop = side === 'front' ? P.frontNeckDrop : P.backNeckDrop
  return { x: P.N.x * Math.sin(theta), y: P.N.y - drop * Math.cos(theta) }
}

export const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})
export const mirror = (p: Vec2): Vec2 => ({ x: -p.x, y: p.y })

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2) {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const len = abx * abx + aby * aby
  const t = len > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len)) : 0
  const dx = p.x - (a.x + abx * t)
  const dy = p.y - (a.y + aby * t)
  return Math.sqrt(dx * dx + dy * dy)
}

/** Signed distance past the armhole line (U→S) into the sleeve; negative inside the body. */
export function armholeDistance(x: number, y: number) {
  const ax = Math.abs(x)
  const ux = P.S.x - P.U.x
  const uy = P.S.y - P.U.y
  const len = Math.hypot(ux, uy)
  // outward normal of the armhole line (pointing away from the body centre)
  const nx = uy / len
  const ny = -ux / len
  return (ax - P.U.x) * nx + (y - P.U.y) * ny
}

/* ------------------------------------------------------------------ */
/* Texture atlas (2048 x 2048)                                         */
/* ------------------------------------------------------------------ */

export const ATLAS = {
  size: 2048,
  scale: 13.6, // pixels per centimetre
  xMin: -42.7,
  yMax: 72.9,
  front: { x: 24, y: 18 },
  back: { x: 24, y: 1042 },
  stripsX: 1210,
}

/** Pattern coordinate → atlas pixel (canvas convention, y down). Back panel is mirrored. */
export function patternToPixel(x: number, y: number, side: 'front' | 'back') {
  const origin = side === 'front' ? ATLAS.front : ATLAS.back
  const px = origin.x + ((side === 'front' ? x : -x) - ATLAS.xMin) * ATLAS.scale
  const py = origin.y + (ATLAS.yMax - y) * ATLAS.scale
  return { px, py }
}

export function patternToUV(x: number, y: number, side: 'front' | 'back'): [number, number] {
  const { px, py } = patternToPixel(x, y, side)
  return [px / ATLAS.size, 1 - py / ATLAS.size]
}

/** Rectangular atlas strips for the collar band and the rolled hems. */
export const STRIPS = {
  collar: { x: ATLAS.stripsX, y: 30, w: 820, h: 72 },
  hemFront: { x: ATLAS.stripsX, y: 130, w: 820, h: 22 },
  hemBack: { x: ATLAS.stripsX, y: 166, w: 820, h: 22 },
  cuffRightFront: { x: ATLAS.stripsX, y: 202, w: 400, h: 22 },
  cuffRightBack: { x: ATLAS.stripsX + 420, y: 202, w: 400, h: 22 },
  cuffLeftFront: { x: ATLAS.stripsX, y: 238, w: 400, h: 22 },
  cuffLeftBack: { x: ATLAS.stripsX + 420, y: 238, w: 400, h: 22 },
} as const

export type StripName = keyof typeof STRIPS

export function stripUV(name: StripName, along: number, across: number): [number, number] {
  const strip = STRIPS[name]
  const px = strip.x + Math.min(strip.w, along * ATLAS.scale)
  const py = strip.y + Math.min(strip.h, across * ATLAS.scale)
  return [px / ATLAS.size, 1 - py / ATLAS.size]
}

export type Region = 'front' | 'back' | 'left-sleeve' | 'right-sleeve' | 'collar' | 'hem'

/** Garment region of a UV coordinate (used to describe where a drawing was made). */
export function regionOfUV(u: number, v: number): Region {
  const px = u * ATLAS.size
  const py = (1 - v) * ATLAS.size
  if (px >= ATLAS.stripsX - 10) {
    const c = STRIPS.collar
    return py >= c.y - 6 && py <= c.y + c.h + 6 ? 'collar' : 'hem'
  }
  const side = py < 1030 ? 'front' : 'back'
  const origin = side === 'front' ? ATLAS.front : ATLAS.back
  const sx = (px - origin.x) / ATLAS.scale + ATLAS.xMin
  const x = side === 'front' ? sx : -sx
  const y = ATLAS.yMax - (py - origin.y) / ATLAS.scale
  if (armholeDistance(x, y) > 0.5 && y > P.C2.y - 2) return x > 0 ? 'right-sleeve' : 'left-sleeve'
  return side
}
