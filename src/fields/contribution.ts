import type { Field, FieldHook } from 'payload'

import { adminField, isAdmin, isStudent } from '../access'

/**
 * The contributor is always derived from the authenticated session on create. A value sent by
 * a student is ignored, so nobody can impersonate another classmate. Only administrators can
 * read the field, which keeps contributor identity out of every student-facing response.
 */
const forceSessionUserOnCreate: FieldHook = ({ operation, req, value }) => {
  if (operation === 'create' && isStudent(req) && req.user) return req.user.id
  return value
}

export const contributorField = (name = 'contributor', label = 'Contributor (private)'): Field => ({
  name,
  label,
  type: 'relationship',
  relationTo: 'users',
  required: true,
  index: true,
  access: { read: adminField, update: adminField },
  admin: {
    position: 'sidebar',
    description: 'Private. Only administrators can see who contributed this.',
  },
  hooks: { beforeChange: [forceSessionUserOnCreate] },
})

/** Client-generated idempotency key; a unique index blocks duplicate submissions. */
export const submissionIdField = (): Field => ({
  name: 'submissionId',
  type: 'text',
  required: true,
  unique: true,
  index: true,
  access: { read: adminField, update: () => false },
  admin: { position: 'sidebar', readOnly: true },
  validate: (value: unknown) =>
    typeof value === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(value)
      ? true
      : 'Invalid submission key',
})

/** Published/removed moderation state. Students can never set or change it. */
export const moderationStatusField = (): Field => ({
  name: 'status',
  type: 'select',
  required: true,
  defaultValue: 'published',
  index: true,
  options: [
    { label: 'Published', value: 'published' },
    { label: 'Removed by moderator', value: 'removed' },
  ],
  access: { create: adminField, update: adminField },
  admin: { position: 'sidebar' },
})

export const ownerRelationship = (name: string, label: string): Field => ({
  name,
  label,
  type: 'relationship',
  relationTo: 'users',
  required: true,
  index: true,
  filterOptions: { role: { equals: 'student' } },
  access: { update: adminField },
})

export const privateNoStore = ({ headers }: { headers: Headers }) => {
  headers.set('Cache-Control', 'private, no-store')
  return headers
}

export const adminOnlyFieldAccess = { read: adminField, create: adminField, update: adminField }

export { isAdmin }
