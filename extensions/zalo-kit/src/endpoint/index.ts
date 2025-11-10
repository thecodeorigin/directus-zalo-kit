import type { Accountability } from '@directus/types'
import type {
  ZaloAttachment,
  ZaloConversation,
  ZaloConversationLabel,
  ZaloGroup,
  ZaloGroupMember,
  ZaloLabel,
  ZaloMessage,
  ZaloQuickMessage,
  ZaloReaction,
  ZaloSyncStatus,
  ZaloUser,
} from '../type'
import { defineEndpoint } from '@directus/extensions-sdk'
import { ThreadType } from 'zca-js'

// Import route handlers
import avatarProxyHandler from './routes/avatar-proxy.get'

import conversationsHandler from './routes/conversations.get'
import cookiesLoginHandler from './routes/login/cookies.post'
import qrLoginHandler from './routes/login/qr.post'
import logoutHandler from './routes/logout.post'
import meHandler from './routes/me.get'
import messagesHandler from './routes/messages/[conversationId].get'
import sendHandler from './routes/send.post'
import sessionHandler from './routes/session.get'
import statusHandler from './routes/status.get'
import * as ZaloLogin from './services/ZaloLoginService'
import * as ZaloMessage from './services/ZaloMessageService'
import ZaloService from './services/ZaloService'

/**
 * Zalo Endpoint - Main Entry Point
 */
