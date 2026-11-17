import type { CollectionConfig } from 'payload'

import { adminsOnly, nobody } from '../access'
import { privateNoStore } from '../fields/contribution'

/** JSON snapshots of every record, stored privately in object storage. */
export const Backups: CollectionConfig = {
  slug: 'backups',
  labels: { singular: 'Backup', plural: 'Backups' },
  admin: {
    group: 'Operations',
    useAsTitle: 'label',
    defaultColumns: ['label', 'createdByLabel', 'createdAt'],
  },
  defaultSort: '-createdAt',
  access: { read: adminsOnly, create: adminsOnly, update: nobody, delete: adminsOnly },
  upload: {
    mimeTypes: ['application/json'],
    focalPoint: false,
    crop: false,
    modifyResponseHeaders: privateNoStore,
  },
  fields: [
    { name: 'label', type: 'text', required: true },
    { name: 'createdBy', type: 'relationship', relationTo: 'users' },
    { name: 'createdByLabel', type: 'text' },
    { name: 'counts', type: 'json' },
  ],
}
