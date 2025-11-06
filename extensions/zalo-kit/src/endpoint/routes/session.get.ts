import type { Accountability } from '@directus/types'
import * as ZaloLogin from '../services/ZaloLoginService'
import { defineEventHandler } from '../utils'

/**
 * GET /zalo/session
 * Get session information
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
    const session = await ZaloLogin.sessionGetInfo()

    if (session) {
      res.json({
        exists: true,
        userId: session.userId,
        loginTime: session.loginTime,
        isActive: session.isActive,
      })
    }
    else {
      res.json({ exists: false })
    }
  }
  catch (error: any) {
    console.error('[Session] Error:', error)
    res.status(500).json({ error: error.message })
  }
})
