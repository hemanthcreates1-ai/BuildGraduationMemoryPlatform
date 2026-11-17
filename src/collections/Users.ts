import type { CollectionBeforeChangeHook, CollectionConfig, FieldAccess, Where } from 'payload'

import { adminField, adminsOnly, isAdmin, isStudent } from '../access'
import { appSessionFileStrategy } from '../lib/auth-strategy'
import { normalizeRollNumber, ROLL_NUMBER_PATTERN, SESSION_MAX_AGE_SECONDS } from '../lib/constants'

/**
 * App accounts: the 84 students (username = roll number, password = PIN) and the app
 * administrator. Separate from the `admins` collection used by Payload Admin (Figma SSO).
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'App account', plural: 'App accounts' },
  admin: {
    useAsTitle: 'username',
    defaultColumns: ['username', 'rollNumber', 'role', 'lastLoginAt', 'loginCount'],
    group: 'Batch',
    description:
      'Students sign in with their roll number and PIN; the administrator signs in at /hq/login.',
  },
  auth: {
    loginWithUsername: { allowEmailLogin: false, requireEmail: false, requireUsername: true },
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    tokenExpiration: SESSION_MAX_AGE_SECONDS,
    useSessions: true,
    depth: 0,
    strategies: [appSessionFileStrategy],
  },
  access: {
    read: ({ req }) => {
      if (isAdmin(req)) return true
      if (isStudent(req)) return { role: { equals: 'student' } }
      return false
    },
    create: adminsOnly,
    update: ({ req }) => {
      if (isAdmin(req)) return true
      if (isStudent(req) && req.user?.id) return { id: { equals: req.user.id } } satisfies Where
      return false
    },
    delete: adminsOnly,
    unlock: adminsOnly,
  },
  defaultSort: 'rosterOrder',
  hooks: {
    beforeChange: [
      (({ data, operation, originalDoc, req }) => {
        if (operation !== 'update' || !isStudent(req)) return data
        // A student update is strictly profile-photo-only. Preserve every account/credential
        // field even if a crafted request includes it.
        const profilePhoto =
          data.profilePhoto === undefined ? originalDoc.profilePhoto : data.profilePhoto
        return {
          ...originalDoc,
          profilePhoto,
          username: originalDoc.username,
          role: originalDoc.role,
          rollNumber: originalDoc.rollNumber,
          rosterOrder: originalDoc.rosterOrder,
          lastLoginAt: originalDoc.lastLoginAt,
          loginCount: originalDoc.loginCount,
        }
      }) satisfies CollectionBeforeChangeHook,
    ],
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'student',
      index: true,
      saveToJWT: true,
      options: [
        { label: 'Student', value: 'student' },
        { label: 'Administrator', value: 'admin' },
      ],
      access: { create: adminField, update: adminField },
      admin: { position: 'sidebar' },
    },
    {
      name: 'rollNumber',
      label: 'Roll number',
      type: 'text',
      unique: true,
      index: true,
      hooks: {
        beforeValidate: [
          ({ value }) => (typeof value === 'string' ? normalizeRollNumber(value) : value),
        ],
      },
      validate: (value: unknown, { siblingData }: { siblingData: Record<string, unknown> }) => {
        if ((siblingData as { role?: string })?.role === 'admin') return true
        if (typeof value !== 'string' || !value) return 'Students need a roll number.'
        return ROLL_NUMBER_PATTERN.test(value) || 'Roll numbers look like 23X51A05H0.'
      },
      access: { create: adminField, update: adminField },
    },
    {
      name: 'rosterOrder',
      label: 'Roster order (from pins.csv)',
      type: 'number',
      index: true,
      admin: { position: 'sidebar' },
      access: { create: adminField, update: adminField },
    },
    {
      name: 'profilePhoto',
      type: 'upload',
      relationTo: 'profile-photos',
      access: {
        update: (({ req }) => isAdmin(req) || isStudent(req)) satisfies FieldAccess,
      },
    },
    {
      name: 'lastLoginAt',
      type: 'date',
      access: { read: adminField, create: adminField, update: adminField },
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'loginCount',
      type: 'number',
      defaultValue: 0,
      access: { read: adminField, create: adminField, update: adminField },
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      // HMAC of the ADMIN_PASSWORD env var (keyed by the server secret) so the admin password
      // is only re-hashed when the env var changes. Never readable through any API.
      name: 'credentialFingerprint',
      type: 'text',
      hidden: true,
      access: { read: () => false, create: () => false, update: () => false },
    },
  ],
}
