import type { CollectionConfig } from 'payload'

import type { Access, FieldHook, Where } from 'payload'

import { adminField, isAdmin, isStudent, serverOwned, signedIn } from '../access'
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

/** Admin-managed yearbook portraits (stored as 4:5 portrait crops). */
export const ProfilePhotos: CollectionConfig = {
  slug: 'profile-photos',
  labels: { singular: 'Profile photo', plural: 'Profile photos' },
  admin: {
    group: 'Batch',
    useAsTitle: 'label',
    defaultColumns: ['label', 'student', 'createdAt'],
  },
  access: {
    read: signedIn,
    create: ({ req }) => isStudent(req) || isAdmin(req),
    update: ownOrAdmin,
    delete: ownOrAdmin,
  },
  authorship: false,
  upload: {
    mimeTypes: ['image/webp', 'image/jpeg', 'image/png'],
    focalPoint: false,
    crop: false,
    modifyResponseHeaders: privateNoStore,
  },
  fields: [
    { name: 'label', type: 'text', admin: { readOnly: true } },
    {
      name: 'student',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      filterOptions: { role: { equals: 'student' } },
      access: { create: serverOwned, update: adminField },
      hooks: { beforeChange: [forceStudent] },
    },
    { name: 'alt', type: 'text', access: { create: serverOwned, update: adminField } },
    {
      name: 'originalFile',
      label: 'Private original',
      type: 'relationship',
      relationTo: 'profile-photo-originals',
      access: { read: adminField, create: serverOwned, update: adminField },
    },
    {
      name: 'sourceFilename',
      label: 'Uploaded file name',
      type: 'text',
      access: { read: adminField, create: serverOwned, update: adminField },
      admin: { readOnly: true },
    },
  ],
}
