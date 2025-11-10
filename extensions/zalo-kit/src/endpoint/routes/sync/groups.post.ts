import type { Accountability } from '@directus/types'
import * as ZaloMessage from '../../services/ZaloMessageService'
import { defineEventHandler } from '../../utils'

/**
 * POST /zalo/sync/groups
 * Sync all groups from Zalo
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

  try {
    const status = ZaloMessage.getLoginStatus()

    if (status.status !== 'logged_in') {
      res.status(503).json({
        error: 'Zalo not connected',
        status: status.status,
      })
      return
    }

    console.warn('[Endpoint /sync/groups] Starting group sync...')

    await ZaloMessage.syncGroups()

    console.warn('[Endpoint /sync/groups] Group sync completed')

    res.json({
      success: true,
      message: 'Groups synced successfully',
    })
  }
  catch (error: any) {
    console.error('[Endpoint /sync/groups] Error:', error)
    res.status(500).json({
      error: 'Failed to sync groups',
      details: error.message,
    })
  }
})
