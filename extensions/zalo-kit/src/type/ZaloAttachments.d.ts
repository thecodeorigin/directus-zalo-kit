import type { PrimaryKey } from '@directus/types'

export interface ZaloAttachment {
  id: PrimaryKey
  message_id: PrimaryKey
  url?: string
  thumbnail_url?: string
  file_name?: string
  mime_type?: string
  file_size?: number
  duration?: number
  height?: number
  width?: number
  metadata?: any
  created_at: string
  updated_at: string

  message?: ZaloMessage
}
