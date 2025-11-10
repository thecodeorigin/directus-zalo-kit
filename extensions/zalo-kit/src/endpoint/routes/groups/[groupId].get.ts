/**
 * GET /groups/:groupId
 * Get a specific group by ID with optional member information
 */
export default function groupDetailHandler(context: any) {
  const { database } = context

  return async (req: any, res: any) => {
    try {
      const { groupId } = req.params
      const { withMembers } = req.query

      const group = await (database as any)('zalo_groups')
        .where('id', groupId)
        .first()

      if (!group) {
        return res.status(404).json({ error: 'Group not found' })
      }

      if (withMembers === 'true') {
        const members = await (database as any)('zalo_group_members')
          .where('group_id', groupId)
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

      res.json({ data: group })
    }
    catch (error: any) {
      console.error('[Endpoint /groups/:groupId] Error:', error)
      res.status(500).json({ error: 'Failed to fetch group', details: error.message })
    }
  }
}
