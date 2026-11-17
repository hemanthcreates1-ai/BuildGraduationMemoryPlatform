import type { CollectionConfig } from 'payload'

import { adminsOnly, nobody } from '../access'

/** Append-only audit trail: logins, contributions, uploads, admin actions and errors. */
export const ActivityLogs: CollectionConfig = {
  slug: 'activity-logs',
  labels: { singular: 'Activity log', plural: 'Activity logs' },
  admin: {
    group: 'Operations',
    useAsTitle: 'summary',
    defaultColumns: ['event', 'level', 'actorLabel', 'summary', 'createdAt'],
  },
  defaultSort: '-createdAt',
  access: { read: adminsOnly, create: adminsOnly, update: nobody, delete: nobody },
  fields: [
    { name: 'event', type: 'text', required: true, index: true },
    {
      name: 'level',
      type: 'select',
      required: true,
      defaultValue: 'info',
      index: true,
      options: ['info', 'warn', 'error'],
    },
    { name: 'summary', type: 'text' },
    { name: 'actor', type: 'relationship', relationTo: 'users', index: true },
    { name: 'actorLabel', type: 'text', index: true },
    { name: 'targetCollection', type: 'text', index: true },
    { name: 'targetId', type: 'text' },
    { name: 'ip', type: 'text', index: true },
    { name: 'userAgent', type: 'text' },
    { name: 'details', type: 'json' },
  ],
}
