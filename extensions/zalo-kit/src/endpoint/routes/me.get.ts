import type { Accountability } from '@directus/types'
import * as ZaloMessage from '../services/ZaloMessageService'
import { defineEventHandler } from '../utils'

/**
 * GET /zalo/me
 * Get basic status about the currently logged-in user
 */
export default defineEventHandler(async (_, { req, res }) => {
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
    res.json({
      userId: status.userId,
      status: status.status,
      isListening: status.isListening,
    })
  }
  catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})
