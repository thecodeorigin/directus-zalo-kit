import type { PrimaryKey } from '@directus/types'

export interface ZaloUser {
  id: PrimaryKey
  zalo_name?: string
  display_name?: string
  alias?: string
  avatar_url?: string
  cover_url?: string
  date_of_birth?: string
  is_friend: boolean
  status_message?: string
  last_online?: string
  raw_data?: any
  created_at: string
  updated_at: string

  groups_owned?: ZaloGroup[]
  messages?: ZaloGroupMember[] | null
  messages_sent?: ZaloMessage[]
  reactions?: ZaloReaction[]
  conversations?: ZaloConversation[]
}
