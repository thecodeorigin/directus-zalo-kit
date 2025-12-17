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
        'reply_to_message_id',
        'sender_id.id',
        'sender_id.display_name',
        'sender_id.avatar_url',
        'sender_id.zalo_name',
        'reply_to_message_id.id',
        'reply_to_message_id.content',
        'reply_to_message_id.sender_id',
        'reply_to_message_id.sender_id.id',
        'reply_to_message_id.sender_id.display_name',
        'reply_to_message_id.sender_id.avatar_url',
      ],
      sort: ['-sent_at'],
      limit,
    })

    messages.reverse()

    const senderIds = [...new Set(messages.map((m: any) => m.sender_id).filter(id => id))]
    const messageIds = messages.map((m: any) => m.id)

    // Get all reply_to_message_id values that need to be fetched
    const replyToIds = [...new Set(
      messages
        .map((m: any) => m.reply_to_message_id)
        .filter(id => id && typeof id === 'string'),
    )]

    // Fetch quoted messages if any
    const quotedMessagesMap = new Map()
    if (replyToIds.length > 0) {
      try {
        const quotedMessages = await messagesService.readByQuery({
          filter: { id: { _in: replyToIds } },
          fields: [
            'id',
            'content',
            'sender_id',
            'sender_id.id',
            'sender_id.display_name',
            'sender_id.avatar_url',
          ],
        })

        quotedMessages.forEach((qm: any) => {
          quotedMessagesMap.set(qm.id, qm)
        })

        console.log(`[Endpoint] Fetched ${quotedMessages.length} quoted messages`)
      }
      catch (error) {
        console.error('[Endpoint] Error fetching quoted messages:', error)
      }
    }

    let userMap = new Map()
    const attachmentsMap = new Map()

    // Fetch attachments using ItemsService instead of database
    if (messageIds.length > 0) {
      try {
        const attachmentsService = new context.services.ItemsService('zalo_attachments', {
          schema: await context.getSchema(),
          accountability: { admin: true, role: null, user: null, roles: [], app: false, ip: null },
        })

        const attachments = await attachmentsService.readByQuery({
          filter: {
            message_id: { _in: messageIds },
          },
          fields: [
            'id',
            'message_id',
            'url',
            'file_name',
            'mime_type',
            'file_size',
            'width',
            'height',
            'thumbnail_url',
          ],
          limit: -1,
        })

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
    const enrichedMessages = messages
      .filter((msg: any) => {
        // ✅ Filter out system event messages (JSON with "type" and "actionType")
        if (msg.content && typeof msg.content === 'string') {
          const trimmed = msg.content.trim()
          if ((trimmed.startsWith('{') || trimmed.startsWith('['))
            && (trimmed.includes('"type":') && trimmed.includes('"actionType":'))) {
            console.warn(`[Endpoint] Filtering system event message ${msg.id}`)
            return false // Skip system events
          }
        }
        return true // Keep valid messages
      })
      .map((msg: any) => {
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
              if ((trimmed.startsWith('{') && trimmed.endsWith('}'))
                || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                try {
                // Try to parse - nếu parse được thì đây là JSON, không hiển thị
                  JSON.parse(trimmed)
                  parsedContent = '' // Ẩn JSON object
                  console.warn(`[Endpoint] Filtered JSON content from message ${msg.id}`)
                }
                catch {
                // Not valid JSON, display as-is
                  parsedContent = msg.content
                }
              }
              else {
                parsedContent = msg.content
              }
            }
            else if (typeof msg.content === 'object') {
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

          // Parse quote data from raw_data if exists (Zalo API structure)
          let quoteData = null

          // Try 1: Parse from raw_data.data.quote (Zalo API response)
          if (msg.raw_data && !quoteData) {
            try {
              const rawData = typeof msg.raw_data === 'string' ? JSON.parse(msg.raw_data) : msg.raw_data

              // Zalo structure: raw_data.data.quote or raw_data.message.data.quote
              const quote = rawData?.data?.quote || rawData?.message?.data?.quote

              if (quote) {
                const quoteSender = userMap.get(quote.ownerId)
                const quoteSenderName = quoteSender?.display_name || quoteSender?.zalo_name || quote.dName || 'Someone'
                const quoteAvatar = quoteSender?.avatar_url
                  || `https://ui-avatars.com/api/?name=${encodeURIComponent(quoteSenderName.charAt(0))}&background=random&size=32`

                quoteData = {
                  content: quote.msg || quote.content || '',
                  msgType: quote.cliMsgType === 1 ? 'text' : 'other',
                  uidFrom: quote.ownerId || '',
                  msgId: quote.globalMsgId || quote.cliMsgId || '',
                  senderName: quoteSenderName,
                  avatar: quoteAvatar,
                }
              }
            }
            catch (parseError) {
              console.error(`[Endpoint] Error parsing quote from raw_data for message ${msg.id}:`, parseError)
            }
          }

          // Try 2: Use reply_to_message_id from quotedMessagesMap
          if (!quoteData && msg.reply_to_message_id) {
            const quotedMsgId = typeof msg.reply_to_message_id === 'string'
              ? msg.reply_to_message_id
              : msg.reply_to_message_id?.id

            const quotedMsg = quotedMessagesMap.get(quotedMsgId)

            if (quotedMsg) {
              const quoteSender = typeof quotedMsg.sender_id === 'object' ? quotedMsg.sender_id : null
              quoteData = {
                content: quotedMsg.content || '',
                msgType: 'text',
                uidFrom: quoteSender?.id || '',
                msgId: quotedMsg.id,
                senderName: quoteSender?.display_name || 'Unknown',
                avatar: quoteSender?.avatar_url || null,
              }
            }
          }

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
            rawData: msg.raw_data || null, // Include raw_data to get cliMsgId
            quote: quoteData, // Include quote data if this is a reply
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
