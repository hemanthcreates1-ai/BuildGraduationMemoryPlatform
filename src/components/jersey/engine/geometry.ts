import * as THREE from 'three'

import {
  armholeDistance,
  distToSegment,
  lerp2,
  mirror,
  neckPoint,
  P,
  patternToUV,
  sideX,
  smoothstep,
  stripUV,
  type StripName,
  type Vec2,
} from './pattern'

const CM = 0.01 // geometry is authored in centimetres and stored in metres

type PanelSide = 'front' | 'back'

/* ------------------------------------------------------------------ */
/* Parameter distributions                                             */
/* ------------------------------------------------------------------ */

/** Values in [0,1] clustered towards both ends (resolves the round seams). */
function chebyshev(n: number) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const c = 0.5 - 0.5 * Math.cos((Math.PI * i) / n)
    return 0.25 * (i / n) + 0.75 * c
  })
}

/** Across-body distribution: dense near the side seams, uniform through the neckline span. */
function bodyColumns(shoulderFraction: number, nSide: number, nMiddle: number) {
  const values: number[] = []
  for (let k = 0; k <= nSide; k++)
    values.push(shoulderFraction * (1 - Math.cos((Math.PI / 2) * (k / nSide))))
  for (let k = 1; k <= nMiddle; k++)
    values.push(shoulderFraction + (1 - 2 * shoulderFraction) * (k / nMiddle))
  for (let k = nSide - 1; k >= 0; k--)
    values.push(1 - shoulderFraction * (1 - Math.cos((Math.PI / 2) * (k / nSide))))
  return values
}

/* ------------------------------------------------------------------ */
/* Silhouette polygon with boundary types                              */
/* ------------------------------------------------------------------ */

type EdgeType = 'seam' | 'open'
type Edge = { a: Vec2; b: Vec2; type: EdgeType }

function polyline(points: Vec2[], type: EdgeType, out: Edge[]) {
  for (let i = 0; i < points.length - 1; i++) out.push({ a: points[i]!, b: points[i + 1]!, type })
}

function silhouette(side: PanelSide) {
  const edges: Edge[] = []
  const sideSeam: Vec2[] = []
  for (let k = 0; k <= 24; k++) {
    const y = (k / 24) * P.U.y
    sideSeam.push({ x: sideX(y), y })
  }
  const neck: Vec2[] = []
  for (let k = 0; k <= 32; k++) neck.push(neckPoint(1 - (2 * k) / 32, side))

  polyline(
    [
      { x: -P.hemHalf, y: 0 },
      { x: P.hemHalf, y: 0 },
    ],
    'open',
    edges,
  ) // hem
  polyline(sideSeam, 'seam', edges)
  polyline([P.U, P.C2], 'seam', edges)
  polyline([P.C2, P.C1], 'open', edges) // right cuff
  polyline([P.C1, P.S, P.N], 'seam', edges) // top fold + shoulder
  polyline(neck, 'open', edges)
  polyline([mirror(P.N), mirror(P.S), mirror(P.C1)], 'seam', edges)
  polyline([mirror(P.C1), mirror(P.C2)], 'open', edges) // left cuff
  polyline([mirror(P.C2), mirror(P.U)], 'seam', edges)
  polyline([...sideSeam].reverse().map(mirror), 'seam', edges)
  return edges
}

function insidePolygon(p: Vec2, edges: Edge[]) {
  let inside = false
  for (const { a, b } of edges) {
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside
  }
  return inside
}

/* ------------------------------------------------------------------ */
/* Poisson "inflation" depth field                                     */
/* ------------------------------------------------------------------ */

/**
 * Solves ∇²φ = -1 over the silhouette with φ = 0 on seams (front and back meet there) and a
 * zero-flux condition on the hem, cuffs and neckline (open tubes). z = k·√(2φ) then gives
 * elliptical cross-sections, like fabric filled by a body.
 */
