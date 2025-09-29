// ZaloService.ts
import type { SchemaOverview } from '@directus/types'
import { match, P } from 'ts-pattern'
import { LoginQRCallbackEventType, Zalo } from 'zca-js'

type EmitterLike = (event: string, payload: any) => void

interface ZaloMessage {
  msgId: string
  threadId: string
  senderId: string
  content: string
  timestamp: number
  type: string
  attachments?: any[]
}

interface ZaloReaction {
  msgId: string
  reactorId: string
  reaction: string
  timestamp: number
}

export class ZaloService {
  private static instance: ZaloService
  private zalo = new Zalo({ selfListen: true, checkUpdate: false })
  private api: any = null
  private emitter: EmitterLike
  private schema: SchemaOverview
  private status: 'logged_out' | 'pending_qr' | 'logged_in' = 'logged_out'
  private qrCode: string | null = null
  private loginResolver: ((value: any) => void) | null = null
  private listenerStarted = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 5000

  private constructor(emitter: EmitterLike, schema: SchemaOverview) {
    this.emitter = emitter
    this.schema = schema
    console.log('ZaloService initialized')
  }

  public static getInstance(emitter?: EmitterLike, schema?: SchemaOverview) {
    if (!ZaloService.instance && emitter && schema) {
      ZaloService.instance = new ZaloService(emitter, schema)
    }
    if (!ZaloService.instance) {
      throw new Error('ZaloService must be initialized first')
    }
    return ZaloService.instance
  }

  public getStatus() {
    return {
      status: this.status,
      qrCode: this.qrCode,
      isListening: this.listenerStarted,
      userId: this.api?.getOwnId() || null,
    }
  }

