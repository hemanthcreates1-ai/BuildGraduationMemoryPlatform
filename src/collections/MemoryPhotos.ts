import type { Access, CollectionAfterChangeHook, CollectionConfig, FieldHook, Where } from 'payload'
import { APIError } from 'payload'

import { adminField, isAdmin, isStudent, serverOwned, studentsOrAdminsCreate } from '../access'
import { privateNoStore } from '../fields/contribution'
import { WALL } from '../lib/constants'

const ownDraft = (req: Parameters<Access>[0]['req']): Where => ({
  and: [{ status: { equals: 'draft' } }, { uploader: { equals: req.user?.id } }],
})

const readAccess: Access = ({ req }) => {
  if (isAdmin(req)) return true
  if (isStudent(req)) {
    return { or: [{ status: { equals: 'published' } } satisfies Where, ownDraft(req)] }
  }
  return false
}

/** Students may only touch their own unpublished draft (position, rotation, publish). */
const ownDraftOnly: Access = ({ req }) => {
  if (isAdmin(req)) return true
  if (isStudent(req)) return ownDraft(req)
  return false
}

/** Students can only move a draft to `published`; moderation states are admin-only. */
const guardStatus: FieldHook = ({ originalDoc, operation, req, value }) => {
  if (isAdmin(req)) return value
  if (operation === 'create') return 'draft'
  if (originalDoc?.status === 'draft' && (value === 'draft' || value === 'published')) return value
  throw new APIError('This photograph can no longer be changed.', 403)
}

const forceUploader: FieldHook = ({ operation, req, value, originalDoc }) => {
  if (operation === 'create' && isStudent(req) && req.user) return req.user.id
  if (operation === 'update' && !isAdmin(req)) return originalDoc?.uploader
  return value
}

const clamp =
  (min: number, max: number): FieldHook =>
  ({ value }) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.min(max, Math.max(min, value))
      : value

const stampPublishedAt: FieldHook = ({ siblingData, originalDoc, value }) => {
  if (siblingData?.status === 'published' && originalDoc?.status !== 'published' && !value) {
    return new Date().toISOString()
  }
  return value
}

/** Keep the derived image records' visibility in sync with the photo's status. */
const syncSourceVisibility: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  if (operation === 'create' || previousDoc?.status === doc.status) return doc
  const ids = [doc.fullFile, doc.originalFile]
    .map((value) => (value && typeof value === 'object' ? value.id : value))
    .filter(Boolean)
  for (const id of ids) {
    await req.payload.update({
      collection: 'memory-photo-sources',
      id,
      data: { visibility: doc.status },
      overrideAccess: true,
      req,
    })
  }
  return doc
}

/**
 * A memory wall photograph. The display upload and full-size version preserve the complete
 * source ratio; the untouched original lives in `memory-photo-sources`. Coordinates and
 * aspect-derived frame dimensions are wall world units, independent of any screen.
 */
export const MemoryPhotos: CollectionConfig = {
  slug: 'memory-photos',
  // Contributor identity is stored only in the admin-only fields below; no automatic
  // createdBy/updatedBy stamping that could expose it.
  authorship: false,
  labels: { singular: 'Memory wall photo', plural: 'Memory wall photos' },
  admin: {
    group: 'Contributions',
    defaultColumns: ['filename', 'uploader', 'status', 'x', 'y', 'publishedAt'],
  },
  defaultSort: 'publishedAt',
  access: {
    read: readAccess,
    create: studentsOrAdminsCreate,
    update: ownDraftOnly,
    delete: ownDraftOnly,
  },
  hooks: { afterChange: [syncSourceVisibility] },
  upload: {
    mimeTypes: ['image/webp', 'image/jpeg'],
    focalPoint: false,
    crop: false,
    modifyResponseHeaders: privateNoStore,
  },
  fields: [
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      index: true,
      options: [
        { label: 'Draft (being placed)', value: 'draft' },
        { label: 'Published', value: 'published' },
        { label: 'Removed by moderator', value: 'removed' },
      ],
      hooks: { beforeChange: [guardStatus] },
      admin: { position: 'sidebar' },
    },
    {
      name: 'uploader',
      label: 'Uploader (private)',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      access: { read: adminField },
      hooks: { beforeChange: [forceUploader] },
      admin: { position: 'sidebar', description: 'Private. Only administrators can see this.' },
    },
    {
      name: 'submissionId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      access: { read: adminField, update: () => false },
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'publishedAt',
      type: 'date',
      index: true,
      access: { update: adminField },
      hooks: { beforeChange: [stampPublishedAt] },
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'x',
          type: 'number',
          required: true,
          min: 0,
          max: WALL.width,
          hooks: { beforeValidate: [clamp(0, WALL.width)] },
        },
        {
          name: 'y',
          type: 'number',
          required: true,
          min: 0,
          max: WALL.height,
          hooks: { beforeValidate: [clamp(0, WALL.height)] },
        },
        {
          name: 'rotation',
          type: 'number',
          required: true,
          defaultValue: 0,
          min: -WALL.maxRotation,
          max: WALL.maxRotation,
          hooks: { beforeValidate: [clamp(-WALL.maxRotation, WALL.maxRotation)] },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'frameWidth',
          type: 'number',
          defaultValue: WALL.frameWidth,
          access: { create: serverOwned, update: adminField },
        },
        {
          name: 'frameHeight',
          type: 'number',
          defaultValue: WALL.frameHeight,
          access: { create: serverOwned, update: adminField },
        },
      ],
    },
    {
      name: 'placeholder',
      label: 'Tiny blurred preview (data URL)',
      type: 'textarea',
      access: { create: serverOwned, update: adminField },
      admin: { readOnly: true },
    },
    {
      name: 'dominantColor',
      type: 'text',
      access: { create: serverOwned, update: adminField },
      admin: { readOnly: true },
    },
    {
      name: 'fullFile',
      label: 'Full-size version',
      type: 'relationship',
      relationTo: 'memory-photo-sources',
      access: { create: serverOwned, update: adminField },
    },
    {
      name: 'originalFile',
      label: 'Original upload (private)',
      type: 'relationship',
      relationTo: 'memory-photo-sources',
      access: { read: adminField, create: serverOwned, update: adminField },
    },
    {
      name: 'originalInfo',
      label: 'Original file details',
      type: 'group',
      access: { read: adminField, create: serverOwned, update: adminField },
      fields: [
        { name: 'width', type: 'number' },
        { name: 'height', type: 'number' },
        { name: 'format', type: 'text' },
        { name: 'bytes', type: 'number' },
        {
          name: 'browserOptimized',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description:
              'True when the photo was larger than the upload limit and was re-encoded in the browser before upload.',
          },
        },
        { name: 'clientOriginalBytes', type: 'number' },
      ],
    },
  ],
}
