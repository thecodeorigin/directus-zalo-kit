import type { PrimaryKey } from '@directus/types'

export interface ZaloReaction {
  id: PrimaryKey
  message_id: PrimaryKey
  user_id: PrimaryKey
  reaction_icon?: string
  created_at: string

  message?: ZaloMessage
  user?: ZaloUser
}
