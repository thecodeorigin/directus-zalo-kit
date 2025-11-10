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
      // Fields với nested relations
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
        'last_message_id.content',
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
          const messageObj = typeof conv.last_message_id === 'object' ? conv.last_message_id : null

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

            return {
              id: conv.id,
              type: 'group',
              name: groupName,
              avatar: groupAvatar,
              lastMessage: messageObj?.content || '',
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
              lastMessage: messageObj?.content || '',
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
