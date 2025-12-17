import type { Accountability } from '@directus/types'
import * as ZaloLogin from '../../services/ZaloLoginService'
import { defineEventHandler } from '../../utils'

/**
 * GET /zalo/index
 * Get recent conversations for the logged-in Zalo user using Directus SDK
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

  const { services, getSchema } = context

  try {
    const status = ZaloLogin.loginGetStatus()
    const currentZaloUserId = status.userId

    if (status.status !== 'logged_in' || !currentZaloUserId) {
      res.status(401).json({ error: 'Zalo user not authenticated' })
      return
    }

    const page = Math.max(1, Number.parseInt(req.query?.page as string) || 1)
    const limit = Math.max(1, Math.min(100, Number.parseInt(req.query?.limit as string) || 50))
    const offset = (page - 1) * limit

    console.warn('[Endpoint /conversations] Starting for user:', currentZaloUserId)
    console.warn('[Endpoint /conversations] Page:', page, 'Limit:', limit, 'Offset:', offset)

    const schema = await getSchema()
    const { ItemsService } = services
    const conversationsService = new ItemsService('zalo_conversations', {
      schema,
      accountability: _req.accountability,
    })

    const conversationFilter = {
      _and: [
        { is_hidden: { _eq: false } },
        { last_message_id: { _nnull: true } }, // ✅ Only show conversations with at least one message
        {
          _or: [
            {
              _and: [
                { group_id: { _nnull: true } },
                { participant_id: { _eq: currentZaloUserId } },
              ],
            },
            {
              _and: [
                { group_id: { _null: true } },
                { id: { _contains: currentZaloUserId } },
              ],
            },
          ],
        },
      ],
    } as any

    //  Count total với aggregate
    const totalResult = await conversationsService.readByQuery({
      filter: conversationFilter,
      aggregate: { count: ['id'] },
      limit: 1,
    })

    const total = totalResult[0]?.count?.id || 0
    const hasMore = offset + limit < total

    console.warn('[Endpoint /conversations] Total:', total, 'HasMore:', hasMore)

    //  Fetch conversations với full query parameters
    const conversationsData = await conversationsService.readByQuery({
      // Fields - remove last_message_id.content since it doesn't work
      fields: [
        'id',
        'group_id',
        'participant_id',
        'last_message_id',
        'last_message_time',
        'last_read_message_time',
        'unread_count',
        'is_pinned',
        'is_archived',
        'is_muted',
        'is_hidden',
        'settings',
        //  Nested relational fields với dot notation
        'group_id.name',
        'group_id.avatar_url',
        'participant_id.display_name',
        'participant_id.zalo_name',
        'participant_id.avatar_url',
      ],
      // Filter
      filter: conversationFilter,
      //  Sort: pinned first, then by last message time descending
      sort: ['-is_pinned', '-last_message_time'],
      // Pagination
      limit,
      offset,
    })

    console.warn('[Endpoint /conversations] Fetched:', conversationsData.length, 'conversations')

    if (conversationsData.length === 0) {
      res.json({
        data: [],
        meta: {
          page,
          limit,
          total,
          hasMore: false,
          totalPages: Math.ceil(total / limit),
        },
      })
      return
    }

    // ✅ Manually fetch message content for last_message_id
    const messageMap = new Map<string, string>()
    const messageIds = conversationsData
      .map(conv => conv.last_message_id)
      .filter((id): id is string => Boolean(id))

    const conversationsToUpdate: Array<{ id: string, newMessageId: string, newMessageTime: string, newContent: string }> = []

    if (messageIds.length > 0) {
      try {
        const messagesService = new ItemsService('zalo_messages', {
          schema,
          accountability: _req.accountability,
        })

        const messages = await messagesService.readByQuery({
          filter: { id: { _in: messageIds } },
          fields: ['id', 'content'],
          limit: -1,
        }) as Array<{ id: string, content: string }>

        // Helper to check if content is a system event JSON
        const isSystemEvent = (content: string | null): boolean => {
          if (!content)
            return false
          const trimmed = content.trim()

          // Check if it's JSON (starts with { or [)
          if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
            return false
          }

          // More comprehensive checks for system events
          // Pattern 1: Contains both "type" and "actionType" (with or without quotes variations)
          const hasTypeAndAction = (
            (trimmed.includes('"type":') || trimmed.includes('\'type\':')) &&
            (trimmed.includes('"actionType":') || trimmed.includes('\'actionType\':'))
          )
          
          // Pattern 2: JSON array starting with [{"type": (common format)
          const isJsonArrayWithType = trimmed.startsWith('[{') && trimmed.includes('type')
          
          // Pattern 3: Contains "uidFrom" (common in system events)
          const hasUidFrom = trimmed.includes('"uidFrom":') || trimmed.includes('\'uidFrom\':')
          
          // Pattern 4: Starts with [{ and contains numeric type field
          const isSystemEventArray = trimmed.startsWith('[{') && /["']type["']:\s*\d+/.test(trimmed)

          return hasTypeAndAction || (isJsonArrayWithType && hasUidFrom) || isSystemEventArray
        }

        const foundMessageIds = new Set<string>()
        const systemEventIds = new Set<string>()

        // ✅ Filter messages and detect system events
        for (const msg of messages) {
          foundMessageIds.add(msg.id)

          if (isSystemEvent(msg.content)) {
            systemEventIds.add(msg.id)
            console.warn('[Endpoint /conversations] Detected system event message:', msg.id, 'content preview:', msg.content?.substring(0, 100))
            // Don't add system events to messageMap
          }
          else {
            // Log first 5 messages to debug
            if (messageMap.size < 5 && msg.content) {
              const preview = msg.content.substring(0, 150)
              console.warn('[Endpoint /conversations] Adding message to map:', msg.id, 'preview:', preview)
            }
            messageMap.set(msg.id, msg.content)
          }
        }

        console.warn('[Endpoint /conversations] Fetched message content for', messageMap.size, 'messages (filtered', systemEventIds.size, 'system events)')

        // ✅ Find conversations with deleted messages or system events and update them
        for (const conv of conversationsData) {
          const needsUpdate = conv.last_message_id && (
            !foundMessageIds.has(conv.last_message_id) // Message deleted
            || systemEventIds.has(conv.last_message_id) // Message is system event
          )

          if (needsUpdate) {
            console.warn('[Endpoint /conversations] ⚠️ Conversation', conv.id, 'has invalid message:', conv.last_message_id, 'reason:', !foundMessageIds.has(conv.last_message_id) ? 'deleted' : 'system event')

            // Find the latest valid message for this conversation
            // Skip system events: JSON with "type" and "actionType" fields
            const latestMessage = await context.database('zalo_messages')
              .where('conversation_id', conv.id)
              .where('is_undone', false)
              .whereRaw(`(content IS NULL OR (content NOT LIKE '%"type":%' OR content NOT LIKE '%"actionType":%'))`) // Skip JSON system events
              .orderBy('sent_at', 'desc')
              .first()

            if (latestMessage) {
              conversationsToUpdate.push({
                id: conv.id,
                newMessageId: latestMessage.id,
                newMessageTime: latestMessage.sent_at,
                newContent: latestMessage.content || '',
              })

              // Add to messageMap for immediate display
              messageMap.set(latestMessage.id, latestMessage.content || '')

              // Update conv object for current response
              conv.last_message_id = latestMessage.id
              conv.last_message_time = latestMessage.sent_at

              console.warn('[Endpoint /conversations] ✅ Will update conversation', conv.id, 'to message:', latestMessage.id)
            }
            else {
              // No valid messages - clear last_message
              conversationsToUpdate.push({
                id: conv.id,
                newMessageId: '',
                newMessageTime: '',
                newContent: '',
              })

              conv.last_message_id = null
              conv.last_message_time = null

              console.warn('[Endpoint /conversations] ✅ Will clear conversation', conv.id, 'last message')
            }
          }
        }

        // ✅ Batch update conversations in database
        if (conversationsToUpdate.length > 0) {
          console.warn('[Endpoint /conversations] Updating', conversationsToUpdate.length, 'conversations with deleted messages')

          for (const update of conversationsToUpdate) {
            await context.database('zalo_conversations')
              .where('id', update.id)
              .update({
                last_message_id: update.newMessageId || null,
                last_message_time: update.newMessageTime || null,
                updated_at: new Date().toISOString(),
              })
          }

          console.warn('[Endpoint /conversations] ✅ Updated conversations in database')
        }
      }
      catch (msgError: any) {
        console.error('[Endpoint /conversations] Error fetching message content:', msgError.message)
      }
    }

    //  Extract unique group IDs
    const groupIds = [
      ...new Set(
        conversationsData
          .filter(conv => conv.group_id)
          .map(conv => (typeof conv.group_id === 'object' ? conv.group_id.id : conv.group_id))
          .filter(Boolean),
      ),
    ]

    console.warn('[Endpoint /conversations] Group IDs to fetch members:', groupIds.length)

    //  Fetch group members với Directus SDK
    const groupMembersMap = new Map()
    if (groupIds.length > 0) {
      try {
        const groupMembersService = new ItemsService('zalo_group_members', {
          schema,
          accountability: _req.accountability,
        })

        const allMembers = await groupMembersService.readByQuery({
          fields: [
            'group_id',
            'owner_id',
            'owner_id.display_name',
            'owner_id.zalo_name',
            'owner_id.avatar_url',
          ],
          filter: {
            _and: [
              { group_id: { _in: groupIds } },
              { is_active: { _eq: true } },
            ],
          },
          limit: -1, // ✅ Get all members
        })

        console.warn('[Endpoint /conversations] Fetched members:', allMembers.length)

        for (const member of allMembers) {
          const groupId = typeof member.group_id === 'object' ? member.group_id.id : member.group_id
          const userId = typeof member.owner_id === 'object' ? member.owner_id.id : member.owner_id
          const userObj = typeof member.owner_id === 'object' ? member.owner_id : {}

          if (!groupId || !userId)
            continue

          if (!groupMembersMap.has(groupId)) {
            groupMembersMap.set(groupId, [])
          }

          const memberName
            = userObj.display_name || userObj.zalo_name || `User ${String(userId).substring(0, 8)}`
          let memberAvatar = userObj.avatar_url

          // Proxy avatar if needed
          if (memberAvatar) {
            if (
              memberAvatar.startsWith('https://s120-ava-talk.zadn.vn/')
              || memberAvatar.startsWith('https://ava-grp-talk.zadn.vn/')
            ) {
              memberAvatar = `http://localhost:8055/zalo/avatar-proxy?url=${encodeURIComponent(memberAvatar)}`
            }
          }
          else {
            memberAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(memberName)}&background=random`
          }

          groupMembersMap.get(groupId).push({
            id: String(userId),
            name: memberName,
            avatar: memberAvatar,
          })
        }
      }
      catch (memberError: any) {
        console.error('[Endpoint /conversations] Error fetching members:', memberError.message)
      }
    }

    const conversations = conversationsData
      .map((conv) => {
        try {
          const groupObj = typeof conv.group_id === 'object' ? conv.group_id : null
          const userObj = typeof conv.participant_id === 'object' ? conv.participant_id : null

          // Group conversation
          if (groupObj || conv.group_id) {
            const groupId = groupObj?.id || conv.group_id
            const groupIdStr = String(groupId)
            const groupName = groupObj?.name || `Group ${groupIdStr.substring(0, 8)}`
            let groupAvatar = groupObj?.avatar_url

            if (groupAvatar && groupAvatar.startsWith('https://ava-grp-talk.zadn.vn/')) {
              groupAvatar = `http://localhost:8055/zalo/avatar-proxy?url=${encodeURIComponent(groupAvatar)}`
            }
            else if (!groupAvatar) {
              groupAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(groupName)}&background=0088ff`
            }

            const members = groupMembersMap.get(groupId) || []

            let lastMessage = (conv.last_message_id ? messageMap.get(conv.last_message_id) : null) || ''
            
            // Debug: Log if lastMessage contains JSON
            if (lastMessage && lastMessage.trim().startsWith('[{')) {
              console.warn('[Endpoint /conversations] ⚠️ Conversation', conv.id, 'has JSON lastMessage:', lastMessage.substring(0, 100), 'messageId:', conv.last_message_id)
            }

            return {
              id: conv.id,
              type: 'group',
              name: groupName,
              avatar: groupAvatar,
              lastMessage,
              lastMessageId: conv.last_message_id,
              timestamp: conv.last_message_time || new Date().toISOString(),
              lastReadMessageTime: conv.last_read_message_time,
              unreadCount: conv.unread_count || 0,
              isPinned: conv.is_pinned || false,
              isArchived: conv.is_archived || false,
              isMuted: conv.is_muted || false,
              isHidden: conv.is_hidden || false,
              settings: conv.settings,
              members,
              hasRealAvatar: !!groupObj?.avatar_url,
            }
          }
          // Direct conversation
          else if (userObj || conv.participant_id) {
            const userName = userObj?.display_name || userObj?.zalo_name || 'Unknown User'
            let userAvatar = userObj?.avatar_url

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
              lastMessage: (conv.last_message_id ? messageMap.get(conv.last_message_id) : null) || '',
              lastMessageId: conv.last_message_id,
              timestamp: conv.last_message_time || new Date().toISOString(),
              lastReadMessageTime: conv.last_read_message_time,
              unreadCount: conv.unread_count || 0,
              isPinned: conv.is_pinned || false,
              isArchived: conv.is_archived || false,
              isMuted: conv.is_muted || false,
              isHidden: conv.is_hidden || false,
              settings: conv.settings,
              hasRealAvatar: !!userObj?.avatar_url,
            }
          }

          return null
        }
        catch (convError: any) {
          console.error('[Endpoint /conversations] Error processing conversation:', conv.id, convError.message)
          return null
        }
      })
      .filter(Boolean)

    console.warn('[Endpoint /conversations] Returning', conversations.length, 'conversations')

    res.json({
      data: conversations,
      meta: {
        page,
        limit,
        total,
        hasMore,
        totalPages: Math.ceil(total / limit),
      },
    })
  }
  catch (error: any) {
    res.status(500).json({
      error: 'Failed to fetch conversations',
      details: error.message,
      stack: error.stack,
    })
  }
})
