import type { PrimaryKey } from '@directus/types'

export interface ZaloQuickMessage {
  id: PrimaryKey
  title?: string
  keyword?: string
  content?: string
  media_attachment?: string
  is_active: boolean
  usage_count?: number
  last_used_at?: string
  created_at: string
  updated_at: string
}
