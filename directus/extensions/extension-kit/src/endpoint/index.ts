import { defineEndpoint } from '@directus/extensions-sdk'
import ZaloService from './services/ZaloService'

export default defineEndpoint(async (router, { getSchema, services }) => {
  const { ItemsService } = services

  let zaloService: ZaloService
  try {
    zaloService = ZaloService.getInstance()
    console.warn('[Zalo Endpoint] Using existing ZaloService instance')
  }
  catch {
    zaloService = ZaloService.init(getSchema, ItemsService)
    console.warn('[Zalo Endpoint] Created new ZaloService instance')
  }

  // POST /zalo/init - Initiate QR code login
  router.post('/init', async (req, res) => {
    try {
      const result = await zaloService.initiateLogin()
      res.json(result)
    }
    catch (error: any) {
      console.error('[Zalo Endpoint] Init error:', error)
      res.status(500).json({
        error: error.message,
        status: 'logged_out',
        qrCode: null,
        isListening: false,
        userId: null,
      })
    }
  })

  // POST /zalo/login/cookies - Login using cookies from Zalo Extractor
  router.post('/login/cookies', async (req, res) => {
    try {
      const { cookies, imei, userAgent } = req.body

      if (!cookies || !imei || !userAgent) {
        return res.status(400).json({
          ok: false,
          message: 'Missing required fields: cookies, imei, userAgent',
        })
      }

      if (!Array.isArray(cookies) || cookies.length === 0) {
        return res.status(400).json({
          ok: false,
          message: 'Cookies must be a non-empty array',
        })
      }
      res.json({
        ok: true,
        message: 'Login session is being initialized...',
      });

      (async () => {
        try {
          const result = await zaloService.importSessionFromExtractor(
            imei,
            userAgent,
            cookies,
          )
          console.log('[ZaloService]  Background cookie login done:', result)
        }
        catch (err) {
          console.error('[ZaloService]  Background cookie login failed:', err)
        }
      })()
    }
    catch (error: any) {
      console.error('[Zalo Endpoint] Cookies Login error:', error)
      res.status(500).json({
        ok: false,
        message: error.message,
      })
    }
  })

  // GET /zalo/status - Get current login status
  router.get('/status', async (req, res) => {
    try {
      const status = zaloService.getStatus()
      res.json(status)
    }
    catch (error: any) {
      console.error('[Zalo Endpoint] Status error:', error)
      res.status(500).json({
        error: error.message,
        status: 'logged_out',
        qrCode: null,
        isListening: false,
        userId: null,
      })
    }
  })

  // POST /zalo/logout - Logout
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

  // GET /zalo/session - Get session info
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

  // POST /zalo/send-message - Send a message
  router.post('/send-message', async (req, res) => {
    try {
      const { threadId, message } = req.body

      if (!threadId || !message) {
        return res.status(400).json({
          error: 'Missing required fields: threadId, message',
        })
      }

      const result = await zaloService.sendMessage({ msg: message }, threadId)
      res.json({
        success: true,
        data: result,
      })
    }
    catch (error: any) {
      console.error('[Zalo Endpoint] Send message error:', error)
      res.status(500).json({ error: error.message })
    }
  })
})