function solveDepthField(edges: Edge[]) {
  const h = 0.5
  const x0 = -45
  const y0 = -2
  const nx = Math.ceil(90 / h)
  const ny = Math.ceil(77 / h)
  const count = nx * ny
  const inside = new Uint8Array(count)
  const type = new Uint8Array(count) // for outside cells near the domain: 1 = seam, 2 = open
  const phi = new Float32Array(count)

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (insidePolygon({ x: x0 + (i + 0.5) * h, y: y0 + (j + 0.5) * h }, edges))
        inside[j * nx + i] = 1
    }
  }
  // Boundary type of outside cells within a few cells of the domain.
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const id = j * nx + i
      if (inside[id]) continue
      let near = false
      for (let dj = -4; dj <= 4 && !near; dj++) {
        for (let di = -4; di <= 4; di++) {
          const ii = i + di
          const jj = j + dj
          if (ii >= 0 && jj >= 0 && ii < nx && jj < ny && inside[jj * nx + ii]) {
            near = true
            break
          }
        }
      }
      if (!near) continue
      const p = { x: x0 + (i + 0.5) * h, y: y0 + (j + 0.5) * h }
      let best = Infinity
      let bestType: EdgeType = 'seam'
      for (const edge of edges) {
        const d = distToSegment(p, edge.a, edge.b)
        if (d < best) {
          best = d
          bestType = edge.type
        }
      }
      type[id] = bestType === 'seam' ? 1 : 2
    }
  }

  const omega = 1.92
  const h2 = h * h
  for (let iter = 0; iter < 650; iter++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const id = j * nx + i
        if (!inside[id]) continue
        let sum = 0
        let denom = 4
        const neighbours = [id - 1, id + 1, id - nx, id + nx]
        for (const n of neighbours) {
          if (inside[n]) sum += phi[n]!
          else if (type[n] === 2) denom -= 1 // zero flux: neighbour mirrors this cell
        }
        const next = (sum + h2) / Math.max(denom, 1)
        phi[id] = phi[id]! + omega * (next - phi[id]!)
      }
    }
  }
  // Extend values a few cells past open edges so interpolation doesn't pinch the openings.
  const filled = new Uint8Array(inside)
  for (let pass = 0; pass < 4; pass++) {
    const snapshot = new Uint8Array(filled)
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const id = j * nx + i
        if (snapshot[id] || type[id] !== 2) continue
        let sum = 0
        let n = 0
        for (const nb of [id - 1, id + 1, id - nx, id + nx]) {
          if (snapshot[nb]) {
            sum += phi[nb]!
            n++
          }
        }
        if (n) {
          phi[id] = sum / n
          filled[id] = 1
        }
      }
    }
  }

  return (x: number, y: number) => {
    const fx = (x - x0) / h - 0.5
    const fy = (y - y0) / h - 0.5
    const i = Math.max(0, Math.min(nx - 2, Math.floor(fx)))
    const j = Math.max(0, Math.min(ny - 2, Math.floor(fy)))
    const tx = Math.min(1, Math.max(0, fx - i))
    const ty = Math.min(1, Math.max(0, fy - j))
    const at = (ii: number, jj: number) => phi[jj * nx + ii]!
    return (
      at(i, j) * (1 - tx) * (1 - ty) +
      at(i + 1, j) * tx * (1 - ty) +
      at(i, j + 1) * (1 - tx) * ty +
      at(i + 1, j + 1) * tx * ty
    )
  }
}

/* ------------------------------------------------------------------ */
/* Panel topology (welded grid patches)                                */
/* ------------------------------------------------------------------ */

type PanelVertex = {
  x: number
  y: number
  seam: boolean
  sleeve: 0 | 1 | -1
  su: number
  sv: number
}

type PanelTopology = {
  verts: PanelVertex[]
  tris: number[]
  hem: number[]
  neck: number[]
  cuffRight: number[]
  cuffLeft: number[]
}

const SHOULDER_FRACTION = 0.24
const BODY_COLUMNS = bodyColumns(SHOULDER_FRACTION, 22, 52)
const TORSO_ROWS = 56
const UPPER_ROWS = 26
const ARMHOLE = chebyshev(UPPER_ROWS) // shared by the upper body and both sleeves
const SLEEVE_ROWS = 34

