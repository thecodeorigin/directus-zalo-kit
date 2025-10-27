import Redis from 'ioredis'
import { match, P } from 'ts-pattern'
import { LoginQRCallbackEventType, Zalo } from 'zca-js'

export interface ZaloSession {
  userId: string
  loginTime: string
  isActive: boolean
  imei?: string
  userAgent?: string
  cookies?: any[]
}

/**
 * ZaloLoginService
 * Manages all login, session persistence, and Redis operations for Zalo.
 * This service handles:
 * - QR code login flow
 * - Session saving/loading/restoring
 * - Redis persistence
 * - Login state management
 */
export class ZaloLoginService {
  private static instance: ZaloLoginService | null = null

  private zalo = new Zalo({ selfListen: true, checkUpdate: false })
  private api: any = null
  private redis: Redis | null = null

  // Login and connection state
  private loginStatus: 'logged_out' | 'pending_qr' | 'logged_in' = 'logged_out'
  private loginQrCode: string | null = null
  private loginResolver: ((value: any) => void) | null = null
  private loginPendingData: {
    imei?: string
    userAgent?: string
    cookies?: any[]
  } | null = null

  // Session restoration state
  private sessionIsRestoring = false

  // Keep-alive state
  private keepAliveInterval: NodeJS.Timeout | null = null

  private constructor() {
    this.zalo = new Zalo({ selfListen: true, checkUpdate: false })
    this.redisInitialize()
    console.log('[ZaloLoginService] Initialized')
  }

  // --- Singleton Instance ---

