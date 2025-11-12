export interface Conversation {
  id: string
  name: string
  avatar: string
  lastMessage: string
  lastMessageTime: string
  timestamp: string // Alias for compatibility
  unreadCount: number
  isOnline?: boolean
  online?: boolean // Alias for compatibility
  isGroup?: boolean
  type?: 'group' | 'direct' // For backward compatibility
  members?: string[]
  groupAvatarUrl?: string
  userId?: string
}

export interface Message {
  id: string
  direction: 'in' | 'out'
  text: string
  senderName: string
  senderId: string
  time: string
  avatar?: string
  status?: 'sent' | 'delivered' | 'read' | 'failed'
  type?: 'system' | 'user' | 'file'
  clientId?: string
  files?: FileAttachment[]
}

export interface FileAttachment {
  id: string
  filename: string
  type: string
  size: number
  url: string
  thumbnail?: string
  width?: number
  height?: number
}

export interface Group {
  id: string
  name: string
  avatar: string
  members: string[]
}
