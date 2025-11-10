import type { SchemaOverview } from '@directus/types'
import type { ZaloConversation, ZaloGroup, ZaloGroupMember, ZaloLabel, ZaloQuickMessage } from '../../type'
import * as ZaloLogin from './ZaloLoginService'

// ============================================================================
// MODULE STATE
// ============================================================================

let api: any = null
let getSchemaFn: (() => Promise<SchemaOverview>) | null = null
let ItemsService: any = null
let database: any = null

let schema: SchemaOverview | null = null
const serviceCache: { [key: string]: any } = {}
let isSchemaLoading = false

let listenerIsStarted = false
let listenerReconnectAttempts = 0
const listenerMaxReconnectAttempts = 5
const listenerReconnectDelay = 5000

let sessionIsRestoring = false

const systemAccountability = { admin: true, role: null, user: null }

// Group sync and message queue management
let isSyncingGroups = false
let syncGroupsCompleted = false
let isProcessingQueue = false
const messageQueue: Array<{ rawData: any, type: 'message' | 'reaction' }> = []

const groupMemberSyncTimestamps = new Map<string, number>()
const GROUP_MEMBER_SYNC_COOLDOWN = 5 * 60 * 1000 // 10 minutes

// ============================================================================
// INITIALIZATION
// ============================================================================
async function handleZaloResponse(response: any): Promise<any> {
  if (typeof response === 'object' && response !== null && !(response instanceof Response)) {
    return response
  }

  if (response instanceof Response) {
    try {
      const text = await response.text()

      if (!text || text.trim() === '') {
        console.warn('Zalo API returned empty response')
        return null
      }

      return JSON.parse(text)
    }
    catch (error) {
      console.error('Failed to parse Zalo response:', error)
      return null
    }
  }

  return response
}

function init(
  _getSchemaFn: () => Promise<SchemaOverview>,
  _ItemsService: any,
  _context?: any,
): void {
  getSchemaFn = _getSchemaFn
  ItemsService = _ItemsService

  if (_context) {
    if (_context.database)
      database = _context.database
  }

  setTimeout(async () => {
    await ZaloLogin.sessionTryRestore(async (result: any) => {
      await onSessionRestored(result)
    })
  }, 10000)

  setTimeout(() => {
    tryGetApiFromLogin().catch(() => {})
  }, 2000)
}

function initialize(
  _getSchemaFn: () => Promise<SchemaOverview>,
  _ItemsService: any,
  _context?: any,
): void {
  return init(_getSchemaFn, _ItemsService, _context)
}

async function tryGetApiFromLogin(): Promise<void> {
  try {
    const loginApi = ZaloLogin.getApi()
    if (loginApi) {
      setApi(loginApi)
      await listenerStart()
    }
  }
  catch {}
}

// ============================================================================
// API MANAGEMENT
// ============================================================================

function getApi(): any {
  return api
}

function setApi(newApi: any): void {
  if (api && listenerIsStarted)
    listenerStop()
  api = newApi
}

function getCurrentUserId(): string | null {
  if (!api)
    return null
  return api.getCurrentUserId?.() || api.getOwnId?.() || null
}

function getLoginStatus() {
  if (!api) {
    return { status: 'logged_out' as const, qrCode: null, isListening: false, userId: null }
  }

  const listener = api.listener
  return {
    status: 'logged_in' as const,
    qrCode: null,
    isListening: listener?.isListening?.() || listenerIsStarted,
    userId: getCurrentUserId(),
  }
}

// ============================================================================
// SCHEMA & SERVICE MANAGEMENT
// ============================================================================

async function loadSchema(): Promise<SchemaOverview> {
  if (schema)
    return schema

  if (isSchemaLoading) {
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (!isSchemaLoading && schema) {
          clearInterval(checkInterval)
          resolve()
        }
      }, 100)
    })
    return schema!
  }

  isSchemaLoading = true
  try {
    if (!getSchemaFn)
      throw new Error('getSchemaFn not initialized')
    schema = await getSchemaFn()
    return schema
  }
  finally {
    isSchemaLoading = false
  }
}

