import type { Accountability } from '@directus/types'
import type { ZaloMessageType } from '../../../type'
import { ThreadType } from 'zca-js'
import { getInstance } from '../../services/ZaloMessageService'
import { defineEventHandler } from '../../utils'

let zaloService: any = null

export default defineEventHandler(async (context, { req, res }) => {
  // Initialize singleton instance
  if (!zaloService) {
    zaloService = getInstance(
      context.database,
      context.services.WebSocketService,
      context.getSchema,
      context.services.ItemsService,
    )
  }
  const _req = req as typeof req & { accountability: Accountability | null }

  if (!_req.accountability?.user) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'User not authenticated',
    })
    return
  }

  try {
    const { conversationId, message, content, clientId, senderId } = req.body as {
      conversationId: string
      message?: string
      content?: string
      clientId?: string
      senderId?: string
    }
    const messageContent = message || content

    if (!conversationId || !messageContent) {
      res.status(400).json({
        error: 'conversationId and message are required',
      })
      return
    }

    // Sử dụng instance methods
    const status = zaloService.getLoginStatus()
    if (status.status !== 'logged_in') {
      console.error('[Endpoint /send] Zalo not logged in')
      res.status(503).json({
        error: 'Zalo is not connected',
        status: status.status,
      })
      return
    }

    const zaloUserId = senderId || status.userId
    if (!zaloUserId) {
      res.status(401).json({ error: 'Zalo user ID not found' })
      return
    }

    let zaloThreadId: string | null = null
    let threadType: typeof ThreadType.User | typeof ThreadType.Group

    try {
      const conversationsService = new context.services.ItemsService('zalo_conversations', {
        schema: await context.getSchema(),
        accountability: { admin: true, role: null, user: null, roles: [], app: false, ip: null },
      })

      const conversations = await conversationsService.readByQuery({
        filter: { id: { _eq: conversationId } },
        fields: ['participant_id', 'group_id'],
        limit: 1,
      })

      if (!conversations || conversations.length === 0) {
        console.error('[Endpoint /send] Conversation not found')
        res.status(404).json({
          error: 'Conversation not found in database',
          conversationId,
        })
        return
      }

      const conversation = conversations[0]

      if (conversation.group_id && conversation.group_id !== null) {
        zaloThreadId = String(conversation.group_id)
        threadType = ThreadType.Group
      }
      else if (conversation.participant_id && conversation.participant_id !== null) {
        zaloThreadId = String(conversation.participant_id)
        threadType = ThreadType.User
      }
      else {
        res.status(400).json({
          error: 'Cannot determine Zalo thread ID',
          conversationId,
          conversation,
        })
        return
      }

      if (!zaloThreadId) {
        res.status(400).json({
          error: 'Invalid thread ID',
          conversationId,
          conversation,
        })
        return
      }
    }
    catch (dbError: any) {
      res.status(500).json({
        error: 'Failed to query conversation',
        details: dbError.message,
      })
      return
    }

    // Gửi tin nhắn qua instance
    let zaloResult: any
    try {
      zaloResult = await zaloService.sendMessage(
        { msg: messageContent },
        zaloThreadId,
        threadType,
      )
    }
    catch (e: any) {
      console.error(`[Endpoint /send] Zalo API Error: ${e.message}`)
      res.status(500).json({
        error: 'Failed to send message via Zalo',
        details: e.message,
      })
      return
    }

    const messageId
      = zaloResult?.message?.msgId
        || zaloResult?.data?.msgId
        || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const clientMsgId = clientId || messageId

    // Get ItemsService for users
    const usersService = new context.services.ItemsService('zalo_users', {
      schema: await context.getSchema(),
      accountability: { admin: true, role: null, user: null, roles: [], app: false, ip: null },
    })

    const senders = await usersService.readByQuery({
      filter: { id: { _eq: zaloUserId } },
      fields: ['id', 'display_name', 'avatar_url', 'zalo_name'],
      limit: 1,
    })
    const sender = senders?.[0] || null

    const timestamp = new Date()

    try {
      // Get ItemsService for messages
      const messagesService = new context.services.ItemsService('zalo_messages', {
        schema: await context.getSchema(),
        accountability: { admin: true, role: null, user: null, roles: [], app: false, ip: null },
      })

      const existingMessages = await messagesService.readByQuery({
        filter: {
          _or: [
            { id: { _eq: messageId } },
            { client_id: { _eq: clientMsgId } },
          ],
        },
        limit: 1,
      })

      if (existingMessages && existingMessages.length > 0) {
        const existingMessage = existingMessages[0]
        res.json({
          success: true,
          message: 'Message already processed',
          data: {
            id: existingMessage.id,
            conversationId: existingMessage.conversation_id,
            content: existingMessage.content,
            sent_at: existingMessage.sent_at,
          },
        })
        return
      }

      const messageToInsert: Partial<ZaloMessageType> = {
        id: messageId,
        client_id: clientMsgId,
        conversation_id: conversationId,
        content: messageContent,
        sender_id: zaloUserId,
        sent_at: timestamp.toISOString(),
        received_at: timestamp.toISOString(),
        is_edited: false,
        is_undone: false,
        raw_data: zaloResult,
      }

      // Use ItemsService to trigger WebSocket events
      await messagesService.createOne(messageToInsert)

      // Get ItemsService for conversations
      const conversationsService = new context.services.ItemsService('zalo_conversations', {
        schema: await context.getSchema(),
        accountability: { admin: true, role: null, user: null, roles: [], app: false, ip: null },
      })

      await conversationsService.updateByQuery(
        { filter: { id: { _eq: conversationId } } },
        {
          last_message_id: messageId,
          last_message: messageContent, // ✅ Add last_message content
          last_message_time: timestamp.toISOString(),
        },
      )

      // ItemsService sẽ tự động trigger WebSocket events cho frontend

      res.json({
        success: true,
        message: 'Message sent successfully',
        data: {
          messageId,
          id: messageId,
          conversationId,
          content: messageContent,
          sent_at: timestamp.toISOString(),
          sender_id: zaloUserId,
          client_id: clientMsgId,
          thread_id: zaloThreadId,
          sender: {
            id: sender?.id,
            display_name: sender?.display_name,
            avatar_url: sender?.avatar_url,
            zalo_name: sender?.zalo_name,
          },
        },
      })
    }
    catch (dbError: any) {
      console.error('Database Error:', dbError)
      res.status(207).json({
        success: true,
        warning: 'Message sent to Zalo but failed to save to database',
        data: {
          messageId,
          error: dbError.message,
        },
      })
    }
  }
  catch (error: any) {
    if (error.message === 'User is not authenticated.') {
      res.status(401).json({
        ok: false,
        message: 'Authentication required. Please log in.',
      })
      return
    }
    console.error('[Zalo /send] Internal Error:', error)
    res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    })
  }
})