function buildTopology(side: PanelSide): PanelTopology {
  const verts: PanelVertex[] = []
  const lookup = new Map<string, number>()
  const tris: number[] = []

  const add = (p: Vec2, seam: boolean, sleeve: 0 | 1 | -1 = 0, su = 0, sv = 0) => {
    const key = `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)}`
    const existing = lookup.get(key)
    if (existing !== undefined) {
      const v = verts[existing]!
      v.seam ||= seam
      return existing
    }
    verts.push({ x: p.x, y: p.y, seam, sleeve, su, sv })
    lookup.set(key, verts.length - 1)
    return verts.length - 1
  }

  const grid = (
    cols: number,
    rows: number,
    at: (i: number, j: number) => number,
    flip: boolean,
  ) => {
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = at(i, j)
        const b = at(i + 1, j)
        const c = at(i + 1, j + 1)
        const d = at(i, j + 1)
        const alt = (i + j) % 2 === 0
        const quad = alt ? [a, b, c, a, c, d] : [a, b, d, b, c, d]
        if (flip) for (let k = 0; k < 6; k += 3) tris.push(quad[k]!, quad[k + 2]!, quad[k + 1]!)
        else tris.push(...quad)
      }
    }
  }

  const cols = BODY_COLUMNS.length - 1

  // Lower torso: hem → underarm level.
  const torso: number[][] = []
  for (let j = 0; j <= TORSO_ROWS; j++) {
    const y = (j / TORSO_ROWS) * P.U.y
    const half = sideX(y)
    torso.push(
      BODY_COLUMNS.map((s, i) => add({ x: -half + 2 * half * s, y }, i === 0 || i === cols)),
    )
  }
  grid(cols, TORSO_ROWS, (i, j) => torso[j]![i]!, false)

  // Upper body (Coons patch): underarm line → shoulders and neckline.
  const uL = mirror(P.U)
  const sL = mirror(P.S)
  const nL = mirror(P.N)
  const a = SHOULDER_FRACTION
  const top = (s: number): Vec2 => {
    if (s <= a) return lerp2(sL, nL, s / a)
    if (s >= 1 - a) return lerp2(P.N, P.S, (s - (1 - a)) / a)
    return neckPoint(((s - a) / (1 - 2 * a)) * 2 - 1, side)
  }
  const bottom = (s: number): Vec2 => ({ x: -P.U.x + 2 * P.U.x * s, y: P.U.y })
  const upper: number[][] = []
  for (let j = 0; j <= UPPER_ROWS; j++) {
    const t = ARMHOLE[j]!
    upper.push(
      BODY_COLUMNS.map((s, i) => {
        const B = bottom(s)
        const T = top(s)
        const L = lerp2(uL, sL, t)
        const R = lerp2(P.U, P.S, t)
        const p = {
          x:
            (1 - t) * B.x +
            t * T.x +
            (1 - s) * L.x +
            s * R.x -
            ((1 - s) * (1 - t) * uL.x + s * (1 - t) * P.U.x + (1 - s) * t * sL.x + s * t * P.S.x),
          y:
            (1 - t) * B.y +
            t * T.y +
            (1 - s) * L.y +
            s * R.y -
            ((1 - s) * (1 - t) * uL.y + s * (1 - t) * P.U.y + (1 - s) * t * sL.y + s * t * P.S.y),
        }
        const onShoulder = j === UPPER_ROWS && (s <= a + 1e-9 || s >= 1 - a - 1e-9)
        const corner = j === 0 && (i === 0 || i === cols)
        return add(p, onShoulder || corner)
      }),
    )
  }
  grid(cols, UPPER_ROWS, (i, j) => upper[j]![i]!, false)

  // Sleeves: across (top fold → underarm) × along (armhole → cuff).
  const sleeve = (dir: 1 | -1) => {
    const S = dir === 1 ? P.S : sL
    const U = dir === 1 ? P.U : uL
    const C1 = dir === 1 ? P.C1 : mirror(P.C1)
    const C2 = dir === 1 ? P.C2 : mirror(P.C2)
    const rows: number[][] = []
    for (let k = 0; k <= UPPER_ROWS; k++) {
      const across = 1 - ARMHOLE[UPPER_ROWS - k]! // exactly mirrors the body's armhole samples
      rows.push(
        Array.from({ length: SLEEVE_ROWS + 1 }, (_, m) => {
          const t = m / SLEEVE_ROWS
          const p = lerp2(lerp2(S, U, across), lerp2(C1, C2, across), t)
          return add(p, k === 0 || k === UPPER_ROWS, dir, t, across)
        }),
      )
    }
    // rows[k][m]: k across, m along. Winding depends on the mirrored direction.
    grid(SLEEVE_ROWS, UPPER_ROWS, (m, k) => rows[k]![m]!, dir === 1)
    return rows.map((row) => row[SLEEVE_ROWS]!)
  }
  const cuffRight = sleeve(1)
  const cuffLeft = sleeve(-1)

  const hem = torso[0]!
  const neck = upper[UPPER_ROWS]!.filter(
    (_, i) => BODY_COLUMNS[i]! >= a - 1e-9 && BODY_COLUMNS[i]! <= 1 - a + 1e-9,
  )

  if (side === 'back') {
    for (let i = 0; i < tris.length; i += 3) {
      const tmp = tris[i + 1]!
      tris[i + 1] = tris[i + 2]!
      tris[i + 2] = tmp
    }
  }
  return { verts, tris, hem, neck, cuffRight, cuffLeft }
}

