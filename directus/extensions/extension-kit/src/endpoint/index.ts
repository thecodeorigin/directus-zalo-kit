import { defineEndpoint } from '@directus/extensions-sdk'
import { ThreadType } from 'zca-js'
import ZaloService from './services/ZaloService'

export default defineEndpoint(async (router, { database, getSchema, services }) => {
  const { ItemsService } = services

  let zaloService: ZaloService
  try {
    zaloService = ZaloService.getInstance()
    console.warn('[Zalo Endpoint] Using existing ZaloService instance')
  }
  catch {
    zaloService = ZaloService.init(getSchema, ItemsService)
    console.warn('[Zalo Endpoint] Created new ZaloService instance')
  }

  // POST /zalo/init - Initiate QR code login
  router.post('/init', async (req, res) => {
    try {
      const result = await zaloService.initiateLogin()
      res.json(result)
    }
    catch (error: any) {
      console.error('[Zalo Endpoint] Init error:', error)
      res.status(500).json({
        error: error.message,
        status: 'logged_out',
        qrCode: null,
        isListening: false,
        userId: null,
      })
    }
  })

  // POST /zalo/login/cookies - Login using cookies from Zalo Extractor
  router.post('/login/cookies', async (req, res) => {
    try {
      const { cookies, imei, userAgent } = req.body

      if (!cookies || !imei || !userAgent) {
        return res.status(400).json({
          ok: false,
          message: 'Missing required fields: cookies, imei, userAgent',
        })
      }

      if (!Array.isArray(cookies) || cookies.length === 0) {
        return res.status(400).json({
          ok: false,
          message: 'Cookies must be a non-empty array',
        })
      }
      res.json({
        ok: true,
        message: 'Login session is being initialized...',
      });

      (async () => {
        try {
          await zaloService.importSessionFromExtractor(
            imei,
            userAgent,
            cookies,
          )
        }
        catch (err) {
          console.error('[ZaloService] Background cookie login failed:', err)
        }
      })()
    }
    catch (error: any) {
      console.error('[Zalo Endpoint] Cookies Login error:', error)
      res.status(500).json({
        ok: false,
        message: error.message,
      })
    }
  })

  // GET /zalo/status - Get current login status
  router.get('/status', async (req, res) => {
    try {
      const status = zaloService.getStatus()
      res.json(status)
    }
    catch (error: any) {
      console.error('[Zalo Endpoint] Status error:', error)
      res.status(500).json({
        error: error.message,
        status: 'logged_out',
        qrCode: null,
        isListening: false,
        userId: null,
      })
    }
  })

  // POST /zalo/logout - Logout
  router.post('/logout', async (req, res) => {
    try {
      await zaloService.logout()
      res.json({
        success: true,
        message: 'Logged out successfully',
      })
    }
    catch (error: any) {
      console.error('[Zalo Endpoint] Logout error:', error)
      res.status(500).json({ error: error.message })
    }
  })

  // GET /zalo/session - Get session info
  router.get('/session', async (req, res) => {
    try {
      const session = await zaloService.getSessionInfo()

      if (session) {
        res.json({
          exists: true,
          userId: session.userId,
          loginTime: session.loginTime,
          isActive: session.isActive,
        })
      }
      else {
        res.json({ exists: false })
      }
    }
    catch (error: any) {
      console.error('[Zalo Endpoint] Session error:', error)
      res.status(500).json({ error: error.message })
    }
  })

  // POST /zalo/send-message - Send a message
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

      console.log('🔵 [Endpoint /send] Request received:', {
        conversationId,
        messageLength: messageContent?.length,
        hasAuth: !!(req as any).accountability,
        userId: (req as any).accountability?.user,
        clientId, // ✅ Log clientId
      })

      // 1. Validation
      if (!conversationId || !messageContent) {
        console.error('❌ [Endpoint /send] Missing required fields')
        return res.status(400).json({
          error: 'conversationId and message are required',
        })
      }

      // 2. Check Zalo status
      const status = zaloService.getStatus()
      console.log('🔵 [Endpoint /send] Zalo status:', status)

      if (status.status !== 'logged_in') {
        console.error('❌ [Endpoint /send] Zalo not logged in')
        return res.status(503).json({
          error: 'Zalo is not connected',
          status: status.status,
        })
      }

      // 3. Get current user
      const accountability = (req as any).accountability
      const currentUserId = accountability?.user || status.userId || 'system'
      const zaloUserId = status.userId // ✅ Lấy Zalo user ID

      console.log('🔵 [Endpoint /send] User IDs:', {
        directusUserId: currentUserId,
        zaloUserId,
      })

      // 4. Query DB để lấy Zalo thread ID
      let zaloThreadId: string | null = null

      try {
        const [conversation] = await database('zalo_conversations')
          .where('id', conversationId)
          .select(['participant_id', 'group_id'])
          .limit(1)

        console.log('🔵 [Endpoint /send] Found conversation:', conversation)

        if (!conversation) {
          console.error('❌ [Endpoint /send] Conversation not found')
          return res.status(404).json({
            error: 'Conversation not found in database',
            conversationId,
          })
        }

        if (conversationId.startsWith('direct_')) {
          zaloThreadId = conversation.participant_id
          console.log('🔵 [Endpoint /send] Direct chat - participant_id:', zaloThreadId)
        }
        else {
          zaloThreadId = conversation.group_id
          console.log('🔵 [Endpoint /send] Group chat - group_id:', zaloThreadId)
        }

        if (!zaloThreadId) {
          console.error('❌ [Endpoint /send] No Zalo thread ID in conversation')
          return res.status(400).json({
            error: 'Cannot determine Zalo thread ID',
            conversationId,
            conversation,
          })
        }
      }
      catch (dbError: any) {
        console.error('❌ [Endpoint /send] Database error:', dbError)
        return res.status(500).json({
          error: 'Failed to query conversation',
          details: dbError.message,
        })
      }

      console.log('✅ [Endpoint /send] Zalo thread ID:', zaloThreadId)

      // 5. Send via Zalo API
      console.log('🔵 [Endpoint /send] Calling zaloService.sendMessage...')

      let zaloResult: any
      try {
        zaloResult = await zaloService.sendMessage(
          { msg: messageContent },
          zaloThreadId,
        )

        console.log('✅ [Endpoint /send] Zalo API success:', zaloResult)
      }
      catch (zaloError: any) {
        console.error('❌ [Endpoint /send] Zalo API error:', zaloError)

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
        })
      }

      // ✅ 6. Extract message IDs (SAU try-catch)
      const messageId = zaloResult?.message?.msgId // ✅ Đúng path
        || zaloResult?.data?.msgId
        || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      const clientMsgId = clientId || messageId // ✅ Từ request body

      console.log('🔵 [Endpoint /send] Message IDs:', {
        messageId,
        clientMsgId,
        fromZalo: zaloResult?.message?.msgId,
        fromBody: clientId,
      })

      // 7. Save to database
      const timestamp = new Date()

      try {
      // Check duplicate
        const existingMessage = await database('zalo_messages')
          .where(function () {
            this.where('id', messageId)
              .orWhere('client_id', clientMsgId)
          })
          .first()

        if (existingMessage) {
          console.log('⏭️ [Endpoint /send] Message already exists:', messageId)
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

        console.log('🔵 [Endpoint /send] Inserting new message...')

        // ✅ Insert với Zalo IDs
        const [newMessage] = await database('zalo_messages')
          .insert({
            id: messageId, // ✅ Zalo msgId
            client_id: clientMsgId, // ✅ Client ID
            conversation_id: conversationId,
            content: messageContent,
            sender_id: zaloUserId, // ✅ Zalo user ID (không phải Directus UUID)
            sent_at: timestamp,
            received_at: timestamp,
            is_edited: false,
            is_undone: false,
            raw_data: zaloResult,
            created_at: timestamp,
            updated_at: timestamp,
          })
          .returning('*')

        console.log('✅ [Endpoint /send] Message saved - WebSocket broadcasting...')

        // Update conversation
        await database('zalo_conversations')
          .where('id', conversationId)
          .update({
            last_message_id: messageId,
            last_message_time: timestamp,
            updated_at: timestamp,
          })

        // ✅ Return success
        return res.json({
          success: true,
          message: 'Message sent successfully',
          data: {
            id: messageId, // ✅ Zalo msgId
            conversationId,
            content: messageContent,
            sent_at: timestamp.toISOString(),
            sender_id: zaloUserId, // ✅ Zalo user ID
            client_id: clientMsgId, // ✅ Client ID
          },
        })
      }
      catch (dbError: any) {
        console.error('❌ [Endpoint /send] DB save error:', dbError)

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
      console.error('❌ [Endpoint /send] Unexpected error:', error)
      return res.status(500).json({
        error: 'Internal server error',
        details: error.message,
      })
    }
  })

  // Proxy avatar images to avoid CORS
  router.get('/avatar-proxy', async (req, res) => {
    try {
      const { url } = req.query

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL parameter is required' })
      }

      // Only allow Zalo CDN URLs
      if (!url.startsWith('https://ava-grp-talk.zadn.vn/') && !url.startsWith('https://s120-ava-talk.zadn.vn/')) {
        return res.status(403).json({ error: 'Only Zalo CDN URLs are allowed' })
      }

      // Fetch image from Zalo
      const response = await fetch(url)

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch image' })
      }

      // Get content type and buffer
      const contentType = response.headers.get('content-type') || 'image/jpeg'
      const buffer = await response.arrayBuffer()

      // Set headers and send
      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'public, max-age=86400') // Cache 24 hours
      res.send(Buffer.from(buffer))
    }
    catch (error: any) {
      console.error('❌ [Endpoint /avatar-proxy] Error:', error)
      res.status(500).json({ error: 'Failed to proxy image', details: error.message })
    }
  })

  // Manual sync group members (max 10 members to avoid rate limit)
  router.post('/sync-group-members/:groupId', async (req, res) => {
    try {
      const { groupId } = req.params
      const { maxMembers = 10 } = req.body

      if (!groupId) {
        return res.status(400).json({ error: 'Group ID is required' })
      }

      console.warn(`[Endpoint] Manual sync members for group: ${groupId}`)

      // Fetch group info from Zalo API
      const groupInfo = await zaloService.getGroupInfo(groupId)

      if (!groupInfo) {
        return res.status(404).json({ error: 'Group not found' })
      }

      // Sync members (only first N to avoid rate limit)
      await zaloService.manualSyncGroupMembers(groupId, groupInfo, maxMembers)

      res.json({
        success: true,
        message: `Synced up to ${maxMembers} members for group ${groupId}`,
        totalMembers: groupInfo.memVerList?.length || 0,
      })
    }
    catch (error: any) {
      console.error('❌ [Endpoint /sync-group-members] Error:', error)
      res.status(500).json({
        error: 'Failed to sync group members',
        details: error.message,
      })
    }
  })
})
