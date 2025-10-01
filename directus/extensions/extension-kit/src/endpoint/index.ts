// endpoint/index.ts
import { defineEndpoint } from '@directus/extensions-sdk'
import { ZaloService } from './services/ZaloService'

export default defineEndpoint((router) => {
  // GET /zalo/status - Lấy trạng thái hiện tại
  router.get('/status', async (req, res) => {
    try {
      const zalo = ZaloService.getInstance()
      const status = zalo.getStatus()

      res.json({
        status: status.status,
        qrCode: status.qrCode,
        userId: status.userId,
      })
    }
    catch (error: any) {
      console.error('[Zalo Endpoint] Status error:', error)
      res.status(500).json({ error: error.message })
    }
  })

  // POST /zalo/init - Bắt đầu đăng nhập
  router.post('/init', async (req, res) => {
    try {
      const zalo = ZaloService.getInstance()

      console.log('[Zalo Endpoint] Starting login...')
      const result = await zalo.login()

      if (result.success) {
        res.json({
          success: true,
          userId: result.userId,
          message: 'Logged in successfully',
        })
      }
      else if (result.qrCode) {
        res.json({
          success: false,
          qrCode: result.qrCode,
          message: 'QR code generated, please scan',
        })
      }
      else {
        res.json({
          success: false,
          message: 'Login failed',
        })
      }
    }
    catch (error: any) {
      console.error('[Zalo Endpoint] Init error:', error)
      res.status(500).json({ error: error.message })
    }
  })

  // POST /zalo/logout - Đăng xuất
  router.post('/logout', async (req, res) => {
    try {
      const zalo = ZaloService.getInstance()
      await zalo.logout()

      res.json({
        success: true,
        message: 'Logged out successfully',
      })
    }
    catch (error: any) {
      console.error('[Zalo Endpoint] Logout error:', error)
      res.status(500).json({ error: error.message })
    }
  })

  // GET /zalo/session - Lấy thông tin session
  router.get('/session', async (req, res) => {
    try {
      const zalo = ZaloService.getInstance()
      const session = await zalo.getSessionInfo()

      if (session) {
        res.json({
          exists: true,
          userId: session.userId,
          loginTime: session.loginTime,
          isActive: session.isActive,
        })
      }
      else {
        res.json({
          exists: false,
        })
      }
    }
    catch (error: any) {
      console.error('[Zalo Endpoint] Session error:', error)
      res.status(500).json({ error: error.message })
    }
  })
})
