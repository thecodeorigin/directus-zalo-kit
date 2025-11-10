import type { Accountability } from '@directus/types'
import * as ZaloLogin from '../../services/ZaloLoginService'
import { defineEventHandler } from '../../utils'

/**
 * GET /zalo/conversations
 * Get recent conversations for the logged-in Zalo user
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
    const status = ZaloLogin.loginGetStatus()
    const currentZaloUserId = status.userId

    if (status.status !== 'logged_in' || !currentZaloUserId) {
      res.status(401).json({ error: 'Zalo user not authenticated' })
      return
    }

    // ✅ Parse pagination params với validation
    const page = Math.max(1, Number.parseInt(req.query?.page as string) || 1)
    const limit = Math.max(1, Math.min(100, Number.parseInt(req.query?.limit as string) || 50))
    const offset = (page - 1) * limit

    console.warn('[Endpoint /conversations] Starting for user:', currentZaloUserId)
    console.warn('[Endpoint /conversations] Page:', page, 'Limit:', limit, 'Offset:', offset)

    // ✅ Count total conversations
    const totalResult = await database('zalo_conversations')
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
      .count('* as count')
      .first()

    const total = Number(totalResult?.count) || 0
    const hasMore = (offset + limit) < total

    console.warn('[Endpoint /conversations] Total:', total, 'HasMore:', hasMore)

    // ✅ Fetch conversations với pagination
    const conversationsData = await database('zalo_conversations')
      .select([
        'zalo_conversations.id',
        'zalo_conversations.group_id',
        'zalo_conversations.participant_id',
        'zalo_conversations.last_message_id',
        'zalo_conversations.last_message_time as timestamp',
        'zalo_conversations.last_read_message_time',
        'zalo_conversations.unread_count',
        'zalo_conversations.is_pinned',
        'zalo_conversations.is_archived',
        'zalo_conversations.is_muted',
        'zalo_conversations.is_hidden',
        'zalo_conversations.settings',
        'zalo_groups.name as group_name',
        'zalo_groups.avatar_url as group_avatar',
        'zalo_users.display_name as user_display_name',
        'zalo_users.avatar_url as user_avatar',
        'zalo_users.zalo_name as user_zalo_name',
        'zalo_messages.content as last_message_content',
      ])
      .leftJoin('zalo_groups', 'zalo_conversations.group_id', 'zalo_groups.id')
      .leftJoin('zalo_users', 'zalo_conversations.participant_id', 'zalo_users.id')
      .leftJoin('zalo_messages', 'zalo_conversations.last_message_id', 'zalo_messages.id')
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
      .limit(limit)
      .offset(offset)

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

    const groupIds = [...new Set(conversationsData
      .filter(conv => conv.group_id)
      .map(conv => conv.group_id)
      .filter(Boolean))]

    console.warn('[Endpoint /conversations] Group IDs to fetch members:', groupIds.length)

    const groupMembersMap = new Map()
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

        console.warn('[Endpoint /conversations] Fetched members:', allMembers.length)

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
            lastMessage: conv.last_message_content || '',
            lastMessageId: conv.last_message_id,
            timestamp: conv.timestamp || new Date().toISOString(),
            lastReadMessageTime: conv.last_read_message_time,
            unreadCount: conv.unread_count || 0,
            isPinned: conv.is_pinned || false,
            isArchived: conv.is_archived || false,
            isMuted: conv.is_muted || false,
            isHidden: conv.is_hidden || false,
            settings: conv.settings,
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
            lastMessage: conv.last_message_content || '',
            lastMessageId: conv.last_message_id,
            timestamp: conv.timestamp || new Date().toISOString(),
            lastReadMessageTime: conv.last_read_message_time,
            unreadCount: conv.unread_count || 0,
            isPinned: conv.is_pinned || false,
            isArchived: conv.is_archived || false,
            isMuted: conv.is_muted || false,
            isHidden: conv.is_hidden || false,
            settings: conv.settings,
            hasRealAvatar: !!conv.user_avatar,
          }
        }

        return null
      }
      catch (convError: any) {
        console.error('[Endpoint /conversations] Error processing conversation:', conv.id, convError.message)
        return null
      }
    }).filter(Boolean)

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
    console.error('❌ [Endpoint /conversations] Error:', error)
    console.error('❌ Stack:', error.stack)
    res.status(500).json({
      error: 'Failed to fetch conversations',
      details: error.message,
      stack: error.stack,
    })
  }
})
