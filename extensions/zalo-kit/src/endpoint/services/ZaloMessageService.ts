import type { SchemaOverview } from '@directus/types'
import type { ZaloConversation, ZaloGroup, ZaloGroupMember, ZaloLabel, ZaloQuickMessage } from '../../type'
import * as ZaloLogin from './ZaloLoginService'

// Module state
let api: any = null
let getSchemaFn: (() => Promise<SchemaOverview>) | null = null
let ItemsService: any = null
let database: any = null

// Schema cache
let schema: SchemaOverview | null = null
const serviceCache: { [key: string]: any } = {}
let isSchemaLoading = false

// Listener state
let listenerIsStarted = false
let listenerReconnectAttempts = 0
const listenerMaxReconnectAttempts = 5
const listenerReconnectDelay = 5000

// Session restore state
let sessionIsRestoring = false

// System accountability
const systemAccountability = { admin: true, role: null, user: null }

export function init(
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

export function initialize(
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

export function getApi(): any {
  return api
}

export function setApi(newApi: any): void {
  if (api && listenerIsStarted)
    listenerStop()
  api = newApi
}

export function getCurrentUserId(): string | null {
  if (!api)
    return null
  return api.getCurrentUserId?.() || api.getOwnId?.() || null
}

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

export function getLoginStatus() {
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

export async function sessionTryRestore(): Promise<void> {
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

export async function onSessionImported(result: any): Promise<void> {
  try {
    if (!result.ok)
      return

    api = result.api
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

export async function listenerStart(): Promise<void> {
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

export function listenerStop(): void {
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
  let conversationId: string | null = null
  try {
    const msgData = rawData.data || rawData.message || rawData
    const message = msgData
    const messageId = message.msgId || rawData.msgId
    const senderId = message.uidFrom || rawData.uidFrom || message.senderId || rawData.senderId
    const receiverId = message.idTo || rawData.idTo || message.receiverId || rawData.receiverId
    const threadId = rawData.threadId || message.threadId

    if (!messageId)
      return

    const currentUserId = getCurrentUserId()
    if (!currentUserId)
      return

    if (database) {
      const existingMessage = await database('zalo_messages').where('id', messageId).first()
      if (existingMessage)
        return
    }

    if (senderId)
      await dbFetchAndUpsertUser(senderId)
    if (!threadId)
      return

    let isGroupMessage = false
    let existingConversation: any = null

    if (database) {
      const possibleConversationIds = [
        `group_${threadId}_user_${currentUserId}`,
        `direct_${threadId}_${currentUserId}`,
        `direct_${currentUserId}_${threadId}`,
      ]

      const conversations = await database('zalo_conversations')
        .whereIn('id', possibleConversationIds)
        .select(['id', 'group_id', 'participant_id'])
        .limit(3)

      if (conversations.length > 0) {
        existingConversation = conversations[0]
        isGroupMessage = existingConversation.group_id != null
      }
      else {
        const groups = await database('zalo_groups').where('id', threadId).select(['id']).limit(1)
        isGroupMessage = groups.length > 0
      }
    }

    let otherUserId: string | null = null

    if (isGroupMessage && threadId) {
      conversationId = `group_${threadId}_user_${currentUserId}`

      if (database) {
        const existingGroups = await database('zalo_groups')
          .where('id', threadId)
          .select(['id', 'name'])
          .limit(1)

        if (existingGroups.length === 0) {
          await dbUpsertGroup(threadId, { name: msgData.dName || `Group ${threadId}` })
        }
      }

      if (senderId && senderId !== currentUserId)
        await dbEnsureGroupMember(threadId, senderId, true)
      await dbEnsureGroupMember(threadId, currentUserId, true)
      await dbEnsureGroupConversation(threadId, currentUserId, true)
    }
    else {
      if (receiverId && receiverId !== currentUserId) {
        otherUserId = receiverId
      }
      else if (threadId && threadId !== currentUserId) {
        otherUserId = threadId
      }
      else if (senderId && senderId !== currentUserId) {
        otherUserId = senderId
      }

      if (!otherUserId)
        return

      const participants = [otherUserId, currentUserId].sort()
      conversationId = `direct_${participants[0]}_${participants[1]}`

      await dbFetchAndUpsertUser(otherUserId)
      await dbUpsertConversation(conversationId, {
        participant_id: otherUserId,
        group_id: undefined,
        is_hidden: false,
      })
    }

    if (!conversationId)
      return

    await syncStart(conversationId)

    const content = message.content || message.desc || rawData.content || ''
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
        await database('zalo_messages').insert(dbMessageData).onConflict('id').ignore()
      }
      else {
        throw new Error('Database not initialized')
      }
    }
    catch (insertError: any) {
      if (insertError.code === '23505' || insertError.message?.includes('duplicate')) {
        return
      }
      else {
        throw insertError
      }
    }

    if (database) {
      await database('zalo_conversations').where('id', conversationId).update({
        last_message_id: messageId,
        last_message_time: sentAt,
        updated_at: now,
      })
    }

    await syncComplete(conversationId, messageId)

    if (typeof content === 'string' && content.startsWith('/')) {
      await quickMessageHandle(content, conversationId, senderId)
    }
  }
  catch (error: any) {
    if (conversationId)
      await syncFail(conversationId, error)
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

export async function sendMessage(
  content: { msg: string },
  threadId: string,
  threadType: number,
): Promise<any> {
  if (!api)
    throw new Error('Not logged in')

  const result = await api.sendMessage(content, threadId, threadType)
  return result
}

export async function sendReaction(
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

export async function dbFetchAndUpsertUser(userId: string): Promise<void> {
  if (!api)
    return

  const usersService = await getService('zalo_users')
  const existing = await usersService.readOne(userId, { fields: ['id'] }).catch(() => null)

  try {
    const response = await api.getUserInfo?.(userId)
    const userInfo = response?.changed_profiles?.[userId] || response

    if (!userInfo || !userInfo.userId)
      return

    const userData: any = {
      id: userId,
      zalo_name: userInfo.zname || userInfo.name || `User ${userId}`,
      display_name: userInfo.dName || userInfo.displayName || userInfo.zname || userInfo.name || `User ${userId}`,
      avatar_url: (userInfo.avatar && userInfo.avatar !== '')
        ? userInfo.avatar
        : (userInfo.bgavatar && userInfo.bgavatar !== '')
            ? userInfo.bgavatar
            : undefined,
      gender: userInfo.gender !== undefined ? userInfo.gender : undefined,
      date_of_birth: userInfo.dob ? new Date(Number(userInfo.dob) * 1000).toISOString() : undefined,
      phone_number: userInfo.phoneNumber || undefined,
      is_friend: userInfo.isFr !== undefined ? Boolean(userInfo.isFr) : false,
      updated_at: new Date().toISOString(),
    }

    if (!existing) {
      userData.created_at = new Date().toISOString()
      try {
        await usersService.createOne(userData)
      }
      catch (createError: any) {
        if (createError.message?.includes('unique') || createError.message?.includes('duplicate')) {
          await usersService.updateOne(userId, userData)
        }
        else {
          throw createError
        }
      }
    }
    else {
      await usersService.updateOne(userId, userData)
    }
  }
  catch {
    if (!existing) {
      try {
        await usersService.createOne({
          id: userId,
          zalo_name: `User ${userId}`,
          display_name: `User ${userId}`,
          is_friend: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      }
      catch (createError: any) {
        if (!createError.message?.includes('unique') && !createError.message?.includes('duplicate')) {
          throw createError
        }
      }
    }
  }
}

export async function dbUpsertGroup(
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

export async function syncGroups(): Promise<void> {
  try {
    if (!api || typeof api.getAllGroups !== 'function')
      return

    const response = await api.getAllGroups()
    if (!response || !response.gridVerMap)
      return

    const gridVerMap = response.gridVerMap
    const groupIds = Object.keys(gridVerMap)
    const BATCH_SIZE = 50
    const currentUserId = getCurrentUserId()
    if (!currentUserId)
      return

    for (let i = 0; i < groupIds.length; i += BATCH_SIZE) {
      const batch = groupIds.slice(i, i + BATCH_SIZE)
      const batchPromises = batch.map(async (groupId) => {
        try {
          const response = await api.getGroupInfo?.(groupId)
          const groupInfo = response?.gridInfoMap?.[groupId] || response

          if (!groupInfo || !groupInfo.groupId)
            return

          if (groupInfo.creatorId) {
            try {
              await dbFetchAndUpsertUser(groupInfo.creatorId)
            }
            catch {}
          }

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
            settings: groupInfo.setting
              ? {
                  type: groupInfo.type,
                  subType: groupInfo.subType,
                  visibility: groupInfo.visibility,
                  maxMember: groupInfo.maxMember,
                  e2ee: groupInfo.e2ee,
                  blockName: groupInfo.setting.blockName,
                  signAdminMsg: groupInfo.setting.signAdminMsg,
                  addMemberOnly: groupInfo.setting.addMemberOnly,
                  setTopicOnly: groupInfo.setting.setTopicOnly,
                  enableMsgHistory: groupInfo.setting.enableMsgHistory,
                  lockCreatePost: groupInfo.setting.lockCreatePost,
                  lockCreatePoll: groupInfo.setting.lockCreatePoll,
                  lockSendMsg: groupInfo.setting.lockSendMsg,
                  lockViewMember: groupInfo.setting.lockViewMember,
                  joinAppr: groupInfo.setting.joinAppr,
                  bannFeature: groupInfo.setting.bannFeature,
                  dirtyMedia: groupInfo.setting.dirtyMedia,
                  banDuration: groupInfo.setting.banDuration,
                }
              : undefined,
          }

          await dbUpsertGroup(groupId, groupData)
          await syncGroupMembers(groupId)
          await dbEnsureGroupConversation(groupId, currentUserId, true)
        }
        catch {}
      })

      await Promise.allSettled(batchPromises)
      if (i + BATCH_SIZE < groupIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }
  catch {}
}

export async function syncGroupMembers(groupId: string): Promise<void> {
  if (!api)
    throw new Error('Zalo API not initialized')

  const response = await api.getGroupInfo?.(groupId)
  const groupInfo = response?.gridInfoMap?.[groupId] || response

  if (!groupInfo || !groupInfo.groupId)
    return
  if (!groupInfo.memVerList || !Array.isArray(groupInfo.memVerList))
    return

  const members = groupInfo.memVerList
    .map((memVer: string) => {
      const parts = memVer.split('|')
      if (!parts[0])
        return null
      const userId = parts[0].split('_')[0]
      return { userId }
    })
    .filter((m: any) => m && m.userId && /^\d+$/.test(m.userId))

  const BATCH_SIZE = 50
  const DELAY_BETWEEN_BATCHES = 2000

  for (let i = 0; i < members.length; i += BATCH_SIZE) {
    const batch = members.slice(i, i + BATCH_SIZE)

    for (const member of batch) {
      const userId = member.userId
      try {
        await dbFetchAndUpsertUser(userId)
        await dbEnsureGroupMember(groupId, userId, true)
      }
      catch {}
    }

    if (i + BATCH_SIZE < members.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES))
    }
  }
}

export async function dbEnsureGroupMember(
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

export async function dbEnsureGroupConversation(
  groupId: string,
  userId: string,
  createIfMissing: boolean = true,
): Promise<void> {
  try {
    const conversationId = `group_${groupId}_user_${userId}`
    const conversationsService = await getService('zalo_conversations')
    const existing = await conversationsService.readByQuery({
      filter: { id: { _eq: conversationId } },
      limit: 1,
    })

    if (existing.length === 0 && createIfMissing) {
      await conversationsService.createOne({
        id: conversationId,
        group_id: groupId,
        participant_id: userId,
        is_hidden: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
  }
  catch {}
}

export async function getGroupMembers(groupId: string, activeOnly: boolean = true): Promise<ZaloGroupMember[]> {
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

export async function dbUpsertConversation(
  conversationId: string,
  data: Partial<ZaloConversation>,
): Promise<void> {
  try {
    const conversationsService = await getService('zalo_conversations')
    const existing = await conversationsService.readByQuery({
      filter: { id: { _eq: conversationId } },
      limit: 1,
    })

    if (existing.length === 0) {
      await conversationsService.createOne({
        id: conversationId,
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
    else {
      await conversationsService.updateOne(existing[0].id, {
        ...data,
        updated_at: new Date().toISOString(),
      })
    }
  }
  catch {}
}

export async function dbUpdateConversationLastMessage(
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

export async function labelGet(): Promise<ZaloLabel[]> {
  try {
    const labelsService = await getService('zalo_labels')
    return await labelsService.readByQuery({ limit: -1 })
  }
  catch {
    return []
  }
}

export async function labelCreate(
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

export async function labelUpdate(
  labelId: string,
  data: { name?: string, description?: string, color_hex?: string },
): Promise<void> {
  const labelsService = await getService('zalo_labels')
  await labelsService.updateOne(labelId, {
    ...data,
    updated_at: new Date().toISOString(),
  })
}

export async function labelDelete(labelId: string): Promise<void> {
  const labelsService = await getService('zalo_labels')
  await labelsService.deleteOne(labelId)
}

export async function labelAddToConversation(conversationId: string, labelId: string): Promise<void> {
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

export async function labelRemoveFromConversation(conversationId: string, labelId: string): Promise<void> {
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

export async function quickMessageGet(activeOnly: boolean = true): Promise<ZaloQuickMessage[]> {
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

export async function quickMessageFindByKeyword(keyword: string): Promise<ZaloQuickMessage | null> {
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

export async function quickMessageCreate(data: {
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

export async function quickMessageUpdate(
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

export async function quickMessageDelete(id: string): Promise<void> {
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

export async function syncStart(conversationId: string): Promise<void> {
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

export async function syncComplete(conversationId: string, lastMessageId: string): Promise<void> {
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

export async function syncFail(conversationId: string, error: any): Promise<void> {
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
