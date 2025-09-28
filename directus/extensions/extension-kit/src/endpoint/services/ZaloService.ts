/* eslint-disable no-console */
import type { SchemaOverview } from '@directus/types'
import type { API as ZaloAPI } from 'zca-js'
import { match, P } from 'ts-pattern'
import { LoginQRCallbackEventType, Zalo } from 'zca-js'

// The `action` function from the hook context serves as our emitter.
// We can define its type broadly here, as the actual type-safe instance
// will be passed in from the hook itself.
type EmitterLike = (event: string, payload: any) => void

export class ZaloService {
  private static instance: ZaloService

  private readonly zalo: Zalo
  private api: ZaloAPI | null = null
  private status: 'logged_out' | 'pending_qr' | 'logged_in' = 'logged_out'
  private qrCode: string | null = null
  private loginResolver: ((api: ZaloAPI) => void) | null = null

  private emitter: EmitterLike
  private schema: SchemaOverview | null = null

  private constructor(emitter: EmitterLike, schema: SchemaOverview) {
    this.emitter = emitter
    this.schema = schema
    this.zalo = new Zalo({ selfListen: true, checkUpdate: false })
    console.log('ZaloService initialized.')
  }

  public static getInstance(emitter?: EmitterLike, schema?: SchemaOverview): ZaloService {
    if (!ZaloService.instance && emitter && schema) {
      ZaloService.instance = new ZaloService(emitter, schema)
    }
    if (!ZaloService.instance) {
      throw new Error('ZaloService must be initialized with an emitter and schema first.')
    }
    return ZaloService.instance
  }

  public getStatus() {
    return {
      status: this.status,
      qrCode: this.qrCode,
      userId: this.api?.getOwnId(),
    }
  }

  public async initiateLogin(): Promise<void> {
    if (this.status === 'logged_in' || this.status === 'pending_qr') {
      console.log('Login already in progress or completed.')
      return
    }

    this.status = 'pending_qr'
    console.log('Starting Zalo QR login...')

    const loginPromise = new Promise<ZaloAPI>((resolve) => {
      this.loginResolver = resolve
    })

    this.zalo.loginQR({}, async (response) => {
      // Use ts-pattern for type-safe matching against the event type
      match(response)
        .with({ type: LoginQRCallbackEventType.QRCodeGenerated, data: { image: P.select(P.string) } }, (qrImage) => {
          console.log('QR code received.')
          this.qrCode = qrImage
        })
        .with({ type: LoginQRCallbackEventType.QRCodeScanned }, () => {
          console.log('QR code has been scanned. Waiting for user confirmation...')
        })
        .with({ type: LoginQRCallbackEventType.QRCodeExpired }, () => {
          console.error('QR code has expired. Login failed.')
          this.reset()
        })
        .with({ type: LoginQRCallbackEventType.QRCodeDeclined }, () => {
          console.error('User declined the login request. Login failed.')
          this.reset()
        })
        .otherwise(() => {
          // This will catch 'GotLoginInfo' and any other unexpected event types.
          console.log('Received login event:', LoginQRCallbackEventType[response.type])
        })
    }).then((api) => {
      if (this.loginResolver) {
        this.loginResolver(api)
      }
    }).catch((err) => {
      console.error('Zalo login failed:', err)
      this.reset()
    })

    this.api = await loginPromise
    this.status = 'logged_in'
    this.qrCode = null
    console.log(`Successfully logged in as: ${this.api.getOwnId()}`)

    this.startListener()
  }

  private startListener(): void {
    if (!this.api || !this.emitter || !this.schema) {
      console.error('Cannot start listener: API not initialized.')
      return
    }

    console.log('Starting Zalo event listener...')

    this.api.listener
      .on('message', (message) => {
        console.log(`New message received: ${message.data.msgId}`)
        // Emit the event using the 'action' function from the hook
        this.emitter('zalo.message.new', { payload: message, schema: this.schema })
      })
      .on('reaction', (reaction) => {
        console.log(`New reaction received on message: ${reaction.data.msgId}`)
        this.emitter('zalo.reaction.new', { payload: reaction, schema: this.schema })
      })
      .start()
  }

  private reset(): void {
    this.api = null
    this.status = 'logged_out'
    this.qrCode = null
    this.loginResolver = null
  }
}
