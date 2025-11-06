import type { Accountability } from '@directus/types'
import { ThreadType } from 'zca-js'
import * as ZaloMessage from '../services/ZaloMessageService'
import { defineEventHandler } from '../utils'

/**
 * POST /zalo/send
 * Send a message to a conversation
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
    const { conversationId, message, content, clientId } = req.body
    const messageContent = message || content

    console.log('🔵 [Endpoint /send] Request received:', {
      conversationId,
      messageLength: messageContent?.length,
      hasAuth: !!(req as any).accountability,
      userId: (req as any).accountability?.user,
      clientId,
    })

    // 1. Validation
    if (!conversationId || !messageContent) {
      console.error('❌ [Endpoint /send] Missing required fields')
      res.status(400).json({
        error: 'conversationId and message are required',
      })
    }

    // 2. Check Zalo status
    const status = ZaloMessage.getLoginStatus()
    console.log('🔵 [Endpoint /send] Zalo status:', status)

    if (status.status !== 'logged_in') {
      console.error('❌ [Endpoint /send] Zalo not logged in')
      res.status(503).json({
        error: 'Zalo is not connected',
        status: status.status,
      })
    }

    // 3. Get current user
    const accountability = (req as any).accountability
    const currentUserId = accountability?.user || status.userId || 'system'
    const zaloUserId = status.userId // Get Zalo user ID

    console.log('🔵 [Endpoint /send] User IDs:', {
      directusUserId: currentUserId,
      zaloUserId,
    })

    // 4. Query DB to get Zalo thread ID
    let zaloThreadId: string | null = null
    let threadType: typeof ThreadType.User | typeof ThreadType.Group

    try {
      const [conversation] = await database('zalo_conversations')
        .where('id', conversationId)
        .select(['participant_id', 'group_id', 'type'])
        .limit(1)

      console.log('🔵 [Endpoint /send] Found conversation:', conversation)

      if (!conversation) {
        console.error('❌ [Endpoint /send] Conversation not found')
        res.status(404).json({
          error: 'Conversation not found in database',
          conversationId,
        })
      }

      // Determine threadId and type based on conversation record
      if (conversation.type === 'group' && conversation.group_id) {
        zaloThreadId = conversation.group_id
        threadType = ThreadType.Group
        console.log('🔵 [Endpoint /send] Group chat - group_id:', zaloThreadId)
      }
      else if (conversation.type === 'direct' && conversation.participant_id) {
        zaloThreadId = conversation.participant_id
        threadType = ThreadType.User
        console.log('🔵 [Endpoint /send] Direct chat - participant_id:', zaloThreadId)
      }
      else {
        console.error('❌ [Endpoint /send] Cannot determine Zalo thread ID from conversation type/ids')
        res.status(400).json({
          error: 'Cannot determine Zalo thread ID from conversation data',
          conversationId,
          conversation,
        })
      }

      if (!zaloThreadId) {
        console.error('❌ [Endpoint /send] No Zalo thread ID could be determined')
        res.status(400).json({
          error: 'Invalid thread ID derived from conversation',
          conversationId,
          conversation,
        })
      }
    }
    catch (dbError: any) {
      console.error('❌ [Endpoint /send] Database error:', dbError)
      res.status(500).json({
        error: 'Failed to query conversation',
        details: dbError.message,
      })
    }

    console.log('✅ [Endpoint /send] Determined Zalo thread ID:', zaloThreadId, 'Type:', threadType!)

    // 5. Send via Zalo API
    console.log('🔵 [Endpoint /send] Calling ZaloMessage.sendMessage...')

    let zaloResult: any
    try {
      zaloResult = await ZaloMessage.sendMessage(
        { msg: messageContent },
        zaloThreadId as string,
        threadType!,
      )

      console.log('✅ [Endpoint /send] Zalo API success:', zaloResult)
    }
    catch (zaloError: any) {
      console.error('❌ [Endpoint /send] Zalo API error:', zaloError)

      if (zaloError.code === 114 || zaloError.message?.includes('không hợp lệ')) {
        res.status(400).json({
          error: 'Invalid Zalo recipient or permissions',
          details: zaloError.message || 'The recipient might not exist or has blocked you.',
          zaloThreadId,
          code: zaloError.code || 114,
        })
        return
      }

      res.status(500).json({
        error: 'Failed to send message via Zalo',
        details: zaloError.message,
        code: zaloError.code,
      })
      return
    }

    // 6. Extract message IDs
    const messageId = zaloResult?.message?.msgId
      || zaloResult?.data?.msgId
      || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const clientMsgId = clientId || messageId

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
          if (clientId) {
            this.orWhere('client_id', clientMsgId)
          }
        })
        .first()

      if (existingMessage) {
        console.log('⏭️ [Endpoint /send] Message already exists:', messageId)
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
      }

      console.log('🔵 [Endpoint /send] Inserting new message...')

      // Insert message
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

      res.json({
        success: true,
        message: 'Message sent successfully',
        data: {
          id: messageId,
          conversationId,
          content: messageContent,
          sent_at: timestamp.toISOString(),
          sender_id: zaloUserId,
          client_id: clientMsgId,
        },
      })
    }
    catch (dbError: any) {
      console.error('❌ [Endpoint /send] DB save error:', dbError)
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
    console.error('❌ [Endpoint /send] Unexpected error:', error)
    res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    })
  }
})
