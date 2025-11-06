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
    console.log('[Endpoint] Loading messages for:', conversationId)

    // Get messages
    const messages = await database('zalo_messages')
      .where('conversation_id', conversationId)
      .select(['id', 'sender_id', 'content', 'sent_at', 'is_edited', 'raw_data'])
      .orderBy('sent_at', 'asc')
      .limit(200)

    console.log('[Endpoint] Messages fetched:', messages.length)

    // Get unique sender IDs
    const senderIds = [...new Set(messages.map((m: any) => m.sender_id).filter(id => id))]

    let userMap = new Map()

    if (senderIds.length > 0) {
      const users = await database('zalo_users')
        .whereIn('id', senderIds)
        .select(['id', 'display_name', 'avatar_url', 'zalo_name'])

      console.log('[Endpoint] Users fetched:', users.length)
      userMap = new Map(users.map((u: any) => [u.id, u]))
    }
    else {
      console.log('[Endpoint] No sender IDs found in messages.')
    }

    // Enrich messages with sender info
    const enrichedMessages = messages.map((msg: any) => {
      const user = userMap.get(msg.sender_id)
      const senderName = user?.display_name || user?.zalo_name || msg.sender_id || 'Unknown Sender'
      let senderAvatar = user?.avatar_url

      if (!senderAvatar) {
        const avatarName = senderName === 'Unknown Sender' ? '?' : senderName.charAt(0).toUpperCase()
        senderAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(avatarName)}&background=random`
      }

      // Parse attachments from raw_data
      let parsedContent = msg.content
      let attachments = []
      if (!parsedContent || parsedContent === '[Hình ảnh]' || parsedContent === '[File]') {
        try {
          const raw = msg.raw_data
          if (raw && raw.message && raw.message.attachments && Array.isArray(raw.message.attachments)) {
            attachments = raw.message.attachments.map((att: any) => ({
              type: att.type,
              payload: att.payload,
            }))
            if (attachments.length > 0 && !parsedContent) {
              parsedContent = attachments[0].type === 'photo' ? '[Hình ảnh]' : '[File]'
            }
          }
        }
        catch (parseError) {
          console.warn(`[Endpoint] Failed to parse attachments for msg ${msg.id}:`, parseError)
        }
      }

      return {
        id: msg.id,
        senderId: msg.sender_id,
        senderName,
        senderAvatar,
        content: parsedContent,
        timestamp: msg.sent_at,
        isEdited: msg.is_edited,
        attachments,
      }
    })

    res.json({
      data: enrichedMessages,
    })
  }
  catch (error: any) {
    console.error('❌ [Endpoint /messages] Error:', error)
    res.status(500).json({ error: 'Failed to fetch messages', details: error.message })
  }
})