/* ------------------------------------------------------------------ */
/* Shape: inflation, sleeve bend, folds                                */
/* ------------------------------------------------------------------ */

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
function valueNoise(x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi)
  const b = hash(xi + 1, yi)
  const c = hash(xi, yi + 1)
  const d = hash(xi + 1, yi + 1)
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}
function fbm(x: number, y: number) {
  return (
    valueNoise(x, y) * 0.6 +
    valueNoise(x * 2.1 + 5.2, y * 2.1 + 1.3) * 0.3 +
    valueNoise(x * 4.3 + 9.1, y * 4.3 + 7.7) * 0.1 -
    0.5
  )
}

const SEAM_LINES: [Vec2, Vec2][] = (() => {
  const lines: [Vec2, Vec2][] = []
  for (const dir of [1, -1]) {
    const m = (p: Vec2) => (dir === 1 ? p : mirror(p))
    for (let k = 0; k < 12; k++) {
      const y0 = (k / 12) * P.U.y
      const y1 = ((k + 1) / 12) * P.U.y
      lines.push([m({ x: sideX(y0), y: y0 }), m({ x: sideX(y1), y: y1 })])
    }
    lines.push([m(P.U), m(P.C2)], [m(P.C1), m(P.S)], [m(P.S), m(P.N)])
  }
  return lines
})()

function seamDistance(x: number, y: number) {
  let best = Infinity
  const p = { x, y }
  for (const [a, b] of SEAM_LINES) best = Math.min(best, distToSegment(p, a, b))
  return best
}

function depthScale(x: number, y: number, side: PanelSide) {
  const neck = Math.exp(-(x * x + (y - 69) * (y - 69) * 1.4) / (2 * 7.5 * 7.5))
  const chest = Math.exp(-((y - 52) * (y - 52) + x * x * 0.36) / 220)
  const body = side === 'front' ? 0.45 + 0.05 * chest + 0.55 * neck : 0.42 + 0.33 * neck
  const toward = smoothstep(-1, 7, armholeDistance(x, y))
  return body + (0.74 - body) * toward
}

/** Bends the sleeves downward around a hinge near the armpit. */
function bendSleeve(x: number, y: number, z: number) {
  const w = smoothstep(0, 8, armholeDistance(x, y))
  if (w <= 0) return [x, y, z] as const
  const dir = x >= 0 ? 1 : -1
  const pivot = { x: dir * (P.U.x + (P.S.x - P.U.x) * 0.3), y: P.U.y + (P.S.y - P.U.y) * 0.3 }
  const angle = -dir * P.sleeveBend * w
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const dx = x - pivot.x
  const dy = y - pivot.y
  // a slight forward swing makes the sleeves hang naturally
  return [pivot.x + dx * c - dy * s, pivot.y + dx * s + dy * c, z + 1.4 * w] as const
}

function foldDisplacement(v: PanelVertex, side: PanelSide) {
  const { x, y } = v
  const sign = side === 'front' ? 1 : -1
  const fade = smoothstep(0, 3.5, seamDistance(x, y))
  let d = 0
  if (!v.sleeve) {
    const hemW = 1 - smoothstep(0, 11, y)
    d += 0.42 * hemW * Math.sin(0.36 * x + (sign > 0 ? 0.6 : 2.1)) * fade
    const drape = (1 - smoothstep(8, 36, y)) * smoothstep(1, 5, y)
    d += 0.24 * drape * Math.sin(0.23 * x + (sign > 0 ? 1.7 : 0.4)) * fade
    if (side === 'back')
      d += 0.2 * Math.exp(-((y - 50) ** 2) / 120) * Math.sin(0.34 * (Math.abs(x) - 7)) * fade
    else d += 0.12 * Math.exp(-((y - 56) ** 2) / 60) * Math.cos(0.15 * x) * fade
    d += 0.07 * (1 - smoothstep(P.hemBand - 0.2, P.hemBand + 0.2, y))
  } else {
    const along = v.su * 21
    d +=
      0.3 *
      smoothstep(0.55, 1, v.sv) *
      Math.exp(-((along - 4.5) ** 2) / 14) *
      Math.sin(along * 2.4) *
      fade
    d += 0.16 * smoothstep(14, 20, along) * Math.sin(v.sv * 9 + (sign > 0 ? 0.5 : 2.4)) * fade
    d += 0.07 * smoothstep(21 - P.cuffBand - 0.3, 21 - P.cuffBand + 0.1, along)
  }
  // Drag folds radiating from each armpit (symmetric front/back, so seams stay closed).
  for (const dir of [-1, 1]) {
    const px = x - 18.5 * dir
    const py = y - 40
    const ax = -0.8 * dir
    const ay = -0.6
    const along = px * ax + py * ay
    const across = -px * ay + py * ax
    const env = Math.exp(-(along * along) / 98 - (across * across) / 35)
    d += 0.36 * env * Math.sin(across * 2.1 + 0.8)
  }
  // A soft crease along the set-in sleeve seam.
  const dArm = armholeDistance(x, y)
  if (y > P.U.y - 2) d -= 0.12 * Math.exp(-(dArm * dArm) / 0.25)
  d += 0.14 * fbm(x * 0.09 + (sign > 0 ? 0 : 31.7), y * 0.09) * fade
  return d
}

