import type { Payload, Where } from 'payload'

import type { AppUser } from '../app-auth'
import { JERSEY_UV_LAYOUT, normalizeRollNumber, ROLL_NUMBER_PATTERN, WALL } from '../constants'
import { getPayloadClient } from '../payload'

/*
 * Student-facing reads. Every query passes the signed-in user with `overrideAccess: false`
 * and selects an explicit allow-list of fields, so contributor/uploader identity can never
 * appear in what is sent to a browser, even when an administrator views these pages.
 */

export type PhotoRef = { url: string; width: number; height: number } | null
export type RosterEntry = { id: string; rollNumber: string; rosterOrder: number; photo: PhotoRef }

export type JerseyLayer = { id: string; createdAt: string; url: string }
export type MessageCard = { id: string; message: string; createdAt: string }
export type WallPhoto = {
  id: string
  x: number
  y: number
  rotation: number
  w: number
  h: number
  src: string
  fullSrc: string | null
  fullWidth: number
  fullHeight: number
  placeholder: string | null
  color: string
  publishedAt: string | null
  draft: boolean
}

function photoRef(value: unknown): PhotoRef {
  if (!value || typeof value !== 'object') return null
  const doc = value as { url?: string | null; width?: number | null; height?: number | null }
  if (!doc.url) return null
  return { url: doc.url, width: doc.width ?? 640, height: doc.height ?? 800 }
}

const studentSelect = { rollNumber: true, rosterOrder: true, profilePhoto: true } as const
const portraitPopulate = {
  'profile-photos': { url: true, filename: true, width: true, height: true },
} as const

export async function getRoster(user: AppUser): Promise<RosterEntry[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'users',
    where: { role: { equals: 'student' } },
    sort: 'rosterOrder',
    limit: 300,
    depth: 1,
    overrideAccess: false,
    user,
    select: studentSelect,
    populate: portraitPopulate,
  })
  return docs
    .filter((doc) => doc.rollNumber)
    .map((doc) => ({
      id: doc.id,
      rollNumber: doc.rollNumber as string,
      rosterOrder: doc.rosterOrder ?? 0,
      photo: photoRef(doc.profilePhoto),
    }))
}

export async function getStudentByRoll(
  user: AppUser,
  rollInput: string,
): Promise<RosterEntry | null> {
  const roll = normalizeRollNumber(decodeURIComponent(rollInput))
  if (!ROLL_NUMBER_PATTERN.test(roll)) return null
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'users',
    where: { and: [{ rollNumber: { equals: roll } }, { role: { equals: 'student' } }] },
    limit: 1,
    depth: 1,
    overrideAccess: false,
    user,
    select: studentSelect,
    populate: portraitPopulate,
  })
  const doc = docs[0]
  if (!doc?.rollNumber) return null
  return {
    id: doc.id,
    rollNumber: doc.rollNumber,
    rosterOrder: doc.rosterOrder ?? 0,
    photo: photoRef(doc.profilePhoto),
  }
}

export async function getOwnProfile(user: AppUser): Promise<RosterEntry | null> {
  if (user.role !== 'student') return null
  const payload = await getPayloadClient()
  const doc = await payload.findByID({
    collection: 'users',
    id: user.id,
    depth: 1,
    overrideAccess: false,
    user,
    select: studentSelect,
    populate: portraitPopulate,
    disableErrors: true,
  })
  if (!doc?.rollNumber) return null
  return {
    id: doc.id,
    rollNumber: doc.rollNumber,
    rosterOrder: doc.rosterOrder ?? 0,
    photo: photoRef(doc.profilePhoto),
  }
}

export const layerUrl = (id: string) => `/api/lj/layers/${id}`

export async function getJerseyLayers(user: AppUser, ownerId: string): Promise<JerseyLayer[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'jersey-artworks',
    where: { and: [{ jerseyOwner: { equals: ownerId } }, { status: { equals: 'published' } }] },
    sort: 'createdAt',
    limit: 5000,
    depth: 0,
    overrideAccess: false,
    user,
    select: { createdAt: true, uvLayout: true },
  })
  return docs
    .filter((doc) => !doc.uvLayout || doc.uvLayout === JERSEY_UV_LAYOUT)
    .map((doc) => ({ id: doc.id, createdAt: doc.createdAt, url: layerUrl(doc.id) }))
}

