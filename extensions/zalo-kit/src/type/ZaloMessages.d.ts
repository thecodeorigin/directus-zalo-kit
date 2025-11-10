import type { PrimaryKey } from '@directus/types'

export interface ZaloMessage {
  id: PrimaryKey
  conversation_id: PrimaryKey
  sender_id?: PrimaryKey
  client_id?: string
  content?: string
  is_edited: boolean
  is_undone: boolean
  reply_to_message_id?: PrimaryKey
  forward_from_message_id?: PrimaryKey
  mentions?: any
  raw_data?: any
  sent_at?: string
  received_at?: string
  edited_at?: string
  created_at: string
  updated_at: string

  conversation?: ZaloConversation
  sender?: ZaloUser
  reply_to?: ZaloMessage
  forward_from?: ZaloMessage
  attachments?: ZaloAttachment[]
  reactions?: ZaloReaction[]
}
