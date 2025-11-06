import type { Accountability } from '@directus/types'

import * as ZaloLogin from '../../services/ZaloLoginService'
import { defineEventHandler } from '../../utils'

/**
 * POST /zalo/login/qr
 * Initiate QR code login
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
    const result = await ZaloLogin.handleZaloLoginQR()
    res.json(result)
  }
  catch (error: any) {
    console.error('[QR Login] Error:', error)
    res.status(500).json({
      error: error.message,
      status: 'logged_out',
      qrCode: null,
      isListening: false,
      userId: null,
    })
  }
})
