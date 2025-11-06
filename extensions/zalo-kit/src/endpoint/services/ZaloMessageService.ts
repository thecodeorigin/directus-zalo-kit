import type { SchemaOverview } from '@directus/types'
import { ThreadType } from 'zca-js'
import * as ZaloLogin from './ZaloLoginService'

/**
 * Zalo Message Service - Functional Module
 * Manages message synchronization, listener, and database operations
 */

// Module-level state
let api: any = null
let getSchemaFn: (() => Promise<SchemaOverview>) | null = null
let ItemsService: any = null

// Schema cache
let schema: SchemaOverview | null = null
const serviceCache: { [key: string]: any } = {}
let isSchemaLoading = false

// Listener state
let listenerIsStarted = false
let listenerReconnectAttempts = 0
const listenerMaxReconnectAttempts = 5
const listenerReconnectDelay = 5000

const systemAccountability = {
  admin: true,
  role: null,
  user: null,
}

/**
 * Initialize the module
 */
export async function initialize(
  _getSchemaFn: () => Promise<SchemaOverview>,
  _ItemsService: any,
) {
  getSchemaFn = _getSchemaFn
  ItemsService = _ItemsService

  console.warn('[ZaloMessage] Initialized')

  // Try to restore session after delay
  setTimeout(async () => {
    await ZaloLogin.sessionTryRestore(async (result: any) => {
      await onSessionRestored(result)
    })
  }, 10000)
}

/**
 * Get current API instance
 */
export function getApi() {
  return api
}

/**
 * Set API instance
 */
export function setApi(newApi: any) {
  api = newApi
}

/**
 * Load and cache schema
 */
async function loadSchema(): Promise<SchemaOverview> {
  if (schema) {
    return schema
  }

  if (isSchemaLoading) {
    // Wait for schema to be loaded
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (!isSchemaLoading) {
          clearInterval(interval)
          resolve()
        }
      }, 100)
    })
    return schema!
  }

  if (!getSchemaFn) {
    throw new Error('Schema function not initialized')
  }

  isSchemaLoading = true
  try {
    schema = await getSchemaFn()
    return schema
  }
  finally {
    isSchemaLoading = false
  }
}

/**
 * Get or create a service instance
 */
async function getService(collection: string): Promise<any> {
  if (serviceCache[collection]) {
    return serviceCache[collection]
  }

  if (!ItemsService) {
    throw new Error('ItemsService not initialized')
  }

  const currentSchema = await loadSchema()
  const service = new ItemsService(collection, {
    schema: currentSchema,
    accountability: systemAccountability,
  })

  serviceCache[collection] = service
  return service
}

/**
 * Session restored callback
 */
async function onSessionRestored(result: any) {
  try {
    console.warn('[ZaloMessage] Session restored, setting up API and listener')

    api = result.api || ZaloLogin.getApi()

    if (api) {
      await startListener()
      await ZaloLogin.startKeepAlive()
    }
  }
  catch (error) {
    console.error('[ZaloMessage] Error in onSessionRestored:', error)
  }
}

/**
 * Session imported callback
 */
export async function onSessionImported(result: any) {
  try {
    if (!result.ok) {
      console.error('[ZaloMessage] Session import failed')
      return
    }

    api = result.api

    if (api) {
      await startListener()
      await ZaloLogin.startKeepAlive()
    }
  }
  catch (error) {
    console.error('[ZaloMessage] Error in onSessionImported:', error)
  }
}

/**
 * Get login status
 */
export function getLoginStatus() {
  if (!api) {
    return {
      status: 'logged_out',
      qrCode: null,
      isListening: false,
      userId: null,
    }
  }

  // Listener is a property, not a method
  const listener = api.listener
  return {
    status: 'logged_in' as const,
    qrCode: null,
    isListening: listener?.isListening?.() || listenerIsStarted,
    userId: api.getCurrentUserId?.() || null,
  }
}

