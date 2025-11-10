/**
 * GET /groups/:groupId/members
 * Get members of a specific group
 */
export default function groupMembersHandler(context: any) {
  const { database } = context

  return async (req: any, res: any) => {
    try {
      const { groupId } = req.params
      const { activeOnly } = req.query

      let query = (database as any)('zalo_group_members')
        .where('group_id', groupId)

      if (activeOnly !== 'false') {
        query = query.where('is_active', true)
      }

      const members = await query
        .select(['owner_id', 'is_active', 'joined_at', 'left_at'])

      if (members.length > 0) {
        const memberIds = members.map((m: any) => m.owner_id)
        const users = await (database as any)('zalo_users')
          .whereIn('id', memberIds)
          .select(['id', 'display_name', 'zalo_name', 'avatar_url'])

        const userMap = new Map(users.map((u: any) => [u.id, u]))

        const enrichedMembers = members.map((m: any) => {
          const userData = userMap.get(m.owner_id) || {}
          return {
            userId: m.owner_id,
            isActive: m.is_active,
            joinedAt: m.joined_at,
            leftAt: m.left_at,
            ...userData,
          }
        })

        res.json({ data: enrichedMembers })
      }
      else {
        res.json({ data: [] })
      }
    }
    catch (error: any) {
      console.error('[Endpoint /groups/:groupId/members] Error:', error)
      res.status(500).json({ error: 'Failed to fetch group members', details: error.message })
    }
  }
}
