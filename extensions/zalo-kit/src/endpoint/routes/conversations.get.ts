import type { Accountability } from '@directus/types'
import { defineEventHandler } from '../utils'

/**
 * GET /zalo/conversations
 * Get recent conversations
 */
export default defineEventHandler(async (context, { req, res }) => {
  const _req = req as typeof req & { accountability: Accountability | null }

  if (!_req.accountability?.user) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'User not authenticated',
    })
    return
  }

  const { database } = context

  try {
    console.log('[Endpoint] Loading conversations...')

    const conversationsData = await database('zalo_conversations')
      .select([
        'zalo_conversations.id',
        'zalo_conversations.type',
        'zalo_conversations.last_message_time as timestamp',
        'zalo_conversations.last_message_id',
        'zalo_conversations.participant_id',
        'zalo_groups.name as group_name',
        'zalo_groups.avatar_url as group_avatar',
        'zalo_users.display_name as user_display_name',
        'zalo_users.avatar_url as user_avatar',
        'zalo_users.zalo_name as user_zalo_name',
        'last_msg.content as lastMessage',
        'last_msg.sender_id as last_sender_id',
      ])
      .leftJoin('zalo_groups', 'zalo_conversations.group_id', 'zalo_groups.id')
      .leftJoin('zalo_users', 'zalo_conversations.participant_id', 'zalo_users.id')
      .leftJoin('zalo_messages as last_msg', 'zalo_conversations.last_message_id', 'last_msg.id')
      .orderBy('zalo_conversations.last_message_time', 'desc')
      .limit(100)

    console.log('[Endpoint] Conversations data fetched:', conversationsData.length)

    const conversations = conversationsData.map((conv: any) => {
      let name: string
      let avatar: string | null

      if (conv.type === 'group') {
        name = conv.group_name || `Group ${conv.id}`
        avatar = conv.group_avatar
      }
      else {
        name = conv.user_display_name || conv.user_zalo_name || conv.participant_id || 'Unknown User'
        avatar = conv.user_avatar
      }

      if (!avatar) {
        const avatarName = name === 'Unknown User' ? '?' : name.charAt(0).toUpperCase()
        avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(avatarName)}&background=random`
      }

      return {
        id: conv.id,
        name,
        avatar,
        lastMessage: conv.lastMessage || '',
        timestamp: conv.timestamp,
        unreadCount: 0,
        online: true,
      }
    })

    console.log('[Endpoint] Processed Conversations:', conversations.length)

    res.json({
      data: conversations,
    })
  }
  catch (error: any) {
    console.error('❌ [Endpoint /conversations] Error:', error)
    res.status(500).json({ error: 'Failed to fetch conversations', details: error.message })
  }
})