/**
 * Start message listener
 */
export async function startListener() {
  if (!api) {
    console.warn('[ZaloMessage] Cannot start listener: not logged in')
    return
  }

  if (listenerIsStarted) {
    console.warn('[ZaloMessage] Listener already started')
    return
  }

  try {
    // Get listener from API instance (it's a property, not a method)
    const listener = api.listener

    if (!listener) {
      console.error('[ZaloMessage] Failed to get listener from API')
      return
    }

    // Register message handler
    listener.on('message', async (message: any) => {
      try {
        await handleIncomingMessage(message)
      }
      catch (error) {
        console.error('[ZaloMessage] Error handling message:', error)
      }
    })

    // Start listening
    await listener.start()
    listenerIsStarted = true
    listenerReconnectAttempts = 0
  }
  catch (error) {
    console.error('[ZaloMessage] Error starting listener:', error)

    // Retry logic
    if (listenerReconnectAttempts < listenerMaxReconnectAttempts) {
      listenerReconnectAttempts++
      console.warn(`[ZaloMessage] Retrying listener start (${listenerReconnectAttempts}/${listenerMaxReconnectAttempts})`)

      setTimeout(() => {
        void startListener()
      }, listenerReconnectDelay)
    }
  }
}

/**
 * Stop message listener
 */
export function stopListener() {
  if (!api) {
    return
  }

  try {
    // Listener is a property, not a method
    const listener = api.listener
    if (listener && typeof listener.stop === 'function') {
      listener.stop()
      listenerIsStarted = false
      console.warn('[ZaloMessage] Listener stopped')
    }
  }
  catch (error) {
    console.error('[ZaloMessage] Error stopping listener:', error)
  }
}

/**
 * Handle incoming message
 */
async function handleIncomingMessage(message: any) {
  console.warn('[ZaloMessage] Received message:', message.data?.message?.msgId)

  try {
    // Sync user
    const senderId = message.data?.uidFrom
    if (senderId) {
      await syncUser(senderId)
    }

    // Sync conversation
    const threadId = message.data?.message?.threadId
    const threadType = message.data?.message?.threadType

    if (threadId) {
      if (threadType === ThreadType.Group) {
        await syncGroup(threadId)
        await syncConversation(threadId, 'group')
      }
      else {
        await syncConversation(senderId, 'direct')
      }
    }

    // Sync message
    await syncMessage(message.data)
  }
  catch (error) {
    console.error('[ZaloMessage] Error processing message:', error)
  }
}

/**
 * Sync user to database
 */
async function syncUser(userId: string) {
  if (!api)
    return

  try {
    const userInfo = await api.getUserInfo(userId)
    if (!userInfo)
      return

    const usersService = await getService('zalo_users')

    const userData = {
      id: userId,
      display_name: userInfo.displayName || userInfo.zaloName,
      zalo_name: userInfo.zaloName,
      avatar_url: userInfo.avatar,
      updated_at: new Date(),
    }

    // Upsert user
    const existing = await usersService.readOne(userId, { fields: ['id'] }).catch(() => null)

    if (existing) {
      await usersService.updateOne(userId, userData)
    }
    else {
      await usersService.createOne({ ...userData, created_at: new Date() })
    }

    console.warn(`[ZaloMessage] User synced: ${userId}`)
  }
  catch (error) {
    console.error('[ZaloMessage] Error syncing user:', error)
  }
}

/**
 * Sync group to database
 */
async function syncGroup(groupId: string) {
  if (!api)
    return

  try {
    const groupInfo = await api.getGroupInfo(groupId)
    if (!groupInfo)
      return

    const groupsService = await getService('zalo_groups')

    const groupData = {
      id: groupId,
      name: groupInfo.name,
      avatar_url: groupInfo.avatar,
      total_members: groupInfo.totalMembers || 0,
      updated_at: new Date(),
    }

    // Upsert group
    const existing = await groupsService.readOne(groupId, { fields: ['id'] }).catch(() => null)

    if (existing) {
      await groupsService.updateOne(groupId, groupData)
    }
    else {
      await groupsService.createOne({ ...groupData, created_at: new Date() })
    }

    console.warn(`[ZaloMessage] Group synced: ${groupId}`)
  }
  catch (error) {
    console.error('[ZaloMessage] Error syncing group:', error)
  }
}