export default defineEndpoint(async (router, context) => {
  const { getSchema, services } = context
  const { ItemsService } = services

  // Initialize Zalo modules
  await ZaloLogin.initialize()
  await ZaloMessage.initialize(getSchema, ItemsService)

  // Register routes
  router.post('/login/qr', qrLoginHandler(context) as any)
  router.post('/login/cookies', cookiesLoginHandler(context) as any)

  router.get('/status', statusHandler(context) as any)
  router.post('/logout', logoutHandler(context) as any)
  router.get('/session', sessionHandler(context) as any)
  router.get('/me', meHandler(context) as any)
  router.post('/send', sendHandler(context) as any)
  router.get('/conversations', conversationsHandler(context) as any)
  router.get('/messages/:conversationId', messagesHandler(context) as any)
  router.get('/avatar-proxy', avatarProxyHandler(context) as any)

  console.warn('[Zalo Endpoint] Modules initialized and routes registered')
  let zaloService: ZaloService
  try {
    zaloService = ZaloService.getInstance()
    console.warn('[Zalo Endpoint] Using existing ZaloService instance')
  }
  catch {
    zaloService = ZaloService.init(getSchema, ItemsService)
    console.warn('[Zalo Endpoint] Created new ZaloService instance')
  }

  router.post('/init', async (req, res) => {
    try {
      const result = await zaloService.loginInitiate()
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

  router.post('/login/cookies', async (req, res) => {
    try {
      const { cookies, imei, userAgent } = req.body as {
        cookies: any[]
        imei: string
        userAgent: string
      }

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
          await zaloService.loginImportSession(
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
  router.get('/status', async (req, res) => {
    try {
      const status = zaloService.loginGetStatus()
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

  router.post('/logout', async (req, res) => {
    try {
      await zaloService.loginLogout()
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

  router.get('/session', async (req, res) => {
    try {
      const session = await zaloService.sessionGetInfo()

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

  router.get('/me', (req, res) => {
    try {
      const status = zaloService.loginGetStatus()
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
      const { conversationId, message, content, clientId, senderId } = req.body as {
        conversationId: string
        message?: string
        content?: string
        clientId?: string
        senderId?: string
      }
      const messageContent = message || content

      if (!conversationId || !messageContent) {
        return res.status(400).json({
          error: 'conversationId and message are required',
        })
      }

      const status = zaloService.loginGetStatus()
      if (status.status !== 'logged_in') {
        console.error('[Endpoint /send] Zalo not logged in')
        return res.status(503).json({
          error: 'Zalo is not connected',
          status: status.status,
        })
      }

      const zaloUserId = senderId || status.userId
      if (!zaloUserId) {
        return res.status(401).json({ error: 'Zalo user ID not found' })
      }

      let zaloThreadId: string | null = null
      let threadType: typeof ThreadType.User | typeof ThreadType.Group

      try {
        const [conversation] = await database<ZaloConversation>('zalo_conversations')
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
          zaloThreadId = String(conversation.group_id)
          threadType = ThreadType.Group
        }
        else if (conversation.participant_id && conversation.participant_id !== null) {
          zaloThreadId = String(conversation.participant_id)
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
        zaloResult = await zaloService.apiSendMessage(
          { msg: messageContent },
          zaloThreadId,
          threadType,
        )
      }
      catch (e: any) {
        console.error(`[Endpoint /send] Zalo API Error: ${e.message}`)
      }

      const messageId
        = zaloResult?.message?.msgId
          || zaloResult?.data?.msgId
          || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      const clientMsgId = clientId || messageId

      const [sender] = await database<ZaloUser>('zalo_users')
        .where('id', zaloUserId)
        .select(['id', 'display_name', 'avatar_url', 'zalo_name'])
        .limit(1)

      const timestamp = new Date()

      try {
        const existingMessage = await database<ZaloMessage>('zalo_messages')
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

        const messageToInsert: Partial<ZaloMessage> = {
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
          created_at: timestamp.toISOString(),
          updated_at: timestamp.toISOString(),
        }
        await database<ZaloMessage>('zalo_messages')
          .insert(messageToInsert)
          .onConflict('id')
          .merge({
            client_id: clientMsgId,
            updated_at: timestamp.toISOString(),
          })

        await database<ZaloConversation>('zalo_conversations')
          .where('id', conversationId)
          .update({
            last_message_id: messageId,
            last_message_time: timestamp.toISOString(),
            updated_at: timestamp.toISOString(),
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
      if (error.message === 'User is not authenticated.') {
        return res.status(401).json({
          ok: false,
          message: 'Authentication required. Please log in.',
        })
      }
      console.error('[Zalo /send] Internal Error:', error)
      return res.status(500).json({
        error: 'Internal server error',
        details: error.message,
      })
    }
  })

  router.get('/conversations', async (req, res) => {
    try {
      const status = zaloService.loginGetStatus()
      const currentZaloUserId = status.userId

      if (status.status !== 'logged_in' || !currentZaloUserId) {
        return res.status(401).json({ error: 'Zalo user not authenticated' })
      }
      console.log('[Endpoint /conversations] Starting for user:', currentZaloUserId)

      const conversationsData = await database('zalo_conversations')
        .select([
          'zalo_conversations.id',
          'zalo_conversations.group_id',
          'zalo_conversations.participant_id',
          'zalo_conversations.last_message_time as timestamp',
          'zalo_conversations.unread_count',
          'zalo_conversations.is_pinned',
          'zalo_conversations.is_archived',
          'zalo_groups.name as group_name',
          'zalo_groups.avatar_url as group_avatar',
          'zalo_users.display_name as user_display_name',
          'zalo_users.avatar_url as user_avatar',
          'zalo_users.zalo_name as user_zalo_name',
        ])
        .leftJoin('zalo_groups', 'zalo_conversations.group_id', 'zalo_groups.id')
        .leftJoin('zalo_users', 'zalo_conversations.participant_id', 'zalo_users.id')
        .where('zalo_conversations.is_hidden', false)
        .andWhere(function () {
          this.where(function () {
            this.whereNotNull('zalo_conversations.group_id')
              .andWhere('zalo_conversations.participant_id', currentZaloUserId)
          }).orWhere(function () {
            this.whereNull('zalo_conversations.group_id')
              .andWhere('zalo_conversations.id', 'like', `%${currentZaloUserId}%`)
          })
        })
        .orderBy('zalo_conversations.is_pinned', 'desc')
        .orderBy('zalo_conversations.last_message_time', 'desc')
        .limit(100)

      console.log('[Endpoint /conversations] Fetched conversations:', conversationsData.length)

      if (conversationsData.length === 0) {
        return res.json({ data: [] })
      }

      const groupIds = [...new Set(conversationsData
        .filter(conv => conv.group_id)
        .map(conv => conv.group_id)
        .filter(Boolean))]

      console.log('[Endpoint /conversations] Group IDs to fetch members:', groupIds.length)

      let groupMembersMap = new Map()
      if (groupIds.length > 0) {
        try {
          const allMembers = await database('zalo_group_members')
            .select([
              'zalo_group_members.group_id',
              'zalo_group_members.owner_id',
              'zalo_users.display_name',
              'zalo_users.zalo_name',
              'zalo_users.avatar_url',
            ])
            .leftJoin('zalo_users', 'zalo_group_members.owner_id', 'zalo_users.id')
            .whereIn('zalo_group_members.group_id', groupIds)
            .where('zalo_group_members.is_active', true)

          console.log('[Endpoint /conversations] Fetched members:', allMembers.length)

          for (const member of allMembers) {
            if (!member.group_id || !member.owner_id) {
              continue
            }

            if (!groupMembersMap.has(member.group_id)) {
              groupMembersMap.set(member.group_id, [])
            }

            const memberName = member.display_name || member.zalo_name || `User ${String(member.owner_id).substring(0, 8)}`
            let memberAvatar = member.avatar_url

            if (memberAvatar) {
              if (memberAvatar.startsWith('https://s120-ava-talk.zadn.vn/')
                || memberAvatar.startsWith('https://ava-grp-talk.zadn.vn/')) {
                memberAvatar = `http://localhost:8055/zalo/avatar-proxy?url=${encodeURIComponent(memberAvatar)}`
              }
            }
            else {
              memberAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(memberName)}&background=random`
            }

            groupMembersMap.get(member.group_id).push({
              id: String(member.owner_id),
              name: memberName,
              avatar: memberAvatar,
            })
          }
        }
        catch (memberError: any) {
          console.error('[Endpoint /conversations] Error fetching members:', memberError.message)
        }
      }

      const conversations = conversationsData.map((conv) => {
        try {
          if (conv.group_id) {
            const groupIdStr = String(conv.group_id)
            const groupName = conv.group_name || `Group ${groupIdStr.substring(0, 8)}`
            let groupAvatar = conv.group_avatar

            if (groupAvatar && groupAvatar.startsWith('https://ava-grp-talk.zadn.vn/')) {
              groupAvatar = `http://localhost:8055/zalo/avatar-proxy?url=${encodeURIComponent(groupAvatar)}`
            }
            else if (!groupAvatar) {
              groupAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(groupName)}&background=0088ff`
            }

            const members = groupMembersMap.get(conv.group_id) || []

            return {
              id: conv.id,
              type: 'group',
              name: groupName,
              avatar: groupAvatar,
              timestamp: conv.timestamp || new Date().toISOString(),
              unreadCount: conv.unread_count || 0,
              isPinned: conv.is_pinned || false,
              isArchived: conv.is_archived || false,
              members,
              hasRealAvatar: !!conv.group_avatar,
            }
          }
          else if (conv.participant_id) {
            const userName = conv.user_display_name || conv.user_zalo_name || 'Unknown User'
            let userAvatar = conv.user_avatar

            if (userAvatar && userAvatar.startsWith('https://s120-ava-talk.zadn.vn/')) {
              userAvatar = `http://localhost:8055/zalo/avatar-proxy?url=${encodeURIComponent(userAvatar)}`
            }
            else if (!userAvatar) {
              userAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=random`
            }

            return {
              id: conv.id,
              type: 'direct',
              name: userName,
              avatar: userAvatar,
              timestamp: conv.timestamp || new Date().toISOString(),
              unreadCount: conv.unread_count || 0,
              isPinned: conv.is_pinned || false,
              isArchived: conv.is_archived || false,
              hasRealAvatar: !!conv.user_avatar,
            }
          }
        }
        catch (convError: any) {
          console.error('[Endpoint /conversations] Error processing conversation:', conv.id, convError.message)
          return null
        }
      }).filter(Boolean)

      console.log('[Endpoint /conversations] Returning', conversations.length, 'conversations')

      res.json({ data: conversations })
    }
    catch (error: any) {
      console.error(' [Endpoint /conversations] Error:', error)
      console.error(' Stack:', error.stack)
      res.status(500).json({
        error: 'Failed to fetch conversations',
        details: error.message,
        stack: error.stack,
      })
    }
  })

  router.get('/messages/:conversationId', async (req, res) => {
    try {
      const { conversationId } = req.params
      const status = zaloService.loginGetStatus()
      const currentZaloUserId = status.userId

      console.log('[Endpoint] Loading messages for:', conversationId)
      const messages = await database<ZaloMessage>('zalo_messages')
        .where('conversation_id', conversationId)
        .select([
          'zalo_messages.*',
          database.raw(`
            jsonb_agg(
              DISTINCT jsonb_build_object(
                'user_id', zr.user_id,
                'reaction_icon', zr.reaction_icon
              )
            ) FILTER (WHERE zr.id IS NOT NULL) AS reactions
          `),
          database.raw(`
            jsonb_agg(
              DISTINCT jsonb_build_object(
                'id', za.id,
                'url', za.url,
                'thumbnail_url', za.thumbnail_url,
                'file_name', za.file_name,
                'mime_type', za.mime_type,
                'file_size', za.file_size
              )
            ) FILTER (WHERE za.id IS NOT NULL) AS attachments
          `),
        ])
        // ✨ TYPED Joins
        .leftJoin<ZaloReaction>('zalo_reactions as zr', 'zr.message_id', 'zalo_messages.id')
        .leftJoin<ZaloAttachment>('zalo_attachments as za', 'za.message_id', 'zalo_messages.id')
        .groupBy('zalo_messages.id')
        .orderBy('zalo_messages.sent_at', 'asc')
        .limit(200)

      console.log('[Endpoint] Messages fetched:', messages.length)

      const senderIds = [...new Set(messages.map((m: any) => m.sender_id).filter(id => id))]
      let userMap = new Map()
      if (senderIds.length > 0) {
        const users = await database('zalo_users')
          .whereIn('id', senderIds)
          .select(['id', 'display_name', 'avatar_url', 'zalo_name'])
        userMap = new Map(users.map((u: any) => [u.id, u]))
      }

      const enrichedMessages = messages.map((msg: any) => {
        const user = userMap.get(msg.sender_id)
        const senderName = user?.display_name || user?.zalo_name || msg.sender_id || 'Unknown'
        let senderAvatar = user?.avatar_url

        if (!senderAvatar) {
          const avatarName = senderName === 'Unknown' ? '?' : senderName.charAt(0).toUpperCase()
          senderAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(avatarName)}&background=random`
        }
        else if (senderAvatar.startsWith('https://s120-ava-talk.zadn.vn/')) {
          senderAvatar = `http://localhost:8055/zalo/avatar-proxy?url=${encodeURIComponent(senderAvatar)}`
        }

        const direction = msg.sender_id === currentZaloUserId ? 'out' : 'in'

        return {
          id: msg.id,
          direction,
          text: msg.content || '',
          senderName,
          senderId: msg.sender_id,
          time: msg.sent_at,
          avatar: senderAvatar,
          status: direction === 'out' ? 'read' : undefined,
          isEdited: msg.is_edited,
          isUndone: msg.is_undone,
          clientId: msg.client_id,
          reactions: msg.reactions || [],
          attachments: msg.attachments || [],
        }
      })

      res.json({ data: enrichedMessages })
    }
    catch (error: any) {
      console.error('❌ [Endpoint /messages] Error:', error)
      res.status(500).json({ error: 'Failed to fetch messages', details: error.message })
    }
  })

  router.get('/avatar-proxy', async (req, res) => {
    try {
      const { url } = req.query

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL parameter is required' })
      }

      const allowedDomains = [
        'https://ava-grp-talk.zadn.vn/',
        'https://s120-ava-talk.zadn.vn/',
        'https://avatar-talk.zadn.vn/',
      ]

      if (!allowedDomains.some(domain => url.startsWith(domain))) {
        console.warn(`[Avatar Proxy] Blocked URL: ${url}`)
        return res.status(403).json({ error: 'Only allowed Zalo CDN URLs are permitted' })
      }

      const response = await fetch(url)

      if (!response.ok) {
        console.error(`[Avatar Proxy] Failed to fetch ${url} - Status: ${response.status}`)
        return res.status(response.status).send(`Failed to fetch image from Zalo. Status: ${response.status}`)
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream'
      const buffer = await response.arrayBuffer()

      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'public, max-age=86400')
      // eslint-disable-next-line node/prefer-global/buffer
      res.send(Buffer.from(buffer))
    }
    catch (error: any) {
      console.error('❌ [Endpoint /avatar-proxy] Error:', error)
      res.status(500).json({ error: 'Failed to proxy image', details: error.message })
    }
  })

  router.post('/messages/:messageId/react', async (req, res) => {
    try {
      const { messageId } = req.params
      const { reaction_icon } = req.body as { reaction_icon: string }

      const status = zaloService.loginGetStatus()
      const zaloUserId = status.userId

      if (status.status !== 'logged_in' || !zaloUserId) {
        return res.status(401).json({ error: 'Zalo user not authenticated' })
      }

      if (!reaction_icon) {
        return res.status(400).json({ error: 'reaction_icon is required' })
      }

      const reactionData: Omit<ZaloReaction, 'id'> = {
        message_id: messageId,
        user_id: zaloUserId,
        reaction_icon,
        created_at: new Date().toISOString(),
      }

      await database<ZaloReaction>('zalo_reactions')
        .insert(reactionData as any)
        .onConflict(database.raw('(message_id, user_id)'))
        .merge({
          reaction_icon,
        })

      res.json({
        success: true,
        message: 'Reaction saved',
        data: reactionData,
      })
    }
    catch (error: any) {
      console.error(' [Endpoint /react] Error:', error)
      res.status(500).json({ error: 'Failed to save reaction', details: error.message })
    }
  })

  router.get('/labels', async (req, res) => {
    try {
      const labels = await database<ZaloLabel>('zalo_labels')
        .select('*')
        .orderBy('name', 'asc')

      res.json({ data: labels as ZaloLabel[] })
    }
    catch (error: any) {
      console.error(' [Endpoint /labels] Error:', error)
      res.status(500).json({ error: 'Failed to fetch labels', details: error.message })
    }
  })

  router.post('/conversations/:conversationId/labels', async (req, res) => {
    try {
      const { conversationId } = req.params
      const { label_id } = req.body as { label_id: number }

      if (!label_id) {
        return res.status(400).json({ error: 'label_id is required' })
      }

      await database<ZaloConversationLabel>('zalo_conversation_labels')
        .insert({
          conversation_id: conversationId,
          label_id,
        })
        .onConflict(['conversation_id', 'label_id'])
        .ignore()

      res.json({ success: true, message: 'Label applied' })
    }
    catch (error: any) {
      console.error(' [Endpoint /apply-label] Error:', error)
      res.status(500).json({ error: 'Failed to apply label', details: error.message })
    }
  })

  router.delete('/conversations/:conversationId/labels/:labelId', async (req, res) => {
    try {
      const { conversationId, labelId } = req.params

      await database<ZaloConversationLabel>('zalo_conversation_labels')
        .where({
          conversation_id: conversationId,
          label_id: Number(labelId),
        })
        .del()

      res.json({ success: true, message: 'Label removed' })
    }
    catch (error: any) {
      console.error(' [Endpoint /remove-label] Error:', error)
      res.status(500).json({ error: 'Failed to remove label', details: error.message })
    }
  })

  router.get('/quick-messages', async (req, res) => {
    try {
      const messages = await database<ZaloQuickMessage>('zalo_quick_messages')
        .where('is_active', true)
        .orderBy('keyword', 'asc')
        .select('*')

      res.json({ data: messages as ZaloQuickMessage[] })
    }
    catch (error: any) {
      console.error(' [Endpoint /quick-messages] Error:', error)
      res.status(500).json({ error: 'Failed to fetch quick messages', details: error.message })
    }
  })

  router.put('/conversations/:conversationId/pin', async (req, res) => {
    try {
      const { conversationId } = req.params
      const { is_pinned } = req.body as { is_pinned: boolean }

      if (typeof is_pinned !== 'boolean') {
        return res.status(400).json({ error: 'is_pinned (boolean) is required' })
      }

      await database<ZaloConversation>('zalo_conversations')
        .where('id', conversationId)
        .update({
          is_pinned,
          updated_at: new Date().toISOString(),
        })

      res.json({ success: true, message: `Conversation ${is_pinned ? 'pinned' : 'unpinned'}` })
    }
    catch (error: any) {
      console.error(' [Endpoint /pin] Error:', error)
      res.status(500).json({ error: 'Failed to update pin status', details: error.message })
    }
  })

  router.put('/conversations/:conversationId/archive', async (req, res) => {
    try {
      const { conversationId } = req.params
      const { is_archived } = req.body as { is_archived: boolean }

      if (typeof is_archived !== 'boolean') {
        return res.status(400).json({ error: 'is_archived (boolean) is required' })
      }

      await database<ZaloConversation>('zalo_conversations')
        .where('id', conversationId)
        .update({
          is_archived,
          updated_at: new Date().toISOString(),
        })

      res.json({ success: true, message: `Conversation ${is_archived ? 'archived' : 'unarchived'}` })
    }
    catch (error: any) {
      console.error(' [Endpoint /archive] Error:', error)
      res.status(500).json({ error: 'Failed to update archive status', details: error.message })
    }
  })

  router.get('/users', async (req, res) => {
    try {
      const { userId, ids, fields, limit } = req.query

      let query = database('zalo_users')

      if (userId) {
        query = query.where('id', userId)
      }

      if (ids && typeof ids === 'string') {
        const idArray = ids.split(',')
        query = query.whereIn('id', idArray)
      }

      if (fields && typeof fields === 'string') {
        const fieldArray = fields.split(',')
        query = query.select(fieldArray)
      }
      else {
        query = query.select(['id', 'zalo_name', 'display_name', 'avatar_url', 'is_friend'])
      }

      const limitNum = limit ? Number(limit) : 100
      query = query.limit(limitNum)

      const users = await query

      res.json({ data: users })
    }
    catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch users', details: error.message })
    }
  })
  router.get('/users/:userId', async (req, res) => {
    try {
      const { userId } = req.params

      const user = await database('zalo_users')
        .where('id', userId)
        .first()

      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      res.json({ data: user })
    }
    catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch user', details: error.message })
    }
  })
  router.get('/groups', async (req, res) => {
    try {
      const { groupId, ids, limit, withMembers } = req.query

      let query = database('zalo_groups')

      if (groupId) {
        query = query.where('id', groupId)
      }

      if (ids && typeof ids === 'string') {
        const idArray = ids.split(',')
        query = query.whereIn('id', idArray)
      }

      const limitNum = limit ? Number(limit) : 100
      query = query.limit(limitNum)

      const groups = await query
      if (withMembers === 'true') {
        for (const group of groups) {
          const members = await database('zalo_group_members')
            .where('group_id', group.id)
            .where('is_active', true)
            .select(['owner_id', 'joined_at', 'is_active'])

          if (members.length > 0) {
            const memberIds = members.map(m => m.owner_id)
            const users = await database('zalo_users')
              .whereIn('id', memberIds)
              .select(['id', 'display_name', 'zalo_name', 'avatar_url'])

            const userMap = new Map(users.map((u: any) => [u.id, u]))

            group.members = members.map(m => ({
              userId: m.owner_id,
              joinedAt: m.joined_at,
              isActive: m.is_active,
              ...userMap.get(m.owner_id),
            }))
          }
          else {
            group.members = []
          }
        }
      }

      res.json({ data: groups })
    }
    catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch groups', details: error.message })
    }
  })
  router.get('/groups/:groupId', async (req, res) => {
    try {
      const { groupId } = req.params
      const { withMembers } = req.query

      const group = await database('zalo_groups')
        .where('id', groupId)
        .first()

      if (!group) {
        return res.status(404).json({ error: 'Group not found' })
      }

      if (withMembers === 'true') {
        const members = await database('zalo_group_members')
          .where('group_id', groupId)
          .where('is_active', true)
          .select(['owner_id', 'joined_at', 'is_active'])

        if (members.length > 0) {
          const memberIds = members.map(m => m.owner_id)
          const users = await database('zalo_users')
            .whereIn('id', memberIds)
            .select(['id', 'display_name', 'zalo_name', 'avatar_url'])

          const userMap = new Map(users.map((u: any) => [u.id, u]))

          group.members = members.map(m => ({
            userId: m.owner_id,
            joinedAt: m.joined_at,
            isActive: m.is_active,
            ...userMap.get(m.owner_id),
          }))
        }
        else {
          group.members = []
        }
      }

      res.json({ data: group })
    }
    catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch group', details: error.message })
    }
  })

  router.get('/groups/:groupId/members', async (req, res) => {
    try {
      const { groupId } = req.params
      const { activeOnly } = req.query

      let query = database('zalo_group_members')
        .where('group_id', groupId)

      if (activeOnly !== 'false') {
        query = query.where('is_active', true)
      }

      const members = await query
        .select(['owner_id', 'is_active', 'joined_at', 'left_at'])

      if (members.length > 0) {
        const memberIds = members.map(m => m.owner_id)
        const users = await database('zalo_users')
          .whereIn('id', memberIds)
          .select(['id', 'display_name', 'zalo_name', 'avatar_url'])

        const userMap = new Map(users.map((u: any) => [u.id, u]))

        const enrichedMembers = members.map(m => ({
          userId: m.owner_id,
          isActive: m.is_active,
          joinedAt: m.joined_at,
          leftAt: m.left_at,
          ...userMap.get(m.owner_id),
        }))

        res.json({ data: enrichedMembers })
      }
      else {
        res.json({ data: [] })
      }
    }
    catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch group members', details: error.message })
    }
  })

  router.post('/labels', async (req, res) => {
    try {
      const { name, color_hex, description } = req.body as {
        name: string
        color_hex?: string
        description?: string
      }

      if (!name) {
        return res.status(400).json({ error: 'name is required' })
      }

      const labelData = {
        name,
        color_hex: color_hex || '#3498db',
        description: description || null,
        is_system: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const [newLabel] = await database<ZaloLabel>('zalo_labels')
        .insert(labelData)
        .returning('*')

      res.json({
        success: true,
        message: 'Label created',
        data: newLabel,
      })
    }
    catch (error: any) {
      res.status(500).json({ error: 'Failed to create label', details: error.message })
    }
  })
  router.put('/labels/:labelId', async (req, res) => {
    try {
      const { labelId } = req.params
      const { name, color_hex, description } = req.body

      const updateData: any = {
        updated_at: new Date().toISOString(),
      }

      if (name)
        updateData.name = name
      if (color_hex)
        updateData.color_hex = color_hex
      if (description !== undefined)
        updateData.description = description

      await database<ZaloLabel>('zalo_labels')
        .where('id', Number(labelId))
        .update(updateData)

      res.json({
        success: true,
        message: 'Label updated',
      })
    }
    catch (error: any) {
      res.status(500).json({ error: 'Failed to update label', details: error.message })
    }
  })

  router.delete('/labels/:labelId', async (req, res) => {
    try {
      const { labelId } = req.params

      await database<ZaloConversationLabel>('zalo_conversation_labels')
        .where('label_id', Number(labelId))
        .del()

      await database<ZaloLabel>('zalo_labels')
        .where('id', Number(labelId))
        .del()

      res.json({
        success: true,
        message: 'Label deleted',
      })
    }
    catch (error: any) {
      res.status(500).json({ error: 'Failed to delete label', details: error.message })
    }
  })

  router.post('/sync/groups/:groupId/members', async (req, res) => {
    try {
      const { groupId } = req.params

      await zaloService.syncGroupMembers(groupId)

      res.json({
        success: true,
        message: `Members synced for group ${groupId}`,
      })
    }
    catch (error: any) {
      res.status(500).json({
        error: 'Failed to sync group members',
        details: error.message,
      })
    }
  })
})