/* ------------------------------------------------------------------ */
/* Mesh assembly                                                        */
/* ------------------------------------------------------------------ */

export type GarmentGeometry = {
  geometry: THREE.BufferGeometry
  paintGeometry: THREE.BufferGeometry
  bounds: THREE.Box3
}

type Builder = { pos: number[]; nrm: number[]; uv: number[]; idx: number[] }

function computeNormals(positions: Float32Array, indices: number[]) {
  const normals = new Float32Array(positions.length)
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 3
    const b = indices[i + 1]! * 3
    const c = indices[i + 2]! * 3
    const abx = positions[b]! - positions[a]!
    const aby = positions[b + 1]! - positions[a + 1]!
    const abz = positions[b + 2]! - positions[a + 2]!
    const acx = positions[c]! - positions[a]!
    const acy = positions[c + 1]! - positions[a + 1]!
    const acz = positions[c + 2]! - positions[a + 2]!
    const nx = aby * acz - abz * acy
    const ny = abz * acx - abx * acz
    const nz = abx * acy - aby * acx
    for (const k of [a, b, c]) {
      normals[k] += nx
      normals[k + 1] += ny
      normals[k + 2] += nz
    }
  }
  return normals
}

function normalizeInPlace(normals: Float32Array) {
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!) || 1
    normals[i]! /= l
    normals[i + 1]! /= l
    normals[i + 2]! /= l
  }
}

/** Averages normals of coincident vertices across the front/back seams. */
function weldNormals(panels: { positions: Float32Array; normals: Float32Array }[]) {
  const groups = new Map<string, { panel: number; index: number }[]>()
  panels.forEach(({ positions }, panel) => {
    for (let i = 0; i < positions.length; i += 3) {
      const key = `${Math.round(positions[i]! * 1e3)},${Math.round(positions[i + 1]! * 1e3)},${Math.round(positions[i + 2]! * 1e3)}`
      const list = groups.get(key)
      if (list) list.push({ panel, index: i })
      else groups.set(key, [{ panel, index: i }])
    }
  })
  for (const list of groups.values()) {
    if (list.length < 2) continue
    let x = 0
    let y = 0
    let z = 0
    for (const { panel, index } of list) {
      const n = panels[panel]!.normals
      x += n[index]!
      y += n[index + 1]!
      z += n[index + 2]!
    }
    for (const { panel, index } of list) {
      const n = panels[panel]!.normals
      n[index] = x
      n[index + 1] = y
      n[index + 2] = z
    }
  }
  for (const { normals } of panels) normalizeInPlace(normals)
}