async function getService(collection: string): Promise<any> {
  if (serviceCache[collection])
    return serviceCache[collection]

  const currentSchema = await loadSchema()
  if (!ItemsService)
    throw new Error('ItemsService not initialized')

  const service = new ItemsService(collection, {
    schema: currentSchema,
    accountability: systemAccountability,
  })
  serviceCache[collection] = service
  return service
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

async function sessionTryRestore(): Promise<void> {
  if (sessionIsRestoring)
    return

  sessionIsRestoring = true
  try {
    await ZaloLogin.sessionTryRestore(async (result: any) => {
      await onSessionRestored(result)
    })
  }
  catch {
  }
  finally {
    sessionIsRestoring = false
  }
}

async function onSessionRestored(result: any): Promise<void> {
  try {
    api = result.api
    if (api)
      await listenerStart()
  }
  catch {}
}

async function onSessionImported(result: any): Promise<void> {
  try {
    if (!result.ok)
      return

    setApi(result.api)
    if (api) {
      await listenerStart()
      setTimeout(async () => {
        try {
          await syncGroups()
        }
        catch {}
      }, 5000)
    }
  }
  catch {}
}

async function listenerStart(): Promise<void> {
  if (!api || typeof api.listener !== 'object' || !api.listener || listenerIsStarted)
    return

  try {
    const listener = api.listener
    if (!listener)
      throw new Error('Listener not available')

    if (typeof listener.isListening === 'function' && listener.isListening()) {
      listenerIsStarted = true
      return
    }

    listener
      .on('message', async (message: any) => {
        try {
          await listenerHandleMessage(message)
        }
        catch {}
      })
      .on('reaction', async (reaction: any) => {
        try {
          await listenerHandleReaction(reaction)
        }
        catch {}
      })
      .on('error', async (error: any) => {
        if (error.message?.includes('Not authenticated'))
          listenerStop()
      })

    try {
      await listener.start()
      listenerIsStarted = true
    }
    catch (startError: any) {
      if (startError.message?.includes('Already started')) {
        listenerIsStarted = true
      }
      else {
        throw startError
      }
    }
  }
  catch {
    if (listenerReconnectAttempts < listenerMaxReconnectAttempts) {
      listenerReconnectAttempts++
      setTimeout(() => listenerStart(), listenerReconnectDelay)
    }
  }
}

function listenerStop(): void {
  if (!api)
    return

  try {
    const listener = api.listener
    if (listener && typeof listener.stop === 'function') {
      listener.stop()
      listenerIsStarted = false
    }
  }
  catch {}
}

async function listenerHandleMessage(rawData: any): Promise<void> {
  if (isSyncingGroups && !syncGroupsCompleted) {
    messageQueue.push({ rawData, type: 'message' })
    return
  }
  await listenerHandleMessageDirect(rawData)
}

async function listenerHandleReactionQueued(rawData: any): Promise<void> {
  if (isSyncingGroups && !syncGroupsCompleted) {
    messageQueue.push({ rawData, type: 'reaction' })
    return
  }
  await listenerHandleReaction(rawData)
}

async function listenerHandleMessageDirect(rawData: any): Promise<void> {
  let conversationId: string | null = null

  try {
    const msgData = rawData.data || rawData.message || rawData
    const message = msgData
    const messageId = message.msgId || rawData.msgId
    const senderId = message.uidFrom || rawData.uidFrom || message.senderId || rawData.senderId
    const threadId = rawData.threadId || message.threadId
    const currentUserId = getCurrentUserId()

    if (!messageId || !currentUserId)
      return

    if (!senderId) {
      console.error(`Message ${messageId} has no sender ID`)
      return
    }

    if (database) {
      const existingMessage = await database('zalo_messages')
        .where('id', messageId)
        .first()
      if (existingMessage)
        return
    }

    try {
      await dbFetchAndUpsertUser(senderId)
    }
    catch (error: any) {
      console.error(`Failed to upsert sender ${senderId}, cannot process message ${messageId}:`, error)
      messageQueue.push({ rawData, type: 'message' })
      return
    }

    let isGroupMessage = false
    const msgType = rawData.msgType || rawData.type || message.msgType || message.type
    const isGroup = rawData.isGroup || message.isGroup

    if (isGroup === true || msgType === 'group') {
      isGroupMessage = true
    }
    else if (database && threadId) {
      const groups = await database('zalo_groups')
        .where('id', threadId)
        .select('id')
        .limit(1)

      if (groups.length > 0) {
        isGroupMessage = true
      }
    }

    if (isGroupMessage && threadId) {
      if (database) {
        const existingGroup = await database('zalo_groups')
          .where('id', threadId)
          .first()

        if (!existingGroup) {
          console.warn(` Group ${threadId} not synced yet, queueing message ${messageId}`)
          messageQueue.push({ rawData, type: 'message' })
          return
        }
      }

      conversationId = `group${threadId}user${currentUserId}`
      try {
        if (database) {
          const senderMember = await database('zalo_group_members')
            .where('group_id', threadId)
            .where('owner_id', senderId)
            .first()

          if (!senderMember) {
            console.log(`Sender ${senderId} not a member of group ${threadId}, fetching group members`)
            await dbEnsureGroupMember(threadId, senderId, true)
          }
        }
      }
      catch (error: any) {
        console.error(`Failed to lazy load group members for ${threadId}:`, error)
      }
      await dbEnsureGroupMember(threadId, senderId, true)
      await dbEnsureGroupMember(threadId, currentUserId, true)
      await dbEnsureGroupConversation(threadId, currentUserId, true)
    }
    else {
      const receiverId = message.idTo || rawData.idTo || message.receiverId || rawData.receiverId
      let otherUserId: string | null = null

      if (receiverId && receiverId !== currentUserId) {
        otherUserId = receiverId
      }
      else if (senderId && senderId !== currentUserId) {
        otherUserId = senderId
      }

      if (!otherUserId) {
        console.error(`Cannot determine other user for message ${messageId}`)
        return
      }

      const participants = [otherUserId, currentUserId].sort()
      conversationId = `direct${participants[0]}${participants[1]}`

      // Upsert other user nếu khác sender
      if (otherUserId !== senderId) {
        try {
          await dbFetchAndUpsertUser(otherUserId)
        }
        catch (error: any) {
          console.error(`Failed to upsert user ${otherUserId}:`, error)
        }
      }

      await dbUpsertConversation(conversationId, {
        participant_id: otherUserId,
        group_id: undefined,
        is_hidden: false,
      })
    }

    if (!conversationId)
      return
    await syncStart(conversationId)

    // 6. KIỂM TRA LẠI SENDER TỒN TẠI TRƯỚC KHI INSERT MESSAGE
    if (database) {
      const senderExists = await database('zalo_users')
        .where('id', senderId)
        .first()

      if (!senderExists) {
        console.error(`Sender ${senderId} does not exist after upsert, queueing message`)
        messageQueue.push({ rawData, type: 'message' })
        return
      }
    }

    // 7. Lưu message vào DB
    const content = message.content || message.desc || rawData.content
    const timestamp = message.ts || rawData.ts || Date.now()
    const clientMsgId = rawData.cliMsgId || message.cliMsgId || messageId
    const sentAt = new Date(Number(timestamp))
    const now = new Date()

    const dbMessageData = {
      id: messageId,
      client_id: clientMsgId,
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      sent_at: sentAt.toISOString(),
      received_at: now.toISOString(),
      is_edited: false,
      is_undone: false,
      raw_data: rawData,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    }

    try {
      if (database) {
        await database('zalo_messages')
          .insert(dbMessageData)
          .onConflict('id')
          .ignore()
      }
      else {
        throw new Error('Database not initialized')
      }
    }
    catch (insertError: any) {
      if (insertError.code === '23505' || insertError.message?.includes('duplicate')) {
        return
      }
      else if (insertError.code === '23503') {
        // Foreign key violation - sender không tồn tại
        console.error(`Foreign key violation for sender ${senderId}, queueing for retry`)
        messageQueue.push({ rawData, type: 'message' })
        return
      }
      else {
        throw insertError
      }
    }

    // 8. Cập nhật last message
    if (database) {
      await database('zalo_conversations')
        .where('id', conversationId)
        .update({
          last_message_id: messageId,
          last_message_time: sentAt,
          updated_at: now,
        })
    }

    await syncComplete(conversationId, messageId)

    // 9. Xử lý quick message
    if (typeof content === 'string' && content.startsWith('/')) {
      await quickMessageHandle(content, conversationId, senderId)
    }
  }
  catch (error: any) {
    if (conversationId) {
      await syncFail(conversationId, error)
    }
    console.error('Error handling message:', error)
  }
}

async function listenerHandleReaction(rawData: any): Promise<void> {
  try {
    const messageId = rawData.msgId
    const senderId = rawData.uidFrom
    const reactionIcon = rawData.react || rawData.icon

    const reactionsService = await getService('zalo_reactions')

    const existing = await reactionsService.readByQuery({
      filter: {
        _and: [
          { message_id: { _eq: messageId } },
          { sender_id: { _eq: senderId } },
        ],
      },
      limit: 1,
    })

    if (existing.length > 0) {
      await reactionsService.updateOne(existing[0].id, {
        icon: reactionIcon,
        updated_at: new Date().toISOString(),
      })
    }
    else {
      await reactionsService.createOne({
        message_id: messageId,
        sender_id: senderId,
        icon: reactionIcon,
      })
    }
  }
  catch {}
}

// ============================================================================
// MESSAGE OPERATIONS
// ============================================================================

async function sendMessage(
  content: { msg: string },
  threadId: string,
  threadType: number,
): Promise<any> {
  if (!api)
    throw new Error('Not logged in')

  const result = await api.sendMessage(content, threadId, threadType)
  return result
}

async function sendReaction(
  messageId: string,
  reactionIcon: string,
  threadId: string,
  threadType: number,
): Promise<any> {
  if (!api)
    throw new Error('Not logged in')

  const result = await api.sendReaction?.(messageId, reactionIcon, threadId, threadType)
  return result
}

async function dbFetchAndUpsertUser(userId: string, retries = 3): Promise<void> {
  if (!api) {
    throw new Error('API not initialized')
  }

  let lastError: any = null

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) {
        const backoffDelay = 2000 * 2 ** (attempt - 1) // 2s, 4s, 8s
        await new Promise(resolve => setTimeout(resolve, backoffDelay))
      }

      const rawResponse = await api.getUserInfo?.(userId)
      const response = await handleZaloResponse(rawResponse)
      const userInfo = response?.changed_profiles?.[userId] || response

      const userData: any = {
        id: userId,
        zalo_name: userInfo?.zname || userInfo?.name || `User ${userId}`,
        display_name: userInfo?.dName || userInfo?.displayName || userInfo?.zname || userInfo?.name || `User ${userId}`,
        is_friend: userInfo?.isFr !== undefined ? Boolean(userInfo.isFr) : false,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }

      if (userInfo?.avatar && userInfo.avatar !== '') {
        userData.avatar_url = userInfo.avatar
      }
      else if (userInfo?.bgavatar && userInfo.bgavatar !== '') {
        userData.avatar_url = userInfo.bgavatar
      }

      if (userInfo?.dob) {
        userData.date_of_birth = new Date(Number(userInfo.dob) * 1000).toISOString()
      }

      const cleanData = Object.fromEntries(
        Object.entries(userData).filter(([_, v]) => v !== undefined && v !== null),
      )

      if (database) {
        const { created_at, ...updateData } = cleanData
        await database('zalo_users')
          .insert(cleanData)
          .onConflict('id')
          .merge(updateData)
      }
      else {
        const usersService = await getService('zalo_users')
        const existing = await usersService.readOne(userId, { fields: ['id'] }).catch(() => null)
        if (existing) {
          const { created_at, id, ...updateFields } = cleanData
          await usersService.updateOne(userId, updateFields)
        }
        else {
          await usersService.createOne(cleanData).catch(async (error: any) => {
            if (error.code === '23505') {
              const { created_at, id, ...updateFields } = cleanData
              await usersService.updateOne(userId, updateFields)
            }
            else {
              throw error
            }
          })
        }
      }

      // ✅ VERIFY USER EXISTS
      if (database) {
        const verified = await database('zalo_users')
          .where('id', userId)
          .first()
        if (!verified) {
          throw new Error(`User ${userId} verification failed after insert`)
        }
      }

      return // Success - exit retry loop
    }
    catch (error: any) {
      lastError = error
      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt))
      }
    }
  }

  if (database) {
    try {
      await database('zalo_users')
        .insert({
          id: userId,
          zalo_name: `User ${userId}`,
          display_name: `User ${userId}`,
          is_friend: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .onConflict('id')
        .ignore()
    }
    catch (fallbackError: any) {
      console.error(`❌ Fallback creation failed for ${userId}:`, fallbackError)
      throw new Error(`Cannot create user ${userId}: ${lastError?.message}`)
    }
  }
  else {
    throw lastError
  }
}
async function dbUpsertGroup(
  groupId: string,
  groupInfo: Partial<{
    name: string
    owner_id?: string
    description?: string
    avatar_url?: string
    invite_link?: string
    total_members?: number
    created_at_zalo?: string
    settings?: any
  }>,
): Promise<void> {
  if (!api) {
    console.warn('API not initialized, cannot upsert group')
    return
  }
  try {
    const groupsService = await getService('zalo_groups')
    const existing = await groupsService.readByQuery({
      filter: { id: { _eq: groupId } },
      limit: 1,
    })

    const groupData: Partial<ZaloGroup> = {
      name: groupInfo.name || `Group ${groupId}`,
      owner_id: groupInfo.owner_id || undefined,
      description: groupInfo.description || undefined,
      avatar_url: groupInfo.avatar_url || undefined,
      invite_link: groupInfo.invite_link || undefined,
      total_members: groupInfo.total_members || undefined,
      created_at_zalo: groupInfo.created_at_zalo || undefined,
      settings: groupInfo.settings || undefined,
      updated_at: new Date().toISOString(),
    }

    if (existing.length === 0) {
      await groupsService.createOne({
        id: groupId,
        ...groupData,
        created_at: new Date().toISOString(),
      })
    }
    else {
      await groupsService.updateOne(existing[0].id, groupData)
    }
  }
  catch {}
}

async function syncGroups(): Promise<boolean> {
  if (!api || typeof api.getAllGroups !== 'function')
    return false

  const response = await api.getAllGroups()

  console.log('syncGroups response:', response.gridVerMap)

  if (!response || !response.gridVerMap)
    return false

  const groupIds = Object.keys(response.gridVerMap)
  const BATCH_SIZE = 50
  const currentUserId = getCurrentUserId()

  if (!currentUserId)
    return false

  for (let i = 0; i < groupIds.length; i += BATCH_SIZE) {
    const batch = groupIds.slice(i, i + BATCH_SIZE)

    const batchPromises = batch.map(async (groupId) => {
      try {
        const response = await api.getGroupInfo?.(groupId) // ✅ Sửa lỗi cú pháp
        const groupInfo = response?.gridInfoMap?.[groupId] || response

        if (!groupInfo || !groupInfo.groupId)
          return { success: false, groupId }

        if (groupInfo.creatorId)
          await dbFetchAndUpsertUser(groupInfo.creatorId).catch(() => {})

        const groupData = {
          name: groupInfo.name || `Group ${groupId}`,
          owner_id: groupInfo.creatorId || undefined,
          description: groupInfo.desc || undefined,
          avatar_url: (groupInfo.fullAvt && groupInfo.fullAvt !== '')
            ? groupInfo.fullAvt
            : (groupInfo.avt && groupInfo.avt !== '')
                ? groupInfo.avt
                : undefined,
          invite_link: groupInfo.link || undefined,
          total_members: groupInfo.totalMember || groupInfo.numMembers || undefined,
          created_at_zalo: groupInfo.createdTime
            ? new Date(Number(groupInfo.createdTime)).toISOString()
            : undefined,
          settings: groupInfo.setting || undefined,
        }

        await dbUpsertGroup(groupId, groupData)

        // ❌ BỎ DÒNG NÀY - không sync members ngay
        // await syncGroupMembers(groupId)

        // ✅ CHỈ TẠO CONVERSATION
        await dbEnsureGroupConversation(groupId, currentUserId, true)

        console.log(`✅ Synced group ${groupId}`)
        return { success: true, groupId }
      }
      catch (error: any) {
        console.error(`❌ Failed to sync group ${groupId}:`, error.message)
        return { success: false, groupId }
      }
    })

    await Promise.allSettled(batchPromises)

    // Delay nhỏ hơn giữa các batch
    if (i + BATCH_SIZE < groupIds.length)
      await new Promise(resolve => setTimeout(resolve, 500)) // Giảm từ 1000ms xuống 500ms
  }

  console.log(`✅ Synced ${groupIds.length} groups (without members)`)
  return true
}

async function syncGroupMembers(groupId: string): Promise<void> {
  if (!api) {
    throw new Error('Zalo API not initialized')
  }

  // ✅ CHECK COOLDOWN - KHÔNG SYNC QUÁ THƯỜNG XUYÊN
  const lastSync = groupMemberSyncTimestamps.get(groupId)
  if (lastSync && (Date.now() - lastSync) < GROUP_MEMBER_SYNC_COOLDOWN) {
    console.log(`⏭️ Skipping group ${groupId} sync - synced ${Math.floor((Date.now() - lastSync) / 1000)}s ago`)
    return
  }

  try {
    const response = await api.getGroupInfo?.(groupId)
    const groupInfo = response?.gridInfoMap?.[groupId] || response

    if (!groupInfo?.memVerList)
      return

    const members = groupInfo.memVerList
      .map((memVer: string) => {
        const parts = memVer.split('-')
        if (!parts[0])
          return null
        const userId = parts[0].split(':')[0]
        return { userId }
      })
      .filter((m: any) => m?.userId)

    const BATCH_SIZE = 10 // ✅ GIẢM BATCH SIZE
    const DELAY_BETWEEN_BATCHES = 2000 // ✅ TĂNG DELAY LÊN 2S

    console.log(`Syncing ${members.length} members for group ${groupId}`)

    for (let i = 0; i < members.length; i += BATCH_SIZE) {
      const batch = members.slice(i, i + BATCH_SIZE)

      await Promise.allSettled(
        batch.map(async (member: any) => {
          try {
            await dbFetchAndUpsertUser(member.userId)
            await dbEnsureGroupMember(groupId, member.userId, true)
          }
          catch (error: any) {
            console.error(`Failed to sync member ${member.userId}:`, error.message)
          }
        }),
      )

      if (i + BATCH_SIZE < members.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES))
      }
    }

    // ✅ UPDATE TIMESTAMP
    groupMemberSyncTimestamps.set(groupId, Date.now())
    console.log(`✅ Synced ${members.length} members for group ${groupId}`)
  }
  catch (error: any) {
    console.error(`Failed to sync members for group ${groupId}:`, error.message)
  }
}

