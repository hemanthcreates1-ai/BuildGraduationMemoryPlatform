import type { Access, CollectionConfig, Where } from 'payload'

import { adminField, isAdmin, isStudent, serverOwned, studentsOrAdminsCreate } from '../access'
import { privateNoStore } from '../fields/contribution'

/**
 * Full-size and original files for memory wall photos.
 * - `full`: EXIF-stripped, auto-rotated, uncropped version classmates can open.
 * - `original`: the untouched uploaded file, readable by administrators only.
 */
const readAccess: Access = ({ req }) => {
  if (isAdmin(req)) return true
  const userId = req.user?.id
  if (isStudent(req) && userId) {
    const kind: Where = { kind: { equals: 'full' } }
    const published: Where = { visibility: { equals: 'published' } }
    const owned: Where = { owner: { equals: userId } }
    const visibility: Where = { or: [published, owned] }
    return { and: [kind, visibility] }
  }
  return false
}

export const MemoryPhotoSources: CollectionConfig = {
  slug: 'memory-photo-sources',
  // Contributor identity is stored only in the admin-only fields below; no automatic
  // createdBy/updatedBy stamping that could expose it.
  authorship: false,
  labels: { singular: 'Memory photo file', plural: 'Memory photo files' },
  admin: {
    group: 'Contributions',
    defaultColumns: ['filename', 'kind', 'visibility', 'owner', 'createdAt'],
  },
  access: {
    read: readAccess,
    create: studentsOrAdminsCreate,
    update: ({ req }) => isAdmin(req),
    delete: ({ req }) => isAdmin(req),
  },
  upload: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    focalPoint: false,
    crop: false,
    modifyResponseHeaders: privateNoStore,
  },
  fields: [
    {
      name: 'kind',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Full-size (classmates)', value: 'full' },
        { label: 'Original (administrators only)', value: 'original' },
      ],
      access: { create: serverOwned, update: adminField },
    },
    {
      name: 'visibility',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      index: true,
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
        { label: 'Removed', value: 'removed' },
      ],
      access: { create: adminField, update: adminField },
    },
    {
      name: 'owner',
      label: 'Uploader (private)',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      access: { read: adminField, update: adminField },
      hooks: {
        beforeChange: [
          ({ operation, req, value }) =>
            operation === 'create' && isStudent(req) && req.user ? req.user.id : value,
        ],
      },
    },
  ],
}