function loft(
  builder: Builder,
  loop: { p: THREE.Vector3; n: THREE.Vector3 }[],
  profile: [number, number][],
  strips: { name: StripName; from: number; to: number }[],
  closed: boolean,
  sideDirection: (i: number, tangent: THREE.Vector3, normal: THREE.Vector3) => THREE.Vector3,
) {
  const base = builder.pos.length / 3
  const count = loop.length
  // arc length along the loop (for UVs)
  const arc: number[] = [0]
  for (let i = 1; i < count; i++) arc.push(arc[i - 1]! + loop[i]!.p.distanceTo(loop[i - 1]!.p))
  const profileArc: number[] = [0]
  for (let k = 1; k < profile.length; k++) {
    profileArc.push(
      profileArc[k - 1]! +
        Math.hypot(profile[k]![0] - profile[k - 1]![0], profile[k]![1] - profile[k - 1]![1]),
    )
  }
  const tangent = new THREE.Vector3()
  for (let i = 0; i < count; i++) {
    const prev = loop[closed ? (i - 1 + count) % count : Math.max(0, i - 1)]!.p
    const next = loop[closed ? (i + 1) % count : Math.min(count - 1, i + 1)]!.p
    tangent.subVectors(next, prev).normalize()
    const { p, n } = loop[i]!
    const e = sideDirection(i, tangent, n)
    const strip = strips.find((entry) => i >= entry.from && i <= entry.to) ?? strips[0]!
    const along = arc[i]! - arc[strip.from]!
    profile.forEach(([pe, pn], k) => {
      builder.pos.push(
        p.x + e.x * pe + n.x * pn,
        p.y + e.y * pe + n.y * pn,
        p.z + e.z * pe + n.z * pn,
      )
      builder.nrm.push(0, 0, 0)
      const [u, v] = stripUV(strip.name, along, profileArc[k]!)
      builder.uv.push(u, v)
    })
  }
  const width = profile.length
  const segments = closed ? count : count - 1
  for (let i = 0; i < segments; i++) {
    const a = i
    const b = (i + 1) % count
    // Don't stitch across a UV strip boundary.
    const stripA = strips.find((entry) => a >= entry.from && a <= entry.to)
    const stripB = strips.find((entry) => b >= entry.from && b <= entry.to)
    if (stripA !== stripB) continue
    for (let k = 0; k < width - 1; k++) {
      const v00 = base + a * width + k
      const v01 = base + a * width + k + 1
      const v10 = base + b * width + k
      const v11 = base + b * width + k + 1
      builder.idx.push(v00, v10, v11, v00, v11, v01)
    }
  }
}

