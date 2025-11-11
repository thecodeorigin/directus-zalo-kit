import type { PrimaryKey } from '@directus/types'

export interface ZaloConversationLabel {
  id: PrimaryKey
  conversation_id: PrimaryKey
  label_id: PrimaryKey
  applied_at: string

  conversation?: ZaloConversation
  label?: ZaloLabel
}
