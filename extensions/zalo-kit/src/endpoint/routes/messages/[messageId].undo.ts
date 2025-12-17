import type { Accountability } from '@directus/types'
import { ThreadType } from 'zca-js'
import * as ZaloMessage from '../../services/ZaloMessageService'
import { defineEventHandler } from '../../utils'

/**
 * POST /zalo/messages/:messageId/undo
 * Recall/undo a message (remove for all participants)
 *
 * Based on zca-js implementation:
 * - undo(payload: UndoPayload, threadId: string, type: ThreadType)
 * - payload = { msgId: string|number, cliMsgId: string|number }
 * - threadId = userId (for direct) or groupId (for group)
 * - type = 1 (ThreadType.User) or 2 (ThreadType.Group)
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
    const { messageId } = req.params

    if (!messageId) {
      res.status(400).json({
        error: 'Missing required parameter: messageId',
      })
      return
    }

    // Check login status
    const status = ZaloMessage.getLoginStatus()
    if (status.status !== 'logged_in') {
      res.status(503).json({
        error: 'Zalo is not connected',
        status: status.status,
      })
      return
    }

    const zaloUserId = status.userId
    if (!zaloUserId) {
      res.status(401).json({ error: 'Zalo user ID not found' })
      return
    }

    // Get message from database
    const message = await database('zalo_messages')
      .where('id', messageId)
      .first()

    if (!message) {
      res.status(404).json({
        error: 'Message not found',
      })
      return
    }

    // Check if user owns this message
    if (message.sender_id !== zaloUserId) {
      res.status(403).json({
        error: 'You can only recall your own messages',
      })
      return
    }

    // Check if message was already undone
    if (message.is_undone) {
      res.status(400).json({
        error: 'Message has already been recalled',
      })
      return
    }

    // Get Zalo API
    const api = ZaloMessage.getApi()
    if (!api) {
      res.status(503).json({
        error: 'Zalo API not available',
      })
      return
    }

    // Check if API session is valid (has zpwServiceMap)
    if (!api.zpwServiceMap) {
      res.status(503).json({
        error: 'SESSION_EXPIRED',
        message: 'Your Zalo session has expired. Please logout and login again.',
        needsRelogin: true,
      })
      return
    }

    // Get threadId and threadType from request body (sent from frontend)
    const { threadId: rawThreadId, threadType: rawThreadType } = req.body

    if (!rawThreadId || !rawThreadType) {
      res.status(400).json({
        error: 'Missing required parameters: threadId and threadType in request body',
      })
      return
    }

    const threadType = Number(rawThreadType) === 2 ? ThreadType.Group : ThreadType.User

    // Parse conversationId to get actual threadId
    // conversationId formats:
    // - Group: "group{groupId}user{userId}" → threadId = groupId
    // - Direct: "direct_{userId1}_{userId2}" OR just "{otherUserId}" → threadId = otherUserId
    let finalThreadId = String(rawThreadId)

    if (threadType === ThreadType.Group) {
      // Extract groupId from "group{groupId}user{userId}" or "group_{groupId}_user_{userId}"
      const groupMatch = finalThreadId.match(/^group_?(\d+)_?user/)
      if (groupMatch) {
        finalThreadId = groupMatch[1]
        console.error('[UNDO] Parsed groupId:', finalThreadId, 'from conversationId:', rawThreadId)
      }
      else {
        console.error('[UNDO] Warning: conversationId does not match group pattern:', finalThreadId)
      }
    }
    else {
      // For User/Direct chat, get the OTHER person's ID from database
      const conversation = await database('zalo_conversations')
        .where('id', message.conversation_id)
        .first()

      if (!conversation) {
        res.status(400).json({
          error: 'Conversation not found',
          debug: { conversationId: message.conversation_id },
        })
        return
      }

      // participant_id is the OTHER person's ID
      if (conversation.participant_id) {
        finalThreadId = String(conversation.participant_id)
      }
      else {
        res.status(400).json({
          error: 'Cannot determine recipient ID for direct chat',
          debug: { conversationId: message.conversation_id, conversation },
        })
        return
      }

      // Validate: threadId should NOT be current user
      if (String(finalThreadId) === String(zaloUserId)) {
        res.status(400).json({
          error: 'INVALID_THREAD_ID',
          message: 'For 1-1 chat, threadId must be the OTHER person\'s ID, not your own',
          debug: { finalThreadId, zaloUserId },
        })
        return
      }
    }

    // Get cliMsgId from raw_data or client_id
    // Priority: client_id (generated by us) > raw_data.cliMsgId (from Zalo) > messageId
    const rawData = message.raw_data || {}
    const cliMsgId = message.client_id || rawData.cliMsgId || messageId

    console.error('[UNDO] Recalling message:', {
      messageId,
      cliMsgId,
      threadId: finalThreadId,
      threadType: threadType === ThreadType.User ? 'User/Direct' : 'Group',
    })

    try {
      // Call api.undo based on zca-js source code:
      //
      // From src/apis/undo.ts:
      // export const undoFactory = apiFactory<UndoResponse>()((api, ctx, utils) => {
      //   const URLType = {
      //     [ThreadType.User]: utils.makeURL(`${api.zpwServiceMap.chat[0]}/api/message/undo`),
      //     [ThreadType.Group]: utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/undomsg`),
      //   };
      //   return async function undo(payload: UndoPayload, threadId: string, type: ThreadType = ThreadType.User) {
      //     const params: Record<string, unknown> = {
      //       msgId: payload.msgId,
      //       clientId: Date.now(),
      //       cliMsgIdUndo: payload.cliMsgId,
      //     };
      //     if (type == ThreadType.Group) {
      //       params["grid"] = threadId;
      //       params["visibility"] = 0;
      //       params["imei"] = ctx.imei;
      //     } else params["toid"] = threadId;
      //     ...
      //   }
      // })

      const payload = {
        msgId: messageId,
        cliMsgId,
      }

      const result = await api.undo(payload, finalThreadId, threadType)

      console.error('[UNDO] Success:', result)

      // Update message in database - mark as undone
      await database('zalo_messages')
        .where('id', messageId)
        .update({
          is_undone: true,
          updated_at: database.fn.now(),
        })

      // ✅ UPDATE CONVERSATION'S LAST MESSAGE ID AND TIME
      // Get the most recent NON-SYSTEM-EVENT message
      // Skip system events: JSON with "type" and "actionType" fields
      const latestMessage = await database('zalo_messages')
        .where('conversation_id', message.conversation_id)
        .where('is_undone', false)
        .whereRaw(`(content IS NULL OR (content NOT LIKE '%"type":%' OR content NOT LIKE '%"actionType":%'))`) // Skip JSON system events
        .orderBy('sent_at', 'desc')
        .first()

      if (latestMessage) {
        // Update conversation with new last message ID and time
        await database('zalo_conversations')
          .where('id', message.conversation_id)
          .update({
            last_message_id: latestMessage.id,
            last_message_time: latestMessage.sent_at,
            updated_at: new Date().toISOString(),
          })
        console.error('[UNDO] Updated conversation lastMessage to:', latestMessage.id)
      }
      else {
        // No messages left - clear last message
        await database('zalo_conversations')
          .where('id', message.conversation_id)
          .update({
            last_message_id: null,
            last_message_time: null,
            updated_at: new Date().toISOString(),
          })
        console.error('[UNDO] No messages left, cleared lastMessage')
      }

      res.json({
        success: true,
        message: 'Message recalled successfully',
        data: {
          messageId,
          isUndone: true,
        },
      })
    }
    catch (error: any) {
      console.error('[UNDO] Error:', error)

      // Handle Zalo API errors
      if (error.data) {
        const errorCode = error.data.error_code || error.data.error
        const errorMsg = error.data.error_message || error.data.message || 'Failed to recall message'

        res.status(400).json({
          error: errorCode,
          message: errorMsg,
          zaloError: error.data,
        })
        return
      }

      throw error
    }
  }
  catch (error: any) {
    console.error('[UNDO] Unhandled error:', error)
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error.message || 'Failed to recall message',
    })
  }
})
