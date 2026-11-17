import type { CollectionConfig } from 'payload'

import { adminsOnly, nobody } from '../access'

/** Every upload attempt, including rejected and failed ones. */
export const UploadRecords: CollectionConfig = {
  slug: 'upload-records',
  labels: { singular: 'Upload record', plural: 'Upload records' },
  admin: {
    group: 'Operations',
    useAsTitle: 'originalFilename',
    defaultColumns: ['kind', 'status', 'actorLabel', 'reason', 'createdAt'],
  },
  defaultSort: '-createdAt',
  access: { read: adminsOnly, create: adminsOnly, update: nobody, delete: nobody },
  fields: [
    {
      name: 'kind',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Memory wall photo', value: 'memory-photo' },
        { label: 'Jersey artwork', value: 'jersey-artwork' },
        { label: 'Signature entry', value: 'signature' },
        { label: 'Profile photo', value: 'profile-photo' },
        { label: 'Roster import', value: 'roster-import' },
        { label: 'Backup', value: 'backup' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Succeeded', value: 'success' },
        { label: 'Rejected (validation)', value: 'rejected' },
        { label: 'Failed (server/storage)', value: 'failed' },
      ],
    },
    { name: 'reason', type: 'text' },
    { name: 'originalFilename', type: 'text' },
    { name: 'mimeType', type: 'text' },
    { name: 'sizeBytes', type: 'number' },
    { name: 'actor', type: 'relationship', relationTo: 'users', index: true },
    { name: 'actorLabel', type: 'text' },
    { name: 'relatedCollection', type: 'text' },
    { name: 'relatedId', type: 'text' },
  ],
}
