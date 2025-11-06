import type { Accountability } from '@directus/types'
import * as ZaloLogin from '../services/ZaloLoginService'
import { defineEventHandler } from '../utils'

/**
 * POST /zalo/logout
 * Logout from Zalo
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
    await ZaloLogin.initialize()
    await ZaloLogin.loginLogout()

    res.json({
      success: true,
      message: 'Logged out successfully',
    })
  }
  catch (error: any) {
    console.error('[Logout] Error:', error)
    res.status(500).json({ error: error.message })
  }
})