async function syncSingleGroup(groupId: string, currentUserId: string): Promise<void> {
  if (!api || typeof api.getGroupInfo !== 'function')
    return

  const response = await api.getGroupInfo?.(groupId)
  const groupInfo = response?.gridInfoMap?.[groupId] || response

  if (!groupInfo || !groupInfo.groupId)
    return

  if (groupInfo.creatorId)
    await dbFetchAndUpsertUser(groupInfo.creatorId).catch(() => {})

  const groupData = {
    name: groupInfo.name || `Group ${groupId}`,
    owner_id: groupInfo.creatorId || undefined,
    description: groupInfo.desc || undefined,
    avatar_url: (groupInfo.fullAvt && groupInfo.fullAvt !== '')
      ? groupInfo.fullAvt
      : (groupInfo.avt && groupInfo.avt !== '')
          ? groupInfo.avt
          : undefined,
    invite_link: groupInfo.link || undefined,
    total_members: groupInfo.totalMember || groupInfo.numMembers || undefined,
    created_at_zalo: groupInfo.createdTime
      ? new Date(Number(groupInfo.createdTime)).toISOString()
      : undefined,
    settings: groupInfo.setting ? {} : undefined,
  }

  await dbUpsertGroup(groupId, groupData)
  await syncGroupMembers(groupId)
  await dbEnsureGroupConversation(groupId, currentUserId, true)
}

