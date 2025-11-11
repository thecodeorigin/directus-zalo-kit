import type { PrimaryKey } from '@directus/types'

export interface ZaloLabel {
  id: PrimaryKey
  name: string
  description?: string
  color_hex?: string
  is_system: boolean
  created_at: string
  updated_at: string

  conversation_labels?: ZaloConversationLabel[]
}
