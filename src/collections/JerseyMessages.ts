import type { CollectionConfig } from 'payload'

import { adminsOnly, publishedOrAdmin, studentsOrAdminsCreate } from '../access'
import {
  contributorField,
  moderationStatusField,
  ownerRelationship,
  submissionIdField,
} from '../fields/contribution'
import { MESSAGE_MAX_LENGTH } from '../lib/constants'

export const JerseyMessages: CollectionConfig = {
  slug: 'jersey-messages',
  // Contributor identity is stored only in the admin-only fields below; no automatic
  // createdBy/updatedBy stamping that could expose it.
  authorship: false,
  labels: { singular: 'Jersey message', plural: 'Jersey messages' },
  admin: {
    group: 'Contributions',
    useAsTitle: 'message',
    defaultColumns: ['message', 'jerseyOwner', 'contributor', 'status', 'createdAt'],
  },
  defaultSort: 'createdAt',
  access: {
    read: publishedOrAdmin,
    create: studentsOrAdminsCreate,
    update: adminsOnly,
    delete: adminsOnly,
  },
  fields: [
    ownerRelationship('jerseyOwner', 'Jersey of'),
    contributorField(),
    submissionIdField(),
    moderationStatusField(),
    {
      name: 'message',
      type: 'textarea',
      required: true,
      maxLength: MESSAGE_MAX_LENGTH,
      validate: (value: unknown) => {
        if (typeof value !== 'string' || value.trim().length === 0) return 'Write a message first.'
        if (value.length > MESSAGE_MAX_LENGTH)
          return `Messages can be up to ${MESSAGE_MAX_LENGTH} characters.`
        return true
      },
    },
  ],
}
