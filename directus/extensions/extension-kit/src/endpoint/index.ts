import { defineEndpoint } from '@directus/extensions-sdk'
import { ZaloService } from './services/ZaloService'

// The endpoint definition provides a context object that includes the emitter and getSchema function.
export default defineEndpoint((router, { emitter, getSchema }) => {
  // This route will be accessible at POST /zalo/init
  router.post('/init', async (_req, res) => {
    try {
      // Await getSchema() to ensure it's available for initialization.
      const schema = await getSchema()
      // Pass the emitter and schema. The singleton pattern in ZaloService
      // will ensure it's only initialized once, even if the hook also calls this.
      const zaloService = ZaloService.getInstance(emitter, schema)

      zaloService.initiateLogin().catch((err) => {
        console.error('[Zalo Endpoint] Error during login initiation:', err)
      })

      res.json({ message: 'Login process initiated. Please poll /zalo/status for updates.' })
    }
    catch (error) {
      console.error('[Zalo Endpoint] Failed to get schema for ZaloService initialization:', error)
      res.status(500).json({ error: 'Failed to initialize service.' })
    }
  })

  // This route will be accessible at GET /zalo/status
  router.get('/status', async (_req, res) => {
    try {
      const schema = await getSchema()
      // Similarly, ensure the service is initialized before use.
      const zaloService = ZaloService.getInstance(emitter, schema)
      const status = zaloService.getStatus()
      res.json(status)
    }
    catch (error) {
      console.error('[Zalo Endpoint] Failed to get schema for ZaloService initialization:', error)
      res.status(500).json({ error: 'Failed to initialize service.' })
    }
  })
})