  public async initiateLogin(): Promise<void> {
    if (this.status === 'logged_in') {
      console.log('Already logged in.')
      return
    }

    if (this.status === 'pending_qr') {
      console.log('Login already in progress.')
      return
    }

    this.status = 'pending_qr'
    console.log('Starting Zalo QR login...')

    const loginPromise = new Promise<any>((resolve, reject) => {
      this.loginResolver = resolve

      // Set timeout for login
      const timeout = setTimeout(() => {
        reject(new Error('Login timeout'))
        this.reset()
      }, 120000) // 2 minutes timeout

      this.zalo.loginQR({}, async (response) => {
        match(response)
          .with(
            { type: LoginQRCallbackEventType.QRCodeGenerated, data: { image: P.select(P.string) } },
            (qrImage) => {
              console.log('QR code received.')
              this.qrCode = qrImage
              // Emit QR code event for UI
              this.emitter('zalo.qr.generated', { qrCode: qrImage })
            },
          )
          .with({ type: LoginQRCallbackEventType.QRCodeScanned }, () => {
            console.log('QR code has been scanned. Waiting for user confirmation...')
            this.emitter('zalo.qr.scanned', {})
          })
          .with({ type: LoginQRCallbackEventType.QRCodeExpired }, () => {
            console.error('QR code has expired. Login failed.')
            clearTimeout(timeout)
            this.emitter('zalo.qr.expired', {})
            this.reset()
          })
          .with({ type: LoginQRCallbackEventType.QRCodeDeclined }, () => {
            console.error('User declined the login request. Login failed.')
            clearTimeout(timeout)
            this.emitter('zalo.qr.declined', {})
            this.reset()
          })
          .otherwise(() => {
            console.log('Received login event:', LoginQRCallbackEventType[response.type])
          })
      })
        .then((api) => {
          clearTimeout(timeout)
          if (this.loginResolver) {
            this.loginResolver(api)
          }
        })
        .catch((err) => {
          clearTimeout(timeout)
          console.error('Zalo login failed:', err)
          reject(err)
          this.reset()
        })
    })

    try {
      this.api = await loginPromise
      this.status = 'logged_in'
      this.qrCode = null
      const userId = this.api.getOwnId()
      console.log(`Successfully logged in as: ${userId}`)

      // Emit login success event
      this.emitter('zalo.login.success', { userId })

      // Start listening for messages
      this.startListener()
    }
    catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error)
      console.error('Error processing message:', errMsg)
      this.emitter('zalo.error', { type: 'message_processing', error: errMsg })
    }
  }

  private startListener() {
    if (!this.api || this.listenerStarted)
      return

    console.log('Starting Zalo listener')
    this.listenerStarted = true

    try {
      this.api.listener
        .on('message', (msg: any) => {
          try {
            const messageData: ZaloMessage = this.parseMessage(msg.data)
            console.log(`New message from: ${messageData.content}`)
            this.emitter('zalo.message.new', messageData)
          }
          catch (error) {
            console.error('Error processing message:', error)
            this.emitter('zalo.error', { type: 'message_processing', error })
          }
        })
        .on('reaction', (react: any) => {
          try {
            const reactionData: ZaloReaction = this.parseReaction(react.data)
            console.log(`New reaction on message ${reactionData.msgId}`)
            this.emitter('zalo.reaction.new', reactionData)
          }
          catch (error) {
            console.error('Error processing reaction:', error)
            this.emitter('zalo.error', { type: 'reaction_processing', error })
          }
        })
        .on('error', (error: any) => {
          console.error('Listener error:', error)
          this.emitter('zalo.error', { type: 'listener_error', error })
          this.handleListenerError()
        })
        .start()

      console.log('Zalo listener started successfully')
      this.emitter('zalo.listener.started', {})
      this.reconnectAttempts = 0
    }
    catch (error) {
      console.error('Failed to start listener:', error)
      this.listenerStarted = false
      this.handleListenerError()
    }
  }

  private parseMessage(rawData: any): ZaloMessage {
    // Parse and validate message data
    return {
      msgId: rawData.msgId || rawData.messageId,
      threadId: rawData.threadId || rawData.conversationId,
      senderId: rawData.senderId || rawData.from,
      content: rawData.content || rawData.text || '',
      timestamp: rawData.timestamp || Date.now(),
      type: rawData.type || 'text',
      attachments: rawData.attachments || [],
    }
  }

  private parseReaction(rawData: any): ZaloReaction {
    // Parse and validate reaction data
    return {
      msgId: rawData.msgId || rawData.messageId,
      reactorId: rawData.reactorId || rawData.userId,
      reaction: rawData.reaction || rawData.emoji,
      timestamp: rawData.timestamp || Date.now(),
    }
  }

  private handleListenerError() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

      setTimeout(() => {
        this.restartListener()
      }, this.reconnectDelay * this.reconnectAttempts)
    }
    else {
      console.error('Max reconnection attempts reached. Please re-login.')
      this.emitter('zalo.connection.lost', {})
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
      catch (error) {
        console.error('Failed to restart listener:', error)
        this.handleListenerError()
      }
    }
  }

  public async sendMessage(threadId: string, content: string, options?: any): Promise<any> {
    if (!this.api) {
      throw new Error('Not logged in')
    }

    try {
      const result = await this.api.sendMessage(content, threadId, options)
      this.emitter('zalo.message.sent', { threadId, content, messageId: result })
      return result
    }
    catch (error) {
      console.error('Failed to send message:', error)
      this.emitter('zalo.message.send_failed', { threadId, content, error })
      throw error
    }
  }

  public async logout(): Promise<void> {
    if (this.api) {
      try {
        if (this.api.listener) {
          this.api.listener.stop()
        }
        await this.api.logout()
        console.log('Logged out successfully')
        this.emitter('zalo.logout', {})
      }
      catch (error) {
        console.error('Logout error:', error)
      }
      finally {
        this.reset()
      }
    }
  }

  private reset(): void {
    this.api = null
    this.status = 'logged_out'
    this.qrCode = null
    this.loginResolver = null
    this.listenerStarted = false
    this.reconnectAttempts = 0
  }
}