export async function getJerseyMessages(user: AppUser, ownerId: string): Promise<MessageCard[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'jersey-messages',
    where: { and: [{ jerseyOwner: { equals: ownerId } }, { status: { equals: 'published' } }] },
    sort: 'createdAt',
    limit: 5000,
    depth: 0,
    overrideAccess: false,
    user,
    select: { message: true, createdAt: true },
  })
  return docs.map((doc) => ({ id: doc.id, message: doc.message, createdAt: doc.createdAt }))
}

const wallSelect = {
  url: true,
  filename: true,
  x: true,
  y: true,
  rotation: true,
  frameWidth: true,
  frameHeight: true,
  placeholder: true,
  dominantColor: true,
  publishedAt: true,
  createdAt: true,
  status: true,
  fullFile: true,
} as const

export function toWallPhoto(doc: Record<string, unknown>): WallPhoto | null {
  if (typeof doc.url !== 'string') return null
  const full =
    doc.fullFile && typeof doc.fullFile === 'object'
      ? (doc.fullFile as Record<string, unknown>)
      : null
  return {
    id: String(doc.id),
    x: Number(doc.x),
    y: Number(doc.y),
    rotation: Number(doc.rotation ?? 0),
    w: Number(doc.frameWidth ?? WALL.frameWidth),
    h: Number(doc.frameHeight ?? WALL.frameHeight),
    src: typeof full?.url === 'string' ? full.url : doc.url,
    fullSrc: typeof full?.url === 'string' ? full.url : null,
    fullWidth: Number(full?.width ?? 0),
    fullHeight: Number(full?.height ?? 0),
    placeholder: typeof doc.placeholder === 'string' ? doc.placeholder : null,
    color: typeof doc.dominantColor === 'string' ? doc.dominantColor : '#e9dfd0',
    publishedAt: typeof doc.publishedAt === 'string' ? doc.publishedAt : null,
    draft: doc.status === 'draft',
  }
}

/** Published photos plus the signed-in student's own unfinished drafts. */
export async function getWallPhotos(user: AppUser): Promise<WallPhoto[]> {
  const payload = await getPayloadClient()
  // For students the collection access rule adds "published OR (my draft)"; querying `uploader`
  // directly is not allowed for them because the field is admin-only.
  const where: Where =
    user.role === 'admin'
      ? { status: { equals: 'published' } }
      : { status: { in: ['published', 'draft'] } }
  const { docs } = await payload.find({
    collection: 'memory-photos',
    where,
    sort: 'publishedAt',
    limit: 5000,
    depth: 1,
    overrideAccess: false,
    user,
    select: wallSelect,
    populate: { 'memory-photo-sources': { url: true, filename: true, width: true, height: true } },
  })
  return docs
    .map((doc) => toWallPhoto(doc as unknown as Record<string, unknown>))
    .filter((photo): photo is WallPhoto => photo !== null)
}

export async function getWallPhotoForUser(user: AppUser, id: string) {
  const payload = await getPayloadClient()
  const doc = await payload.findByID({
    collection: 'memory-photos',
    id,
    depth: 1,
    overrideAccess: false,
    user,
    select: wallSelect,
    populate: { 'memory-photo-sources': { url: true, filename: true, width: true, height: true } },
    disableErrors: true,
  })
  return doc ? toWallPhoto(doc as unknown as Record<string, unknown>) : null
}

/** System lookup for idempotent retries; returns who created the record (server-side only). */
export async function findSubmission(
  payload: Payload,
  collection: 'jersey-artworks' | 'jersey-messages' | 'signature-entries' | 'memory-photos',
  submissionId: string,
) {
  const { docs } = await payload.find({
    collection,
    where: { submissionId: { equals: submissionId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = docs[0] as unknown as Record<string, unknown> | undefined
  if (!doc) return null
  const owner = (doc.contributor ?? doc.uploader) as string | { id: string } | undefined
  return { doc, creatorId: typeof owner === 'object' ? owner?.id : owner }
}
