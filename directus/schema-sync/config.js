/**
 * This file is used to configure which data from your collections you want to export and eventually import accross environments.
 *
 * Schema:
 *  collectionName:
 * 		watch: array of events to watch for changes, eg. 'posts.items',
 * 		excludeFields: (optional) array of fields to exclude from the export,
 * 		groupBy: (optional) array of fields to group the exported data into multiple files, eg. ['collection'] (per collection)
 * 		linkedFields: (optional) array of fields to treat as many-to-one relationships for hierarchy, eg. ['parent']
 * 		getKey: (optional) function to get the key for the item, defaults to primary key found on schema,
 * 		query: (optional) query to use when exporting the collection, valid options are: (limit=-1 | filter | sort)
 * 		prefix: (optional) prefix the exported json file with this string (useful for separating test data from production data)
 * 		onExport: (optional) (object) => object: Function to parse the data before exporting, useful for encoding/sanitizing secrets or other sensitive data
 * 		onImport: (optional) (object) => object: Function to parse the data before importing, useful for decoding secrets
 */
export const syncCustomCollections = {
  zalo_users: {
    watch: ["zalo_users.items", "zalo_users.schema"],
    excludeFields: ["date_created", "date_updated"],
    query: {
      sort: ["display_name"],
    },
  },

  zalo_groups: {
    watch: ["zalo_groups.items", "zalo_groups.schema"],
    query: {
      sort: ["name"],
    },
  },

  zalo_group_members: {
    watch: ["zalo_group_members.items", "zalo_group_members.schema"],
    linkedFields: ["group_id", "user_id"],
    query: {
      sort: ["joined_at"],
    },
  },

  zalo_conversations: {
    watch: ["zalo_conversations.items", "zalo_conversations.schema"],
    query: {
      sort: ["last_message_time"],
    },
  },

  zalo_messages: {
    watch: ["zalo_messages.items", "zalo_messages.schema"],
    excludeFields: ["date_created", "date_updated"],
    linkedFields: ["conversation_id", "sender_id"],
    query: {
      sort: ["sent_at"],
    },
  },

  zalo_attachments: {
    watch: ["zalo_attachments.items", "zalo_attachments.schema"],
    query: {
      sort: ["id"],
    },
  },

  zalo_reactions: {
    watch: ["zalo_reactions.items", "zalo_reactions.schema"],
    query: {
      sort: ["created_at"],
    },
    getKey: (item) => `${item.message_id}-${item.user_id}`,
  },

  zalo_labels: {
    watch: ["zalo_labels.items", "zalo_labels.schema"],
    query: {
      sort: ["name"],
    },
  },

  zalo_conversation_labels: {
    watch: [
      "zalo_conversation_labels.items",
      "zalo_conversation_labels.schema",
    ],
    query: {
      sort: ["applied_at"],
    },
    getKey: (item) => `${item.conversation_id}-${item.label_id}`,
  },

  zalo_quick_messages: {
    watch: ["zalo_quick_messages.items", "zalo_quick_messages.schema"],
    query: {
      sort: ["keyword"],
    },
  },

  zalo_sync_status: {
    watch: ["zalo_sync_status.items", "zalo_sync_status.schema"],
    query: {
      sort: ["last_sync_at"],
    },
  },
};
