import Redis from 'ioredis'

/**
 * ZaloLoginService - Function-based Module
 * Manages Zalo login, session storage, and authentication
 */

// Module-level state
let zalo: any = null
let api: any = null
let redis: Redis | null = null

// Login state
let loginStatus: 'logged_out' | 'pending_qr' | 'logged_in' = 'logged_out'
let loginQrCode: string | null = null
let loginUserId: string | null = null
let loginPendingData: {
  imei?: string
  userAgent?: string
  cookies?: any[]
} | null = null
let loginResolver: ((value: any) => void) | null = null

// Session restoration state
let sessionIsRestoring = false

// Keep-alive state
let keepAliveInterval: NodeJS.Timeout | null = null

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize Zalo instance with dynamic import
 */
export async function initialize() {
  if (zalo) {
    console.warn('[ZaloLogin] Already initialized')
    return
  }

  const { Zalo } = await import('zca-js')
  zalo = new Zalo({ selfListen: true, checkUpdate: false })

  await initializeRedis()
  console.warn('[ZaloLogin] Initialized')
}

/**
 * Initialize Redis connection
 */
async function initializeRedis() {
  if (redis)
    return

  redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number.parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
  })

  redis.on('error', (err: any) => {
    console.error('[ZaloLogin] Redis connection error:', err.message)
    redis = null
  })

  console.warn('[ZaloLogin] Redis client initialized')
}

// ============================================================================
// API ACCESS
// ============================================================================

/**
 * Get current API instance
 */
export function getApi() {
  return api
}

// ============================================================================
// SESSION STORAGE (REDIS)
// ============================================================================

/**
 * Save session to Redis
 */
export async function sessionSave(session: any) {
  if (!redis) {
    console.error('[ZaloLogin] Redis not initialized')
    return
  }

  try {
    const sessionKey = `zalo:session:${session.userId}`
    await redis.set(sessionKey, JSON.stringify(session), 'EX', 60 * 60 * 24 * 7) // 7 days
    console.warn(`[ZaloLogin] Session saved to Redis: ${session.userId}`)

    // Verify
    const saved = await redis.get(sessionKey)
    if (saved) {
      console.warn(`[ZaloLogin] Session verified in Redis for ${session.userId}`)
    }
  }
  catch (error) {
    console.error('[ZaloLogin] Error saving session to Redis:', error)
  }
}

/**
 * Delete session from Redis
 */
export async function sessionDelete(userId: string) {
  if (!redis)
    return

  console.warn('[ZaloLogin] Deleting session for user:', userId)

  try {
    const sessionKey = `zalo:session:${userId}`
    await redis.del(sessionKey)
    console.warn('[ZaloLogin] Session deleted from Redis for user:', userId)
  }
  catch (error) {
    console.error('[ZaloLogin] Error deleting session:', error)
  }
}

/**
 * Load session from Redis
 */
export async function sessionLoad(userId?: string) {
  if (!redis) {
    console.error('[ZaloLogin] Redis not initialized')
    return null
  }

  try {
    if (userId) {
      console.warn(`[ZaloLogin] Checking Redis for user ${userId}...`)
      const sessionKey = `zalo:session:${userId}`
      const data = await redis.get(sessionKey)
      if (data) {
        console.warn(`[ZaloLogin] Redis session loaded for ${userId}`)
        return JSON.parse(data)
      }
    }
    else {
      // Get all sessions
      const keys = await redis.keys('zalo:session:*')
      if (keys.length > 0) {
        const sessions: any[] = []
        for (const key of keys) {
          const data = await redis.get(key)
          if (data) {
            sessions.push(JSON.parse(data))
          }
        }
        return sessions
      }
    }
  }
  catch (error) {
    console.error('[ZaloLogin] Error loading session from Redis:', error)
  }

  return null
}

/**
 * Get session info
 */
export async function sessionGetInfo() {
  const sessions = await sessionLoad()
  if (Array.isArray(sessions) && sessions.length > 0) {
    return sessions[0]
  }
  return null
}