/**
 * Sync conversation to database
 */
async function syncConversation(participantId: string, type: 'group' | 'direct') {
  try {
    const conversationsService = await getService('zalo_conversations')

    const conversationData: any = {
      type,
      updated_at: new Date(),
    }

    if (type === 'group') {
      conversationData.group_id = participantId
      conversationData.id = `group_${participantId}`
    }
    else {
      conversationData.participant_id = participantId
      conversationData.id = `direct_${participantId}`
    }

    // Upsert conversation
    const existing = await conversationsService.readOne(conversationData.id, { fields: ['id'] }).catch(() => null)

    if (existing) {
      await conversationsService.updateOne(conversationData.id, conversationData)
    }
    else {
      await conversationsService.createOne({ ...conversationData, created_at: new Date() })
    }

    console.warn(`[ZaloMessage] Conversation synced: ${conversationData.id}`)
  }
  catch (error) {
    console.error('[ZaloMessage] Error syncing conversation:', error)
  }
}

/**
 * Sync message to database
 */
async function syncMessage(messageData: any) {
  try {
    const message = messageData.message
    if (!message)
      return

    const messagesService = await getService('zalo_messages')

    const msgId = message.msgId
    const senderId = messageData.uidFrom
    const threadId = message.threadId
    const threadType = message.threadType

    // Determine conversation ID
    let conversationId: string
    if (threadType === ThreadType.Group) {
      conversationId = `group_${threadId}`
    }
    else {
      conversationId = `direct_${senderId}`
    }

    const msgData = {
      id: msgId,
      conversation_id: conversationId,
      sender_id: senderId,
      content: message.content || message.desc || '',
      sent_at: new Date(message.ts || Date.now()),
      received_at: new Date(),
      is_edited: false,
      is_undone: false,
      raw_data: messageData,
      updated_at: new Date(),
    }

    // Check if message exists
    const existing = await messagesService.readOne(msgId, { fields: ['id'] }).catch(() => null)

    if (!existing) {
      await messagesService.createOne({ ...msgData, created_at: new Date() })
      console.warn(`[ZaloMessage] Message saved: ${msgId}`)

      // Update conversation last message
      const conversationsService = await getService('zalo_conversations')
      await conversationsService.updateOne(conversationId, {
        last_message_id: msgId,
        last_message_time: msgData.sent_at,
        updated_at: new Date(),
      }).catch(() => {
        // Conversation might not exist yet
      })
    }
  }
  catch (error) {
    console.error('[ZaloMessage] Error syncing message:', error)
  }
}

/**
 * Send message via Zalo API
 */
export async function sendMessage(
  content: { msg: string },
  threadId: string,
  threadType: typeof ThreadType.User | typeof ThreadType.Group,
) {
  if (!api) {
    throw new Error('Not logged in')
  }

  try {
    const result = await api.sendMessage(content, threadId, threadType)
    return result
  }
  catch (error) {
    console.error('[ZaloMessage] Error sending message:', error)
    throw error
  }
}

/**
 * Redis operations - delegated to ZaloLogin
 */
export async function getRedisStatus() {
  return await ZaloLogin.redisGetStatus()
}

export async function getRedisSession(userId?: string) {
  return await ZaloLogin.redisGetSession(userId)
}

export async function getRedisKeys(pattern = '*', limit = 1000) {
  return await ZaloLogin.redisGetKeys(pattern, limit)
}

export async function getRedisValue(key: string) {
  return await ZaloLogin.redisGet(key)
}
