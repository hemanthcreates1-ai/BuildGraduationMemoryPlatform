import type { CollectionConfig } from 'payload'

import { adminsOnly, nobody } from '../access'

/** Append-only record of every moderation decision. */
export const ModerationRecords: CollectionConfig = {
  slug: 'moderation-records',
  labels: { singular: 'Moderation record', plural: 'Moderation records' },
  admin: {
    group: 'Operations',
    useAsTitle: 'targetLabel',
    defaultColumns: ['action', 'targetLabel', 'moderatorLabel', 'createdAt'],
  },
  defaultSort: '-createdAt',
  access: { read: adminsOnly, create: adminsOnly, update: nobody, delete: nobody },
  fields: [
    {
      name: 'action',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Removed', value: 'remove' },
        { label: 'Restored', value: 'restore' },
        { label: 'Discarded abandoned draft', value: 'discard-draft' },
        { label: 'Profile photo set', value: 'profile-photo-set' },
        { label: 'Profile photo removed', value: 'profile-photo-removed' },
        { label: 'Account unlocked', value: 'account-unlock' },
      ],
    },
    { name: 'targetCollection', type: 'text', required: true, index: true },
    { name: 'targetId', type: 'text', required: true, index: true },
    { name: 'targetLabel', type: 'text' },
    { name: 'reason', type: 'textarea' },
    { name: 'moderator', type: 'relationship', relationTo: 'users' },
    { name: 'moderatorLabel', type: 'text' },
    { name: 'snapshot', type: 'json' },
  ],
}
