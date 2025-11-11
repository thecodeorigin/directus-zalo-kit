import type { PrimaryKey } from '@directus/types'

export interface ZaloSyncStatus {
  id: PrimaryKey
  conversation_id: PrimaryKey
  is_syncing: boolean
  last_message_id_synced?: PrimaryKey
  last_sync_at?: string
  sync_errors?: string
  created_at: string
  updated_at: string

  conversation?: ZaloConversation
}
