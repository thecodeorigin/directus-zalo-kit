import { defineEndpoint } from '@directus/extensions-sdk'
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

  // ✅ Get conversations
  router.get('/conversations', async (req, res) => {
    try {
      console.log('[Endpoint] Loading conversations...')

      const messages = await database('zalo_messages')
        .select(['conversation_id', 'sender_id', 'content', 'sent_at']) // ✅ Array
        .orderBy('sent_at', 'desc')
        .limit(1000)

      console.log('[Endpoint] Messages:', messages.length)

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

      // ✅ Fetch users - Array in select
      const users = await database('zalo_users')
        .whereIn('id', Array.from(senderIds) as string[])
        .select(['id', 'display_name', 'avatar_url', 'zalo_name']) // ✅ Array

      console.log('[Endpoint] Users:', users.length)

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

      console.log('[Endpoint] Conversations:', conversations.length)

      res.json({
        data: conversations,
      })
    }
    catch (error: any) {
      console.error('[Endpoint] Error:', error)
      res.status(500).json({ error: error.message })
    }
  })

  // ✅ Get messages
  router.get('/messages/:conversationId', async (req, res) => {
    try {
      const { conversationId } = req.params
      console.log('[Endpoint] Loading messages for:', conversationId)

      const messages = await database('zalo_messages')
        .where('conversation_id', conversationId)
        .select(['id', 'sender_id', 'content', 'sent_at', 'is_edited']) // ✅ Array
        .orderBy('sent_at', 'asc')

      console.log('[Endpoint] Messages:', messages.length)

      const senderIds = [...new Set(messages.map((m: any) => m.sender_id))]

      const users = await database('zalo_users')
        .whereIn('id', senderIds)
        .select(['id', 'display_name', 'avatar_url', 'zalo_name']) // ✅ Array

      console.log('[Endpoint] Users:', users.length)

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

  // ✅ Send message
  router.post('/send-message', async (req, res) => {
    try {
      const { conversationId, content } = req.body

      if (!conversationId || !content) {
        return res.status(400).json({
          error: 'conversationId and content are required',
        })
      }

      console.log('[Endpoint] Sending message:', { conversationId, content })

      const userId = (req as any).accountability?.user || 'system'

      const [newMessage] = await database('zalo_messages')
        .insert({
          conversation_id: conversationId,
          content,
          sender_id: userId,
          sent_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*')

      console.log('[Endpoint] Message sent:', newMessage?.id)

      res.json({
        success: true,
        data: {
          ...newMessage,
          timestamp: newMessage.sent_at,
        },
      })
    }
    catch (error: any) {
      console.error('[Endpoint] Error:', error)
      res.status(500).json({ error: error.message })
    }
  })
})
