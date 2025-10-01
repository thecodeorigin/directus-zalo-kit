import type { SchemaOverview } from '@directus/types'
import type { Knex } from 'knex'
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
  private static instance: ZaloService | null = null

  private zalo: Zalo
  private api: any = null
  private db: Knex
  private getSchemaFn: () => Promise<SchemaOverview>
  private ItemsService: any

  private status: 'logged_out' | 'pending_qr' | 'logged_in' = 'logged_out'
  private qrCode: string | null = null
  private loginResolver: ((value: any) => void) | null = null
  private listenerStarted = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 5000

  private sessionFile: string

  // System accountability
  private systemAccountability = {
    admin: true,
    role: null,
    user: null,
  }

  private constructor(db: Knex, getSchemaFn: () => Promise<SchemaOverview>, ItemsService: any) {
    this.db = db
    this.getSchemaFn = getSchemaFn
    this.ItemsService = ItemsService

    const zaloDataPath = process.env.ZALO_SESSION_PATH || '/directus/storage'
    this.sessionFile = path.join(zaloDataPath, 'zalo-session.json')

    this.zalo = new Zalo({
      selfListen: true,
      checkUpdate: false,
      dataPath: zaloDataPath,
    })

    console.log('[ZaloService] Initialized')
    console.log(`[ZaloService] Session file: ${this.sessionFile}`)

    this.loadOldSession()
  }

  public static init(
    db: Knex,
    getSchemaFn: () => Promise<SchemaOverview>,
    ItemsService: any,
  ) {
    if (!ZaloService.instance) {
      ZaloService.instance = new ZaloService(db, getSchemaFn, ItemsService)
    }
    return ZaloService.instance
  }

  public static getInstance(): ZaloService {
    if (!ZaloService.instance) {
      throw new Error('ZaloService chưa được init')
    }
    return ZaloService.instance
  }

  /** Load session cũ */
  private loadOldSession(): void {
    try {
      if (!fs.existsSync(this.sessionFile)) {
        console.log('[ZaloService] No session file found')
        return
      }

      const data = fs.readFileSync(this.sessionFile, 'utf-8')
      const session: ZaloSession = JSON.parse(data)

      const age = Date.now() - new Date(session.loginTime).getTime()
      if (age > 24 * 60 * 60 * 1000) {
        console.log('[ZaloService] Session expired')
        fs.unlinkSync(this.sessionFile)
        return
      }

      console.log(`[ZaloService] Found session: ${session.userId}`)
      console.log('[ZaloService] Need to re-login with QR')
    }
    catch (err) {
      console.error('[ZaloService] Load session error:', err)
    }
  }

  /** Save session */
  private saveSessionToFile(userId: string): void {
    try {
      const dir = path.dirname(this.sessionFile)
      if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true })

      const session: ZaloSession = {
        userId,
        loginTime: new Date().toISOString(),
        isActive: true,
      }

      fs.writeFileSync(this.sessionFile, JSON.stringify(session, null, 2), 'utf-8')
      console.log(`[ZaloService] Session saved: ${userId}`)
    }
    catch (err) {
      console.error('[ZaloService] Save session error:', err)
    }
  }

  public getStatus() {
    return {
      status: this.status,
      qrCode: this.qrCode,
      isListening: this.listenerStarted,
      userId: this.api?.getOwnId() || null,
    }
  }

  /** Login bằng QR */
  public async initiateLogin(): Promise<any> {
    if (this.status !== 'logged_out')
      return this.getStatus()

    this.status = 'pending_qr'
    console.log('[ZaloService] Starting QR login...')

    return new Promise<any>((resolve, reject) => {
      this.loginResolver = resolve

      const timeout = setTimeout(() => {
        reject(new Error('Login timeout'))
        this.reset()
      }, 120000)

      this.zalo
        .loginQR({}, async (response) => {
          match(response)
            .with(
              { type: LoginQRCallbackEventType.QRCodeGenerated, data: { image: P.select(P.string) } },
              (qrImage) => {
                this.qrCode = qrImage
                console.log('[ZaloService] QR code generated')
                if (this.loginResolver)
                  this.loginResolver(this.getStatus())
              },
            )
            .with({ type: LoginQRCallbackEventType.QRCodeExpired }, () => {
              clearTimeout(timeout)
              this.reset()
            })
            .with({ type: LoginQRCallbackEventType.QRCodeDeclined }, () => {
              clearTimeout(timeout)
              this.reset()
            })
            .otherwise(() => {
              console.log('[ZaloService] Login event:', response.type)
            })
        })
        .then((api) => {
          clearTimeout(timeout)
          this.api = api
          this.status = 'logged_in'
          this.qrCode = null

          const userId = this.api?.getOwnId?.() || 'unknown'
          console.log(`[ZaloService] Logged in as: ${userId}`)
          this.saveSessionToFile(userId)

          this.startListener()
          if (this.loginResolver)
            this.loginResolver(this.getStatus())
        })
        .catch((err) => {
          clearTimeout(timeout)
          console.error('[ZaloService] Login failed:', err)
          this.reset()
          reject(err)
        })
    })
  }

  /** Bắt đầu listener */
  private startListener() {
    if (!this.api || this.listenerStarted)
      return
    this.listenerStarted = true

    try {
      this.api.listener
        .on('message', async (msg: any) => {
          try {
            await this.handleIncomingMessage(msg.data)
          }
          catch (err) {
            console.error('[ZaloService] Error handling message:', err)
          }
        })
        .on('reaction', async (react: any) => {
          try {
            await this.handleIncomingReaction(react.data)
          }
          catch (err) {
            console.error('[ZaloService] Error handling reaction:', err)
          }
        })
        .on('error', async (err: any) => {
          console.error('[ZaloService] Listener error:', err)
          this.handleListenerError()
        })
        .start()
      this.reconnectAttempts = 0
    }
    catch {
      this.listenerStarted = false
      this.handleListenerError()
    }
  }

  /** Xử lý tin nhắn đến - tạo các items */
  private async handleIncomingMessage(rawData: any) {
    try {
      const schema = await this.getSchemaFn()

      // Parse fields từ Zalo format
      const messageId = rawData.msgId
      const senderId = rawData.uidFrom
      const recipientId = rawData.idTo
      const displayName = rawData.dName
      const content = rawData.content || ''
      const timestamp = rawData.ts ? Number.parseInt(rawData.ts) : Date.now()
      const clientMsgId = rawData.cliMsgId

      // Validation
      if (!messageId || !senderId) {
        console.error('[ZaloService] Missing required fields:', { messageId, senderId })
        return
      }

      // Tạo conversation ID từ 2 user IDs
      const userIds = [senderId, recipientId].filter(Boolean).sort()
      const conversationId = userIds.length === 2
        ? `direct_${userIds[0]}_${userIds[1]}`
        : `direct_${senderId}`

      console.log('[ZaloService] Processing:', {
        messageId,
        conversationId,
        senderId,
        displayName,
      })

      // 1. Upsert conversation
      await this.upsertConversation(conversationId, rawData, schema, senderId, recipientId)

      // 2. Upsert sender
      await this.upsertUser(senderId, rawData, schema)

      // 3. Upsert recipient if different
      if (recipientId && recipientId !== senderId) {
        await this.upsertUser(recipientId, { id: recipientId, dName: 'Unknown' }, schema)
      }

      // 4. Create message
      const messageData = {
        id: messageId,
        client_id: clientMsgId || messageId,
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        raw_data: JSON.stringify(rawData),
        mentions: null,
        forward_from_message_id: null,
        reply_to_message_id: null,
        is_edited: false,
        is_undone: false,
        created_at: new Date(),
        sent_at: new Date(timestamp),
        received_at: new Date(),
        edited_at: null,
        updated_at: new Date(),
      }

      const messagesService = new this.ItemsService('zalo_messages', {
        knex: this.db,
        schema,
        accountability: this.systemAccountability,
      })

      await messagesService.createOne(messageData)
      // 5. Update conversation last message
      await this.updateConversationLastMessage(
        conversationId,
        messageId,
        messageData.sent_at,
        schema,
      )
    }
    catch (error) {
      console.error('[ZaloService] Error handling message:', error)
    }
  }

  /** Upsert conversation */
  private async upsertConversation(
    conversationId: string,
    rawData: any,
    schema: SchemaOverview,
    senderId?: string,
    recipientId?: string,
  ) {
    try {
      const conversationsService = new this.ItemsService('zalo_conversations', {
        knex: this.db,
        schema,
        accountability: this.systemAccountability,
      })

      const existing = await conversationsService.readByQuery({
        filter: { id: { _eq: conversationId } },
        limit: 1,
      })

      if (!existing || existing.length === 0) {
        await conversationsService.createOne({
          id: conversationId,
          type: 'direct', // Tin nhắn 1-1
          participant_id: recipientId || null,
          group_id: null,
          is_pinned: false,
          is_muted: false,
          is_archived: false,
          is_hidden: false,
          unread_count: 0,
          created_at: new Date(),
          updated_at: new Date(),
        })
        console.log('[ZaloService] Created conversation:', conversationId)
      }
    }
    catch (error) {
      console.error('[ZaloService] Error upserting conversation:', error)
    }
  }

  /** Upsert user */
  private async upsertUser(userId: string, rawData: any, schema: SchemaOverview) {
    try {
      const usersService = new this.ItemsService('zalo_users', {
        knex: this.db,
        schema,
        accountability: this.systemAccountability,
      })

      const existing = await usersService.readByQuery({
        filter: { id: { _eq: userId } },
        limit: 1,
      })

      if (!existing || existing.length === 0) {
        await usersService.createOne({
          id: userId,
          display_name: rawData.dName || 'Unknown User',
          avatar_url: null,
          phone: null,
          status: 'active',
          created_at: new Date(),
          updated_at: new Date(),
        })
        console.log('[ZaloService] Created user:', userId)
      }
    }
    catch (error) {
      console.error('[ZaloService] Error upserting user:', error)
    }
  }

  /** Tạo attachments */
  private async createAttachments(messageId: string, attachments: any[], schema: SchemaOverview) {
    try {
      const attachmentsService = new this.ItemsService('zalo_attachments', {
        knex: this.db,
        schema,
        accountability: this.systemAccountability,
      })

      for (const att of attachments) {
        await attachmentsService.createOne({
          message_id: messageId,
          type: att.type || 'file',
          url: att.url || '',
          file_name: att.fileName || null,
          file_size: att.fileSize || null,
          mime_type: att.mimeType || null,
          thumbnail_url: att.thumbnailUrl || null,
          width: att.width || null,
          height: att.height || null,
          duration: att.duration || null,
          metadata: att.metadata ? JSON.stringify(att.metadata) : null,
          created_at: new Date(),
          updated_at: new Date(),
        })
      }
      console.log(`[ZaloService] Created ${attachments.length} attachments for message:`, messageId)
    }
    catch (error) {
      console.error('[ZaloService] Error creating attachments:', error)
    }
  }

  /** Update conversation's last message */
  private async updateConversationLastMessage(
    conversationId: string,
    messageId: string,
    messageTime: Date,
    schema: SchemaOverview,
  ) {
    try {
      const conversationsService = new this.ItemsService('zalo_conversations', {
        knex: this.db,
        schema,
        accountability: this.systemAccountability,
      })

      await conversationsService.updateByQuery(
        { filter: { id: { _eq: conversationId } } },
        {
          last_message_id: messageId,
          last_message_time: messageTime,
          updated_at: new Date(),
        },
      )
    }
    catch (error) {
      console.error('[ZaloService] Error updating conversation last message:', error)
    }
  }

  /** Xử lý reaction */
  private async handleIncomingReaction(rawData: any) {
    try {
    // Debug log để xem cấu trúc dữ liệu
      console.log('[ZaloService] Raw reaction data:', JSON.stringify(rawData, null, 2))

      const schema = await this.getSchemaFn()

      // Parse reaction data với field names đúng theo schema
      const messageId = rawData.msgId || rawData.messageId || rawData.msg_id
      const userId = rawData.reactorId || rawData.userId || rawData.user_id || rawData.uidFrom
      const reactionIcon = rawData.reaction || rawData.emoji || rawData.icon || '❤️' // Default heart

      // Validation
      if (!messageId) {
        return
      }

      if (!userId) {
        return
      }

      console.log('[ZaloService] Parsed reaction:', {
        messageId,
        userId,
        reactionIcon,
      })

      const reactionsService = new this.ItemsService('zalo_reactions', {
        knex: this.db,
        schema,
        accountability: this.systemAccountability,
      })

      await reactionsService.createOne({
        message_id: messageId, // ✅ message_id (không phải msg_id)
        user_id: userId, // ✅ user_id (không phải reactor_id)
        reaction_icon: reactionIcon, // ✅ reaction_icon (không phải reaction)
        created_at: new Date(),
      })
    }
    catch (error) {
      console.error('[ZaloService] Error handling reaction:', error)
      console.error('[ZaloService] Failed raw data:', JSON.stringify(rawData, null, 2))
    }
  }

  private handleListenerError() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      setTimeout(() => this.restartListener(), this.reconnectDelay * this.reconnectAttempts)
    }
    else {
      this.reset()
    }
  }

  private restartListener() {
    if (this.api?.listener) {
      try {
        this.api.listener.stop()
        this.listenerStarted = false
        this.startListener()
      }
      catch {
        this.handleListenerError()
      }
    }
  }

  public async sendMessage(threadId: string, content: string, options?: any) {
    if (!this.api)
      throw new Error('Not logged in')
    return this.api.sendMessage(content, threadId, options)
  }

  public async logout(): Promise<void> {
    if (this.api) {
      try {
        if (this.api.listener)
          this.api.listener.stop()
        await this.api.logout()
        if (fs.existsSync(this.sessionFile))
          fs.unlinkSync(this.sessionFile)
      }
      catch {}
      finally {
        this.reset()
      }
    }
  }

  private reset() {
    this.api = null
    this.status = 'logged_out'
    this.qrCode = null
    this.loginResolver = null
    this.listenerStarted = false
    this.reconnectAttempts = 0
  }
}

export default ZaloService
