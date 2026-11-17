import type { CollectionConfig } from 'payload'

import {
  adminField,
  adminsOnly,
  publishedOrAdmin,
  serverOwned,
  studentsOrAdminsCreate,
} from '../access'
import {
  contributorField,
  moderationStatusField,
  ownerRelationship,
  privateNoStore,
  submissionIdField,
} from '../fields/contribution'

/** Handwritten notes, signatures and doodles on a classmate's farewell notebook. */
export const SignatureEntries: CollectionConfig = {
  slug: 'signature-entries',
  // Contributor identity is stored only in the admin-only fields below; no automatic
  // createdBy/updatedBy stamping that could expose it.
  authorship: false,
  labels: { singular: 'Signature entry', plural: 'Signature entries' },
  admin: {
    group: 'Contributions',
    defaultColumns: ['wallOwner', 'contributor', 'status', 'createdAt'],
  },
  defaultSort: 'createdAt',
  access: {
    read: publishedOrAdmin,
    create: studentsOrAdminsCreate,
    update: adminsOnly,
    delete: adminsOnly,
  },
  upload: {
    mimeTypes: ['image/png'],
    focalPoint: false,
    crop: false,
    modifyResponseHeaders: privateNoStore,
  },
  fields: [
    ownerRelationship('wallOwner', 'Signature wall of'),
    contributorField(),
    submissionIdField(),
    moderationStatusField(),
    {
      name: 'strokeCount',
      type: 'number',
      min: 0,
      access: { create: serverOwned, update: adminField },
      admin: { readOnly: true },
    },
    {
      name: 'inkColors',
      type: 'text',
      access: { create: serverOwned, update: adminField },
      admin: { readOnly: true },
    },
    {
      name: 'canvasWidth',
      type: 'number',
      access: { create: serverOwned, update: adminField },
      admin: { readOnly: true },
    },
    {
      name: 'canvasHeight',
      type: 'number',
      access: { create: serverOwned, update: adminField },
      admin: { readOnly: true },
    },
  ],
}
