import type { Accountability } from '@directus/types'
import * as ZaloMessage from '../../../../services/ZaloMessageService'
import { defineEventHandler } from '../../../../utils'

/**
 * POST /sync/groups/:groupId/members
 * Sync members for a specific group
 */
export default defineEventHandler(async (context, { req, res }) => {
  const _req = req as typeof req & { accountability: Accountability | null }

  // Authentication check
  if (!_req.accountability?.user) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'User not authenticated',
    })
    return
  }

  try {
    const { groupId } = req.params

    if (!groupId) {
      res.status(400).json({
        error: 'groupId is required',
      })
      return
    }

    console.log(`[Endpoint /sync/groups/members] Syncing members for group ${groupId}`)

    await ZaloMessage.syncGroupMembers(groupId)

    res.json({
      success: true,
      message: `Members synced successfully for group ${groupId}`,
    })
  }
  catch (error: any) {
    console.error('[Endpoint /sync/groups/members] Error:', error)
    res.status(500).json({
      error: 'Failed to sync group members',
      details: error.message,
    })
  }
})
