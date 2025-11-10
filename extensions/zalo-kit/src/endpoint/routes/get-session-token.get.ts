import type { Accountability } from '@directus/types'
import { defineEventHandler } from '../utils'

/**
 * GET /zalo/get-session-token
 * Get Directus session token from cookies
 */
export default defineEventHandler(async (_, { req, res }) => {
  const _req = req as typeof req & { accountability: Accountability | null }

  try {
    // Get session token from cookies
    const sessionToken = _req.cookies?.directus_session_token

    if (!sessionToken) {
      res.status(401).json({
        error: 'SESSION_TOKEN_NOT_FOUND',
        message: 'Session token not found in cookies',
      })
      return
    }

    // Return session token
    res.json({
      sessionToken,
      user: _req.accountability?.user || null,
    })
  }
  catch (error: any) {
    console.error('[GetSessionToken] Error:', error)
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error.message,
    })
  }
})
