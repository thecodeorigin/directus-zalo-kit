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

    const senderIds = [...new Set(messages.map((m: any) => m.sender_id).filter(id => id))]
    const messageIds = messages.map((m: any) => m.id)

    let userMap = new Map()
    const attachmentsMap = new Map()

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

    // Fetch attachments for all messages
    if (messageIds.length > 0) {
      try {
        const attachments = await database('zalo_attachments')
          .whereIn('message_id', messageIds)
          .select([
            'id',
            'message_id',
            'url',
            'file_name',
            'mime_type',
            'file_size',
            'width',
            'height',
            'thumbnail_url',
          ])
          .timeout(queryTimeout)

        // Group attachments by message_id
        attachments.forEach((att: any) => {
          if (!attachmentsMap.has(att.message_id)) {
            attachmentsMap.set(att.message_id, [])
          }

          // Get base URL from request
          const baseUrl = req.get('origin') || `http://localhost:8055`
          const fullUrl = att.url.startsWith('http') ? att.url : `${baseUrl}${att.url}`

          attachmentsMap.get(att.message_id).push({
            id: att.id,
            url: fullUrl,
            filename: att.file_name,
            type: att.mime_type,
            size: att.file_size,
            width: att.width,
            height: att.height,
            thumbnail: att.thumbnail_url ? (att.thumbnail_url.startsWith('http') ? att.thumbnail_url : `${baseUrl}${att.thumbnail_url}`) : fullUrl,
          })
        })
      }
      catch (attError) {
        console.error('[Endpoint] Error fetching attachments:', attError)
        // Continue without attachment data
      }

      console.warn(`[Endpoint] Loaded ${attachmentsMap.size} messages with attachments`)
    }

    // Enrich messages with sender info
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

        // Parse content - xử lý cả string và object
        let parsedContent = ''
        if (msg.content) {
          if (typeof msg.content === 'string') {
            // ✅ Filter JSON string - không hiển thị nếu là JSON object serialized
            const trimmed = msg.content.trim()
            
            // Check if it's a JSON object string (starts with { or [)
            if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
              try {
                // Try to parse - nếu parse được thì đây là JSON, không hiển thị
                JSON.parse(trimmed)
                parsedContent = '' // Ẩn JSON object
                console.warn(`[Endpoint] Filtered JSON content from message ${msg.id}`)
              } catch {
                // Not valid JSON, display as-is
                parsedContent = msg.content
              }
            } else {
              parsedContent = msg.content
            }
          } else if (typeof msg.content === 'object') {
            // Nếu là object JSON, có thể là từ Zalo raw data
            // Không hiển thị raw object, chỉ hiển thị nếu có attachments
            parsedContent = ''
            console.warn(`[Endpoint] Filtered object content from message ${msg.id}`)
          }
        }

        // Nếu có attachments nhưng không có text, để trống
        const hasAttachments = attachmentsMap.has(msg.id) && attachmentsMap.get(msg.id).length > 0
        if (hasAttachments && !parsedContent) {
          parsedContent = '' // Không hiển thị text khi chỉ có attachment
        }

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
          attachments: attachmentsMap.get(msg.id) || [],
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
          attachments: attachmentsMap.get(msg.id) || [],
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
