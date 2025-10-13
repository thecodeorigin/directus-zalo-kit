import { defineEndpoint } from '@directus/extensions-sdk'
import { ThreadType } from 'zca-js'
import ZaloService from './services/ZaloService'

export default defineEndpoint((router, { getSchema, services, database }) => {
  const { ItemsService } = services
  const zaloService = ZaloService.init(getSchema, ItemsService)

  router.post('/init', async (req, res) => {
    try {
      const status = await zaloService.initiateLogin()
      res.json(status)
    }
    catch (error) {
      res.status(500).json({ error: (error as Error).message })
    }
  })

  router.get('/status', (req, res) => {
    res.json(zaloService.getStatus())
  })

  router.get('/conversations', async (req, res) => {
    try {
      const messages = await database('zalo_messages')
        .select(['conversation_id', 'sender_id', 'content', 'sent_at'])
        .orderBy('sent_at', 'desc')
        .limit(1000)

      const conversationsMap = new Map()
      const senderIds = new Set()

      messages.forEach((msg: any) => {
        if (!conversationsMap.has(msg.conversation_id)) {
          conversationsMap.set(msg.conversation_id, {
            conversation_id: msg.conversation_id,
            sender_id: msg.sender_id,
            content: msg.content,
            sent_at: msg.sent_at,
          })
          senderIds.add(msg.sender_id)
        }
      })

      const users = await database('zalo_users')
        .whereIn('id', Array.from(senderIds) as string[])
        .select(['id', 'display_name', 'avatar_url', 'zalo_name'])

      const userMap = new Map(users.map((u: any) => [u.id, u]))

      const conversations = Array.from(conversationsMap.values()).map((conv: any) => {
        const user = userMap.get(conv.sender_id)
        return {
          id: conv.conversation_id,
          name: user?.display_name || user?.zalo_name || conv.sender_id || 'Unknown',
          avatar: user?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.display_name || 'U')}&background=random`,
          lastMessage: conv.content || '',
          timestamp: conv.sent_at,
          unreadCount: 0,
          online: true,
        }
      })

      res.json({
        data: conversations,
      })
    }
    catch (error: any) {
      console.error('[Endpoint] Error:', error)
      res.status(500).json({ error: error.message })
    }
  })

  router.get('/messages/:conversationId', async (req, res) => {
    try {
      const { conversationId } = req.params
      const messages = await database('zalo_messages')
        .where('conversation_id', conversationId)
        .select(['id', 'sender_id', 'content', 'sent_at', 'is_edited'])
        .orderBy('sent_at', 'asc')

      const senderIds = [...new Set(messages.map((m: any) => m.sender_id))]

      const users = await database('zalo_users')
        .whereIn('id', senderIds)
        .select(['id', 'display_name', 'avatar_url', 'zalo_name'])

      const userMap = new Map(users.map((u: any) => [u.id, u]))

      const enrichedMessages = messages.map((msg: any) => {
        const user = userMap.get(msg.sender_id)
        return {
          id: msg.id,
          msgId: msg.id,
          senderId: msg.sender_id,
          senderName: user?.display_name || user?.zalo_name || msg.sender_id || 'Unknown',
          senderAvatar: user?.avatar_url,
          content: msg.content,
          timestamp: msg.sent_at,
          isEdited: msg.is_edited,
        }
      })

      res.json({
        data: enrichedMessages,
      })
    }
    catch (error: any) {
      console.error('[Endpoint] Error:', error)
      res.status(500).json({ error: error.message })
    }
  })
  router.get('/me', (req, res) => {
    try {
      const status = zaloService.getStatus()
      res.json({
        userId: status.userId,
        status: status.status,
        isListening: status.isListening,
      })
    }
    catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  })
  router.post('/send', async (req, res) => {
    try {
      const { conversationId, message, content, clientId } = req.body
      const messageContent = message || content

      // 1. Validation
      if (!conversationId || !messageContent) {
        return res.status(400).json({
          error: 'conversationId and message are required',
        })
      }

      const status = zaloService.getStatus()
      if (status.status !== 'logged_in') {
        console.error('[Endpoint /send] Zalo not logged in')
        return res.status(503).json({
          error: 'Zalo is not connected',
          status: status.status,
        })
      }

      const zaloUserId = status.userId

      let zaloThreadId: string | null = null
      let threadType: typeof ThreadType.User | typeof ThreadType.Group

      try {
        const [conversation] = await database('zalo_conversations')
          .where('id', conversationId)
          .select(['participant_id', 'group_id'])
          .limit(1)

        if (!conversation) {
          console.error('[Endpoint /send] Conversation not found')
          return res.status(404).json({
            error: 'Conversation not found in database',
            conversationId,
          })
        }

        if (conversation.group_id && conversation.group_id !== null) {
          zaloThreadId = conversation.group_id
          threadType = ThreadType.Group
        }
        else if (conversation.participant_id && conversation.participant_id !== null) {
          zaloThreadId = conversation.participant_id
          threadType = ThreadType.User
        }
        else {
          return res.status(400).json({
            error: 'Cannot determine Zalo thread ID',
            conversationId,
            conversation,
          })
        }

        if (!zaloThreadId) {
          return res.status(400).json({
            error: 'Invalid thread ID',
            conversationId,
            conversation,
          })
        }
      }
      catch (dbError: any) {
        return res.status(500).json({
          error: 'Failed to query conversation',
          details: dbError.message,
        })
      }

      let zaloResult: any
      try {
        zaloResult = await zaloService.sendMessage(
          { msg: messageContent },
          zaloThreadId,
          threadType,
        )
      }
      catch (zaloError: any) {
        console.error('Zalo API Error:', zaloError)

        if (zaloError.code === 114) {
          return res.status(400).json({
            error: 'Invalid Zalo thread ID',
            details: 'The recipient does not exist or has blocked you',
            zaloThreadId,
            code: 114,
          })
        }

        return res.status(500).json({
          error: 'Failed to send message via Zalo',
          details: zaloError.message,
          code: zaloError.code,
          threadId: zaloThreadId,
        })
      }

      const messageId = zaloResult?.message?.msgId
        || zaloResult?.data?.msgId
        || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      const clientMsgId = clientId || messageId

      const [sender] = await database('zalo_users')
        .where('id', zaloUserId)
        .select(['id', 'display_name', 'avatar_url', 'zalo_name'])
        .limit(1)

      const timestamp = new Date()

      try {
        const existingMessage = await database('zalo_messages')
          .where(function () {
            this.where('id', messageId)
              .orWhere('client_id', clientMsgId)
          })
          .first()

        if (existingMessage) {
          return res.json({
            success: true,
            message: 'Message already processed',
            data: {
              id: existingMessage.id,
              conversationId: existingMessage.conversation_id,
              content: existingMessage.content,
              sent_at: existingMessage.sent_at,
            },
          })
        }

        await database('zalo_messages')
          .insert({
            id: messageId,
            client_id: clientMsgId,
            conversation_id: conversationId,
            content: messageContent,
            sender_id: zaloUserId,
            sent_at: timestamp,
            received_at: timestamp,
            is_edited: false,
            is_undone: false,
            raw_data: zaloResult,
            created_at: timestamp,
            updated_at: timestamp,
          })
          .onConflict('id')
          .merge({
            client_id: clientMsgId,
            updated_at: timestamp,
          })

        await database('zalo_conversations')
          .where('id', conversationId)
          .update({
            last_message_id: messageId,
            last_message_time: timestamp,
            updated_at: timestamp,
          })

        return res.json({
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
        return res.status(207).json({
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
      console.error('Internal Error:', error)
      return res.status(500).json({
        error: 'Internal server error',
        details: error.message,
      })
    }
  })
})
