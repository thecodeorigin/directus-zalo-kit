import { authentication, createDirectus, createItem, readItems, rest, updateItem } from '@directus/sdk'

// Define schema
interface ZaloConversation {
  id: string
  type: string
  participant_id: any
  group_id: any
  last_message_id: any
  last_message_time: string
  is_pinned: boolean
  is_muted: boolean
  is_archived: boolean
  unread_count: number
}

interface ZaloMessage {
  id: string
  conversation_id: string
  sender_id: any
  content: string
  message_type: string
  sent_at: string
  is_edited: boolean
  is_deleted: boolean
}

interface Schema {
  zalo_conversations: ZaloConversation[]
  zalo_messages: ZaloMessage[]
}

// Create client instance
const client = createDirectus<Schema>('http://localhost:8055')
  .with(rest())
  .with(authentication('json'))

export { client }
