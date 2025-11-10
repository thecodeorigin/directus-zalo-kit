import type { PrimaryKey } from '@directus/types'

export interface ZaloGroupMember {
  id: PrimaryKey
  group_id: PrimaryKey
  owner_id: PrimaryKey
  is_active: boolean
  joined_at?: string
  left_at?: string

  group?: ZaloGroup
  user?: ZaloUser
}
