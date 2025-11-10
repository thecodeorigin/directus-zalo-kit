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

  try {
    const { conversationId } = req.params

    if (!conversationId || typeof conversationId !== 'string') {
      res.status(400).json({
        error: 'Invalid conversationId',
      })
      return
    }

    const limit = Math.min(Number.parseInt(req.query.limit as string) || 200, 500)

    const messagesService = new context.services.ItemsService('zalo_messages', {
      schema: await context.getSchema(),
      accountability: { admin: true, role: null, user: null, roles: [], app: false, ip: null },
    })

    const messages = await messagesService.readByQuery({
      filter: { conversation_id: { _eq: conversationId } },
      fields: [
        'id',
        'client_id',
        'sender_id',
        'content',
        'sent_at',
        'is_edited',
        'is_undone',
        'raw_data',
        'sender_id.id',
        'sender_id.display_name',
        'sender_id.avatar_url',
        'sender_id.zalo_name',
      ],
      sort: ['-sent_at'],
      limit,
    })

    messages.reverse()

    // Enrich messages with sender info (already included via ItemsService fields)
    const enrichedMessages = messages.map((msg: any) => {
      try {
        const sender = typeof msg.sender_id === 'object' ? msg.sender_id : null
        const senderId = sender?.id || msg.sender_id
        const senderName = sender?.display_name || sender?.zalo_name || senderId || 'Unknown'
        let senderAvatar = sender?.avatar_url

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
          senderId,
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
