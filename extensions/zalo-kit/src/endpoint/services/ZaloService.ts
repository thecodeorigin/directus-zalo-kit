/* eslint-disable no-console */
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

/**
 * ZaloService
 * Manages the connection, session, and data synchronization
 * for a Zalo account with Directus.
 */
export class ZaloService {
  private static instance: ZaloService | null = null
  private zalo = new Zalo({ selfListen: true, checkUpdate: false })
  private api: any = null
  private getSchemaFn: () => Promise<SchemaOverview>
  private ItemsService: any
  private redis: Redis | null = null

  // Directus schema and service cache
  private schema: SchemaOverview | null = null
  private serviceCache: { [key: string]: any } = {}
  private isSchemaLoading = false

  // Login and connection state
  private loginStatus: 'logged_out' | 'pending_qr' | 'logged_in' = 'logged_out'
  private loginQrCode: string | null = null
  private loginResolver: ((value: any) => void) | null = null
  private loginPendingData: {
    imei?: string
    userAgent?: string
    cookies?: any[]
  } | null = null

  // Listener and session state
  private listenerIsStarted = false
  private listenerReconnectAttempts = 0
  private readonly listenerMaxReconnectAttempts = 5
  private readonly listenerReconnectDelay = 5000
  private sessionIsRestoring = false
  private listenerKeepAliveInterval: NodeJS.Timeout | null = null

  private readonly systemAccountability = {
    admin: true,
    role: null,
    user: null,
  }

  private constructor(
    getSchemaFn: () => Promise<SchemaOverview>,
    ItemsService: any,
  ) {
    this.getSchemaFn = getSchemaFn
    this.ItemsService = ItemsService

    this.zalo = new Zalo({ selfListen: true, checkUpdate: false })

    this.redisInitialize()
    console.log('[ZaloService] Initialized')

    // Per request, keeping the 10s magic number.
    // This delay likely waits for Directus hooks or Redis to be fully available.
    setTimeout(() => {
      void this.sessionTryRestore()
    }, 10000)
  }

  // --- Public Static ---

  /**
   * Initializes the singleton instance of the ZaloService.
   * This method is idempotent and safe to call multiple times.
   */
  public static init(
    getSchemaFn: () => Promise<SchemaOverview>,
    ItemsService: any,
  ): ZaloService {
    if (ZaloService.instance) {
      console.warn(
        '[ZaloService] Instance already exists. Skipping re-initialization.',
      )
      return ZaloService.instance
    }
    ZaloService.instance = new ZaloService(getSchemaFn, ItemsService)
    return ZaloService.instance
  }

  /**
   * Gets the singleton instance of the ZaloService.
   * Throws an error if `init` has not been called.
   */
  public static getInstance(): ZaloService {
    if (!ZaloService.instance) {
      throw new Error('ZaloService has not been initialized')
    }
    return ZaloService.instance
  }

  // --- Service and Schema Management ---

