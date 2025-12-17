import type { Accountability } from '@directus/types'
import { ThreadType } from 'zca-js'
import * as ZaloMessage from '../../services/ZaloMessageService'
import { defineEventHandler } from '../../utils'

/**
 * DELETE /zalo/messages/:messageId
 * Delete a message (remove only for current user)
 *
 * Based on zca-js implementation:
 * - deleteMessage(dest: DeleteMessageDestination, onlyMe: boolean)
 * - dest = { data: { cliMsgId, msgId, uidFrom }, threadId, type }
 * - onlyMe = true (delete for current user only) or false (delete for everyone)
 *
 * Note: To delete for everyone, the message must be sent by current user.
 * For other users' messages, can only delete for yourself (onlyMe=true).
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

    // Get Zalo API
    const api = await ZaloMessage.getApi()
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

    // Get threadId and threadType from query params (sent from frontend)
    const { threadId: rawThreadId, threadType: rawThreadType } = req.query

    if (!rawThreadId || !rawThreadType) {
      res.status(400).json({
        error: 'Missing required parameters: threadId and threadType',
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
        console.error('[DELETE] Parsed groupId:', finalThreadId, 'from conversationId:', rawThreadId)
      }
      else {
        console.error('[DELETE] Warning: conversationId does not match group pattern:', finalThreadId)
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

    // Get cliMsgId from raw_data
    // IMPORTANT: Zalo message structure has cliMsgId inside rawData.data.cliMsgId
    const rawData = message.raw_data || {}
    const rawDataData = rawData.data || {}
    const cliMsgId = rawDataData.cliMsgId || messageId

    // Check if this is user's own message
    const isOwnMessage = String(message.sender_id) === String(zaloUserId)

    console.error('[DELETE] Deleting message:', {
      messageId,
      cliMsgId,
      threadId: finalThreadId,
      threadType: threadType === ThreadType.User ? 'User/Direct' : 'Group',
      isOwnMessage,
      deleteForEveryone: false,
    })

    try {
      // Use deleteMessage API for both User/Direct and Group chats
      const dest = {
        threadId: String(finalThreadId),
        type: threadType,
        data: {
          cliMsgId: String(cliMsgId),
          msgId: String(messageId),
          uidFrom: String(message.sender_id),
        },
      }

      const _result = await api.deleteMessage(dest, true)

      // Remove message from database (delete for current user)
      await database('zalo_messages')
        .where('id', messageId)
        .delete()

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
        console.error('[DELETE] Updated conversation lastMessage to:', latestMessage.id, 'content:', latestMessage.content?.substring(0, 50))
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
        console.error('[DELETE] No messages left, cleared lastMessage')
      }

      res.json({
        success: true,
        message: 'Message deleted for you',
        data: {
          messageId,
          isOwnMessage,
          deletedForEveryone: false,
          conversationId: message.conversation_id,
          newLastMessage: latestMessage
            ? {
                id: latestMessage.id,
                content: latestMessage.content,
                time: latestMessage.sent_at,
              }
            : null,
        },
      })
    }
    catch (error: any) {
      console.error('[DELETE] Error:', error)

      // Handle Zalo API errors
      if (error.data) {
        const errorCode = error.data.error_code || error.data.error
        const errorMsg = error.data.error_message || error.data.message || 'Failed to delete message'

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
    console.error('[DELETE] Unhandled error:', error)
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error.message || 'Failed to delete message',
    })
  }
})