/**
 * Validate a session
 */
function sessionValidate(session: any): boolean {
  if (!session.userId || !session.imei || !session.userAgent || !session.cookies) {
    console.error('[ZaloLogin] Invalid session: missing required fields')
    return false
  }

  if (!Array.isArray(session.cookies) || session.cookies.length === 0) {
    console.error('[ZaloLogin] Invalid session: cookies must be a non-empty array')
    return false
  }

  console.warn('[ZaloLogin] Session validation passed')
  return true
}

/**
 * Restore session from cookie
 */
async function sessionRestoreFromCookie(session: any) {
  if (!sessionValidate(session)) {
    throw new Error('Invalid session data')
  }

  const { imei, userAgent, cookies } = session

  try {
    const apiInstance = await zalo.login(
      {
        imei: imei!,
        userAgent: userAgent!,
        cookie: cookies!,
      },
      async (api: any, ctx: any) => {
        console.warn(`[ZaloLogin] Login callback triggered for ${ctx.uid}`)
      },
    )

    // zalo.login() returns the API instance directly
    return apiInstance
  }
  catch (error: any) {
    return { error: error.message || 'Login failed' }
  }
}

/**
 * Try to restore sessions from Redis on startup
 */
export async function sessionTryRestore(callback?: (result: any) => void) {
  if (sessionIsRestoring) {
    console.warn('[ZaloLogin] Session restore already in progress, skipping')
    return
  }

  try {
    sessionIsRestoring = true
    console.warn('[ZaloLogin] Checking for existing sessions...')

    const sessions = await sessionLoad()

    if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
      console.warn('[ZaloLogin] No saved sessions found in Redis')
      return
    }

    console.warn(`[ZaloLogin] Found ${sessions.length} session(s) to restore`)

    for (const session of sessions) {
      try {
        console.warn(`[ZaloLogin] Restoring session for user: ${session.userId}`)
        await loginRestoreSession(session, callback)
      }
      catch (error) {
        console.error(`[ZaloLogin] Failed to restore session for ${session.userId}:`, error)
      }
    }
  }
  catch (error) {
    console.error('[ZaloLogin] Error in sessionTryRestore:', error)
  }
  finally {
    sessionIsRestoring = false
  }
}

/**
 * Restore a specific session
 */
async function loginRestoreSession(session: any, callback?: (result: any) => void) {
  console.warn('[ZaloLogin] Attempting login with saved session...')

  const loginResult = await sessionRestoreFromCookie(session)

  // Handle error response
  if (loginResult && typeof loginResult === 'object' && 'error' in loginResult) {
    console.error('[ZaloLogin] Login failed:', loginResult.error)
    throw new Error(String(loginResult.error))
  }

  // loginResult is the API instance
  if (loginResult) {
    api = loginResult
    loginStatus = 'logged_in'
    loginQrCode = null

    const userId = api.getCurrentUserId?.() || api.getOwnId?.() || session.userId || 'unknown'
    console.warn(`[ZaloLogin] Restored session for user: ${userId}`)

    if (callback) {
      callback({ api, userId })
    }

    return { api, userId }
  }

  throw new Error('Failed to restore session: No API instance returned')
}

// ============================================================================
// LOGIN STATUS & MANAGEMENT
// ============================================================================

/**
 * Get current login status
 */
export function loginGetStatus() {
  if (loginStatus === 'logged_in' && api) {
    // Try different ways to get listener status
    let isListening = false
    try {
      const listener = api.listener
      isListening = listener?.isListening?.() || false
    }
    catch {
      // Ignore - listener might not be available
    }

    return {
      status: loginStatus,
      qrCode: null,
      isListening,
      userId: loginUserId || api.getOwnId?.() || null,
    }
  }

  return {
    status: loginStatus,
    qrCode: loginQrCode,
    isListening: false,
    userId: null,
  }
}

/**
 * Reset login state
 */
