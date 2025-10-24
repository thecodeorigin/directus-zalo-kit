import type { SchemaOverview } from '@directus/types'
import Redis from 'ioredis'
import { match, P } from 'ts-pattern'
import { LoginQRCallbackEventType, ThreadType, Zalo } from 'zca-js'

interface ZaloSession {
  userId: string
  loginTime: string
  isActive: boolean
  imei?: string
  userAgent?: string
  cookies?: any[]
}

export class ZaloService {
  private static instance: ZaloService | null = null
  private zalo = new Zalo({ selfListen: true, checkUpdate: false })
  private api: any = null
  private getSchemaFn: () => Promise<SchemaOverview>
  private ItemsService: any
  private redis: Redis | null = null

  private status: 'logged_out' | 'pending_qr' | 'logged_in' = 'logged_out'
  private qrCode: string | null = null
  private loginResolver: ((value: any) => void) | null = null
  private listenerStarted = false
  private reconnectAttempts = 0
  private readonly maxReconnectAttempts = 5
  private readonly reconnectDelay = 5000
  private isRestoringSession = false

  private readonly systemAccountability = {
    admin: true,
    role: null,
    user: null,
  }

  private pendingLoginData: {
    imei?: string
    userAgent?: string
    cookies?: any[]
  } | null = null

  private keepAliveInterval: NodeJS.Timeout | null = null

  private constructor(
    getSchemaFn: () => Promise<SchemaOverview>,
    ItemsService: any,
  ) {
    this.getSchemaFn = getSchemaFn
    this.ItemsService = ItemsService

    this.zalo = new Zalo({ selfListen: true, checkUpdate: false })

    this.initializeRedis()
    console.log('[ZaloService] Initialized')

    setTimeout(() => {
      void this.tryRestoreSession()
    }, 10000)
  }

  private getRedisKey(userId: string): string {
    return `zalo:session:${userId}`
  }

  private async cleanup() {
    if (this.api?.listener) {
      try {
        this.api.listener.stop()
        console.log('[ZaloService] Listener stopped during cleanup')
      }
      catch (err) {
        console.error(
          '[ZaloService] Error stopping listener during cleanup:',
          err,
        )
      }
    }
    this.api = null
    this.listenerStarted = false
    this.status = 'logged_out'
    this.qrCode = null
    this.loginResolver = null
    this.reconnectAttempts = 0
  }

  public static init(
    getSchemaFn: () => Promise<SchemaOverview>,
    ItemsService: any,
  ): ZaloService {
    if (ZaloService.instance) {
      console.warn(
        '[ZaloService] Instance already exists, cleaning up and reinitializing',
      )
      if (ZaloService.instance.api?.listener) {
        try {
          ZaloService.instance.api.listener.stop()
          console.log('[ZaloService] Listener stopped during cleanup')
        }
        catch (err) {
          console.error(
            '[ZaloService] Error stopping listener during cleanup:',
            err,
          )
        }
      }
      ZaloService.instance = null
    }
    ZaloService.instance = new ZaloService(getSchemaFn, ItemsService)
    return ZaloService.instance
  }

  public static getInstance(): ZaloService {
    if (!ZaloService.instance) {
      throw new Error('ZaloService has not been initialized')
    }
    return ZaloService.instance
  }

  private initializeRedis(): void {
    if (!process.env.REDIS_HOST)
      return

    try {
      this.redis = new Redis({
        host: process.env.REDIS_HOST,
        port: Number.parseInt(process.env.REDIS_PORT ?? '6379'),
      })

      this.redis.on('error', (err) => {
        console.error('[ZaloService] Redis connection error:', err.message)
        this.redis = null
      })

      console.log('[ZaloService] Redis client initialized')
    }
    catch (err: any) {
      console.error('[ZaloService] Failed to initialize Redis:', err.message)
      this.redis = null
    }
  }

  private async tryRestoreSession(userId?: string): Promise<void> {
    if (this.isRestoringSession) {
      console.log(
        '[ZaloService] Session restore already in progress, skipping',
      )
      return
    }
    this.isRestoringSession = true

    try {
      console.log('[ZaloService] Checking for existing sessions...')

      if (userId) {
        const session = await this.loadSession(userId)
        if (session && this.isValidSession(session)) {
          await this.restoreLoginFromSession(session)
        }
        return
      }

      // Restore all sessions
      const sessions = await this.listAllSessions()
      console.log(
        `[ZaloService] Found ${sessions.length} session(s) to restore`,
      )

      for (const session of sessions) {
        if (this.isValidSession(session)) {
          console.log(
            `[ZaloService] Restoring session for user: ${session.userId}`,
          )
          await this.restoreLoginFromSession(session)
        }
      }
    }
    finally {
      this.isRestoringSession = false
    }
  }

  private async loadSession(userId?: string): Promise<ZaloSession | null> {
    if (!userId) {
      const sessions = await this.listAllSessions()
      return sessions.length > 0 && sessions[0] !== undefined
        ? sessions[0]
        : null
    }

    const redisKey = this.getRedisKey(userId)
    if (this.redis) {
      try {
        console.log(`[ZaloService] Checking Redis for user ${userId}...`)
        const raw = await this.redis.get(redisKey)
        if (raw && raw.trim() !== '') {
          const session = JSON.parse(raw)
          console.log(`[ZaloService] Redis session loaded for ${userId}`)
          return session
        }
      }
      catch (err: any) {
        console.error(
          `[ZaloService] Error reading Redis for ${userId}:`,
          err.message,
        )
      }
    }

    return null
  }

  public async listAllSessions(): Promise<ZaloSession[]> {
    const sessions: ZaloSession[] = []
    const seenUserIds = new Set<string>()

    // Load from Redis
    if (this.redis) {
      try {
        const keys = await this.redis.keys('zalo:session:*')
        for (const key of keys) {
          const raw = await this.redis.get(key)
          if (raw) {
            try {
              const session = JSON.parse(raw)
              if (session.userId && !seenUserIds.has(session.userId)) {
                sessions.push(session)
                seenUserIds.add(session.userId)
              }
            }
            catch {
              console.error(`[ZaloService] Failed to parse Redis key ${key}`)
            }
          }
        }
      }
      catch (err) {
        console.error('[ZaloService] Error listing Redis sessions:', err)
      }
    }

    return sessions
  }

  private isValidSession(session: ZaloSession): boolean {
    if (!session) {
      console.warn('[ZaloService] Session object is null/undefined')
      return false
    }

    if (
      !session.cookies
      || !Array.isArray(session.cookies)
      || session.cookies.length === 0
    ) {
      console.warn('[ZaloService] Session missing or empty cookies array')
      return false
    }

    if (!session.imei || typeof session.imei !== 'string') {
      console.warn('[ZaloService] Session missing valid imei')
      return false
    }

    if (!session.userAgent || typeof session.userAgent !== 'string') {
      console.warn('[ZaloService] Session missing valid userAgent')
      return false
    }

    console.log('[ZaloService] Session validation passed')
    return true
  }