export function buildGarment(): GarmentGeometry {
  const field = solveDepthField(silhouette('back'))
  const sides: PanelSide[] = ['front', 'back']
  const panels = sides.map((side) => {
    const topo = buildTopology(side)
    const positions = new Float32Array(topo.verts.length * 3)
    topo.verts.forEach((v, i) => {
      const phi = Math.max(0, field(v.x, v.y))
      const z = v.seam
        ? 0
        : (side === 'front' ? 1 : -1) * depthScale(v.x, v.y, side) * Math.sqrt(2 * phi)
      const [bx, by, bz] = bendSleeve(v.x, v.y, z)
      positions[i * 3] = bx
      positions[i * 3 + 1] = by
      positions[i * 3 + 2] = bz
    })
    return { side, topo, positions, normals: computeNormals(positions, topo.tris) }
  })
  weldNormals(panels)
  // Folds and wrinkles along the smooth normals, then final normals.
  for (const panel of panels) {
    panel.topo.verts.forEach((v, i) => {
      const d = foldDisplacement(v, panel.side)
      panel.positions[i * 3]! += panel.normals[i * 3]! * d
      panel.positions[i * 3 + 1]! += panel.normals[i * 3 + 1]! * d
      panel.positions[i * 3 + 2]! += panel.normals[i * 3 + 2]! * d
    })
  }
  for (const panel of panels) panel.normals = computeNormals(panel.positions, panel.topo.tris)
  weldNormals(panels)

  const body: Builder = { pos: [], nrm: [], uv: [], idx: [] }
  const offsets: number[] = []
  for (const panel of panels) {
    const base = body.pos.length / 3
    offsets.push(base)
    panel.topo.verts.forEach((v, i) => {
      body.pos.push(
        panel.positions[i * 3]!,
        panel.positions[i * 3 + 1]!,
        panel.positions[i * 3 + 2]!,
      )
      body.nrm.push(panel.normals[i * 3]!, panel.normals[i * 3 + 1]!, panel.normals[i * 3 + 2]!)
      const [u, w] = patternToUV(v.x, v.y, panel.side)
      body.uv.push(u, w)
    })
    for (const index of panel.topo.tris) body.idx.push(base + index)
  }

  const vertexOf = (panel: number, index: number) => {
    const p = panels[panel]!
    return {
      p: new THREE.Vector3(
        p.positions[index * 3]!,
        p.positions[index * 3 + 1]!,
        p.positions[index * 3 + 2]!,
      ),
      n: new THREE.Vector3(
        p.normals[index * 3]!,
        p.normals[index * 3 + 1]!,
        p.normals[index * 3 + 2]!,
      ),
    }
  }

  // Rolled hems (fabric thickness) around the bottom opening and both cuffs.
  const rimProfile: [number, number][] = Array.from({ length: 11 }, (_, k) => {
    const theta = (k / 10) * Math.PI * 2
    return [-0.08 + Math.sin(theta) * 0.24, -0.16 + Math.cos(theta) * 0.24]
  })
  const rimLoop = (frontIdx: number[], backIdx: number[]) => [
    ...frontIdx.map((i) => vertexOf(0, i)),
    ...[...backIdx]
      .reverse()
      .slice(1, -1)
      .map((i) => vertexOf(1, i)),
  ]
  const openingDirection =
    (down: THREE.Vector3) => (_i: number, tangent: THREE.Vector3, normal: THREE.Vector3) => {
      const e = new THREE.Vector3().crossVectors(normal, tangent).normalize()
      return e.dot(down) < 0 ? e.negate() : e
    }
  const front = panels[0]!.topo
  const back = panels[1]!.topo
  const hemFrontCount = front.hem.length
  loft(
    body,
    rimLoop(front.hem, back.hem),
    rimProfile,
    [
      { name: 'hemFront', from: 0, to: hemFrontCount - 1 },
      { name: 'hemBack', from: hemFrontCount, to: hemFrontCount + back.hem.length - 3 },
    ],
    true,
    openingDirection(new THREE.Vector3(0, -1, 0)),
  )
  for (const [dir, frontStrip, backStrip] of [
    [1, 'cuffRightFront', 'cuffRightBack'],
    [-1, 'cuffLeftFront', 'cuffLeftBack'],
  ] as const) {
    const fCuff = dir === 1 ? front.cuffRight : front.cuffLeft
    const bCuff = dir === 1 ? back.cuffRight : back.cuffLeft
    const outward = new THREE.Vector3(dir * Math.cos(0.75), -Math.sin(0.75), 0)
    loft(
      body,
      rimLoop(fCuff, bCuff),
      rimProfile,
      [
        { name: frontStrip, from: 0, to: fCuff.length - 1 },
        { name: backStrip, from: fCuff.length, to: fCuff.length + bCuff.length - 3 },
      ],
      true,
      openingDirection(outward),
    )
  }
  const bodyIndexCount = body.idx.length

  // Rib-knit collar band, folded over the neckline.
  const collar: Builder = { pos: body.pos, nrm: body.nrm, uv: body.uv, idx: body.idx }
  const neckLoop = [
    ...front.neck.map((i) => vertexOf(0, i)),
    ...[...back.neck]
      .reverse()
      .slice(1, -1)
      .map((i) => vertexOf(1, i)),
  ]
  const collarProfile: [number, number][] = [
    [0, 0.0],
    [0.5, 0.06],
    [1.1, 0.09],
    [1.6, 0.08],
    [1.88, 0.02],
    [2.0, -0.12],
    [1.9, -0.27],
    [1.4, -0.32],
    [0.7, -0.33],
    [0.0, -0.32],
    [-0.6, -0.3],
  ]
  loft(
    collar,
    neckLoop,
    collarProfile,
    [{ name: 'collar', from: 0, to: neckLoop.length - 1 }],
    true,
    (_i, tangent, normal) => {
      const e = new THREE.Vector3().crossVectors(normal, tangent).normalize()
      return e.y < 0 ? e.negate() : e
    },
  )

  // Final buffers (centimetres → metres) with smooth normals for the lofted parts.
  const positions = new Float32Array(body.pos.map((value) => value * CM))
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(body.uv, 2))
  geometry.setIndex(body.idx)
  const lofted = computeNormals(
    positions,
    body.idx.slice(offsets.length ? panelsIndexCount(panels) : 0),
  )
  const normals = new Float32Array(body.nrm)
  const panelVertexCount = panels.reduce((sum, panel) => sum + panel.topo.verts.length, 0)
  for (let i = panelVertexCount * 3; i < normals.length; i++) normals[i] = lofted[i]!
  normalizeInPlace(normals)
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.addGroup(0, bodyIndexCount, 0)
  geometry.addGroup(bodyIndexCount, body.idx.length - bodyIndexCount, 1)
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  return {
    geometry,
    paintGeometry: buildPaintGeometry(geometry),
    bounds: geometry.boundingBox!.clone(),
  }
}

