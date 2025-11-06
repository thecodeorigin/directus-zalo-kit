import type { Accountability } from '@directus/types'
import * as ZaloLogin from '../../services/ZaloLoginService'
import * as ZaloMessage from '../../services/ZaloMessageService'
import { defineEventHandler } from '../../utils'

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
    const { cookies, imei, userAgent } = req.body

    if (!cookies || !imei || !userAgent) {
      res.status(400).json({
        ok: false,
        message: 'Missing required fields: cookies, imei, userAgent',
      })
      return
    }

    if (!Array.isArray(cookies) || cookies.length === 0) {
      res.status(400).json({
        ok: false,
        message: 'Cookies must be a non-empty array',
      })
      return
    }

    // Wait for login to complete
    const result = await ZaloLogin.handleZaloLoginCookies(imei, userAgent, cookies)

    if (result.ok) {
      const userId = (result as any).userId

      // Run message import in background (don't wait)
      ZaloMessage.onSessionImported(result).catch((err) => {
        console.error('[LoginCookies] Background message import failed:', err)
      })

      res.status(200).json({
        ok: true,
        message: 'Login successful',
        userId,
      })
    }
    else {
      res.status(400).json({
        ok: false,
        message: result.message || 'Login failed',
      })
    }
  }
  catch (error: any) {
    console.error('[LoginCookies] Error:', error)
    res.status(500).json({
      ok: false,
      message: error.message,
    })
  }
})
