import type { Accountability } from '@directus/types'
import { ThreadType } from 'zca-js'
import * as ZaloMessage from '../../services/ZaloMessageService'
import { defineEventHandler } from '../../utils'

/**
 * POST /zalo/messages/forward
 * Forward a message to one or more conversations
 *
 * Based on zca-js implementation:
 * - forwardMessage(payload: ForwardMessagePayload, threadIds: string[], type?: ThreadType)
 * - payload = { message: string, ttl?: number, reference?: {...} }
 * - threadIds = array of recipient IDs (userId for direct, groupId for group)
 * - type = ThreadType.User (1) or ThreadType.Group (2)
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
    const { message, conversationIds, referenceMessageId } = req.body as {
      message: string
      conversationIds: string[]
      referenceMessageId?: string
    }

    if (!message || !conversationIds || conversationIds.length === 0) {
      res.status(400).json({
        error: 'Missing required parameters: message and conversationIds',
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

    // Get Zalo API
    const api = await ZaloMessage.getApi()
    if (!api) {
      res.status(503).json({
        error: 'Zalo API not available',
      })
      return
    }

    // Check if API session is valid
    if (!api.zpwServiceMap) {
      res.status(503).json({
        error: 'SESSION_EXPIRED',
        message: 'Your Zalo session has expired. Please logout and login again.',
        needsRelogin: true,
      })
      return
    }

    // Build forward payload
    const payload: any = {
      message,
    }

    // If forwarding with reference to original message
    if (referenceMessageId) {
      const originalMessage = await database('zalo_messages')
        .where('id', referenceMessageId)
        .first()

      if (originalMessage) {
        const rawData = originalMessage.raw_data || {}
        payload.reference = {
          id: referenceMessageId,
          ts: rawData.ts || Date.now(),
          logSrcType: rawData.logSrcType || 0,
          fwLvl: (rawData.fwLvl || 0) + 1, // Increment forward level
        }
      }
    }

    // Group conversations by type (direct vs group) and extract threadIds
    const directThreadIds: string[] = []
    const groupThreadIds: string[] = []

    for (const conversationId of conversationIds) {
      const conversation = await database('zalo_conversations')
        .where('id', conversationId)
        .first()

      if (!conversation) {
        console.error(`[FORWARD] Conversation not found: ${conversationId}`)
        continue
      }

      if (conversation.group_id) {
        // Group conversation
        groupThreadIds.push(String(conversation.group_id))
      }
      else if (conversation.participant_id) {
        // Direct conversation
        directThreadIds.push(String(conversation.participant_id))
      }
    }

    const results: {
      success: Array<{ conversationId: string, threadId: string, msgId?: string }>
      fail: Array<{ conversationId: string, threadId: string, error_code: string, error_message?: string }>
    } = {
      success: [],
      fail: [],
    }

    // Forward to direct conversations
    if (directThreadIds.length > 0) {
      try {
        console.error('[FORWARD] Forwarding to direct chats:', directThreadIds)
        const result = await ZaloMessage.forwardMessage(payload, directThreadIds, ThreadType.User)

        // Log raw response from Zalo API
        console.error('[FORWARD] Direct chat raw response:', JSON.stringify(result, null, 2))

        // Process results
        if (result?.success) {
          result.success.forEach((item: any) => {
            const threadId = item.clientId || item.threadId
            const conversationId = conversationIds.find(id =>
              id.includes(threadId),
            )
            results.success.push({
              conversationId: conversationId || threadId,
              threadId,
              msgId: item.msgId,
            })
          })
        }

        if (result?.fail) {
          result.fail.forEach((item: any) => {
            const threadId = item.clientId || item.threadId
            const conversationId = conversationIds.find(id =>
              id.includes(threadId),
            )
            results.fail.push({
              conversationId: conversationId || threadId,
              threadId,
              error_code: item.error_code || 'UNKNOWN_ERROR',
              error_message: item.error_message,
            })
          })
        }
      }
      catch (error: any) {
        console.error('[FORWARD] Failed to forward to direct chats:', error)
        directThreadIds.forEach((threadId) => {
          const conversationId = conversationIds.find(id => id.includes(threadId))
          results.fail.push({
            conversationId: conversationId || threadId,
            threadId,
            error_code: error.code || 'FORWARD_FAILED',
            error_message: error.message,
          })
        })
      }
    }

    // Forward to group conversations
    if (groupThreadIds.length > 0) {
      try {
        console.error('[FORWARD] Forwarding to groups:', groupThreadIds)
        const result = await ZaloMessage.forwardMessage(payload, groupThreadIds, ThreadType.Group)

        // Log raw response from Zalo API
        console.error('[FORWARD] Group chat raw response:', JSON.stringify(result, null, 2))

        // Process results
        if (result?.success) {
          result.success.forEach((item: any) => {
            const threadId = item.clientId || item.threadId
            const conversationId = conversationIds.find(id =>
              id.includes(threadId),
            )
            results.success.push({
              conversationId: conversationId || threadId,
              threadId,
              msgId: item.msgId,
            })
          })
        }

        if (result?.fail) {
          result.fail.forEach((item: any) => {
            const threadId = item.clientId || item.threadId
            const conversationId = conversationIds.find(id =>
              id.includes(threadId),
            )
            results.fail.push({
              conversationId: conversationId || threadId,
              threadId,
              error_code: item.error_code || 'UNKNOWN_ERROR',
              error_message: item.error_message,
            })
          })
        }
      }
      catch (error: any) {
        console.error('[FORWARD] Failed to forward to groups:', error)
        groupThreadIds.forEach((threadId) => {
          const conversationId = conversationIds.find(id => id.includes(threadId))
          results.fail.push({
            conversationId: conversationId || threadId,
            threadId,
            error_code: error.code || 'FORWARD_FAILED',
            error_message: error.message,
          })
        })
      }
    }

    // Log final results for debugging
    console.error('[FORWARD] Final results:', {
      totalConversations: conversationIds.length,
      directThreadIds: directThreadIds.length,
      groupThreadIds: groupThreadIds.length,
      successCount: results.success.length,
      failCount: results.fail.length,
      successDetails: results.success,
      failDetails: results.fail,
    })

    res.json({
      success: true,
      message: `Forwarded to ${results.success.length} conversation(s)`,
      data: results,
    })
  }
  catch (error: any) {
    console.error('[Endpoint /messages/forward] Error:', error)

    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error.message || 'Failed to forward message',
    })
  }
})