function panelsIndexCount(panels: { topo: PanelTopology }[]) {
  return panels.reduce((sum, panel) => sum + panel.topo.tris.length, 0)
}

/* ------------------------------------------------------------------ */
/* Paint geometry: unindexed triangles + UV-space gutter skirts         */
/* ------------------------------------------------------------------ */

/**
 * Rendered in UV space by the paint shader. Each triangle carries its 3D centre and radius so
 * the vertex shader can cull everything far from the brush. Skirts extend every UV-island
 * border outward by a few texels so mipmapping never reveals unpainted gaps along UV seams.
 */
function buildPaintGeometry(source: THREE.BufferGeometry) {
  const pos = source.getAttribute('position') as THREE.BufferAttribute
  const nrm = source.getAttribute('normal') as THREE.BufferAttribute
  const uv = source.getAttribute('uv') as THREE.BufferAttribute
  const index = source.getIndex()!
  const out = {
    pos: [] as number[],
    nrm: [] as number[],
    uv: [] as number[],
    center: [] as number[],
    radius: [] as number[],
  }
  const edgeUse = new Map<string, { a: number; b: number; c: number; count: number }>()

  const pushVertex = (i: number, uvOverride?: [number, number]) => {
    out.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i))
    out.nrm.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i))
    out.uv.push(uvOverride ? uvOverride[0] : uv.getX(i), uvOverride ? uvOverride[1] : uv.getY(i))
  }
  const tri = new THREE.Triangle()
  const centre = new THREE.Vector3()
  const va = new THREE.Vector3()
  const vb = new THREE.Vector3()
  const vc = new THREE.Vector3()
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t)
    const b = index.getX(t + 1)
    const c = index.getX(t + 2)
    va.fromBufferAttribute(pos, a)
    vb.fromBufferAttribute(pos, b)
    vc.fromBufferAttribute(pos, c)
    tri.set(va, vb, vc)
    tri.getMidpoint(centre)
    const radius = Math.max(centre.distanceTo(va), centre.distanceTo(vb), centre.distanceTo(vc))
    for (const i of [a, b, c]) {
      pushVertex(i)
      out.center.push(centre.x, centre.y, centre.z)
      out.radius.push(radius)
    }
    for (const [p, q, r] of [
      [a, b, c],
      [b, c, a],
      [c, a, b],
    ] as const) {
      const key = p < q ? `${p}_${q}` : `${q}_${p}`
      const entry = edgeUse.get(key)
      if (entry) entry.count++
      else edgeUse.set(key, { a: p, b: q, c: r, count: 1 })
    }
  }

  const gutter = 3 / 2048
  for (const { a, b, c, count } of edgeUse.values()) {
    if (count !== 1) continue
    const ua = [uv.getX(a), uv.getY(a)] as const
    const ub = [uv.getX(b), uv.getY(b)] as const
    const uc = [uv.getX(c), uv.getY(c)] as const
    let nx = -(ub[1] - ua[1])
    let ny = ub[0] - ua[0]
    const len = Math.hypot(nx, ny) || 1
    nx /= len
    ny /= len
    // point away from the triangle's third vertex
    const mx = (ua[0] + ub[0]) / 2
    const my = (ua[1] + ub[1]) / 2
    if ((uc[0] - mx) * nx + (uc[1] - my) * ny > 0) {
      nx = -nx
      ny = -ny
    }
    const oa: [number, number] = [ua[0] + nx * gutter, ua[1] + ny * gutter]
    const ob: [number, number] = [ub[0] + nx * gutter, ub[1] + ny * gutter]
    va.fromBufferAttribute(pos, a)
    vb.fromBufferAttribute(pos, b)
    centre.addVectors(va, vb).multiplyScalar(0.5)
    const radius = va.distanceTo(vb) / 2
    const quad: [number, [number, number] | undefined][] = [
      [a, undefined],
      [b, undefined],
      [b, ob],
      [a, undefined],
      [b, ob],
      [a, oa],
    ]
    for (const [i, override] of quad) {
      pushVertex(i, override)
      out.center.push(centre.x, centre.y, centre.z)
      out.radius.push(radius)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(out.nrm, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2))
  geometry.setAttribute('triCenter', new THREE.Float32BufferAttribute(out.center, 3))
  geometry.setAttribute('triRadius', new THREE.Float32BufferAttribute(out.radius, 1))
  return geometry
}
