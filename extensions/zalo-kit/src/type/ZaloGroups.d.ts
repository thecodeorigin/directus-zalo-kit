import type { PrimaryKey } from '@directus/types'

export interface ZaloGroup {
  id: PrimaryKey
  name?: string
  owner_id?: PrimaryKey
  description?: string
  avatar_url?: string
  invite_link?: string
  total_members?: number
  settings?: any
  created_at_zalo?: string
  created_at: string
  updated_at: string

  owner?: ZaloUser
  members?: ZaloGroupMember[]
  conversations?: ZaloConversation[]
}