async function reprocessFailedMessages(): Promise<void> {
  if (messageQueue.length === 0)
    return

  console.warn(`Reprocessing ${messageQueue.length} queued messages...`)
  await processMessageQueue()
}

async function initializeSyncGroups(): Promise<void> {
  if (isSyncingGroups)
    return

  isSyncingGroups = true
  syncGroupsCompleted = false

  try {
    const success = await syncGroups()
    syncGroupsCompleted = success
  }
  catch (error) {
    syncGroupsCompleted = false
  }
  finally {
    isSyncingGroups = false

    // SAU KHI BATCH XONG → REPROCESS QUEUE
    await processMessageQueue()

    // Retry sau 5 giây nếu vẫn còn message trong queue
    setTimeout(async () => {
      if (messageQueue.length > 0) {
        await reprocessFailedMessages()
      }
    }, 5000)
  }
}

async function processMessageQueue(): Promise<void> {
  if (isProcessingQueue || messageQueue.length === 0)
    return

  isProcessingQueue = true
  const failedMessages: Array<{ rawData: any, type: 'message' | 'reaction', retries?: number }> = []
  const MAX_RETRIES = 3

  try {
    while (messageQueue.length > 0) {
      const item = messageQueue.shift()
      if (!item)
        continue

      try {
        if (item.type === 'message') {
          await listenerHandleMessageDirect(item.rawData)
        }
        else if (item.type === 'reaction') {
          await listenerHandleReaction(item.rawData)
        }

        // Delay nhỏ giữa các message để tránh overload
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      catch (error) {
        console.error(` Error processing queued ${item.type}:`, error)

        // Retry logic
        const retries = (item as any).retries || 0
        if (retries < MAX_RETRIES) {
          console.warn(` Retrying message (attempt ${retries + 1}/${MAX_RETRIES})`)
          failedMessages.push({ ...item, retries: retries + 1 })
        }
        else {
          console.error(` Dropping message after ${MAX_RETRIES} retries`)
        }
      }
    }

    if (failedMessages.length > 0) {
      messageQueue.push(...failedMessages)
    }
    else {
      console.log(' All queued messages processed successfully')
    }
  }
  catch (error) {
    console.error(' Error processing message queue:', error)
  }
  finally {
    isProcessingQueue = false
  }
}

async function dbEnsureGroupMember(
  groupId: string,
  userId: string,
  isActive: boolean = true,
): Promise<void> {
  try {
    const groupMembersService = await getService('zalo_group_members')
    const existing = await groupMembersService.readByQuery({
      filter: {
        _and: [
          { group_id: { _eq: groupId } },
          { owner_id: { _eq: userId } },
        ],
      },
      limit: 1,
    })

    if (existing.length === 0) {
      await groupMembersService.createOne({
        group_id: groupId,
        owner_id: userId,
        is_active: isActive,
        joined_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
    else {
      await groupMembersService.updateOne(existing[0].id, {
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
    }
  }
  catch {}
}

async function dbEnsureGroupConversation(
  groupId: string,
  userId: string,
  createIfMissing: boolean = true,
): Promise<void> {
  try {
    const conversationId = `group${groupId}user${userId}`

    if (database) {
      const existing = await database('zalo_conversations')
        .where('id', conversationId)
        .first()

      if (existing) {
        return
      }

      if (!createIfMissing) {
        return
      }

      const groupExists = await database('zalo_groups')
        .where('id', groupId)
        .first()

      if (!groupExists) {
        console.error(` Cannot create conversation: group ${groupId} does not exist`)
        return
      }

      // Get last message if any
      let lastMessageId: string | null = null
      let lastMessageTime: string | null = null

      const messages = await database('zalo_messages')
        .where('conversation_id', conversationId)
        .orderBy('sent_at', 'desc')
        .limit(1)

      if (messages.length > 0) {
        lastMessageId = messages[0].id
        lastMessageTime = messages[0].sent_at
      }

      const now = new Date().toISOString()

      // Insert với database
      await database('zalo_conversations')
        .insert({
          id: conversationId,
          group_id: groupId,
          participant_id: userId,
          last_message_id: lastMessageId,
          last_message_time: lastMessageTime ?? now,
          last_read_message_time: null,
          unread_count: 0,
          is_archived: false,
          is_hidden: false,
          is_muted: false,
          is_pinned: false,
          settings: null,
          created_at: now,
          updated_at: now,
        })
        .onConflict('id')
        .ignore()
    }
    else {
      // ✅ FALLBACK - Sử dụng service nếu không có database
      const conversationsService = await getService('zalo_conversations')
      const existing = await conversationsService.readByQuery({
        filter: { id: { _eq: conversationId } },
        limit: 1,
      })

      if (existing.length > 0) {
        console.log(`✅ Conversation ${conversationId} exists`)
        return
      }

      if (!createIfMissing) {
        return
      }

      let lastMessageId: string | null = null
      let lastMessageTime: string | null = null

      const messagesService = await getService('zalo_messages')
      const messages = await messagesService.readByQuery({
        filter: { conversation_id: { _eq: conversationId } },
        sort: ['-sent_at'],
        limit: 1,
      })

      if (messages.length > 0) {
        lastMessageId = messages[0].id
        lastMessageTime = messages[0].sent_at
      }

      const now = new Date().toISOString()

      await conversationsService.createOne({
        id: conversationId,
        group_id: groupId,
        participant_id: userId,
        last_message_id: lastMessageId,
        last_message_time: lastMessageTime ?? now,
        last_read_message_time: null,
        unread_count: 0,
        is_archived: false,
        is_hidden: false,
        is_muted: false,
        is_pinned: false,
        settings: null,
        created_at: now,
        updated_at: now,
      })

      console.log(`✅ Created group conversation ${conversationId} (via service)`)
    }
  }
  catch (error: any) {
    console.error(`❌ Error ensuring group conversation ${groupId}:`, error.message)
    console.error(error.stack) // Debug stack trace
  }
}

async function getGroupMembers(groupId: string, activeOnly: boolean = true): Promise<ZaloGroupMember[]> {
  try {
    const groupMembersService = await getService('zalo_group_members')
    const query: any = {
      filter: { group_id: { _eq: groupId } },
      limit: -1,
    }

    if (activeOnly) {
      query.filter = {
        _and: [
          { group_id: { _eq: groupId } },
          { is_active: { _eq: true } },
        ],
      }
    }

    return await groupMembersService.readByQuery(query)
  }
  catch {
    return []
  }
}

// ============================================================================
// DATABASE - CONVERSATION OPERATIONS
// ============================================================================

async function dbUpsertConversation(
  conversationId: string,
  data: Partial<ZaloConversation>,
): Promise<void> {
  try {
    if (data.participant_id) {
      if (database) {
        const userExists = await database('zalo_users')
          .where('id', data.participant_id)
          .first()

        if (!userExists) {
          console.error(`Participant ${data.participant_id} does not exist, skipping conversation upsert`)
          return
        }
      }
    }
    const conversationsService = await getService('zalo_conversations')
    const existing = await conversationsService.readByQuery({
      filter: { id: { _eq: conversationId } },
      limit: 1,
    })

    const now = new Date().toISOString()

    if (existing.length === 0) {
      await conversationsService.createOne({
        id: conversationId,
        group_id: data.group_id || null,
        participant_id: data.participant_id || null,
        last_message_id: data.last_message_id || null,
        last_message_time: data.last_message_time || null,
        last_read_message_time: data.last_read_message_time || null,
        unread_count: data.unread_count ?? 0,
        is_archived: data.is_archived ?? false,
        is_hidden: data.is_hidden ?? false,
        is_muted: data.is_muted ?? false,
        is_pinned: data.is_pinned ?? false,
        settings: data.settings || null,
        created_at: now,
        updated_at: now,
      })
    }
    else {
      await conversationsService.updateOne(existing[0].id, {
        ...data,
        updated_at: now,
      })
    }
  }
  catch (error) {
    console.error('Error upserting conversation:', error)
  }
}

async function dbUpdateConversationLastMessage(
  conversationId: string,
  messageId: string,
  timestamp: Date,
): Promise<void> {
  try {
    const conversationsService = await getService('zalo_conversations')
    await conversationsService.updateByQuery(
      { filter: { id: { _eq: conversationId } } },
      {
        last_message_id: messageId,
        last_message_time: timestamp.toISOString(),
        updated_at: new Date().toISOString(),
      },
    )
  }
  catch {}
}

// ============================================================================
// LABEL OPERATIONS
// ============================================================================

async function labelGet(): Promise<ZaloLabel[]> {
  try {
    const labelsService = await getService('zalo_labels')
    return await labelsService.readByQuery({ limit: -1 })
  }
  catch {
    return []
  }
}

async function labelCreate(
  name: string,
  options?: { description?: string, color_hex?: string, is_system?: boolean },
): Promise<string> {
  const labelsService = await getService('zalo_labels')
  const result = await labelsService.createOne({
    name,
    description: options?.description || null,
    color_hex: options?.color_hex || null,
    is_system: options?.is_system || false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  return result.id
}

async function labelUpdate(
  labelId: string,
  data: { name?: string, description?: string, color_hex?: string },
): Promise<void> {
  const labelsService = await getService('zalo_labels')
  await labelsService.updateOne(labelId, {
    ...data,
    updated_at: new Date().toISOString(),
  })
}

async function labelDelete(labelId: string): Promise<void> {
  const labelsService = await getService('zalo_labels')
  await labelsService.deleteOne(labelId)
}

async function labelAddToConversation(conversationId: string, labelId: string): Promise<void> {
  const conversationLabelsService = await getService('zalo_conversation_labels')
  const existing = await conversationLabelsService.readByQuery({
    filter: {
      _and: [
        { conversation_id: { _eq: conversationId } },
        { label_id: { _eq: labelId } },
      ],
    },
    limit: 1,
  })

  if (existing.length === 0) {
    await conversationLabelsService.createOne({
      conversation_id: conversationId,
      label_id: labelId,
      created_at: new Date().toISOString(),
    })
  }
}

async function labelRemoveFromConversation(conversationId: string, labelId: string): Promise<void> {
  const conversationLabelsService = await getService('zalo_conversation_labels')
  const existing = await conversationLabelsService.readByQuery({
    filter: {
      _and: [
        { conversation_id: { _eq: conversationId } },
        { label_id: { _eq: labelId } },
      ],
    },
    limit: 1,
  })

  if (existing.length > 0) {
    await conversationLabelsService.deleteOne(existing[0].id)
  }
}

// ============================================================================
// QUICK MESSAGE OPERATIONS
// ============================================================================

async function quickMessageGet(activeOnly: boolean = true): Promise<ZaloQuickMessage[]> {
  try {
    const quickMessagesService = await getService('zalo_quick_messages')
    const query: any = { limit: -1 }
    if (activeOnly)
      query.filter = { is_active: { _eq: true } }

    return await quickMessagesService.readByQuery(query)
  }
  catch {
    return []
  }
}

async function quickMessageFindByKeyword(keyword: string): Promise<ZaloQuickMessage | null> {
  try {
    const quickMessagesService = await getService('zalo_quick_messages')
    const results = await quickMessagesService.readByQuery({
      filter: {
        _and: [
          { keyword: { _eq: keyword } },
          { is_active: { _eq: true } },
        ],
      },
      limit: 1,
    })
    return results.length > 0 ? results[0] : null
  }
  catch {
    return null
  }
}

async function quickMessageCreate(data: {
  keyword: string
  title: string
  content: string
  media_attachment?: string | null
  is_active?: boolean
}): Promise<string> {
  const quickMessagesService = await getService('zalo_quick_messages')
  const result = await quickMessagesService.createOne({
    ...data,
    is_active: data.is_active !== undefined ? data.is_active : true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  return result.id
}

async function quickMessageUpdate(
  id: string,
  data: {
    keyword?: string
    title?: string
    content?: string
    media_attachment?: string | null
    is_active?: boolean
  },
): Promise<void> {
  const quickMessagesService = await getService('zalo_quick_messages')
  await quickMessagesService.updateOne(id, {
    ...data,
    updated_at: new Date().toISOString(),
  })
}

async function quickMessageDelete(id: string): Promise<void> {
  const quickMessagesService = await getService('zalo_quick_messages')
  await quickMessagesService.deleteOne(id)
}

async function quickMessageHandle(
  content: string,
  _conversationId: string,
  _senderId: string,
): Promise<void> {
  try {
    const parts = content.substring(1).split(' ')
    if (parts.length === 0 || !parts[0])
      return

    const keyword = parts[0]
    const quickMessage = await quickMessageFindByKeyword(keyword)

    if (quickMessage) {
      // TODO: Send quick message response
    }
  }
  catch {}
}

// ============================================================================
// SYNC OPERATIONS
// ============================================================================

async function syncStart(conversationId: string): Promise<void> {
  try {
    const syncStatusService = await getService('zalo_sync_status')
    const existing = await syncStatusService.readByQuery({
      filter: { conversation_id: { _eq: conversationId } },
      limit: 1,
    })

    if (existing.length === 0) {
      await syncStatusService.createOne({
        conversation_id: conversationId,
        status: 'in_progress',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
    else {
      await syncStatusService.updateOne(existing[0].id, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
  }
  catch {}
}

async function syncComplete(conversationId: string, lastMessageId: string): Promise<void> {
  try {
    const syncStatusService = await getService('zalo_sync_status')
    const existing = await syncStatusService.readByQuery({
      filter: { conversation_id: { _eq: conversationId } },
      limit: 1,
    })

    if (existing.length > 0) {
      await syncStatusService.updateOne(existing[0].id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        last_message_id: lastMessageId,
        updated_at: new Date().toISOString(),
      })
    }
  }
  catch {}
}

async function syncFail(conversationId: string, error: any): Promise<void> {
  try {
    const syncStatusService = await getService('zalo_sync_status')
    const existing = await syncStatusService.readByQuery({
      filter: { conversation_id: { _eq: conversationId } },
      limit: 1,
    })

    if (existing.length > 0) {
      await syncStatusService.updateOne(existing[0].id, {
        status: 'failed',
        error_message: error.message || String(error),
        updated_at: new Date().toISOString(),
      })
    }
  }
  catch {}
}

// ============================================================================
// REDIS OPERATIONS
// ============================================================================

async function getRedisStatus() {
  return await ZaloLogin.redisGetStatus()
}

async function getRedisSession(userId?: string) {
  return await ZaloLogin.redisGetSession(userId)
}

async function getRedisKeys(pattern = '*', limit = 1000) {
  return await ZaloLogin.redisGetKeys(pattern, limit)
}

async function getRedisValue(key: string) {
  return await ZaloLogin.redisGet(key)
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  dbEnsureGroupConversation,
  dbEnsureGroupMember,

  // Database - User Operations
  dbFetchAndUpsertUser,
  dbUpdateConversationLastMessage,
  // Database - Conversation Operations
  dbUpsertConversation,
  // Database - Group Operations
  dbUpsertGroup,

  // API Management
  getApi,
  getCurrentUserId,

  getGroupMembers,
  getLoginStatus,

  getRedisKeys,
  getRedisSession,

  // Redis Operations
  getRedisStatus,

  getRedisValue,
  // Initialization
  init,
  initialize,
  initializeSyncGroups,
  labelAddToConversation,
  labelCreate,
  labelDelete,

  // Label Operations
  labelGet,
  labelRemoveFromConversation,

  labelUpdate,
  listenerHandleReactionQueued,
  // Listener Management
  listenerStart,
  listenerStop,
  onSessionImported,
  processMessageQueue,
  quickMessageCreate,
  quickMessageDelete,
  quickMessageFindByKeyword,
  // Quick Message Operations
  quickMessageGet,
  quickMessageUpdate,
  reprocessFailedMessages,
  // Message Operations
  sendMessage,

  sendReaction,
  // Session Management
  sessionTryRestore,
  setApi,

  syncComplete,
  syncFail,
  syncGroupMembers,
  syncGroups,
  syncSingleGroup,

  // Sync Operations
  syncStart,
}
