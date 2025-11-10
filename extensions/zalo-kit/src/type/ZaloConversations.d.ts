import type { PrimaryKey } from '@directus/types'

export interface ZaloConversation {
  id: PrimaryKey
  group_id?: PrimaryKey
  participant_id?: PrimaryKey
  last_message_id?: PrimaryKey
  last_message_time?: string
  last_read_message_time?: string
  unread_count?: number
  is_archived: boolean
  is_hidden: boolean
  is_muted: boolean
  is_pinned: boolean
  settings?: any
  created_at: string
  updated_at: string

  group?: ZaloGroup
  participant?: ZaloUser
  last_message?: ZaloMessage
  messages?: ZaloMessage[]
  labels?: ZaloConversationLabel[]
  sync_status?: ZaloSyncStatus
}
