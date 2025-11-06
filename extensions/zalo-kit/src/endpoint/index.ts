import { defineEndpoint } from '@directus/extensions-sdk'

// Import route handlers
import avatarProxyHandler from './routes/avatar-proxy.get'
import conversationsHandler from './routes/conversations.get'
import cookiesLoginHandler from './routes/login/cookies.post'
import qrLoginHandler from './routes/login/qr.post'
import logoutHandler from './routes/logout.post'
import meHandler from './routes/me.get'
import messagesHandler from './routes/messages/[conversationId].get'
import sendHandler from './routes/send.post'
import sessionHandler from './routes/session.get'
import statusHandler from './routes/status.get'
import * as ZaloLogin from './services/ZaloLoginService'
import * as ZaloMessage from './services/ZaloMessageService'

/**
 * Zalo Endpoint - Main Entry Point
 */
export default defineEndpoint(async (router, context) => {
  const { getSchema, services } = context
  const { ItemsService } = services

  // Initialize Zalo modules
  await ZaloLogin.initialize()
  await ZaloMessage.initialize(getSchema, ItemsService)

  // Register routes
  router.post('/login/qr', qrLoginHandler(context) as any)
  router.post('/login/cookies', cookiesLoginHandler(context) as any)

  router.get('/status', statusHandler(context) as any)
  router.post('/logout', logoutHandler(context) as any)
  router.get('/session', sessionHandler(context) as any)
  router.get('/me', meHandler(context) as any)
  router.post('/send', sendHandler(context) as any)
  router.get('/conversations', conversationsHandler(context) as any)
  router.get('/messages/:conversationId', messagesHandler(context) as any)
  router.get('/avatar-proxy', avatarProxyHandler(context) as any)

  console.warn('[Zalo Endpoint] Modules initialized and routes registered')
})