function loginReset() {
  if (api) {
    try {
      // Try different ways to get listener
      const listener = api.getListener?.() || api.listener
      if (listener?.stop) {
        listener.stop()
        console.warn('[ZaloLogin] Listener stopped during cleanup')
      }
    }
    catch (err) {
      console.error('[ZaloLogin] Error stopping listener during cleanup:', err)
    }
  }
  api = null
  loginStatus = 'logged_out'
  loginQrCode = null
  loginUserId = null
  loginResolver = null
  loginPendingData = null
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract userId from cookies
 */
function extractUserIdFromCookies(cookies: any[]): string | null {
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

// ============================================================================
// QR LOGIN
// ============================================================================

/**
 * Handle QR callback events
 */
async function handleQRCallback(response: any) {
  const eventType = response.type

  // QR code generated (type 0)
  if (eventType === 0 && response.data?.image) {
    loginQrCode = response.data.image
    console.warn('[ZaloLogin] QR Code generated')

    // Resolve immediately with QR code
    if (loginResolver) {
      loginResolver(loginGetStatus())
    }
  }
  // Got login info - BEFORE scan (type 1) - not used in current flow
  else if (eventType === 1 && response.data) {
    await handleGotLoginInfo(response.data)
  }
  // QR scanned - waiting for confirmation (type 2)
  else if (eventType === 2) {
    console.warn('[ZaloLogin] QR scanned, waiting for confirmation...')
    // Don't reset! Just waiting for user to confirm on phone
  }
  // QR code declined (type 3)
  else if (eventType === 3) {
    console.warn('[ZaloLogin] QR code declined by user')
    loginReset()
  }
  // Login successful with credentials (type 4)
  else if (eventType === 4 && response.data) {
    console.warn('[ZaloLogin] Login successful, got credentials')
    await handleGotLoginInfo(response.data)
  }
  else {
    console.warn('[ZaloLogin] Unknown QR callback event:', eventType, response)
  }
}

/**
 * Handle got login info event
 */
async function handleGotLoginInfo(loginData: any) {
  try {
    const cookies = loginData?.cookie ?? loginData?.cookies ?? null
    const imei = loginData?.imei
    const userAgent = loginData?.userAgent

    if (!cookies || !Array.isArray(cookies) || cookies.length === 0 || !imei || !userAgent) {
      console.warn('[ZaloLogin] Skipping GotLoginInfo: missing cookies/imei/userAgent')
      return
    }

    loginPendingData = {
      imei,
      userAgent,
      cookies,
    }

    console.warn('[ZaloLogin] Login credentials stored temporarily, waiting for API initialization')

    // Try to finalize if API is ready
    await finalizeLogin()
  }
  catch (e: any) {
    console.warn('[ZaloLogin] GotLoginInfo handling failed:', e.message)
  }
}

/**
 * Handle login success (API ready)
 */
async function handleLoginSuccess(apiInstance: any) {
  api = apiInstance
  console.warn('[ZaloLogin] API instance received')

  // Try to finalize if credentials are ready
  await finalizeLogin()
}

/**
 * Finalize login when both API and credentials are ready
 */
async function finalizeLogin() {
  // Check if both parts are ready
  if (!api || !loginPendingData) {
    console.warn('[ZaloLogin] Waiting for all components...', {
      hasApi: !!api,
      hasPendingData: !!loginPendingData,
    })
    return
  }

  console.warn('[ZaloLogin] Both API and credentials ready, finalizing...')

  loginStatus = 'logged_in'
  loginQrCode = null

  // Get userId from API
  let userId = api.getOwnId?.() || api.getCurrentUserId?.()

  // Fallback to extracting from cookies if API doesn't provide it
  if (!userId && loginPendingData.cookies) {
    userId = extractUserIdFromCookies(loginPendingData.cookies)
  }

  if (!userId) {
    console.error('[ZaloLogin] Could not get userId from API or cookies')
    loginPendingData = null
    return
  }

  console.warn(`[ZaloLogin] Using userId: ${userId}`)

  // Validate userId format
  if (!/^\d+$/.test(userId)) {
    console.error(`[ZaloLogin] Invalid userId format: ${userId}`)
    loginPendingData = null
    return
  }

  if (userId.length < 8 || userId.length > 20) {
    console.warn(`[ZaloLogin] Skip saving - userId length unusual: ${userId} (${userId.length} chars)`)
    loginPendingData = null
    return
  }

  console.warn(`[ZaloLogin] userId validation passed: ${userId} (${userId.length} chars)`)
  console.warn(`[ZaloLogin] Login successful for user: ${userId}`)

  // Create session object
  const session = {
    userId,
    loginTime: new Date().toISOString(),
    isActive: true,
    imei: loginPendingData.imei!,
    userAgent: loginPendingData.userAgent!,
    cookies: loginPendingData.cookies!,
  }

  // Validate session before saving
  if (!session.imei || !session.userAgent || !session.cookies || session.cookies.length === 0) {
    console.error('[ZaloLogin] Session validation failed - incomplete data:', {
      hasImei: !!session.imei,
      hasUserAgent: !!session.userAgent,
      cookiesCount: session.cookies?.length || 0,
    })
    loginPendingData = null
    return
  }

  // Save session
  await sessionSave(session)

  // Clear pending data
  loginPendingData = null

  // Notify ZaloMessage about the session
  // Import dynamically to avoid circular dependency
  const ZaloMessage = await import('./ZaloMessageService')
  ZaloMessage.onSessionImported({
    ok: true,
    api,
    userId,
  }).catch((err: any) => {
    console.error('[ZaloLogin] Error notifying ZaloMessage:', err)
  })

  // Resolve the promise if waiting
  if (loginResolver) {
    loginResolver(loginGetStatus())
    loginResolver = null
  }

  console.warn('[ZaloLogin] Login finalization complete')
}

/**
 * Initiate QR code login
 */
export async function handleZaloLoginQR() {
  if (!zalo) {
    throw new Error('Zalo not initialized. Call initialize() first.')
  }

  if (loginStatus !== 'logged_out') {
    console.warn('[ZaloLogin] Already in login process or logged in')
    return loginGetStatus()
  }

  console.warn('[ZaloLogin] Starting QR login...')

  try {
    loginStatus = 'pending_qr'
    loginQrCode = null
    loginPendingData = null

    // Create promise that resolves when QR is generated
    return new Promise<any>((resolve, reject) => {
      // Set resolver before starting loginQR
      loginResolver = resolve

      // Start the QR login process (runs in background)
      zalo.loginQR({}, async (response: any) => {
        await handleQRCallback(response)
      })
        .then(async (apiInstance: any) => {
          // Login completed successfully
          await handleLoginSuccess(apiInstance)
        })
        .catch((err: any) => {
          // Login failed or QR expired
          console.error('[ZaloLogin] Login process failed:', err)
          loginReset()
        })

      // Set a timeout just in case QR is never generated
      setTimeout(() => {
        if (!loginQrCode && loginResolver) {
          console.error('[ZaloLogin] Timeout: QR code not generated within 10 seconds')
          loginReset()
          reject(new Error('QR code generation timeout'))
        }
      }, 10000) // 10 seconds timeout
    })
  }
  catch (error: any) {
    console.error('[ZaloLogin] Error initiating login:', error)
    loginReset()
    throw error
  }
}

// ============================================================================
// COOKIE LOGIN
// ============================================================================

/**
 * Import session from cookies
 */
export async function handleZaloLoginCookies(
  imei: string,
  userAgent: string,
  cookies: any[],
) {
  if (!zalo) {
    throw new Error('Zalo not initialized')
  }

  try {
    // Login WITHOUT callback - get API client directly
    const apiClient = await zalo.login({
      imei,
      userAgent,
      cookie: cookies,
    })

    if (!apiClient) {
      console.error('[ZaloLogin] Login failed - no API client returned')
      return {
        ok: false,
        message: 'Login failed - no API client returned',
      }
    }

    // Store the API client
    api = apiClient

    // Get userId from the API client
    let userId: string | null = null

    // Try multiple methods to get the user ID
    if (typeof apiClient.getOwnId === 'function') {
      userId = apiClient.getOwnId()
    }

    if (!userId && typeof apiClient.getCurrentUserId === 'function') {
      userId = apiClient.getCurrentUserId()
    }

    // Fallback: extract from cookies
    if (!userId) {
      userId = extractUserIdFromCookies(cookies)
    }

    if (!userId) {
      console.error('[ZaloLogin] Could not determine userId')
      return {
        ok: false,
        message: 'Could not determine user ID',
      }
    }

    // Save the session
    const loginTime = new Date().toISOString()
    const session = {
      userId,
      loginTime,
      isActive: true,
      imei,
      userAgent,
      cookies,
    }

    await sessionSave(session)

    loginStatus = 'logged_in'
    loginUserId = userId
    console.warn(`[ZaloLogin] Cookie login successful: ${userId}`)

    return {
      ok: true,
      message: 'Login successful',
      api: apiClient,
      userId,
    }
  }
  catch (error: any) {
    console.error('[ZaloLogin] Error importing session:', error)
    loginStatus = 'logged_out'
    loginUserId = null
    return {
      ok: false,
      message: error.message,
    }
  }
}

// ============================================================================
// LOGOUT
// ============================================================================

/**
 * Logout
 */
export async function loginLogout() {
  try {
    if (api) {
      const userId = api.getCurrentUserId?.() || api.getOwnId?.()
      if (userId) {
        await sessionDelete(userId)
        console.warn(`[ZaloLogin] Logged out user: ${userId}`)
      }
    }

    loginReset()
    console.warn('[ZaloLogin] Logout completed')
  }
  catch (error) {
    console.error('[ZaloLogin] Error during logout:', error)
    throw error
  }
}

// ============================================================================
// REDIS OPERATIONS
// ============================================================================

/**
 * Get Redis status
 */
export async function redisGetStatus() {
  if (!redis) {
    return { connected: false, error: 'Redis not initialized' }
  }

  try {
    await redis.ping()
    const dbSize = await redis.dbsize()
    const info = await redis.info('server')

    return {
      connected: true,
      dbSize,
      info,
    }
  }
  catch (error: any) {
    return {
      connected: false,
      error: error.message,
    }
  }
}

/**
 * Get session(s) from Redis
 */
export async function redisGetSession(userId?: string) {
  return await sessionLoad(userId)
}

/**
 * Get keys matching pattern
 */
export async function redisGetKeys(pattern = '*', limit = 1000) {
  if (!redis) {
    throw new Error('Redis not initialized')
  }

  try {
    const keys = await redis.keys(pattern)
    return keys.slice(0, limit)
  }
  catch (error) {
    console.error('[ZaloLogin] Error getting keys from Redis:', error)
    throw error
  }
}

/**
 * Get raw value from Redis
 */
export async function redisGet(key: string) {
  if (!redis) {
    throw new Error('Redis not initialized')
  }

  try {
    return await redis.get(key)
  }
  catch (error) {
    console.error('[ZaloLogin] Error getting value from Redis:', error)
    throw error
  }
}

// ============================================================================
// KEEP-ALIVE
// ============================================================================

/**
 * Start keep-alive mechanism
 */
export async function startKeepAlive() {
  if (keepAliveInterval || !api) {
    return
  }

  keepAliveInterval = setInterval(async () => {
    try {
      const ownId = api.getOwnId?.() || api.getCurrentUserId?.()
      if (ownId) {
        await api.getUserInfo?.(ownId)
      }
    }
    catch (error) {
      console.error('[ZaloLogin] Keep-alive ping failed:', error)
    }
  }, 1800000) // 30 minutes
}

/**
 * Stop keep-alive mechanism
 */
export function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval)
    keepAliveInterval = null
  }
}