  /**
   * Gets the singleton instance of ZaloLoginService.
   * Creates it if it doesn't exist.
   */
  public static getInstance(): ZaloLoginService {
    if (!ZaloLoginService.instance) {
      ZaloLoginService.instance = new ZaloLoginService()
    }
    return ZaloLoginService.instance
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
        console.error('[ZaloLoginService] Redis connection error:', err.message)
        this.redis = null
      })

      console.log('[ZaloLoginService] Redis client initialized')
    }
    catch (err: any) {
      console.error('[ZaloLoginService] Failed to initialize Redis:', err.message)
      this.redis = null
    }
  }

  /**
   * Generates a Redis key for a user session.
   */
  private redisGetRedisKey(userId: string): string {
    return `zalo:session:${userId}`
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
        console.log(`[ZaloLoginService] Session saved to Redis: ${userId}`)

        const verifyRaw = await this.redis.get(redisKey)
        if (verifyRaw) {
          JSON.parse(verifyRaw)
          console.log(`[ZaloLoginService] Session verified in Redis for ${userId}`)
        }
      }
      catch (err: any) {
        console.error(
          `[ZaloLoginService] Error saving session to Redis for ${userId}:`,
          err.message,
        )
      }
    }
  }

  /**
   * Deletes a session from storage.
   */
  private sessionDelete(userId: string): void {
    console.log(
      '[ZaloLoginService] Backing up and deleting session for user:',
      userId,
    )
    const redisKey = this.redisGetRedisKey(userId)
    if (this.redis) {
      try {
        this.redis.del(redisKey)
        console.log(
          '[ZaloLoginService] Session deleted from Redis for user:',
          userId,
        )
      }
      catch (err: any) {
        console.error(
          '[ZaloLoginService] Failed to delete session from Redis for user:',
          userId,
          err.message,
        )
      }
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
        console.log(`[ZaloLoginService] Checking Redis for user ${userId}...`)
        const raw = await this.redis.get(redisKey)
        if (raw && raw.trim() !== '') {
          const session = JSON.parse(raw)
          console.log(`[ZaloLoginService] Redis session loaded for ${userId}`)
          return session
        }
      }
      catch (err: any) {
        console.error(
          `[ZaloLoginService] Error reading Redis for ${userId}:`,
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
              console.error(`[ZaloLoginService] Failed to parse Redis key ${key}`)
            }
          }
        }
      }
      catch (err) {
        console.error('[ZaloLoginService] Error listing Redis sessions:', err)
      }
    }

    return sessions
  }

  /**
   * Validates the integrity of a session object.
   */
  private sessionIsValid(session: ZaloSession): boolean {
    if (!session) {
      console.warn('[ZaloLoginService] Session object is null/undefined')
      return false
    }

    if (
      !session.cookies
      || !Array.isArray(session.cookies)
      || session.cookies.length === 0
    ) {
      console.warn('[ZaloLoginService] Session missing or empty cookies array')
      return false
    }

    if (!session.imei || typeof session.imei !== 'string') {
      console.warn('[ZaloLoginService] Session missing valid imei')
      return false
    }

    if (!session.userAgent || typeof session.userAgent !== 'string') {
      console.warn('[ZaloLoginService] Session missing valid userAgent')
      return false
    }

    console.log('[ZaloLoginService] Session validation passed')
    return true
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
      console.error('[ZaloLoginService] getSessionInfo error:', err.message)
      return null
    }
  }

  /**
   * Attempts to restore one or all active sessions from storage.
   * This should be called by ZaloService with a callback for what to do after restoration.
   */
  public async sessionTryRestore(
    afterRestoreCallback?: (session: ZaloSession, api: any) => Promise<void>,
    userId?: string,
  ): Promise<void> {
    if (this.sessionIsRestoring) {
      console.log(
        '[ZaloLoginService] Session restore already in progress, skipping',
      )
      return
    }
    this.sessionIsRestoring = true

    try {
      console.log('[ZaloLoginService] Checking for existing sessions...')

      if (userId) {
        const session = await this.sessionLoad(userId)
        if (session && this.sessionIsValid(session)) {
          await this.sessionRestoreLogin(session, afterRestoreCallback)
        }
        return
      }

      // Restore all sessions
      const sessions = await this.sessionListAll()
      console.log(
        `[ZaloLoginService] Found ${sessions.length} session(s) to restore`,
      )

      for (const session of sessions) {
        if (this.sessionIsValid(session)) {
          console.log(
            `[ZaloLoginService] Restoring session for user: ${session.userId}`,
          )
          await this.sessionRestoreLogin(session, afterRestoreCallback)
        }
      }
    }
    finally {
      this.sessionIsRestoring = false
    }
  }

  /**
   * Logs into Zalo using a saved session object.
   */
  private async sessionRestoreLogin(
    session: ZaloSession,
    afterRestoreCallback?: (session: ZaloSession, api: any) => Promise<void>,
  ): Promise<void> {
    try {
      console.log('[ZaloLoginService] Attempting login with saved session...')

      if (!session.cookies || !Array.isArray(session.cookies)) {
        throw new Error('Session cookies are missing or invalid')
      }

      const api = await this.zalo.login({
        cookie: session.cookies as any[],
        imei: session.imei!,
        userAgent: session.userAgent!,
      })

      let id: string | null = api?.getOwnId?.()
      if (!id) {
        id = this.utilExtractUserIdFromCookies(session.cookies || [])
      }
      if (!id) {
        throw new Error('Restored api has no own id')
      }

      if (id !== session.userId) {
        const oldId = session.userId
        console.warn(
          `[ZaloLoginService] ID mismatch! Saved: ${session.userId}, API: ${id}. Updating to API value.`,
        )
        session.userId = id
        await this.sessionSave(session)
        this.sessionDelete(oldId)
      }

      this.api = api
      this.loginStatus = 'logged_in'
      console.log(`[ZaloLoginService] Restored session for user: ${id}`)

      // Call the callback with the restored session and API
      if (afterRestoreCallback) {
        await afterRestoreCallback(session, api)
      }
    }
    catch (err: any) {
      console.error('[ZaloLoginService] Restore login failed:', err.message)
      this.sessionDelete(session.userId)
    }
  }

  // --- Utility Methods ---

  /**
   * Extracts a user ID from the Zalo cookie array.
   */
  public utilExtractUserIdFromCookies(cookies: any[]): string | null {
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

  // --- Login / Logout ---

  /**
   * Gets the current connection status.
   */
  public loginGetStatus() {
    return {
      status: this.loginStatus,
      qrCode: this.loginQrCode,
      userId: this.api?.getOwnId?.() || null,
    }
  }

  /**
   * Resets the login state and cleans up resources.
   */
  private loginReset() {
    if (this.api?.listener) {
      try {
        this.api.listener.stop()
        console.log('[ZaloLoginService] Listener stopped during cleanup')
      }
      catch (err) {
        console.error(
          '[ZaloLoginService] Error stopping listener during cleanup:',
          err,
        )
      }
    }
    this.api = null
    this.loginStatus = 'logged_out'
    this.loginQrCode = null
    this.loginResolver = null
    this.loginPendingData = null
  }

  /**
   * Initiates a new login attempt via QR code.
   * Returns a promise that resolves when the login is complete.
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
          console.error('[ZaloLoginService] Login failed:', err)
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
        console.log('[ZaloLoginService] QR code expired')
        this.loginReset()
      })
      .with({ type: LoginQRCallbackEventType.QRCodeDeclined }, () => {
        console.log('[ZaloLoginService] QR code declined')
        this.loginReset()
      })
      .with(
        { type: LoginQRCallbackEventType.GotLoginInfo, data: P.select() },
        async (loginData) => {
          await this.loginHandleGotLoginInfo(loginData)
        },
      )
      .otherwise(() => {
        console.log('[ZaloLoginService] Login event:', response.type)
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
          '[ZaloLoginService] Skipping GotLoginInfo: missing cookies/imei/userAgent',
        )
        return
      }
      this.loginPendingData = {
        imei,
        userAgent,
        cookies,
      }

      console.log(
        '[ZaloLoginService] Login credentials stored temporarily, waiting for API initialization',
      )
      // Attempt to finalize login, in case the API resolved first.
      await this.loginFinalize()
    }
    catch (e: any) {
      console.warn('[ZaloLoginService] GotLoginInfo handling failed:', e.message)
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
   * Calls the provided finalize callback when ready.
   */
  public async loginFinalize(
    finalizeCallback?: (session: ZaloSession, api: any) => Promise<void>,
  ): Promise<void> {
    // Check if both parts of the login are ready
    if (!this.api || !this.loginPendingData) {
      console.log(
        '[ZaloLoginService] Finalizing login... waiting for all components.',
      )
      return
    }

    console.log('[ZaloLoginService] API and session data are ready. Finalizing login.')
    this.loginStatus = 'logged_in'
    this.loginQrCode = null

    const userId = this.api?.getOwnId?.()

    if (!userId) {
      console.error('[ZaloLoginService] Could not get userId from API')
      this.loginPendingData = null
      return
    }

    console.log(`[ZaloLoginService] Using userId from API: ${userId}`)
    if (!userId || !/^\d+$/.test(userId)) {
      console.error(`[ZaloLoginService] Invalid userId format: ${userId}`)
      this.loginPendingData = null
      return
    }

    if (userId.length < 8 || userId.length > 20) {
      console.warn(
        `[ZaloLoginService] Skip saving - userId length unusual: ${userId} (${userId.length} chars)`,
      )
      this.loginPendingData = null
      return
    }

    console.log(
      `[ZaloLoginService] userId validation passed: ${userId} (${userId.length} chars)`,
    )
    console.log(`[ZaloLoginService] Login successful for user: ${userId}`)

    const session: ZaloSession = {
      userId,
      loginTime: new Date().toISOString(),
      isActive: true,
      imei: this.loginPendingData.imei!,
      userAgent: this.loginPendingData.userAgent!,
      cookies: this.loginPendingData.cookies!,
    }

    console.log(`[ZaloLoginService] Session info: userId=${userId}`)

    if (
      !session.imei
      || !session.userAgent
      || !session.cookies
      || session.cookies.length === 0
    ) {
      console.error(
        '[ZaloLoginService] Session validation failed - pendingLoginData incomplete:',
        {
          hasImei: !!session.imei,
          hasUserAgent: !!session.userAgent,
          cookiesCount: session.cookies?.length || 0,
        },
      )
      this.loginPendingData = null
      return
    }

    await this.sessionSave(session)

    // Clear pending data now that it's saved
    this.loginPendingData = null

    // Resolve the original promise from initiateLogin
    if (this.loginResolver) {
      this.loginResolver(this.loginGetStatus())
      this.loginResolver = null
    }

    // Call the finalize callback if provided (for ZaloService to sync data)
    if (finalizeCallback) {
      console.log('Waiting for API to stabilize ....')
      await new Promise(resolve => setTimeout(resolve, 2000))

      try {
        if (!this.api) {
          console.error('[ZaloLoginService] API is not initialized after login success')
          return
        }

        if (typeof this.api.getAllGroups !== 'function') {
          console.error('[ZaloLoginService] API does not have getAllGroups function')
          console.error(
            '[ZaloLoginService] Available API methods:',
            Object.keys(this.api || {}),
          )
          return
        }

        console.log('[ZaloLoginService] API validation passed, calling finalize callback...')
        await finalizeCallback(session, this.api)
      }
      catch (err: any) {
        console.error('[ZaloLoginService] Finalize callback failed:', err.message)
        console.error('[ZaloLoginService] Error stack:', err.stack)
      }
    }
  }

  /**
   * Logs in using session data from an external extractor tool.
   */
  public async loginImportSession(
    imei: string,
    userAgent: string,
    cookies: any[],
  ): Promise<{ ok: boolean, userId: string, api: any }> {
    if (
      !imei
      || !userAgent
      || !Array.isArray(cookies)
      || cookies.length === 0
    ) {
      throw new Error('imei, userAgent, and cookies are required')
    }

    try {
      console.log('[ZaloLoginService] Logging in using imported extractor data...')
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
          `[ZaloLoginService] getOwnId() failed, fell back to cookie: ${uid}`,
        )
      }
      if (!uid || uid === 'unknown' || uid.length < 10) {
        throw new Error('Invalid user ID after login; check credentials')
      }

      console.log(`[ZaloLoginService] Login successful (import) for ${uid}`)

      const session: ZaloSession = {
        userId: uid,
        loginTime: new Date().toISOString(),
        isActive: true,
        imei,
        userAgent,
        cookies,
      }

      await this.sessionSave(session)

      return { ok: true, userId: uid, api }
    }
    catch (err: any) {
      console.error(
        '[ZaloLoginService] Import session from extractor failed:',
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
          `[ZaloLoginService] No userId provided, using first session: ${finalUserId}`,
        )
      }
    }

    if (!finalUserId) {
      console.warn('[ZaloLoginService] No userId found to logout')
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
          `[ZaloLoginService] Error during API logout for ${finalUserId}:`,
          err,
        )
      }
      finally {
        // Full cleanup of the active session
        this.loginReset()
      }
    }

    // Always delete the session from storage
    try {
      this.sessionDelete(finalUserId)
    }
    catch (err: any) {
      console.error(
        `[ZaloLoginService] Error cleaning up session for ${finalUserId}:`,
        err.message,
      )
      throw err
    }
  }

  /**
   * Gets the API instance for direct access.
   */
  public getApi(): any {
    return this.api
  }

  /**
   * Sets the API instance (useful for restoration).
   */
  public setApi(api: any): void {
    this.api = api
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

  // --- Keep-Alive Management ---

  /**
   * Starts a keep-alive interval to maintain the connection.
   * Calls getUserInfo periodically to keep the session alive.
   */
  public startKeepAlive(): void {
    if (this.keepAliveInterval)
      return

    if (!this.api) {
      console.warn('[ZaloLoginService] Cannot start keep-alive: API not initialized')
      return
    }

    this.keepAliveInterval = setInterval(async () => {
      if (!this.api)
        return

      try {
        const ownId = this.api.getOwnId()
        if (ownId) {
          await this.api.getUserInfo(ownId)
          console.log('[ZaloLoginService] Keep-alive ping sent via getUserInfo')
        }
        else {
          console.warn('[ZaloLoginService] Skip keep-alive: No ownId available')
        }
      }
      catch (err) {
        console.error('[ZaloLoginService] Keep-alive error:', err)
      }
    }, 1800000) // 30 minutes
  }

  /**
   * Stops the keep-alive interval.
   */
  public stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval)
      this.keepAliveInterval = null
      console.log('[ZaloLoginService] Keep-alive stopped')
    }
  }
}

export default ZaloLoginService
