import type { Accountability } from '@directus/types'
import * as ZaloLogin from '../services/ZaloLoginService'
import { defineEventHandler } from '../utils'

/**
 * GET /zalo/status
 * Get current login status
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
    const status = ZaloLogin.loginGetStatus()
    res.json(status)
  }
  catch (error: any) {
    console.error('[Status] Error:', error)
    res.status(500).json({
      error: error.message,
      status: 'logged_out',
      qrCode: null,
      isListening: false,
      userId: null,
    })
  }
})
