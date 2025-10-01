// endpoint/index.ts
import { defineEndpoint } from '@directus/extensions-sdk'
import ZaloService from './services/ZaloService'

export default defineEndpoint((router, { database, getSchema, services }) => {
  const { ItemsService } = services

  // Khởi tạo ZaloService với context Directus
  const zaloService = ZaloService.init(database, getSchema, ItemsService)

  // POST /zalo/init - Bắt đầu đăng nhập
  router.post('/init', async (req, res) => {
    try {
      const result = await zaloService.initiateLogin()

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

  // GET /zalo/status - Lấy trạng thái hiện tại
  router.get('/status', (req, res) => {
    try {
      const status = zaloService.getStatus()
      res.json(status)
    }
    catch (error: any) {
      console.error('[Zalo Endpoint] Status error:', error)
      res.status(500).json({ error: error.message })
    }
  })

  // POST /zalo/logout - Đăng xuất
  router.post('/logout', async (req, res) => {
    try {
      await zaloService.logout()
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
      const session = await zaloService.getSessionInfo()

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
      console.error('[Zalo Endpoint] Session error:', error)
      res.status(500).json({ error: error.message })
    }
  })
})
