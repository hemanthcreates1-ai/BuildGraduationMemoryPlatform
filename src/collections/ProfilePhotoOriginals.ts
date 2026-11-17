import type { Access, CollectionConfig, FieldHook, Where } from 'payload'

import { adminField, isAdmin, isStudent, serverOwned } from '../access'
import { privateNoStore } from '../fields/contribution'

const ownOrAdmin: Access = ({ req }) => {
  if (isAdmin(req)) return true
  if (!isStudent(req) || !req.user?.id) return false
  return { student: { equals: req.user.id } } satisfies Where
}

const forceStudent: FieldHook = ({ operation, req, value, originalDoc }) => {
  if (isStudent(req) && req.user) {
    return operation === 'create' ? req.user.id : originalDoc?.student
  }
  return value
}

/** Untouched profile uploads. Private to the owning student and administrators. */
export const ProfilePhotoOriginals: CollectionConfig = {
  slug: 'profile-photo-originals',
  labels: { singular: 'Profile photo original', plural: 'Profile photo originals' },
  admin: {
    group: 'Batch',
    useAsTitle: 'sourceFilename',
    defaultColumns: ['sourceFilename', 'student', 'createdAt'],
  },
  access: {
    read: ownOrAdmin,
    create: ({ req }) => isStudent(req) || isAdmin(req),
    update: () => false,
    delete: ownOrAdmin,
  },
  authorship: false,
  upload: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    focalPoint: false,
    crop: false,
    modifyResponseHeaders: privateNoStore,
  },
  fields: [
    {
      name: 'student',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      access: { create: serverOwned, update: adminField },
      hooks: { beforeChange: [forceStudent] },
    },
    {
      name: 'sourceFilename',
      type: 'text',
      required: true,
      access: { create: serverOwned, update: adminField },
    },
  ],
}
