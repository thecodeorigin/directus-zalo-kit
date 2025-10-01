// ZaloService.ts
import fs from 'node:fs'
import path from 'node:path'
import { match, P } from 'ts-pattern'
import { LoginQRCallbackEventType, Zalo } from 'zca-js'

interface ZaloSession {
  userId: string
  loginTime: string
  isActive: boolean
}

export class ZaloService {
  private static instance: ZaloService
  private zalo: Zalo
  private api: any = null
  private status: 'logged_out' | 'pending_qr' | 'logged_in' = 'logged_out'
  private qrCode: string | null = null

  private sessionFile: string

  private constructor() {
    this.sessionFile = path.join(
      process.env.ZALO_SESSION_PATH || '/directus/storage',
      'zalo-session.json',
    )

    // Sử dụng dataPath cho session persistence của zca-js
    const zaloDataPath = process.env.ZALO_SESSION_PATH || '/directus/storage'
    this.zalo = new Zalo({
      selfListen: true,
      checkUpdate: false,
      dataPath: zaloDataPath,
    })

    console.log('[Zalo] Initialized')
    console.log(`[Zalo] Session file: ${this.sessionFile}`)
    this.loadOldSession()
  }

  public static getInstance(): ZaloService {
    if (!ZaloService.instance) {
      ZaloService.instance = new ZaloService()
    }
    return ZaloService.instance
  }

  // Load session cũ khi khởi động
  private loadOldSession(): void {
    try {
      if (!fs.existsSync(this.sessionFile)) {
        console.log('[Zalo] No session file found')
        return
      }

      const data = fs.readFileSync(this.sessionFile, 'utf-8')
      const session: ZaloSession = JSON.parse(data)

      // Check còn hợp lệ không (24h)
      const age = Date.now() - new Date(session.loginTime).getTime()
      if (age > 24 * 60 * 60 * 1000) {
        console.log('[Zalo] Session expired')
        fs.unlinkSync(this.sessionFile)
        return
      }

      console.log(`[Zalo] Found session: ${session.userId}`)
      console.log('[Zalo] Need to re-login with QR')
    }
    catch (err) {
      console.error('[Zalo] Load session error:', err)
    }
  }

  // Lưu session vào file
  private saveSessionToFile(userId: string): void {
    try {
      const dir = path.dirname(this.sessionFile)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      const session: ZaloSession = {
        userId,
        loginTime: new Date().toISOString(),
        isActive: true,
      }

      fs.writeFileSync(
        this.sessionFile,
        JSON.stringify(session, null, 2),
        'utf-8',
      )

      console.log(`[Zalo] Session saved: ${userId}`)
    }
    catch (err) {
      console.error('[Zalo] Save session error:', err)
    }
  }

  // Đăng nhập
  public async login(): Promise<{
    success: boolean
    userId?: string
    qrCode?: string
  }> {
    if (this.status === 'logged_in') {
      return { success: true, userId: this.api?.getOwnId?.() }
    }

    if (this.status === 'pending_qr') {
      return { success: false, qrCode: this.qrCode || undefined }
    }

    console.log('[Zalo] Starting login...')
    this.status = 'pending_qr'

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('[Zalo] Login timeout')
        this.status = 'logged_out'
        resolve({ success: false })
      }, 120000)

      this.zalo
        .loginQR({}, async (response) => {
          match(response)
            .with(
              {
                type: LoginQRCallbackEventType.QRCodeGenerated,
                data: { image: P.select(P.string) },
              },
              (qrImage) => {
                console.log('[Zalo] QR generated')
                this.qrCode = qrImage
                resolve({ success: false, qrCode: qrImage })
              },
            )
            .with({ type: LoginQRCallbackEventType.QRCodeScanned }, () => {
              console.log('[Zalo] QR scanned')
            })
            .with({ type: LoginQRCallbackEventType.QRCodeExpired }, () => {
              console.log('[Zalo] QR expired')
              clearTimeout(timeout)
              this.status = 'logged_out'
            })
            .with({ type: LoginQRCallbackEventType.QRCodeDeclined }, () => {
              console.log('[Zalo] QR declined')
              clearTimeout(timeout)
              this.status = 'logged_out'
            })
            .otherwise(() => {})
        })
        .then((api) => {
          clearTimeout(timeout)
          this.api = api
          this.status = 'logged_in'
          this.qrCode = null

          const userId = this.api?.getOwnId?.() || 'unknown'
          console.log(`[Zalo] Logged in: ${userId}`)

          // LƯU SESSION
          this.saveSessionToFile(userId)
        })
        .catch((err) => {
          clearTimeout(timeout)
          console.error('[Zalo] Login error:', err)
          this.status = 'logged_out'
        })
    })
  }

  // Logout
  public async logout(): Promise<void> {
    if (this.api) {
      try {
        await this.api.logout()
        if (fs.existsSync(this.sessionFile)) {
          fs.unlinkSync(this.sessionFile)
        }
        console.log('[Zalo] Logged out')
      }
      catch (err) {
        console.error('[Zalo] Logout error:', err)
      }
    }
    this.api = null
    this.status = 'logged_out'
    this.qrCode = null
  }

  // Get status
  public getStatus() {
    return {
      status: this.status,
      qrCode: this.qrCode,
      userId: this.api?.getOwnId?.() || null,
    }
  }

  // Get session info
  public async getSessionInfo(): Promise<ZaloSession | null> {
    try {
      if (!fs.existsSync(this.sessionFile)) {
        return null
      }
      const data = fs.readFileSync(this.sessionFile, 'utf-8')
      return JSON.parse(data)
    }
    catch (err) {
      return null
    }
  }
}
