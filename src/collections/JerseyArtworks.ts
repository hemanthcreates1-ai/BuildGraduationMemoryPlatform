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

/**
 * One permanent ink layer per submission, painted in the garment's UV space.
 * Layers are composited in chronological order on top of the white cotton base.
 */
export const JerseyArtworks: CollectionConfig = {
  slug: 'jersey-artworks',
  // Contributor identity is stored only in the admin-only fields below; no automatic
  // createdBy/updatedBy stamping that could expose it.
  authorship: false,
  labels: { singular: 'Jersey artwork', plural: 'Jersey artworks' },
  admin: {
    group: 'Contributions',
    defaultColumns: ['jerseyOwner', 'contributor', 'status', 'strokeCount', 'createdAt'],
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
    ownerRelationship('jerseyOwner', 'Jersey of'),
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
      name: 'regions',
      label: 'Garment regions',
      type: 'text',
      access: { create: serverOwned, update: adminField },
      admin: { readOnly: true },
    },
    {
      name: 'textureSize',
      type: 'number',
      access: { create: serverOwned, update: adminField },
      admin: { readOnly: true },
    },
    {
      name: 'uvLayout',
      type: 'text',
      access: { create: serverOwned, update: adminField },
      admin: { readOnly: true },
    },
  ],
}
