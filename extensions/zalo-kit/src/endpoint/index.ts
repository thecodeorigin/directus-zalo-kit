import { defineEndpoint } from '@directus/extensions-sdk'

// Import route handlers
import avatarProxyHandler from './routes/avatar-proxy.get'
import conversationArchiveHandler from './routes/conversations/[conversationId]/archive.put'
import conversationLabelsAddHandler from './routes/conversations/[conversationId]/labels.post'
import conversationLabelsRemoveHandler from './routes/conversations/[conversationId]/labels/[labelId].delete'
import conversationPinHandler from './routes/conversations/[conversationId]/pin.put'
import indexConversationsHandler from './routes/conversations/index.get'
import getSessionTokenHandler from './routes/get-session-token.get'
import groupDetailHandler from './routes/groups/[groupId].get'
import groupMembersHandler from './routes/groups/[groupId]/members.get'
import groupsHandler from './routes/groups/index.get'
import labelsDeleteHandler from './routes/labels/[labelId].delete'
import labelsUpdateHandler from './routes/labels/[labelId].put'
import labelsGetHandler from './routes/labels/index.get'
import labelsCreateHandler from './routes/labels/index.post'
import cookiesLoginHandler from './routes/login/cookies.post'
import qrLoginHandler from './routes/login/qr.post'
import logoutHandler from './routes/logout.post'
import meHandler from './routes/me.get'
import messagesHandler from './routes/messages/[conversationId].get'
import reactHandler from './routes/messages/react.post'
import sendMessageHandler from './routes/messages/send.post'
import quickMessagesHandler from './routes/quick-messages/index.get'
import sessionHandler from './routes/session.get'
import statusHandler from './routes/status.get'
import syncGroupsHandler from './routes/sync/groups.post'
import syncGroupMembersHandler from './routes/sync/groups/[groupId]/members.post'
import userDetailHandler from './routes/users/[userId].get'
import usersHandler from './routes/users/index.get'

// Import services
import * as ZaloLogin from './services/ZaloLoginService'
import { getInstance as getZaloMessageService } from './services/ZaloMessageService'

/**
 * Zalo Endpoint - Main Entry Point
 */
export default defineEndpoint(async (router, context) => {
  // Initialize ZaloMessageService singleton immediately
  const zaloService = getZaloMessageService(
    context.database,
    context.services.WebSocketService,
    context.getSchema,
    context.services.ItemsService,
  )

  console.log('[Endpoint] ✅ ZaloMessageService singleton initialized')

  // Initialize Zalo Login service
  await ZaloLogin.initialize()

  console.log('[Endpoint] ✅ Zalo services initialized')

  // Register routes
  router.post('/login/qr', qrLoginHandler(context) as any)
  router.post('/login/cookies', cookiesLoginHandler(context) as any)

  router.get('/status', statusHandler(context) as any)
  router.post('/logout', logoutHandler(context) as any)
  router.get('/session', sessionHandler(context) as any)
  router.get('/get-session-token', getSessionTokenHandler(context) as any)
  router.get('/me', meHandler(context) as any)
  router.post('/send', sendMessageHandler(context) as any)

  // ZALO MESSAGES
  router.get('/index', indexConversationsHandler(context) as any)
  router.post('/conversations/:conversationId/labels', conversationLabelsAddHandler(context) as any)
  router.delete('/conversations/:conversationId/labels/:labelId', conversationLabelsRemoveHandler(context) as any)
  router.put('/conversations/:conversationId/pin', conversationPinHandler(context) as any)
  router.put('/conversations/:conversationId/archive', conversationArchiveHandler(context) as any)

  router.get('/messages/:conversationId', messagesHandler(context) as any)
  router.post('/messages/:messageId/react', reactHandler(context) as any)

  router.get('/avatar-proxy', avatarProxyHandler(context) as any)

  router.get('/labels', labelsGetHandler(context) as any)
  router.post('/labels', labelsCreateHandler(context) as any)
  router.put('/labels/:labelId', labelsUpdateHandler(context) as any)
  router.delete('/labels/:labelId', labelsDeleteHandler(context) as any)

  router.get('/quick-messages', quickMessagesHandler(context) as any)

  router.get('/users', usersHandler(context) as any)
  router.get('/users/:userId', userDetailHandler(context) as any)

  router.get('/groups', groupsHandler(context) as any)
  router.get('/groups/:groupId', groupDetailHandler(context) as any)
  router.get('/groups/:groupId/members', groupMembersHandler(context) as any)
  router.post('/sync/groups', syncGroupsHandler(context) as any)

  router.post('/sync/groups/:groupId/members', syncGroupMembersHandler(context) as any)
})