  /**
   * Lazily loads and caches the Directus schema.
   */
  private async loadSchema(): Promise<SchemaOverview> {
    if (this.schema) {
      return this.schema
    }
    if (this.isSchemaLoading) {
      // Wait for the schema to be loaded by another concurrent call
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (!this.isSchemaLoading) {
            clearInterval(interval)
            resolve()
          }
        }, 100)
      })
      return this.schema!
    }

    try {
      this.isSchemaLoading = true
      this.schema = await this.getSchemaFn()
      return this.schema
    }
    catch (err: any) {
      console.error('[ZaloService] Failed to load schema:', err.message)
      throw new Error(`[ZaloService] Failed to load schema: ${err.message}`)
    }
    finally {
      this.isSchemaLoading = false
    }
  }

  /**
   * Gets a cached instance of a Directus ItemsService for a given collection.
   * Lazily initializes the schema if it's not already loaded.
   */
  private async getService(collectionName: string): Promise<any> {
    if (this.serviceCache[collectionName]) {
      return this.serviceCache[collectionName]
    }

    const schema = await this.loadSchema()
    if (!schema) {
      throw new Error('[ZaloService] Schema is not available.')
    }

    const service = new this.ItemsService(collectionName, {
      schema,
      accountability: this.systemAccountability,
    })
    this.serviceCache[collectionName] = service
    return service
  }

  // --- Utility Methods ---

  /**
   * Resets all service state to logged-out.
   */
  private utilCleanup() {
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
    this.listenerIsStarted = false
    this.loginStatus = 'logged_out'
    this.loginQrCode = null
    this.loginResolver = null
    this.listenerReconnectAttempts = 0
  }

  /**
   * Extracts a user ID from the Zalo cookie array.
   */
  private utilExtractUserIdFromCookies(cookies: any[]): string | null {
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

  /**
   * Gets a MIME type from a file extension.
   */
  private utilGetMimeTypeFromExtension(ext: string | undefined): string | null {
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

  // --- Redis & Session ---

  /**
   * Initializes the Redis client from environment variables.
   */
  private redisInitialize(): void {
    if (!process.env.REDIS_HOST)
      return

    try {
      this.redis = new Redis({
        host: process.env.REDIS_HOST,
        port: Number.parseInt(process.env.REDIS_PORT ?? '6379'),
      })

      this.redis.on('error', (err: any) => {
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

  private redisGetRedisKey(userId: string): string {
    return `zalo:session:${userId}`
  }

  /**
   * Attempts to restore one or all active sessions from storage.
   */
  public async sessionTryRestore(userId?: string): Promise<void> {
    if (this.sessionIsRestoring) {
      console.log(
        '[ZaloService] Session restore already in progress, skipping',
      )
      return
    }
    this.sessionIsRestoring = true

    try {
      console.log('[ZaloService] Checking for existing sessions...')

      if (userId) {
        const session = await this.sessionLoad(userId)
        if (session && this.sessionIsValid(session)) {
          await this.sessionRestoreLogin(session)
        }
        return
      }

      // Restore all sessions
      const sessions = await this.sessionListAll()
      console.log(
        `[ZaloService] Found ${sessions.length} session(s) to restore`,
      )

      for (const session of sessions) {
        if (this.sessionIsValid(session)) {
          console.log(
            `[ZaloService] Restoring session for user: ${session.userId}`,
          )
          await this.sessionRestoreLogin(session)
        }
      }
    }
    finally {
      this.sessionIsRestoring = false
    }
  }

  /**
   * Loads a session for a specific user, or the first one found.
   */
  public async sessionLoad(userId?: string): Promise<ZaloSession | null> {
    if (!userId) {
      const sessions = await this.sessionListAll()
      return sessions.length > 0 && sessions[0] !== undefined
        ? sessions[0]
        : null
    }

    const redisKey = this.redisGetRedisKey(userId)
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

  /**
   * Lists all Zalo sessions found in Redis.
   */
  public async sessionListAll(): Promise<ZaloSession[]> {
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

  /**
   * Validates the integrity of a session object.
   */
  private sessionIsValid(session: ZaloSession): boolean {
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

  /**
   * Logs into Zalo using a saved session object.
   */
  private async sessionRestoreLogin(session: ZaloSession): Promise<void> {
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
        id = this.utilExtractUserIdFromCookies(session.cookies || []) || null
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
        await this.sessionSave(session)
        this.sessionDelete(oldId)
      }

      this.loginStatus = 'logged_in'
      console.log(`[ZaloService] Restored session for user: ${id}`)
      this.listenerStart()
      this.listenerStartKeepAlive()

      try {
        await this.dbFetchAndUpsertUser(id)
        await this.syncGroups()
      }
      catch (err) {
        console.warn('[ZaloService] Sync after session restore failed:', err)
      }
    }
    catch (err: any) {
      console.error('[ZaloService] Restore login failed:', err.message)
      this.sessionDelete(session.userId)
    }
  }

  /**
   * Deletes a session from storage.
   */
  private sessionDelete(userId: string): void {
    console.log(
      '[ZaloService] Backing up and deleting session for user:',
      userId,
    )
    const redisKey = this.redisGetRedisKey(userId)
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

  /**
   * Saves a session object to Redis.
   */
  private async sessionSave(session: ZaloSession): Promise<void> {
    const sessionJson = JSON.stringify(session, null, 2)
    const userId = session.userId
    const redisKey = this.redisGetRedisKey(session.userId)

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

  /**
   * Gets the current session info, if any.
   */
  public async sessionGetInfo(): Promise<{
    userId: string | null
    loginTime: string | null
    isActive: boolean
  } | null> {
    try {
      const session = await this.sessionLoad()
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

  // --- Login / Logout ---

  /**
   * Gets the current connection status.
   */
  public loginGetStatus() {
    return {
      status: this.loginStatus,
      qrCode: this.loginQrCode,
      isListening: this.listenerIsStarted,
      userId: this.api?.getOwnId?.() || null,
    }
  }

  /**
   * Resets the login state and cleans up resources.
   */
  private loginReset() {
    this.utilCleanup() // Ensures listener is stopped
    this.loginStatus = 'logged_out'
    this.loginQrCode = null
    this.loginResolver = null
    this.listenerIsStarted = false
    this.listenerReconnectAttempts = 0
    this.loginPendingData = null
  }

  /**
   * Initiates a new login attempt via QR code.
   */
  public async loginInitiate(): Promise<any> {
    if (this.loginStatus !== 'logged_out') {
      return this.loginGetStatus()
    }

    this.loginStatus = 'pending_qr'
    return new Promise<any>((resolve, reject) => {
      this.loginResolver = resolve

      const timeout = setTimeout(() => {
        reject(new Error('Login timeout'))
        this.loginReset()
      }, 120000)

      this.zalo
        .loginQR({}, async (response: any) => {
          await this.loginHandleQRCallback(response)
        })
        .then(async (api: any) => {
          clearTimeout(timeout)
          await this.loginHandleSuccess(api)
          // The resolver might be cleared by finalize,
          // so we resolve the promise directly here too.
          resolve(this.loginGetStatus())
        })
        .catch((err: any) => {
          clearTimeout(timeout)
          console.error('[ZaloService] Login failed:', err)
          this.loginReset()
          reject(err)
        })
    })
  }

  /**
   * Handles QR code login events from `zca-js`.
   */
  private async loginHandleQRCallback(response: any): Promise<void> {
    match(response)
      .with(
        {
          type: LoginQRCallbackEventType.QRCodeGenerated,
          data: { image: P.select(P.string) },
        },
        (qrImage) => {
          this.loginQrCode = qrImage
          if (this.loginResolver) {
            this.loginResolver(this.loginGetStatus())
          }
        },
      )
      .with({ type: LoginQRCallbackEventType.QRCodeExpired }, () => {
        console.log('[ZaloService] QR code expired')
        this.loginReset()
      })
      .with({ type: LoginQRCallbackEventType.QRCodeDeclined }, () => {
        console.log('[ZaloService] QR code declined')
        this.loginReset()
      })
      .with(
        { type: LoginQRCallbackEventType.GotLoginInfo, data: P.select() },
        async (loginData) => {
          await this.loginHandleGotLoginInfo(loginData)
        },
      )
      .otherwise(() => {
        console.log('[ZaloService] Login event:', response.type)
      })
  }

  /**
   * Handles the `GotLoginInfo` event, storing temporary session data.
   */
  private async loginHandleGotLoginInfo(loginData: any): Promise<void> {
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
      this.loginPendingData = {
        imei,
        userAgent,
        cookies,
      }

      console.log(
        '[ZaloService] Login credentials stored temporarily, waiting for API initialization',
      )
      // Attempt to finalize login, in case the API resolved first.
      await this.loginFinalize()
    }
    catch (e: any) {
      console.warn('[ZaloService] GotLoginInfo handling failed:', e.message)
    }
  }

  /**
   * Handles the successful resolution of the `loginQR` promise.
   */
  private async loginHandleSuccess(api: any): Promise<void> {
    this.api = api
    // Attempt to finalize login, in case GotLoginInfo fired first.
    await this.loginFinalize()
  }

  /**
   * [FIX for Race Condition]
   * This method is called by both `loginHandleSuccess` (when API is ready)
   * and `loginHandleGotLoginInfo` (when session data is ready).
   * It only proceeds when *both* are available.
   */
  private async loginFinalize(): Promise<void> {
    // Check if both parts of the login are ready
    if (!this.api || !this.loginPendingData) {
      console.log(
        '[ZaloService] Finalizing login... waiting for all components.',
      )
      return
    }

    console.log('[ZaloService] API and session data are ready. Finalizing login.')
    this.loginStatus = 'logged_in'
    this.loginQrCode = null

    const userId = this.api?.getOwnId?.()

    if (!userId) {
      console.error('[ZaloService] Could not get userId from API')
      this.loginPendingData = null
      this.listenerStart()
      this.listenerStartKeepAlive()
      return
    }

    console.log(`[ZaloService] Using userId from API: ${userId}`)
    if (!userId || !/^\d+$/.test(userId)) {
      console.error(`[ZaloService] Invalid userId format: ${userId}`)
      this.loginPendingData = null
      this.listenerStart()
      this.listenerStartKeepAlive()
      return
    }

    if (userId.length < 8 || userId.length > 20) {
      console.warn(
        `[ZaloService] Skip saving - userId length unusual: ${userId} (${userId.length} chars)`,
      )
      this.loginPendingData = null
      this.listenerStart()
      this.listenerStartKeepAlive()
      return
    }

    console.log(
      `[ZaloService] userId validation passed: ${userId} (${userId.length} chars)`,
    )
    console.log(`[ZaloService] Login successful for user: ${userId}`)

    const session: ZaloSession = {
      userId,
      loginTime: new Date().toISOString(),
      isActive: true,
      imei: this.loginPendingData.imei!,
      userAgent: this.loginPendingData.userAgent!,
      cookies: this.loginPendingData.cookies!,
    }

    console.log(`[ZaloService] Session info: userId=${userId}`)

    if (
      !session.imei
      || !session.userAgent
      || !session.cookies
      || session.cookies.length === 0
    ) {
      console.error(
        '[ZaloService] Session validation failed - pendingLoginData incomplete:',
        {
          hasImei: !!session.imei,
          hasUserAgent: !!session.userAgent,
          cookiesCount: session.cookies?.length || 0,
        },
      )
      this.loginPendingData = null
      this.listenerStart()
      this.listenerStartKeepAlive()
      return
    }

    await this.sessionSave(session)

    // Clear pending data now that it's saved
    this.loginPendingData = null

    this.listenerStart()
    this.listenerStartKeepAlive()

    // Resolve the original promise from initiateLogin
    if (this.loginResolver) {
      this.loginResolver(this.loginGetStatus())
      this.loginResolver = null
    }

    console.log('Waiting for API to stabilize ....')
    await new Promise(resolve => setTimeout(resolve, 2000))

    try {
      if (!this.api) {
        console.error('[ZaloService] API is not initialized after login success')
        return
      }

      if (typeof this.api.getAllGroups !== 'function') {
        console.error('[ZaloService] API does not have getAllGroups function')
        console.error(
          '[ZaloService] Available API methods:',
          Object.keys(this.api || {}),
        )
        return
      }

      console.log('[ZaloService] API validation passed, starting sync...')

      // Sync user info
      await this.dbFetchAndUpsertUser(userId)
      console.log('[ZaloService] User info synced')

      // Sync groups
      console.log('[ZaloService] Starting group sync...')
      await this.syncGroups()
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

  /**
   * Logs in using session data from an external extractor tool.
   */
  public async loginImportSession(
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
      this.loginStatus = 'logged_in'
      this.loginQrCode = null

      let uid = this.api?.getOwnId?.()
      if (!uid) {
        uid = this.utilExtractUserIdFromCookies(cookies) || 'unknown'
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

      await this.sessionSave(session)
      this.listenerStart()
      this.listenerStartKeepAlive()
      try {
        await this.dbFetchAndUpsertUser(uid)
        await this.syncGroups()
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
      this.loginStatus = 'logged_out'
      throw err
    }
  }

  /**
   * Logs out a user and deletes their session.
   */
  public async loginLogout(userId?: string): Promise<void> {
    const targetUserId = userId || this.api?.getOwnId?.()

    let finalUserId = targetUserId
    if (!finalUserId) {
      const sessions = await this.sessionListAll()
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

    const currentUserId = this.api?.getOwnId?.()
    const isCurrentSession = currentUserId === finalUserId

    if (this.api && isCurrentSession) {
      try {
        await this.api.logout?.()
      }
      catch (err: any) {
        console.warn(
          `[ZaloService] Error during API logout for ${finalUserId}:`,
          err,
        )
      }
      finally {
        // Full cleanup of the active session
        await this.utilCleanup()
      }
    }

    // Always delete the session from storage
    try {
      this.sessionDelete(finalUserId)
    }
    catch (err: any) {
      console.error(
        `[ZaloService] Error cleaning up session for ${finalUserId}:`,
        err.message,
      )
      throw err
    }
  }

  // --- Zalo API Proxy ---

  /**
   * Sends a text message via the Zalo API.
   */
  public async apiSendMessage(
    content: { msg: string },
    threadId: string,
    threadType: typeof ThreadType.User | typeof ThreadType.Group = ThreadType.User,
  ): Promise<any> {
    if (!this.api) {
      throw new Error('Zalo API not initialized. Please login first.')
    }

    if (this.loginStatus !== 'logged_in') {
      throw new Error(`Zalo not logged in. Current status: ${this.loginStatus}`)
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

  /**
   * Sends a message and broadcasts it to Directus.
   */
  public async apiSendMessageWithBroadcast(data: {
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

      const messagesService = await this.getService('zalo_messages')

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
      await this.dbUpdateConversationLastMessage(
        conversationId,
        messageId,
        new Date(),
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

  // --- Event Listener ---

  /**
   * Starts the `zca-js` event listener.
   */
  private listenerStart() {
    if (!this.api || this.listenerIsStarted)
      return

    this.listenerIsStarted = true
    try {
      this.api.listener
        .on('message', async (msg: any) => {
          try {
            await this.listenerHandleMessage(msg.data || msg)
          }
          catch (error) {
            console.error('[ZaloService] Error handling message:', error)
          }
        })
        .on('reaction', async (react: any) => {
          try {
            await this.listenerHandleReaction(react.data || react)
          }
          catch (error) {
            console.error('[ZaloService] Error handling reaction:', error)
          }
        })
        .on('error', async (error: any) => {
          console.error('[ZaloService] Listener error:', error)
          this.listenerHandleError()
        })
        .start()

      this.listenerReconnectAttempts = 0
    }
    catch (err) {
      this.listenerIsStarted = false
      console.error('[ZaloService] startListener failed:', err)
      this.listenerHandleError()
    }
  }

  /**
   * Starts a keep-alive interval to maintain the connection.
   */
  private listenerStartKeepAlive() {
    if (this.listenerKeepAliveInterval)
      return
    this.listenerKeepAliveInterval = setInterval(async () => {
      if (this.loginStatus !== 'logged_in' || !this.api)
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
        this.listenerHandleError()
      }
    }, 1800000) // 30 minutes
  }

  /**
   * Handles incoming Zalo messages.
   */
  private async listenerHandleMessage(rawData: any) {
    try {
      const messageId = rawData.msgId
      const senderId = rawData.uidFrom
      const recipientId = rawData.idTo

      // const currentUserId = this.api?.getOwnId?.()

      if (!senderId || !recipientId) {
        console.error('[ZaloService] Missing senderId or recipientId:', {
          senderId,
          recipientId,
          rawData,
        })
        return
      }

      const messagesService = await this.getService('zalo_messages')

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
        const existingConv = await this.dbFindConversation(recipientId)
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
          await this.quickMessageHandle(content, recipientId, senderId)
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
          mimeType: this.utilGetMimeTypeFromExtension(parsedParams.fileExt),
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

      await this.syncStart(conversationId)

      await this.dbUpsertConversation(conversationId, rawData, senderId, recipientId)

      await this.dbFetchAndUpsertUser(senderId)

      if (isGroupMessage && groupId) {
        await this.dbEnsureGroupMember(groupId, senderId)
      }

      if (!isGroupMessage && recipientId && recipientId !== senderId) {
        await this.dbFetchAndUpsertUser(recipientId)
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
        await this.dbCreateAttachments(messageId, attachments)
      }

      await this.dbUpdateConversationLastMessage(
        conversationId,
        messageId,
        new Date(timestamp),
      )

      if (typeof rawData.content === 'string' && rawData.content.trim() && !rawData.content.startsWith('/')) {
        try {
          await this.labelAutoApply(conversationId, rawData.content)
        }
        catch (labelError) {
          console.error('[ZaloService] Auto-label failed:', labelError)
        }
      }

      await this.syncComplete(conversationId, messageId)
    }
    catch (error: any) {
      console.error('[ZaloService] Error handling message:', error)
      const conversationId = rawData.groupId || `direct_${rawData.uidFrom}_${rawData.idTo}`
      await this.syncFail(conversationId, error)
    }
  }

  /**
   * Handles incoming Zalo reactions.
   */
  private async listenerHandleReaction(rawData: any) {
    try {
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

      const service = await this.getService('zalo_reactions')

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

  /**
   * Handles listener errors and attempts reconnection.
   */
  private listenerHandleError() {
    if (this.listenerReconnectAttempts < this.listenerMaxReconnectAttempts) {
      this.listenerReconnectAttempts++
      const delay = this.listenerReconnectDelay * this.listenerReconnectAttempts
      setTimeout(() => this.listenerRestart(), delay)
    }
    else {
      this.loginReset()
    }
  }

  /**
   * Restarts the listener after an error.
   */
  private listenerRestart() {
    if (this.api && this.api.listener) {
      try {
        this.api.listener.stop()
        this.listenerIsStarted = false
        this.listenerStart()
      }
      catch (err) {
        console.error('[ZaloService] restartListener failed', err)
        this.listenerHandleError()
      }
    }
    else {
      this.listenerHandleError()
    }
  }

  // --- Database (Directus) Methods ---

  /**
   * Finds an existing conversation by ID or group ID.
   */
  private async dbFindConversation(id: string): Promise<any | null> {
    try {
      const conversationsService = await this.getService('zalo_conversations')

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

  /**
   * Ensures a user is marked as a member of a group.
   */
  private async dbEnsureGroupMember(
    groupId: string,
    userId: string,
  ) {
    try {
      const membersService = await this.getService('zalo_group_members')

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

  /**
   * Creates or updates a conversation in the database.
   */
  private async dbUpsertConversation(
    conversationId: string,
    rawData: any,
    senderId?: string,
    recipientId?: string,
  ) {
    try {
      const conversationsService = await this.getService('zalo_conversations')

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

  /**
   * Fetches user info from Zalo API and saves it to Directus.
   */
  private async dbFetchAndUpsertUser(userId: string) {
    try {
      const usersService = await this.getService('zalo_users')

      const existingUsers = await usersService.readByQuery({
        filter: { id: { _eq: userId } },
        limit: 1,
      })

      if (existingUsers.length > 0) {
        const existingUser = existingUsers[0]
        if (existingUser.display_name && existingUser.display_name !== 'Unknown User') {
          // Assume user data is fresh enough, skip API call
          return
        }
      }

      if (!this.api) {
        await this.dbCreateBasicUser(userId)
        return
      }

      let userInfo: any = null

      try {
        const apiResponse = await this.api.getUserInfo(userId)
        userInfo = apiResponse?.changed_profiles?.[userId] ?? null
      }
      catch {
        await this.dbCreateBasicUser(userId)
        return
      }

      if (!userInfo) {
        await this.dbCreateBasicUser(userId)
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
      await this.dbCreateBasicUser(userId)
    }
  }

  /**
   * Creates a placeholder user in Directus if API fetch fails.
   */
  private async dbCreateBasicUser(userId: string) {
    try {
      const usersService = await this.getService('zalo_users')

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

  /**
   * Creates or updates a group's info in Directus.
   */
  private async dbUpsertGroup(
    groupId: string,
    groupInfo: any,
  ) {
    try {
      const groupsService = await this.getService('zalo_groups')

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

  /**
   * Creates attachment records in Directus for a given message.
   */
  private async dbCreateAttachments(messageId: string, attachments: any[]) {
    try {
      if (!Array.isArray(attachments) || attachments.length === 0) {
        return
      }

      const attachmentsService = await this.getService('zalo_attachments')

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

  /**
   * Updates a conversation's last message ID and timestamp.
   */
  private async dbUpdateConversationLastMessage(
    conversationId: string,
    messageId: string,
    messageTime: Date,
  ) {
    try {
      const conversationsService = await this.getService('zalo_conversations')

      await conversationsService.updateOne(conversationId, {
        last_message_id: messageId,
        last_message_time: messageTime,
      })
    }
    catch (error) {
      console.error('[ZaloService] Error updating conversation last message:', error)
    }
  }

  /**
   * Creates or updates a group member's status in Directus.
   */
  private async dbUpsertGroupMember(
    groupId: string,
    userId: string,
    data: {
      isactive?: boolean
      joinedat?: Date | null
      leftat?: Date | null
    },
  ) {
    try {
      const membersService = await this.getService('zalo_group_members')

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

  /**
   * Gets all members of a specific group.
   */
  public async dbGetGroupMembers(groupId: string, activeOnly: boolean = true) {
    try {
      const service = await this.getService('zalo_group_members')

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

  /**
   * Marks a group member as having left.
   */
  public async dbMarkMemberLeft(groupId: string, userId: string) {
    await this.dbUpsertGroupMember(groupId, userId, {
      isactive: false,
      leftat: new Date(),
    })
  }

  /**
   * Marks a group member as having (re)joined.
   */
  public async dbMarkMemberRejoined(groupId: string, userId: string) {
    await this.dbUpsertGroupMember(groupId, userId, {
      isactive: true,
      joinedat: new Date(),
      leftat: null,
    })
  }

  /**
   * Gets all groups a specific user belongs to.
   */
  public async dbGetUserGroups(userId: string, activeOnly: boolean = true) {
    try {
      const service = await this.getService('zalo_group_members')

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

  // --- Sync ---

  /**
   * Fetches all groups from Zalo and syncs them to Directus.
   */
  public async syncGroups() {
    try {
      if (!this.api || typeof this.api.getAllGroups !== 'function') {
        console.error('[ZaloService] API not ready for syncGroups')
        return
      }
      const response = await this.api.getAllGroups()

      if (!response || !response.gridVerMap) {
        return
      }

      const gridVerMap = response.gridVerMap
      const groupIds = Object.keys(gridVerMap)
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
              this.dbUpsertGroup(groupId, groupInfo),
              this.dbUpsertConversation(groupId, {
                groupId: groupInfo.groupId || groupId,
                name: groupInfo.name || `Group ${groupId}`,
                avatar: groupInfo.fullAvt || groupInfo.avt || null,
                type: 'group',
              }),
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

  /**
   * Syncs the members of a specific group.
   */
  public async syncGroupMembers(groupId: string, groupInfo: any) {
    try {
      if (!groupInfo.memVerList || !Array.isArray(groupInfo.memVerList)) {
        return
      }

      const membersService = await this.getService('zalo_group_members')

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
              await this.dbFetchAndUpsertUser(userId)
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

              await this.dbUpsertGroupMember(groupId, userId, {
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

  /**
   * Creates or updates the sync status for a conversation.
   */
  public async syncUpsertStatus(conversationId: string, data: {
    is_syncing?: boolean
    last_message_id_synced?: string | null
    last_sync_at?: Date | null
    sync_errors?: any | null
  }) {
    try {
      const service = await this.getService('zalo_sync_status')

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

  /**
   * Gets the sync status for a conversation.
   */
  public async syncGetStatus(conversationId: string) {
    try {
      const service = await this.getService('zalo_sync_status')

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

  /**
   * Marks a conversation as currently syncing.
   */
  public async syncStart(conversationId: string) {
    await this.syncUpsertStatus(conversationId, {
      is_syncing: true,
      sync_errors: null,
    })
  }

  /**
   * Marks a conversation sync as complete.
   */
  public async syncComplete(conversationId: string, lastMessageId: string) {
    await this.syncUpsertStatus(conversationId, {
      is_syncing: false,
      last_message_id_synced: lastMessageId,
      last_sync_at: new Date(),
      sync_errors: null,
    })
  }

  /**
   * Marks a conversation sync as failed, storing the error.
   */
  public async syncFail(conversationId: string, error: any) {
    await this.syncUpsertStatus(conversationId, {
      is_syncing: false,
      sync_errors: {
        message: error.message,
        timestamp: new Date(),
        stack: error.stack,
      },
    })
  }

  // --- Labels ---

  /**
   * Automatically applies labels to a conversation based on message content.
   */
  private async labelAutoApply(conversationId: string, content: string) {
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
          const labelsService = await this.getService('zalo_labels')

          const existingLabel = await labelsService.readByQuery({
            filter: { id: { _eq: labelId } },
            limit: 1,
          })

          if (existingLabel.length === 0) {
            await this.labelCreatePredefined(labelId)
          }

          await this.labelAddToConversation(conversationId, labelId)
        }
      }
    }
    catch (error) {
      console.error('[ZaloService] Error auto-labeling:', error)
    }
  }

  /**
   * Creates a system-defined label if it doesn't exist.
   */
  private async labelCreatePredefined(labelId: string) {
    const labelConfig: Record<string, { name: string, color: string, desc: string }> = {
      label_vip: { name: 'VIP Customer', color: '#FFD700', desc: 'Khách hàng VIP' },
      label_support: { name: 'Support', color: '#4CAF50', desc: 'Yêu cầu hỗ trợ' },
      label_sales: { name: 'Sales', color: '#2196F3', desc: 'Liên quan bán hàng' },
      label_urgent: { name: 'Urgent', color: '#F44336', desc: 'Cần xử lý gấp' },
    }

    const config = labelConfig[labelId]
    if (config) {
      await this.labelUpsert(labelId, {
        name: config.name,
        description: config.desc,
        color_hex: config.color,
        is_system: true,
      })
    }
  }

  /**
   * Handles `/label` slash commands from a user.
   */
  private async labelHandleCommand(
    content: string,
    conversationId: string,
    senderId: string,
    recipientId: string,
  ) {
    try {
      const sendReply = async (msg: string) => {
        try {
          await this.apiSendMessage({ msg }, senderId)
        }
        catch (error: any) {
          if (error.code === 114 || error.message?.includes('not valid')) {
            await this.apiSendMessage({ msg }, recipientId)
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

      const labels = await this.labelGet()

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
        await this.labelAddToConversation(conversationId, label.id)
        await sendReply(`Added label "${label.name}"`)
      }
      else if (action === 'remove') {
        await this.labelRemoveFromConversation(conversationId, label.id)
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

  /**
   * Creates or updates a label in Directus.
   */
  public async labelUpsert(
    labelId: string,
    labelData: {
      name: string
      description?: string
      color_hex?: string
      is_system?: boolean
    },
  ) {
    try {
      const labelsService = await this.getService('zalo_labels')

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

  /**
   * Creates a new custom label.
   */
  public async labelCreate(name: string, options?: {
    description?: string
    color_hex?: string
    is_system?: boolean
  }) {
    try {
      const labelId = `label_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      await this.labelUpsert(
        labelId,
        {
          name,
          description: options?.description,
          color_hex: options?.color_hex,
          is_system: options?.is_system || false,
        },
      )

      return labelId
    }
    catch (error: any) {
      console.error('[ZaloService] Error creating label:', error.message)
      throw error
    }
  }

  /**
   * Gets all labels from Directus.
   */
  public async labelGet() {
    try {
      const labelsService = await this.getService('zalo_labels')

      return await labelsService.readByQuery({
        sort: ['name'],
      })
    }
    catch (error: any) {
      console.error('[ZaloService] Error getting labels:', error.message)
      return []
    }
  }

  /**
   * Updates an existing label.
   */
  public async labelUpdate(labelId: string, data: {
    name?: string
    description?: string
    color_hex?: string
    is_system?: boolean
  }) {
    try {
      const labelsService = await this.getService('zalo_labels')

      await labelsService.updateOne(labelId, data)
    }
    catch (error: any) {
      console.error('[ZaloService] Error updating label:', error.message)
      throw error
    }
  }

  /**
   * Deletes a label.
   */
  public async labelDelete(labelId: string) {
    try {
      const labelsService = await this.getService('zalo_labels')

      await labelsService.deleteOne(labelId)
    }
    catch (error: any) {
      console.error('[ZaloService] Error deleting label:', error.message)
      throw error
    }
  }

  /**
   * Associates a label with a conversation.
   */
  public async labelAddToConversation(conversationId: string, labelId: string) {
    try {
      const service = await this.getService('zalo_conversation_labels')

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

  /**
   * Removes a label from a conversation.
   */
  public async labelRemoveFromConversation(conversationId: string, labelId: string) {
    try {
      const service = await this.getService('zalo_conversation_labels')

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

  /**
   * Gets all labels for a specific conversation.
   */
  public async labelGetForConversation(conversationId: string) {
    try {
      const service = await this.getService('zalo_conversation_labels')

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

  // --- Quick Messages ---

  /**
   * Handles incoming slash commands for quick messages or labels.
   */
  private async quickMessageHandle(content: string, recipientId: string, senderId: string) {
    try {
      const trimmedContent = content.trim()

      if (trimmedContent.startsWith('/label ')) {
        const userIds = [senderId, recipientId].filter(Boolean).sort()
        const conversationId = userIds.length === 2
          ? `direct_${userIds[0]}_${userIds[1]}`
          : `thread_${recipientId || senderId}`

        await this.labelHandleCommand(trimmedContent, conversationId, senderId, recipientId)
        return
      }

      const quickMsg = await this.quickMessageFindByKeyword(trimmedContent)

      if (quickMsg) {
        await this.quickMessageIncrementUsage(quickMsg.id)

        try {
          await this.apiSendMessage({ msg: quickMsg.content }, senderId)
        }
        catch (error: any) {
          if (error.code === 114 || error.message?.includes('không hợp lệ')) {
            await this.apiSendMessage({ msg: quickMsg.content }, recipientId)
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

  /**
   * Creates a new quick message.
   */
  public async quickMessageCreate(data: {
    keyword: string
    title: string
    content: string
    media_attachment?: string | null
    is_active?: boolean
  }) {
    try {
      const service = await this.getService('zalo_quick_messages')

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

  /**
   * Gets all quick messages.
   */
  public async quickMessageGet(activeOnly: boolean = true) {
    try {
      const service = await this.getService('zalo_quick_messages')

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

  /**
   * Finds a quick message by its keyword.
   */
  public async quickMessageFindByKeyword(keyword: string) {
    try {
      const service = await this.getService('zalo_quick_messages')

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

  /**
   * Updates a quick message.
   */
  public async quickMessageUpdate(id: string, data: {
    keyword?: string
    title?: string
    content?: string
    media_attachment?: string | null
    is_active?: boolean
  }) {
    try {
      const service = await this.getService('zalo_quick_messages')
      await service.updateOne(id, data)
    }
    catch (error: any) {
      console.error('[ZaloService] Error updating quick message:', error.message)
      throw error
    }
  }

  /**
   * Increments the usage count of a quick message.
   */
  public async quickMessageIncrementUsage(id: string) {
    try {
      const service = await this.getService('zalo_quick_messages')
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

  /**
   * Deletes a quick message.
   */
  public async quickMessageDelete(id: string) {
    try {
      const service = await this.getService('zalo_quick_messages')
      await service.deleteOne(id)
    }
    catch (error: any) {
      console.error('[ZaloService] Error deleting quick message:', error.message)
      throw error
    }
  }

  // --- Redis Admin ---

  /**
   * Gets the status of the Redis connection.
   */
  public async redisGetStatus() {
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

  /**
   * Gets one or all sessions directly from Redis.
   */
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

      const raw = await this.redis.get(this.redisGetRedisKey(userId))
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

  /**
   * Scans for keys in Redis matching a pattern.
   */
  public async redisGetKeys(pattern = '*', limit = 1000) {
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

  /**
   * Gets a raw value from Redis by key.
   */
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
