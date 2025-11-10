import type { Accountability } from '@directus/types'
import { defineEventHandler } from '../../utils'

/**
 * GET /zalo/messages/:conversationId
 * Get messages for a conversation
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
    const { conversationId } = req.params

    if (!conversationId || typeof conversationId !== 'string') {
      res.status(400).json({
        error: 'Invalid conversationId',
      })
      return
    }

    const limit = Math.min(Number.parseInt(req.query.limit as string) || 200, 500)

    const queryTimeout = 10000 // 10 seconds

    const messagesQuery = database('zalo_messages')
      .where('conversation_id', conversationId)
      .select([
        'id',
        'client_id',
        'sender_id',
        'content',
        'sent_at',
        'is_edited',
        'is_undone',
        'raw_data',
      ])
      .orderBy('sent_at', 'desc')
      .limit(limit)
      .timeout(queryTimeout)

    const messages = await messagesQuery

    messages.reverse()

    const senderIds = [...new Set(messages.map((m: any) => m.sender_id).filter(id => id))]

    let userMap = new Map()

    if (senderIds.length > 0) {
      try {
        const users = await database('zalo_users')
          .whereIn('id', senderIds)
          .select(['id', 'display_name', 'avatar_url', 'zalo_name'])
          .timeout(queryTimeout)

        userMap = new Map(users.map((u: any) => [u.id, u]))
      }
      catch (userError) {
        console.error('[Endpoint] Error fetching users:', userError)
        // Continue without user data
      }
    }

    // Enrich messages with sender info
    const enrichedMessages = messages.map((msg: any) => {
      try {
        const user = userMap.get(msg.sender_id)
        const senderName = user?.display_name || user?.zalo_name || msg.sender_id || 'Unknown'
        let senderAvatar = user?.avatar_url

        if (!senderAvatar) {
          const avatarName = senderName === 'Unknown' ? '?' : senderName.charAt(0).toUpperCase()
          senderAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(avatarName)}&background=random`
        }

        // Parse content
        let parsedContent = msg.content || ''

        // Format time
        const time = msg.sent_at
          ? new Date(msg.sent_at).toLocaleTimeString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : new Date().toLocaleTimeString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
            })

        return {
          id: msg.id,
          clientId: msg.client_id || null,
          senderId: msg.sender_id,
          senderName,
          avatar: senderAvatar,
          text: parsedContent,
          time,
          timestamp: msg.sent_at,
          direction: 'in',
          status: 'delivered',
          isEdited: msg.is_edited || false,
          isUndone: msg.is_undone || false,
          attachments: [],
        }
      }
      catch (enrichError) {
        console.error('[Endpoint] Error enriching message:', msg.id, enrichError)
        // Return minimal message data
        return {
          id: msg.id,
          clientId: msg.client_id || null,
          senderId: msg.sender_id,
          senderName: 'Unknown',
          avatar: 'https://ui-avatars.com/api/?name=?&background=random',
          text: msg.content || '',
          time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          timestamp: msg.sent_at,
          direction: 'in',
          status: 'delivered',
          isEdited: false,
          isUndone: false,
          attachments: [],
        }
      }
    })

    res.json({
      data: enrichedMessages,
      meta: {
        total: messages.length,
        limit,
      },
    })
  }
  catch (error: any) {
    // ✅ Return error details
    res.status(500).json({
      error: 'Failed to fetch messages',
      details: error.message,
      code: error.code,
    })
  }
})
