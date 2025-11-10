/**
 * GET /groups
 * Get groups with optional filtering and member information
 */
export default function groupsHandler(context: any) {
  const { database } = context

  return async (req: any, res: any) => {
    try {
      const { groupId, ids, limit, withMembers } = req.query

      let query = (database as any)('zalo_groups')

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
          const members = await (database as any)('zalo_group_members')
            .where('group_id', group.id)
            .where('is_active', true)
            .select(['owner_id', 'joined_at', 'is_active'])

          if (members.length > 0) {
            const memberIds = members.map((m: any) => m.owner_id)
            const users = await (database as any)('zalo_users')
              .whereIn('id', memberIds)
              .select(['id', 'display_name', 'zalo_name', 'avatar_url'])

            const userMap = new Map(users.map((u: any) => [u.id, u]))

            group.members = members.map((m: any) => {
              const userData = userMap.get(m.owner_id) || {}
              return {
                userId: m.owner_id,
                joinedAt: m.joined_at,
                isActive: m.is_active,
                ...userData,
              }
            })
          }
          else {
            group.members = []
          }
        }
      }

      res.json({ data: groups })
    }
    catch (error: any) {
      console.error('[Endpoint /groups] Error:', error)
      res.status(500).json({ error: 'Failed to fetch groups', details: error.message })
    }
  }
}