  private extractUserIdFromCookies(cookies: any[]): string | null {
    if (!Array.isArray(cookies))
      return null

    const targetCookie = cookies.find(
      c => c.key === 'zpw_sek' || c.key === 'zpsid',
    )
    if (!targetCookie)
      return null

    const parts = targetCookie.value.split('.')
    if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
      return parts[1]
    }
    return null
  }

  private async restoreLoginFromSession(session: ZaloSession): Promise<void> {
    try {
      console.log('[ZaloService] Attempting login with saved session...')

      if (!session.cookies || !Array.isArray(session.cookies)) {
        throw new Error('Session cookies are missing or invalid')
      }
      if (this.api?.listener) {
        try {
          this.api.listener.stop()
          console.log('[ZaloService] Stopped existing listener before restore')
          await new Promise(resolve => setTimeout(resolve, 500))
        }
        catch (err) {
          console.error('[ZaloService] Error stopping listener:', err)
        }
      }
      this.api = await this.zalo.login({
        cookie: session.cookies as any[],
        imei: session.imei!,
        userAgent: session.userAgent!,
      })

      let id = this.api?.getOwnId?.()
      if (!id) {
        id = this.extractUserIdFromCookies(session.cookies || []) || null
      }
      if (!id) {
        throw new Error('Restored api has no own id')
      }

      if (id !== session.userId) {
        const oldId = session.userId
        console.warn(
          `[ZaloService] ID mismatch! Saved: ${session.userId}, API: ${id}. Updating to API value.`,
        )
        session.userId = id
        await this.saveSession(session)
        this.backupAndDeleteSession(oldId)
      }

      this.status = 'logged_in'
      console.log(`[ZaloService] Restored session for user: ${id}`)
      this.startListener()
      this.startKeepAlive()

      try {
        await this.fetchAndUpsertUser(id)
        await this.syncGroupAvatars()
      }
      catch (err) {
        console.warn('[ZaloService] Sync after session restore failed:', err)
      }
    }
    catch (err: any) {
      console.error('[ZaloService] Restore login failed:', err.message)
      this.backupAndDeleteSession(session.userId)
    }
  }

  private backupAndDeleteSession(userId: string): void {
    console.log(
      '[ZaloService] Backing up and deleting session for user:',
      userId,
    )
    const redisKey = this.getRedisKey(userId)
    if (this.redis) {
      try {
        this.redis.del(redisKey)
        console.log(
          '[ZaloService] Session deleted from Redis for user:',
          userId,
        )
      }
      catch (err: any) {
        console.error(
          '[ZaloService] Failed to delete session from Redis for user:',
          userId,
          err.message,
        )
      }
    }
  }

  private async saveSession(session: ZaloSession): Promise<void> {
    const sessionJson = JSON.stringify(session, null, 2)
    const userId = session.userId
    const redisKey = this.getRedisKey(session.userId)

    if (this.redis) {
      try {
        await this.redis.set(redisKey, sessionJson)
        console.log(`[ZaloService] Session saved to Redis: ${userId}`)

        const verifyRaw = await this.redis.get(redisKey)
        if (verifyRaw) {
          JSON.parse(verifyRaw)
          console.log(`[ZaloService] Session verified in Redis for ${userId}`)
        }
      }
      catch (err: any) {
        console.error(
          `[ZaloService] Error saving session to Redis for ${userId}:`,
          err.message,
        )
      }
    }
  }

  public getStatus() {
    return {
      status: this.status,
      qrCode: this.qrCode,
      isListening: this.listenerStarted,
      userId: this.api?.getOwnId?.() || null,
    }
  }

  public async initiateLogin(): Promise<any> {
    if (this.status !== 'logged_out') {
      return this.getStatus()
    }

    this.status = 'pending_qr'
    return new Promise<any>((resolve, reject) => {
      this.loginResolver = resolve

      const timeout = setTimeout(() => {
        reject(new Error('Login timeout'))
        this.reset()
      }, 120000)

      this.zalo
        .loginQR({}, async (response: any) => {
          await this.handleLoginQRCallback(response)
        })
        .then(async (api: any) => {
          clearTimeout(timeout)
          await this.handleLoginSuccess(api)
          if (this.loginResolver) {
            this.loginResolver(this.getStatus())
          }
          resolve(this.getStatus())
        })
        .catch((err: any) => {
          clearTimeout(timeout)
          console.error('[ZaloService] Login failed:', err)
          this.reset()
          reject(err)
        })
    })
  }

  private async handleLoginQRCallback(response: any): Promise<void> {
    match(response)
      .with(
        {
          type: LoginQRCallbackEventType.QRCodeGenerated,
          data: { image: P.select(P.string) },
        },
        (qrImage) => {
          this.qrCode = qrImage
          if (this.loginResolver) {
            this.loginResolver(this.getStatus())
          }
        },
      )
      .with({ type: LoginQRCallbackEventType.QRCodeExpired }, () => {
        console.log('[ZaloService] QR code expired')
        this.reset()
      })
      .with({ type: LoginQRCallbackEventType.QRCodeDeclined }, () => {
        console.log('[ZaloService] QR code declined')
        this.reset()
      })
      .with(
        { type: LoginQRCallbackEventType.GotLoginInfo, data: P.select() },
        async (loginData) => {
          await this.handleGotLoginInfo(loginData)
        },
      )
      .otherwise(() => {
        console.log('[ZaloService] Login event:', response.type)
      })
  }

  private async handleGotLoginInfo(loginData: any): Promise<void> {
    try {
      const cookies = loginData?.cookie ?? loginData?.cookies ?? null
      const imei = loginData?.imei
      const userAgent = loginData?.userAgent
      if (
        !cookies
        || !Array.isArray(cookies)
        || cookies.length === 0
        || !imei
        || !userAgent
      ) {
        console.warn(
          '[ZaloService] Skipping GotLoginInfo: missing cookies/imei/userAgent',
        )
        return
      }
      this.pendingLoginData = {
        imei,
        userAgent,
        cookies,
      }

      console.log(
        '[ZaloService]  Login credentials stored temporarily, waiting for API initialization',
      )
    }
    catch (e: any) {
      console.warn('[ZaloService] GotLoginInfo handling failed:', e.message)
    }
  }

  private async handleLoginSuccess(api: any): Promise<void> {
    this.api = api
    this.status = 'logged_in'
    this.qrCode = null

    if (!this.pendingLoginData) {
      console.error('[ZaloService]  No pending login data available!')
      this.startListener()
      return
    }

    const userId = this.api?.getOwnId?.()

    if (!userId) {
      console.error('[ZaloService]  Could not get userId from API')
      this.pendingLoginData = null
      this.startListener()
      this.startKeepAlive()
      return
    }

    console.log(`[ZaloService] Using userId from API: ${userId}`)
    if (!userId || !/^\d+$/.test(userId)) {
      console.error(`[ZaloService]  Invalid userId format: ${userId}`)
      this.pendingLoginData = null
      this.startListener()
      this.startKeepAlive()
      return
    }

    if (userId.length < 8 || userId.length > 20) {
      console.warn(
        `[ZaloService]  Skip saving - userId length unusual: ${userId} (${userId.length} chars)`,
      )
      this.pendingLoginData = null
      this.startListener()
      this.startKeepAlive()
      return
    }

    console.log(
      `[ZaloService]  userId validation passed: ${userId} (${userId.length} chars)`,
    )
    console.log(`[ZaloService] Login successful for user: ${userId}`)

    const session: ZaloSession = {
      userId,
      loginTime: new Date().toISOString(),
      isActive: true,
      imei: this.pendingLoginData.imei!,
      userAgent: this.pendingLoginData.userAgent!,
      cookies: this.pendingLoginData.cookies!,
    }

    console.log(`[ZaloService] Session info: userId=${userId}`)

    if (
      !session.imei
      || !session.userAgent
      || !session.cookies
      || session.cookies.length === 0
    ) {
      console.error(
        '[ZaloService]  Session validation failed - pendingLoginData incomplete:',
        {
          hasImei: !!session.imei,
          hasUserAgent: !!session.userAgent,
          cookiesCount: session.cookies?.length || 0,
        },
      )
      this.pendingLoginData = null
      this.startListener()
      this.startKeepAlive()
      return
    }

    await this.saveSession(session)
    console.log(`[ZaloService]  Session saved successfully for ${userId}`)

    this.pendingLoginData = null

    this.startListener()
    this.startKeepAlive()

    console.log('Waiting for API to stabilize ....')
    await new Promise(resolve => setTimeout(resolve, 2000))

    try {
      if (!this.api) {
        console.error('[ZaloService] API is not initialized after login success')
        return
      }

      if (typeof this.api.getAllGroups !== 'function') {
        console.error('[ZaloService] API does not have getAllGroups function')
        console.error('[ZaloService] Available API methods:', Object.keys(this.api || {}))
        return
      }

      console.log('[ZaloService] API validation passed, starting sync...')

      // Sync user info
      await this.fetchAndUpsertUser(userId)
      console.log('[ZaloService] User info synced')

      // Sync groups
      console.log('[ZaloService] Starting group sync...')
      await this.syncGroupAvatars()
      console.log('[ZaloService] Group sync completed successfully')
    }
    catch (err: any) {
      console.error('[ZaloService] Sync after login failed:', err.message)
      console.error('[ZaloService] Error stack:', err.stack)
      console.error('[ZaloService] API state:', {
        hasApi: !!this.api,
        apiType: typeof this.api,
        hasGetAllGroups: typeof this.api?.getAllGroups,
        hasGetGroupInfo: typeof this.api?.getGroupInfo,
      })
    }
  }

  public async importSessionFromExtractor(
    imei: string,
    userAgent: string,
    cookies: any[],
  ): Promise<{ ok: boolean, userId: string }> {
    if (
      !imei
      || !userAgent
      || !Array.isArray(cookies)
      || cookies.length === 0
    ) {
      throw new Error('imei, userAgent, and cookies are required')
    }

    try {
      console.log('[ZaloService] Logging in using imported extractor data...')
      const api = await this.zalo.login({
        cookie: cookies,
        imei,
        userAgent,
      })

      this.api = api
      this.status = 'logged_in'
      this.qrCode = null

      let uid = this.api?.getOwnId?.()
      if (!uid) {
        uid = this.extractUserIdFromCookies(cookies) || 'unknown'
        console.warn(
          `[ZaloService] getOwnId() failed, fell back to cookie: ${uid}`,
        )
      }
      if (!uid || uid === 'unknown' || uid.length < 10) {
        throw new Error('Invalid user ID after login; check credentials')
      }

      console.log(`[ZaloService] Login successful (import) for ${uid}`)

      const session: ZaloSession = {
        userId: uid,
        loginTime: new Date().toISOString(),
        isActive: true,
        imei,
        userAgent,
        cookies,
      }

      await this.saveSession(session)
      this.startListener()
      this.startKeepAlive()
      try {
        await this.fetchAndUpsertUser(uid)
        await this.syncGroupAvatars()
      }
      catch (err) {
        console.warn('[ZaloService] Sync after import failed:', err)
      }

      return { ok: true, userId: uid }
    }
    catch (err: any) {
      console.error(
        '[ZaloService] Import session from extractor failed:',
        err.message,
      )
      this.api = null
      this.status = 'logged_out'
      throw err
    }
  }

  public async logout(userId?: string): Promise<void> {
    const targetUserId = userId || this.api.getOwnId()

    let finalUserId = targetUserId
    if (!finalUserId) {
      const sessions = await this.listAllSessions()
      if (sessions.length > 0 && sessions[0]) {
        finalUserId = sessions[0].userId
        console.log(
          `[ZaloService] No userId provided, using first session: ${finalUserId}`,
        )
      }
    }

    if (!finalUserId) {
      console.warn('[ZaloService] No userId found to logout')
      return
    }

    const currentUserId = this.api.getOwnId()
    const isCurrentSession = currentUserId === finalUserId

    if (this.api && isCurrentSession) {
      try {
        if (this.api.listener) {
          this.api.listener.stop()
          console.log(
            `[ZaloService] Listener stopped during logout for ${finalUserId}`,
          )
        }
        await this.api.logout?.()
      }
      catch (err: any) {
        console.warn(
          `[ZaloService] Error during API logout for ${finalUserId}:`,
          err,
        )
      }
      finally {
        await this.cleanup()
      }
    }

    try {
      const redisKey = this.getRedisKey(finalUserId)

      if (this.redis) {
        try {
          const deleted = await this.redis.del(redisKey)
          if (deleted > 0) {
            console.log(
              `[ZaloService]  Session deleted from Redis: ${finalUserId}`,
            )
          }
          else {
            console.log(
              `[ZaloService] No Redis session found for ${finalUserId}`,
            )
          }
        }
        catch (err: any) {
          console.error(
            `[ZaloService] Error deleting from Redis for ${finalUserId}:`,
            err.message,
          )
        }
      }
    }
    catch (err: any) {
      console.error(
        `[ZaloService] Error cleaning up session for ${finalUserId}:`,
        err.message,
      )
      throw err
    }
  }

  private reset() {
    this.api = null
    this.status = 'logged_out'
    this.qrCode = null
    this.loginResolver = null
    this.listenerStarted = false
    this.reconnectAttempts = 0
    this.pendingLoginData = null
  }

  public async getSessionInfo(): Promise<{
    userId: string | null
    loginTime: string | null
    isActive: boolean
  } | null> {
    try {
      const session = await this.loadSession()
      if (!session)
        return null

      return {
        userId: session.userId || null,
        loginTime: session.loginTime || null,
        isActive: session.isActive ?? false,
      }
    }
    catch (err: any) {
      console.error('[ZaloService] getSessionInfo error:', err.message)
      return null
    }
  }

  private startListener() {
    if (!this.api || this.listenerStarted)
      return

    this.listenerStarted = true
    try {
      this.api.listener
        .on('message', async (msg: any) => {
          try {
            await this.handleIncomingMessage(msg.data || msg)
          }
          catch (error) {
            console.error('[ZaloService] Error handling message:', error)
          }
        })
        .on('reaction', async (react: any) => {
          try {
            await this.handleIncomingReaction(react.data || react)
          }
          catch (error) {
            console.error('[ZaloService] Error handling reaction:', error)
          }
        })
        .on('error', async (error: any) => {
          console.error('[ZaloService] Listener error:', error)
          this.handleListenerError()
        })
        .start()

      this.reconnectAttempts = 0
    }
    catch (err) {
      this.listenerStarted = false
      console.error('[ZaloService] startListener failed:', err)
      this.handleListenerError()
    }
  }

  private startKeepAlive() {
    if (this.keepAliveInterval)
      return
    this.keepAliveInterval = setInterval(async () => {
      if (this.status !== 'logged_in' || !this.api)
        return
      try {
        const ownId = this.api.getOwnId()
        if (ownId) {
          await this.api.getUserInfo(ownId)
        }
        else {
          console.warn('[ZaloService] Skip keep-alive: No ownId available')
        }
        console.log('[ZaloService] Internal keep-alive ping sent via getUserInfo')
      }
      catch (err) {
        console.error('[ZaloService] Keep-alive error:', err)
        this.handleListenerError()
      }
    }, 1800000) // 30 minutes
  }

  private async handleIncomingMessage(rawData: any) {
    try {
      const schema = await this.getSchemaFn()
      const messageId = rawData.msgId
      const senderId = rawData.uidFrom
      const recipientId = rawData.idTo

      const currentUserId = this.api?.getOwnId?.()

      if (!senderId || !recipientId) {
        console.error('[ZaloService] Missing senderId or recipientId:', {
          senderId,
          recipientId,
          rawData,
        })
        return
      }

      const messagesService = new this.ItemsService('zalo_messages', {
        schema,
        accountability: this.systemAccountability,
      })

      const existingMessages = await messagesService.readByQuery({
        filter: { id: { _eq: messageId } },
        limit: 1,
      })

      if (existingMessages.length > 0) {
        return
      }

      const timestamp = Number.parseInt(rawData.ts ?? rawData.t ?? `${Date.now()}`)
      const clientMsgId = rawData.cliMsgId

      let isGroupMessage = !!rawData.groupId
      let groupId = rawData.groupId

      if (groupId) {
        isGroupMessage = true
      }
      else if (recipientId && recipientId.startsWith('group_')) {
        isGroupMessage = true
        groupId = recipientId
      }
      else {
        const existingConv = await this.findExistingConversation(recipientId, schema)
        if (existingConv && existingConv.group_id) {
          isGroupMessage = true
          groupId = existingConv.id
        }
      }

      let content = ''
      let attachments: any[] = []

      if (typeof rawData.content === 'string') {
        content = rawData.content

        if (content.startsWith('/')) {
          await this.handleQuickMessage(content, recipientId, senderId)
        }
      }
      else if (typeof rawData.content === 'object' && rawData.content !== null) {
        let parsedParams: any = {}
        if (rawData.content.params) {
          try {
            parsedParams = JSON.parse(rawData.content.params)
          }
          catch {
            console.warn('[ZaloService] Failed to parse params')
          }
        }

        const attachment = {
          title: rawData.content.title,
          fileName: rawData.content.title,
          name: rawData.content.title,
          url: rawData.content.href,
          href: rawData.content.href,
          link: rawData.content.href,
          thumb: rawData.content.thumb,
          thumbnailUrl: rawData.content.thumb,
          fileSize: parsedParams.fileSize ? Number.parseInt(parsedParams.fileSize) : null,
          size: parsedParams.fileSize ? Number.parseInt(parsedParams.fileSize) : null,
          fileExt: parsedParams.fileExt,
          checksum: parsedParams.checksum,
          type: rawData.msgType,
          mimeType: this.getMimeTypeFromExtension(parsedParams.fileExt),
          metadata: {
            ...rawData.content,
            parsedParams,
          },
        }

        attachments = [attachment]
        content = rawData.content.description || rawData.content.title || ''
      }

      let conversationId: string
      if (isGroupMessage && groupId) {
        conversationId = groupId
      }
      else {
        const userIds = [senderId, recipientId].sort()
        conversationId = `direct_${userIds[0]}_${userIds[1]}`
      }

      await this.startSync(conversationId)

      await this.upsertConversation(conversationId, rawData, schema, senderId, recipientId)

      await this.fetchAndUpsertUser(senderId, schema)

      if (isGroupMessage && groupId) {
        await this.ensureGroupMember(groupId, senderId, schema)
      }

      if (!isGroupMessage && recipientId && recipientId !== senderId) {
        await this.fetchAndUpsertUser(recipientId, schema)
      }

      const messageData = {
        id: messageId,
        client_id: clientMsgId || messageId,
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        raw_data: rawData,
        mentions: null,
        forward_from_message_id: null,
        reply_to_message_id: null,
        is_edited: false,
        is_undone: false,
        sent_at: new Date(timestamp),
        received_at: new Date(),
        edited_at: null,
        message_type: isGroupMessage ? 'group' : 'direct',
        websocket_broadcast: true,
      }

      await messagesService.createOne(messageData)

      if (attachments.length > 0) {
        await this.createAttachments(messageId, attachments, schema)
      }

      await this.updateConversationLastMessage(
        conversationId,
        messageId,
        new Date(timestamp),
        schema,
      )

      if (typeof rawData.content === 'string' && rawData.content.trim() && !rawData.content.startsWith('/')) {
        try {
          await this.autoLabelConversation(conversationId, rawData.content)
        }
        catch (labelError) {
          console.error('[ZaloService] Auto-label failed:', labelError)
        }
      }

      await this.completeSync(conversationId, messageId)
    }
    catch (error) {
      console.error('[ZaloService] Error handling message:', error)
      const conversationId = rawData.groupId || `direct_${rawData.uidFrom}_${rawData.idTo}`
      await this.failSync(conversationId, error)
    }
  }

  public async sendMessageWithBroadcast(data: {
    conversationId: string
    content: string
    senderId: string
  }): Promise<{ success: boolean, messageId?: string, error?: string }> {
    try {
      if (!this.api) {
        throw new Error('Zalo API not connected')
      }

      const { conversationId, content, senderId } = data

      let threadId: string
      let recipientId: string | null = null

      if (conversationId.startsWith('direct_')) {
        const parts = conversationId.split('_')
        const userId1 = parts[1]
        const userId2 = parts[2]
        const currentUserId = this.api.getOwnId?.()

        recipientId = (userId1 === currentUserId ? userId2 : userId1) ?? null
        if (!recipientId) {
          throw new Error('Could not determine recipient ID from conversation ID')
        }
        threadId = recipientId
      }
      else {
        threadId = conversationId
      }

      const result = await this.api.sendMessage({ msg: content }, threadId)

      if (!result || result.error) {
        throw new Error(result?.error?.message || 'Send failed')
      }

      const messageId = result.data?.msg_Id || result.msg_Id || `msg_${Date.now()}`

      const schema = await this.getSchemaFn()
      const messagesService = new this.ItemsService('zalo_messages', {
        schema,
        accountability: this.systemAccountability,
      })

      await messagesService.createOne({
        id: messageId,
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        sent_at: new Date(),
        received_at: new Date(),
        is_edited: false,
        is_undone: false,
        raw_data: result,
        websocket_broadcast: true,
      })
      await this.updateConversationLastMessage(
        conversationId,
        messageId,
        new Date(),
        schema,
      )

      return {
        success: true,
        messageId,
      }
    }
    catch (error: any) {
      console.error('[ZaloService] sendMessageWithBroadcast failed:', error)
      return {
        success: false,
        error: error.message,
      }
    }
  }

  private async findExistingConversation(id: string, schema: SchemaOverview): Promise<any | null> {
    try {
      const conversationsService = new this.ItemsService('zalo_conversations', {
        schema,
        accountability: this.systemAccountability,
      })

      const result = await conversationsService.readByQuery({
        filter: { id: { _eq: id } },
        fields: ['id', 'group_id'],
        limit: 1,
      })

      if (result.length > 0) {
        return result[0]
      }

      const groupResult = await conversationsService.readByQuery({
        filter: { group_id: { _eq: id } },
        fields: ['id', 'group_id'],
        limit: 1,
      })

      return groupResult.length > 0 ? groupResult[0] : null
    }
    catch (error) {
      console.error('[ZaloService] Error finding conversation:', error)
      return null
    }
  }

  private validateConversationId(
    conversationId: string,
    senderId?: string,
    recipientId?: string,
  ): boolean {
    if (!conversationId.startsWith('direct_')) {
      return true
    }

    const match = conversationId.match(/^direct_([^_]+)_([^_]+)$/)
    if (!match) {
      console.error('[ZaloService] Invalid conversation ID format:', conversationId)
      return false
    }

    const [, userId1, userId2] = match

    if (senderId && recipientId) {
      const hasUser1 = senderId === userId1 || recipientId === userId1
      const hasUser2 = senderId === userId2 || recipientId === userId2

      if (!hasUser1 || !hasUser2) {
        console.error('[ZaloService] ConversationId mismatch:', {
          conversationId,
          senderId,
          recipientId,
          expected: [userId1, userId2],
        })
        return false
      }
    }

    return true
  }

  private async ensureGroupMember(
    groupId: string,
    userId: string,
    schema: SchemaOverview,
  ) {
    try {
      const membersService = new this.ItemsService('zalo_group_members', {
        schema,
        accountability: this.systemAccountability,
      })

      const existing = await membersService.readByQuery({
        filter: {
          _and: [
            { group_id: { _eq: groupId } },
            { user_id: { _eq: userId } },
          ],
        },
        limit: 1,
      })

      if (existing.length > 0) {
        if (!existing[0].isactive) {
          await membersService.updateOne(existing[0].id, {
            isactive: true,
            joinedat: new Date(),
            leftat: null,
            updatedat: new Date(),
          })
        }
        return
      }

      await membersService.createOne({
        group_id: groupId,
        user_id: userId,
        isactive: true,
        joinedat: new Date(),
        leftat: null,
      })
    }
    catch (error: any) {
      console.error('[ZaloService] Error ensuring group member:', error.message)
    }
  }

  private async autoLabelConversation(conversationId: string, content: string) {
    try {
      const lowerContent = content.toLowerCase()

      const labelRules: Record<string, string[]> = {
        label_vip: ['vip', 'premium', 'ưu tiên'],
        label_support: ['help', 'support', 'giúp', 'hỗ trợ', 'trợ giúp'],
        label_sales: ['giá', 'price', 'mua', 'buy', 'bán'],
        label_urgent: ['urgent', 'khẩn', 'gấp', 'nhanh'],
      }

      for (const [labelId, keywords] of Object.entries(labelRules)) {
        const hasKeyword = keywords.some(kw => lowerContent.includes(kw))

        if (hasKeyword) {
          const schema = await this.getSchemaFn()
          const labelsService = new this.ItemsService('zalo_labels', {
            schema,
            accountability: this.systemAccountability,
          })

          const existingLabel = await labelsService.readByQuery({
            filter: { id: { _eq: labelId } },
            limit: 1,
          })

          if (existingLabel.length === 0) {
            await this.createPredefinedLabel(labelId)
          }

          await this.addLabelToConversation(conversationId, labelId)
        }
      }
    }
    catch (error) {
      console.error('[ZaloService] Error auto-labeling:', error)
    }
  }

  private async createPredefinedLabel(labelId: string) {
    const labelConfig: Record<string, { name: string, color: string, desc: string }> = {
      label_vip: { name: 'VIP Customer', color: '#FFD700', desc: 'Khách hàng VIP' },
      label_support: { name: 'Support', color: '#4CAF50', desc: 'Yêu cầu hỗ trợ' },
      label_sales: { name: 'Sales', color: '#2196F3', desc: 'Liên quan bán hàng' },
      label_urgent: { name: 'Urgent', color: '#F44336', desc: 'Cần xử lý gấp' },
    }

    const config = labelConfig[labelId]
    if (config) {
      await this.upsertLabel(labelId, {
        name: config.name,
        description: config.desc,
        color_hex: config.color,
        is_system: true,
      })
    }
  }

  private async handleQuickMessage(content: string, recipientId: string, senderId: string) {
    try {
      const trimmedContent = content.trim()

      if (trimmedContent.startsWith('/label ')) {
        const userIds = [senderId, recipientId].filter(Boolean).sort()
        const conversationId = userIds.length === 2
          ? `direct_${userIds[0]}_${userIds[1]}`
          : `thread_${recipientId || senderId}`

        await this.handleLabelCommand(trimmedContent, conversationId, senderId, recipientId)
        return
      }

      const quickMsg = await this.findQuickMessageByKeyword(trimmedContent)

      if (quickMsg) {
        await this.incrementQuickMessageUsage(quickMsg.id)

        try {
          await this.sendMessage({ msg: quickMsg.content }, senderId)
        }
        catch (error: any) {
          if (error.code === 114 || error.message?.includes('không hợp lệ')) {
            await this.sendMessage({ msg: quickMsg.content }, recipientId)
          }
          else {
            console.error('[ZaloService] Send message error:', error.message)
            throw error
          }
        }
      }
    }
    catch (error) {
      console.error('[ZaloService] Error handling quick message:', error)
    }
  }

  private async handleLabelCommand(
    content: string,
    conversationId: string,
    senderId: string,
    recipientId: string,
  ) {
    try {
      const sendReply = async (msg: string) => {
        try {
          await this.sendMessage({ msg }, senderId)
        }
        catch (error: any) {
          if (error.code === 114 || error.message?.includes('not valid')) {
            await this.sendMessage({ msg }, recipientId)
          }
          else {
            throw error
          }
        }
      }

      const parts = content.split(' ')

      if (parts.length < 3) {
        await sendReply('Usage:\n/label add <name>\n/label remove <name>')
        return
      }

      const action = parts[1]?.toLowerCase()
      const labelName = parts.slice(2).join(' ')

      if (!action) {
        await sendReply('Invalid command format')
        return
      }

      const labels = await this.getLabels()

      if (!Array.isArray(labels)) {
        await sendReply('Error loading labels')
        return
      }

      const label = labels.find((l: any) =>
        l?.name?.toLowerCase() === labelName.toLowerCase(),
      )

      if (!label) {
        const availableLabels = labels
          .filter((l: any) => l?.name)
          .map((l: any) => `- ${l.name}`)
          .join('\n')

        await sendReply(`Label "${labelName}" not found.\n\nAvailable:\n${availableLabels}`)
        return
      }

      if (action === 'add') {
        await this.addLabelToConversation(conversationId, label.id)
        await sendReply(`Added label "${label.name}"`)
      }
      else if (action === 'remove') {
        await this.removeLabelFromConversation(conversationId, label.id)
        await sendReply(`Removed label "${label.name}"`)
      }
      else {
        await sendReply(`Invalid action "${action}". Use "add" or "remove"`)
      }
    }
    catch (error: any) {
      console.error('[ZaloService] Error handling label command:', error)
    }
  }

  private getMimeTypeFromExtension(ext: string | undefined): string | null {
    if (!ext)
      return null

    const mimeTypes: Record<string, string> = {
      ts: 'text/typescript',
      js: 'text/javascript',
      json: 'application/json',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      mp4: 'video/mp4',
      mp3: 'audio/mpeg',
      zip: 'application/zip',
      rar: 'application/x-rar-compressed',
    }

    return mimeTypes[ext.toLowerCase()] || 'application/octet-stream'
  }

  private async upsertConversation(
    conversationId: string,
    rawData: any,
    schema: SchemaOverview,
    senderId?: string,
    recipientId?: string,
  ) {
    try {
      const conversationsService = new this.ItemsService('zalo_conversations', {
        schema,
        accountability: this.systemAccountability,
      })

      const existing = await conversationsService.readByQuery({
        filter: { id: { _eq: conversationId } },
        limit: 1,
      })

      if (existing.length === 0) {
        const isGroup = !!rawData.groupId || !conversationId.startsWith('direct_')

        let finalParticipantId: string | null = null

        if (!isGroup) {
          if (senderId && recipientId && recipientId) {
            const currentUserId = this.api?.getOwnId?.()

            if (currentUserId) {
              finalParticipantId = senderId === currentUserId
                ? recipientId
                : senderId
            }
            else {
              finalParticipantId = recipientId
            }

            console.warn(`Direct conversation - participant: ${finalParticipantId}`)
          }
        }
        else {
          console.warn(`Group conversation - no participant`)
        }

        console.warn(`Creating conversation: ${conversationId}, type: ${isGroup ? 'group' : 'direct'}, participant: ${finalParticipantId}`)

        await conversationsService.createOne({
          id: conversationId,
          type: isGroup ? 'group' : 'direct',
          participant_id: finalParticipantId,
          group_id: isGroup ? (rawData.groupId || conversationId) : null,
          is_pinned: false,
          is_muted: false,
          is_archived: false,
          is_hidden: false,
          unread_count: 0,
          last_message_time: new Date().toISOString(),
        })

        console.warn(`Conversation created successfully`)
      }
      else {
        console.warn(`Conversation exists, updating last_message_time`)
        await conversationsService.updateOne(conversationId, {
          last_message_time: new Date().toISOString(),
        })
      }
    }
    catch (error: any) {
      console.error('[ZaloService] Error upserting conversation:', error.message)
    }
  }

  private async fetchAndUpsertUser(userId: string, schema?: SchemaOverview) {
    const currentStack = new Error('Checking recursion depth').stack
    const fetchCallCount = (currentStack!.match(/fetchAndUpsertUser/g) || []).length

    if (fetchCallCount > 3) {
      throw new Error('Excessive recursion in fetchAndUpsertUser')
    }

    try {
      const currentSchema = schema ?? await this.getSchemaFn()
      const usersService = new this.ItemsService('zalo_users', {
        schema: currentSchema,
        accountability: this.systemAccountability,
      })

      const existingUsers = await usersService.readByQuery({
        filter: { id: { _eq: userId } },
        limit: 1,
      })

      if (existingUsers.length > 0) {
        const existingUser = existingUsers[0]
        if (existingUser.display_name && existingUser.display_name !== 'Unknown User') {
          return
        }
      }

      if (!this.api) {
        await this.createBasicUser(userId)
        return
      }

      let userInfo: any = null

      try {
        const apiResponse = await this.api.getUserInfo(userId)
        userInfo = apiResponse?.changed_profiles?.[userId] ?? null
      }
      catch {
        await this.createBasicUser(userId)
        return
      }

      if (!userInfo) {
        await this.createBasicUser(userId)
        return
      }

      const parseDateOfBirth = (dob: any): Date | null => {
        if (!dob)
          return null

        try {
          if (typeof dob === 'number' && dob > 0) {
            return new Date(dob > 9999999999 ? dob : dob * 1000)
          }

          if (typeof dob === 'string' && /\d{2}\/\d{2}\/\d{4}/.test(dob)) {
            const [day, month, year] = dob.split('/').map(Number)
            const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1)

            if (
              date.getFullYear() === (year ?? 0)
              && date.getMonth() === (month ?? 1) - 1
              && date.getDate() === (day ?? 1)
            ) {
              return date
            }
          }

          const date = new Date(dob)
          return Number.isNaN(date.getTime()) ? null : date
        }
        catch {
          return null
        }
      }

      const displayName = userInfo?.displayName ?? 'Unknown User'
      const avatarUrl = userInfo?.avatar
      const coverUrl = userInfo?.cover
      const alias = userInfo?.username
      const dateOfBirth = parseDateOfBirth(userInfo?.sdob ?? userInfo?.dob)
      const isFriend = userInfo?.isFr === 1
      const lastOnline = userInfo?.lastActionTime
        ? new Date(Number(userInfo.lastActionTime))
        : null
      const statusMessage = userInfo?.status ?? null
      const zaloName = userInfo?.zaloName

      const userData = {
        display_name: displayName,
        avatar_url: avatarUrl,
        cover_url: coverUrl,
        alias,
        date_of_birth: dateOfBirth,
        is_friend: isFriend,
        last_online: lastOnline,
        status_message: statusMessage,
        zalo_name: zaloName,
        raw_data: userInfo,
      }

      if (existingUsers.length > 0) {
        await usersService.updateOne(userId, userData)
      }
      else {
        await usersService.createOne({
          id: userId,
          ...userData,
        })
      }
    }
    catch (error) {
      console.error('[ZaloService] Error in fetchAndUpsertUser:', error)
      await this.createBasicUser(userId)
    }
  }

  private async createBasicUser(userId: string) {
    try {
      const schema = await this.getSchemaFn()

      const usersService = new this.ItemsService('zalo_users', {
        schema,
        accountability: this.systemAccountability,
      })

      const existing = await usersService.readByQuery({
        filter: { id: { _eq: userId } },
        limit: 1,
      })

      if (existing.length === 0) {
        await usersService.createOne({
          id: userId,
          display_name: 'Unknown User',
          avatar_url: null,
          cover_url: null,
          alias: null,
          date_of_birth: null,
          is_friend: false,
          last_online: null,
          status_message: null,
          zalo_name: null,
          raw_data: null,
        })
      }
    }
    catch (error) {
      console.error('[ZaloService] Error creating basic user:', error)
    }
  }

  private async upsertGroup(
    groupId: string,
    groupInfo: any,
    schema: SchemaOverview,
  ) {
    try {
      const groupsService = new this.ItemsService('zalo_groups', {
        schema,
        accountability: this.systemAccountability,
      })

      const existing = await groupsService.readByQuery({
        filter: { id: { _eq: groupId } },
        limit: 1,
      })

      const groupData = {
        name: groupInfo.name || `Group ${groupId}`,
        description: groupInfo.desc || null,
        avatar_url: groupInfo.fullAvt || groupInfo.avt || null,
        owner_id: groupInfo.creatorId || null,
        total_members: groupInfo.totalMember || 0,
        invite_link: groupInfo.inviteLink || null,
        created_at_zalo: groupInfo.createdTime
          ? new Date(groupInfo.createdTime)
          : null,
        settings: groupInfo.setting ? JSON.stringify(groupInfo.setting) : null,
      }

      if (existing.length === 0) {
        await groupsService.createOne({
          id: groupId,
          ...groupData,
          created_at: new Date(),
        })
      }
      else {
        await groupsService.updateOne(groupId, {
          ...groupData,
          updated_at: new Date(),
        })
      }
    }
    catch (error: any) {
      console.error('[ZaloService] Error upserting group:', groupId, error.message)
      throw error
    }
  }

  private async syncGroupAvatars() {
    try {
      if (!this.api || typeof this.api.getAllGroups !== 'function') {
        console.error('[ZaloService] API not ready for syncGroupAvatars')
        return
      }
      const response = await this.api.getAllGroups()

      if (!response || !response.gridVerMap) {
        return
      }

      const gridVerMap = response.gridVerMap
      const groupIds = Object.keys(gridVerMap)
      const schema = await this.getSchemaFn()
      const BATCH_SIZE = 20

      for (let i = 0; i < groupIds.length; i += BATCH_SIZE) {
        const batch = groupIds.slice(i, i + BATCH_SIZE)

        const batchPromises = batch.map(async (groupId) => {
          try {
            const response = await this.api.getGroupInfo?.(groupId)
            const groupInfo = response?.gridInfoMap?.[groupId]

            if (!groupInfo) {
              return
            }
            await Promise.all([
              this.upsertGroup(groupId, groupInfo, schema),
              this.upsertConversation(groupId, {
                groupId: groupInfo.groupId || groupId,
                name: groupInfo.name || `Group ${groupId}`,
                avatar: groupInfo.fullAvt || groupInfo.avt || null,
                type: 'group',
              }, schema),
            ])
          }
          catch (error: any) {
            console.error('[ZaloService] Error syncing group', groupId, ':', error.message)
          }
        })

        await Promise.all(batchPromises)

        if (i + BATCH_SIZE < groupIds.length) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
    }
    catch (error: any) {
      console.error('[ZaloService] Error syncing group avatars:', error)
    }
  }

  private async syncGroupMembers(groupId: string, groupInfo: any) {
    try {
      if (!groupInfo.memVerList || !Array.isArray(groupInfo.memVerList)) {
        return
      }

      const schema = await this.getSchemaFn()
      const membersService = new this.ItemsService('zalo_group_members', {
        schema,
        accountability: this.systemAccountability,
      })

      const existingMembers = await membersService.readByQuery({
        filter: { group_id: { _eq: groupId } },
        fields: ['user_id'],
      })

      const existingUserIds = new Set(existingMembers.map((m: any) => m.user_id))

      const userIdsToFetch = groupInfo.memVerList
        .map((memVer: string) => memVer.split('|')[0])
        .filter((userId: string) => userId && !existingUserIds.has(userId))

      const USER_BATCH_SIZE = 10
      for (let i = 0; i < userIdsToFetch.length; i += USER_BATCH_SIZE) {
        const userBatch = userIdsToFetch.slice(i, i + USER_BATCH_SIZE)

        await Promise.all(
          userBatch.map(async (userId: string) => {
            try {
              await this.fetchAndUpsertUser(userId, schema)
            }
            catch (error: any) {
              console.error('[ZaloService] Failed to fetch user:', userId, error.message)
            }
          }),
        )

        if (i + USER_BATCH_SIZE < userIdsToFetch.length) {
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }

      const MEMBER_BATCH_SIZE = 20
      for (let i = 0; i < groupInfo.memVerList.length; i += MEMBER_BATCH_SIZE) {
        const memberBatch = groupInfo.memVerList.slice(i, i + MEMBER_BATCH_SIZE)

        await Promise.all(
          memberBatch.map(async (memVer: string) => {
            try {
              const userId = memVer.split('|')[0]
              if (!userId || existingUserIds.has(userId)) {
                return
              }

              await this.upsertGroupMember(groupId, userId, {
                isactive: true,
                joinedat: new Date(),
                leftat: null,
              })

              existingUserIds.add(userId)
            }
            catch (error: any) {
              console.error('[ZaloService] Error creating member:', memVer, error.message)
            }
          }),
        )

        if (i + MEMBER_BATCH_SIZE < groupInfo.memVerList.length) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
    }
    catch (error: any) {
      console.error('[ZaloService] Error syncing group members:', error.message)
    }
  }

  private async createAttachments(messageId: string, attachments: any[], schema: SchemaOverview) {
    try {
      if (!Array.isArray(attachments) || attachments.length === 0) {
        return
      }

      const attachmentsService = new this.ItemsService('zalo_attachments', {
        schema,
        accountability: this.systemAccountability,
      })

      for (let i = 0; i < attachments.length; i++) {
        const att = attachments[i]

        try {
          const attachmentData = {
            message_id: messageId,
            url: att.url || att.href || att.link || '',
            file_name: att.fileName || att.name || att.title || null,
            file_size: att.fileSize || att.size || null,
            mime_type: att.mimeType || null,
            thumbnail_url: att.thumbnailUrl || att.thumb || null,
            width: att.width || null,
            height: att.height || null,
            duration: att.duration || null,
            metadata: att.metadata || att,
          }

          await attachmentsService.createOne(attachmentData)
        }
        catch (attError: any) {
          console.error('[ZaloService] Error creating attachment:', attError.message)
        }
      }
    }
    catch (error: any) {
      console.error('[ZaloService] Fatal error in createAttachments:', error)
    }
  }

  private async updateConversationLastMessage(
    conversationId: string,
    messageId: string,
    messageTime: Date,
    schema: SchemaOverview,
  ) {
    try {
      const conversationsService = new this.ItemsService('zalo_conversations', {
        schema,
        accountability: this.systemAccountability,
      })

      await conversationsService.updateOne(conversationId, {
        last_message_id: messageId,
        last_message_time: messageTime,
      })
    }
    catch (error) {
      console.error('[ZaloService] Error updating conversation last message:', error)
    }
  }

  private async handleIncomingReaction(rawData: any) {
    try {
      const schema = await this.getSchemaFn()
      const messageId = rawData.content?.rMsg?.[0]?.gMsgID?.toString() || rawData.msgId
      const userId = rawData.uidFrom || rawData.content?.msgSender
      const reactionIcon = rawData.content?.rIcon
      const reactionTypeId = rawData.content?.rType

      if (!messageId || !userId || !reactionIcon) {
        console.warn('[ZaloService] Missing reaction data:', {
          messageId: messageId || 'MISSING',
          userId: userId || 'MISSING',
          reactionIcon: reactionIcon || 'MISSING',
        })
        return
      }

      const service = new this.ItemsService('zalo_reactions', {
        schema,
        accountability: this.systemAccountability,
      })

      const existing = await service.readByQuery({
        filter: {
          _and: [
            { message_id: { _eq: messageId } },
            { user_id: { _eq: userId } },
          ],
        },
        limit: 1,
      })

      const reactionData = {
        message_id: messageId,
        user_id: userId,
        reaction_icon: reactionIcon,
        reaction_type: reactionTypeId,
        created_at: new Date(),
      }

      if (existing.length > 0) {
        await service.updateOne(existing[0].id, {
          reaction_icon: reactionIcon,
          reaction_type: reactionTypeId,
          updated_at: new Date(),
        })
      }
      else {
        await service.createOne(reactionData)
      }
    }
    catch (error) {
      console.error('[ZaloService] Error handling reaction:', error)
    }
  }

  private async upsertLabel(
    labelId: string,
    labelData: {
      name: string
      description?: string
      color_hex?: string
      is_system?: boolean
    },
    schema?: SchemaOverview,
  ) {
    try {
      const currentSchema = schema || await this.getSchemaFn()

      const labelsService = new this.ItemsService('zalo_labels', {
        schema: currentSchema,
        accountability: this.systemAccountability,
      })

      const existing = await labelsService.readByQuery({
        filter: { id: { _eq: labelId } },
        limit: 1,
      })

      const data = {
        name: labelData.name,
        description: labelData.description || null,
        color_hex: labelData.color_hex || null,
        is_system: labelData.is_system || false,
      }

      if (existing.length === 0) {
        await labelsService.createOne({
          id: labelId,
          ...data,
        })
      }
      else {
        await labelsService.updateOne(labelId, data)
      }
    }
    catch (error: any) {
      console.error('[ZaloService] Error upserting label:', error.message)
    }
  }

  public async createLabel(name: string, options?: {
    description?: string
    color_hex?: string
    is_system?: boolean
  }) {
    try {
      const schema = await this.getSchemaFn()
      const labelId = `label_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      await this.upsertLabel(
        labelId,
        {
          name,
          description: options?.description,
          color_hex: options?.color_hex,
          is_system: options?.is_system || false,
        },
        schema,
      )

      return labelId
    }
    catch (error: any) {
      console.error('[ZaloService] Error creating label:', error.message)
      throw error
    }
  }

  public async getLabels() {
    try {
      const schema = await this.getSchemaFn()

      const labelsService = new this.ItemsService('zalo_labels', {
        schema,
        accountability: this.systemAccountability,
      })

      return await labelsService.readByQuery({
        sort: ['name'],
      })
    }
    catch (error: any) {
      console.error('[ZaloService] Error getting labels:', error.message)
      return []
    }
  }

  public async updateLabel(labelId: string, data: {
    name?: string
    description?: string
    color_hex?: string
    is_system?: boolean
  }) {
    try {
      const schema = await this.getSchemaFn()

      const labelsService = new this.ItemsService('zalo_labels', {
        schema,
        accountability: this.systemAccountability,
      })

      await labelsService.updateOne(labelId, data)
    }
    catch (error: any) {
      console.error('[ZaloService] Error updating label:', error.message)
      throw error
    }
  }

  public async deleteLabel(labelId: string) {
    try {
      const schema = await this.getSchemaFn()

      const labelsService = new this.ItemsService('zalo_labels', {
        schema,
        accountability: this.systemAccountability,
      })

      await labelsService.deleteOne(labelId)
    }
    catch (error: any) {
      console.error('[ZaloService] Error deleting label:', error.message)
      throw error
    }
  }

  public async addLabelToConversation(conversationId: string, labelId: string) {
    try {
      const schema = await this.getSchemaFn()

      const service = new this.ItemsService('zalo_conversation_labels', {
        schema,
        accountability: this.systemAccountability,
      })

      const existing = await service.readByQuery({
        filter: {
          _and: [
            { conversation_id: { _eq: conversationId } },
            { label_id: { _eq: labelId } },
          ],
        },
        limit: 1,
      })

      if (existing.length === 0) {
        await service.createOne({
          conversation_id: conversationId,
          label_id: labelId,
        })
      }
    }
    catch (error: any) {
      console.error('[ZaloService] Error adding label to conversation:', error.message)
      throw error
    }
  }

  public async removeLabelFromConversation(conversationId: string, labelId: string) {
    try {
      const schema = await this.getSchemaFn()

      const service = new this.ItemsService('zalo_conversation_labels', {
        schema,
        accountability: this.systemAccountability,
      })

      const existing = await service.readByQuery({
        filter: {
          _and: [
            { conversation_id: { _eq: conversationId } },
            { label_id: { _eq: labelId } },
          ],
        },
        limit: 1,
      })

      if (existing.length > 0) {
        await service.deleteOne(existing[0].id)
      }
    }
    catch (error: any) {
      console.error('[ZaloService] Error removing label from conversation:', error.message)
      throw error
    }
  }

  public async getConversationLabels(conversationId: string) {
    try {
      const schema = await this.getSchemaFn()

      const service = new this.ItemsService('zalo_conversation_labels', {
        schema,
        accountability: this.systemAccountability,
      })

      return await service.readByQuery({
        filter: { conversation_id: { _eq: conversationId } },
        fields: ['*', 'label_id.*'],
      })
    }
    catch (error: any) {
      console.error('[ZaloService] Error getting conversation labels:', error.message)
      return []
    }
  }

  public async upsertSyncStatus(conversationId: string, data: {
    is_syncing?: boolean
    last_message_id_synced?: string | null
    last_sync_at?: Date | null
    sync_errors?: any | null
  }) {
    try {
      const schema = await this.getSchemaFn()

      const service = new this.ItemsService('zalo_sync_status', {
        schema,
        accountability: this.systemAccountability,
      })

      const existing = await service.readByQuery({
        filter: { conversation_id: { _eq: conversationId } },
        limit: 1,
      })

      if (existing.length === 0) {
        await service.createOne({
          conversation_id: conversationId,
          is_syncing: data.is_syncing ?? false,
          last_message_id_synced: data.last_message_id_synced ?? null,
          last_sync_at: data.last_sync_at ?? null,
          sync_errors: data.sync_errors ?? null,
        })
      }
      else {
        await service.updateOne(existing[0].id, data)
      }
    }
    catch (error: any) {
      console.error('[ZaloService] Error upserting sync status:', error.message)
      throw error
    }
  }

  public async getSyncStatus(conversationId: string) {
    try {
      const schema = await this.getSchemaFn()

      const service = new this.ItemsService('zalo_sync_status', {
        schema,
        accountability: this.systemAccountability,
      })

      const results = await service.readByQuery({
        filter: { conversation_id: { _eq: conversationId } },
        limit: 1,
      })

      return results.length > 0 ? results[0] : null
    }
    catch (error: any) {
      console.error('[ZaloService] Error getting sync status:', error.message)
      return null
    }
  }

  public async startSync(conversationId: string) {
    await this.upsertSyncStatus(conversationId, {
      is_syncing: true,
      sync_errors: null,
    })
  }

  public async completeSync(conversationId: string, lastMessageId: string) {
    await this.upsertSyncStatus(conversationId, {
      is_syncing: false,
      last_message_id_synced: lastMessageId,
      last_sync_at: new Date(),
      sync_errors: null,
    })
  }

  public async failSync(conversationId: string, error: any) {
    await this.upsertSyncStatus(conversationId, {
      is_syncing: false,
      sync_errors: {
        message: error.message,
        timestamp: new Date(),
        stack: error.stack,
      },
    })
  }

  public async createQuickMessage(data: {
    keyword: string
    title: string
    content: string
    media_attachment?: string | null
    is_active?: boolean
  }) {
    try {
      const schema = await this.getSchemaFn()

      const service = new this.ItemsService('zalo_quick_messages', {
        schema,
        accountability: this.systemAccountability,
      })

      const id = await service.createOne({
        keyword: data.keyword,
        title: data.title,
        content: data.content,
        media_attachment: data.media_attachment ?? null,
        is_active: data.is_active ?? true,
        usage_count: 0,
        last_used_at: null,
      })

      return id
    }
    catch (error: any) {
      console.error('[ZaloService] Error creating quick message:', error.message)
      throw error
    }
  }

  public async getQuickMessages(activeOnly: boolean = true) {
    try {
      const schema = await this.getSchemaFn()

      const service = new this.ItemsService('zalo_quick_messages', {
        schema,
        accountability: this.systemAccountability,
      })

      const filter = activeOnly ? { is_active: { _eq: true } } : {}

      return await service.readByQuery({
        filter,
        sort: ['-last_used_at', 'keyword'],
      })
    }
    catch (error: any) {
      console.error('[ZaloService] Error getting quick messages:', error.message)
      return []
    }
  }

  public async findQuickMessageByKeyword(keyword: string) {
    try {
      const schema = await this.getSchemaFn()

      const service = new this.ItemsService('zalo_quick_messages', {
        schema,
        accountability: this.systemAccountability,
      })

      const results = await service.readByQuery({
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
    catch (error: any) {
      console.error('[ZaloService] Error finding quick message:', error.message)
      return null
    }
  }

  public async updateQuickMessage(id: string, data: {
    keyword?: string
    title?: string
    content?: string
    media_attachment?: string | null
    is_active?: boolean
  }) {
    try {
      const schema = await this.getSchemaFn()

      const service = new this.ItemsService('zalo_quick_messages', {
        schema,
        accountability: this.systemAccountability,
      })

      await service.updateOne(id, data)
    }
    catch (error: any) {
      console.error('[ZaloService] Error updating quick message:', error.message)
      throw error
    }
  }

  public async incrementQuickMessageUsage(id: string) {
    try {
      const schema = await this.getSchemaFn()

      const service = new this.ItemsService('zalo_quick_messages', {
        schema,
        accountability: this.systemAccountability,
      })

      const message = await service.readOne(id)

      await service.updateOne(id, {
        usage_count: (message.usage_count || 0) + 1,
        last_used_at: new Date(),
      })
    }
    catch (error: any) {
      console.error('[ZaloService] Error incrementing usage:', error.message)
    }
  }

  public async deleteQuickMessage(id: string) {
    try {
      const schema = await this.getSchemaFn()

      const service = new this.ItemsService('zalo_quick_messages', {
        schema,
        accountability: this.systemAccountability,
      })

      await service.deleteOne(id)
    }
    catch (error: any) {
      console.error('[ZaloService] Error deleting quick message:', error.message)
      throw error
    }
  }

  private async upsertGroupMember(
    groupId: string,
    userId: string,
    data: {
      isactive?: boolean
      joinedat?: Date | null
      leftat?: Date | null
    },
  ) {
    try {
      const schema = await this.getSchemaFn()

      const membersService = new this.ItemsService('zalo_group_members', {
        schema,
        accountability: this.systemAccountability,
      })

      const existing = await membersService.readByQuery({
        filter: {
          _and: [
            { group_id: { _eq: groupId } },
            { user_id: { _eq: userId } },
          ],
        },
        limit: 1,
      })

      if (existing.length > 0) {
        const current = existing[0]
        const needsUpdate
          = (data.isactive !== undefined && current.isactive !== data.isactive)
            || (data.leftat !== undefined && current.leftat !== data.leftat)

        if (needsUpdate) {
          await membersService.updateOne(existing[0].id, {
            isactive: data.isactive,
            leftat: data.leftat,
            updatedat: new Date(),
          })
        }
        return
      }
      await membersService.createOne({
        group_id: groupId,
        user_id: userId,
        isactive: data.isactive ?? true,
        joinedat: data.joinedat ?? new Date(),
        leftat: data.leftat ?? null,
      })
    }
    catch (error: any) {
      console.error('[ZaloService] Error upserting group member:', error.message)
    }
  }

  public async getGroupMembers(groupId: string, activeOnly: boolean = true) {
    try {
      const schema = await this.getSchemaFn()

      const service = new this.ItemsService('zalo_group_members', {
        schema,
        accountability: this.systemAccountability,
      })

      const filter: any = { group_id: { _eq: groupId } }

      if (activeOnly) {
        filter._and = [filter, { is_active: { _eq: true } }]
      }

      return await service.readByQuery({
        filter,
        fields: ['*', 'user_id.*'],
        sort: ['joined_at'],
      })
    }
    catch (error: any) {
      console.error('[ZaloService] Error getting group members:', error.message)
      return []
    }
  }

  public async markMemberLeft(groupId: string, userId: string) {
    await this.upsertGroupMember(groupId, userId, {
      isactive: false,
      leftat: new Date(),
    })
  }

  public async markMemberRejoined(groupId: string, userId: string) {
    await this.upsertGroupMember(groupId, userId, {
      isactive: true,
      joinedat: new Date(),
      leftat: null,
    })
  }

  public async getUserGroups(userId: string, activeOnly: boolean = true) {
    try {
      const schema = await this.getSchemaFn()

      const service = new this.ItemsService('zalo_group_members', {
        schema,
        accountability: this.systemAccountability,
      })

      const filter: any = { user_id: { _eq: userId } }

      if (activeOnly) {
        filter._and = [filter, { is_active: { _eq: true } }]
      }

      return await service.readByQuery({
        filter,
        fields: ['*', 'group_id.*'],
        sort: ['-joined_at'],
      })
    }
    catch (error: any) {
      console.error('[ZaloService] Error getting user groups:', error.message)
      return []
    }
  }

  private handleListenerError() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = this.reconnectDelay * this.reconnectAttempts
      setTimeout(() => this.restartListener(), delay)
    }
    else {
      this.reset()
    }
  }

  private restartListener() {
    if (this.api && this.api.listener) {
      try {
        this.api.listener.stop()
        this.listenerStarted = false
        this.startListener()
      }
      catch (err) {
        console.error('[ZaloService] restartListener failed', err)
        this.handleListenerError()
      }
    }
    else {
      this.handleListenerError()
    }
  }

  public async sendMessage(
    content: { msg: string },
    threadId: string,
    threadType: typeof ThreadType.User | typeof ThreadType.Group = ThreadType.User,
  ): Promise<any> {
    if (!this.api) {
      throw new Error('Zalo API not initialized. Please login first.')
    }

    if (this.status !== 'logged_in') {
      throw new Error(`Zalo not logged in. Current status: ${this.status}`)
    }

    try {
      const result = await this.api.sendMessage(content, threadId, threadType)
      if (result?.error) {
        throw new Error(result.error.message || 'Zalo API returned error')
      }

      return result
    }
    catch (error: any) {
      throw new Error(`Failed to send via Zalo: ${error.message}`)
    }
  }

  public async redisStatus() {
    if (!this.redis)
      return { enabled: false }
    try {
      const ping = await this.redis.ping()
      const dbsize = await this.redis.dbsize()
      return { enabled: true, ping, dbsize }
    }
    catch (e: any) {
      return { enabled: false, error: e.message }
    }
  }

  public async redisGetSession(userId?: string) {
    if (!this.redis)
      return null
    try {
      if (!userId) {
        const keys = await this.redis.keys('zalo:session:*')
        const sessions: any = {}
        for (const key of keys) {
          const raw = await this.redis.get(key)
          if (raw) {
            try {
              const id = key.replace('zalo:session:', '')
              sessions[id] = JSON.parse(raw)
            }
            catch {
              sessions[key] = raw
            }
          }
        }
        return sessions
      }

      const raw = await this.redis.get(this.getRedisKey(userId))
      if (!raw)
        return null
      try {
        return JSON.parse(raw)
      }
      catch {
        return raw
      }
    }
    catch {
      return null
    }
  }

  public async redisKeys(pattern = '*', limit = 1000) {
    if (!this.redis)
      return []
    let cursor = '0'
    const keys: string[] = []
    do {
      const [next, batch] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        200,
      )
      for (const k of batch) {
        keys.push(k)
        if (keys.length >= limit)
          return keys
      }
      cursor = next
    } while (cursor !== '0')
    return keys
  }

  public async redisGet(key: string) {
    if (!this.redis || !key)
      return null
    const raw = await this.redis.get(key)
    if (!raw)
      return null
    try {
      return JSON.parse(raw)
    }
    catch {
      return raw
    }
  }
}

export default ZaloService
