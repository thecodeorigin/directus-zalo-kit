import type { SchemaOverview } from '@directus/types'
import { match, P } from 'ts-pattern'
import { LoginQRCallbackEventType, Zalo } from 'zca-js'

export class ZaloService {
  private static instance: ZaloService | null = null

  private zalo = new Zalo({ selfListen: true, checkUpdate: false })
  private api: any = null
  private getSchemaFn: () => Promise<SchemaOverview>
  private ItemsService: any

  private status: 'logged_out' | 'pending_qr' | 'logged_in' = 'logged_out'
  private qrCode: string | null = null
  private loginResolver: ((value: any) => void) | null = null
  private listenerStarted = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 5000

  // System accountability
  private systemAccountability = {
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
  }

  public static init(
    getSchemaFn: () => Promise<SchemaOverview>,
    ItemsService: any,
  ) {
    if (!ZaloService.instance) {
      ZaloService.instance = new ZaloService(getSchemaFn, ItemsService)
    }
    return ZaloService.instance
  }

  public static getInstance(): ZaloService {
    if (!ZaloService.instance) {
      throw new Error('ZaloService chưa được init')
    }
    return ZaloService.instance
  }

  public getStatus() {
    return {
      status: this.status,
      qrCode: this.qrCode,
      isListening: this.listenerStarted,
      userId: this.api?.getOwnId?.() || null,
    }
  }

  /**
   * Khởi tạo login bằng QR - trả về object status (bao gồm qrCode khi pending)
   */
  public async initiateLogin(): Promise<any> {
    if (this.status !== 'logged_out')
      return this.getStatus()

    this.status = 'pending_qr'

    const loginPromise = new Promise<any>((resolve, reject) => {
      this.loginResolver = resolve

      const timeout = setTimeout(() => {
        reject(new Error('Login timeout'))
        this.reset()
      }, 120000)

      // Gọi zca-js loginQR (callback-based)
      this.zalo.loginQR({}, async (response: any) => {
        match(response)
          .with(
            { type: LoginQRCallbackEventType.QRCodeGenerated, data: { image: P.select(P.string) } },
            async (qrImage: string) => {
              this.qrCode = qrImage
              if (this.loginResolver)
                this.loginResolver(this.getStatus())
            },
          )
          .with({ type: LoginQRCallbackEventType.QRCodeExpired }, async () => {
            clearTimeout(timeout)
            console.warn('[ZaloService] QR expired')
            this.reset()
          })
          .with({ type: LoginQRCallbackEventType.QRCodeDeclined }, async () => {
            clearTimeout(timeout)
            console.warn('[ZaloService] QR declined')
            this.reset()
          })
      })
        .then(async (api: any) => {
          clearTimeout(timeout)
          this.api = api
          this.status = 'logged_in'
          this.qrCode = null
          this.startListener()

          try {
            const ownId = this.api.getOwnId?.()
            if (ownId)
              await this.fetchAndUpsertUser(ownId)
            await this.syncGroupAvatars()
          }
          catch (err) {
            console.warn('[ZaloService] sync after login failed', err)
          }

          if (this.loginResolver)
            this.loginResolver(this.getStatus())
          resolve(this.getStatus())
        })
        .catch((err: any) => {
          clearTimeout(timeout)
          console.error('[ZaloService] Login failed:', err)
          this.reset()
          reject(err)
        })
    })
    return loginPromise
  }

  /** Bắt đầu lắng nghe tin nhắn/reaction */
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

  private async handleIncomingMessage(rawData: any) {
    try {
      console.warn('[ZaloService] 📥 handleIncomingMessage START', {
        msgId: rawData.msgId,
        from: rawData.uidFrom,
        to: rawData.idTo,
      })
      const schema = await this.getSchemaFn()
      const messageId = rawData.msgId
      const senderId = rawData.uidFrom
      const recipientId = rawData.idTo
      const timestamp = Number.parseInt(rawData.ts ?? rawData.t ?? `${Date.now()}`)
      const clientMsgId = rawData.cliMsgId

      let content = ''
      let attachments: any[] = []

      if (typeof rawData.content === 'string') {
        content = rawData.content

        // Handle commands
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

      const userIds = [senderId, recipientId].filter(Boolean).sort()
      const conversationId = userIds.length === 2
        ? `direct_${userIds[0]}_${userIds[1]}`
        : `thread_${recipientId || senderId}`

      await this.startSync(conversationId)

      await this.upsertConversation(conversationId, rawData, schema, senderId, recipientId)
      console.warn('[ZaloService] 👤 Fetching sender:', senderId)
      await this.fetchAndUpsertUser(senderId, schema)

      if (recipientId && recipientId !== senderId) {
        await this.fetchAndUpsertUser(recipientId, schema)
      }

      const messagesService = new this.ItemsService('zalo_messages', {
        schema,
        accountability: this.systemAccountability,
      })

      const existingMessages = await messagesService.readByQuery({
        filter: { id: { _eq: messageId } },
        limit: 1,
      })

      if (existingMessages.length === 0) {
        await messagesService.createOne({
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
        })
      }

      // 4. Create attachments
      if (attachments.length > 0) {
        await this.createAttachments(messageId, attachments, schema)
      }

      // 5. Update conversation
      await this.updateConversationLastMessage(
        conversationId,
        messageId,
        new Date(timestamp),
        schema,
      )

      // 6. Auto-label
      if (typeof rawData.content === 'string' && rawData.content.trim() && !rawData.content.startsWith('/')) {
        try {
          await this.autoLabelConversation(conversationId, rawData.content)
        }
        catch (labelError) {
          console.error('[ZaloService] Auto-label failed:', labelError)
        }
      }

      // 7. Complete sync
      await this.completeSync(conversationId, messageId)
    }
    catch (error) {
      console.error('[ZaloService] Error handling message:', error)

      const conversationId = `direct_${rawData.uidFrom}_${rawData.idTo}`
      await this.failSync(conversationId, error)
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

      // Check label commands
      if (trimmedContent.startsWith('/label ')) {
        const userIds = [senderId, recipientId].filter(Boolean).sort()
        const conversationId = userIds.length === 2
          ? `direct_${userIds[0]}_${userIds[1]}`
          : `thread_${recipientId || senderId}`

        await this.handleLabelCommand(trimmedContent, conversationId, senderId, recipientId)
        return
      }

      // Check quick messages
      const quickMsg = await this.findQuickMessageByKeyword(trimmedContent)

      if (quickMsg) {
        await this.incrementQuickMessageUsage(quickMsg.id)

        // ✅ Silent retry cho quick messages
        try {
          await this.sendMessage({ msg: quickMsg.content }, senderId)
        }
        catch (error: any) {
          if (error.code === 114 || error.message?.includes('không hợp lệ')) {
          // Silent retry, không log
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
          if (error.code === 114 || error.message?.includes('không hợp lệ')) {
            await this.sendMessage({ msg }, recipientId)
          }
          else {
            console.error('[ZaloService] Send message error:', error.message)
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
        await sendReply(`✓ Added label "${label.name}"`)
      }
      else if (action === 'remove') {
        await this.removeLabelFromConversation(conversationId, label.id)
        await sendReply(`✓ Removed label "${label.name}"`)
      }
      else {
        await sendReply(`Invalid action "${action}". Use "add" or "remove"`)
      }
    }
    catch (error: any) {
      console.error('[ZaloService] Error handling label command:', error)
    }
  }

  private async sendMessageSafe(messageData: any, threadId: string, fallbackThreadId?: string) {
    try {
      await this.sendMessage(messageData, threadId)
    }
    catch (error: any) {
      if ((error.code === 114 || error.message?.includes('không hợp lệ')) && fallbackThreadId) {
        await this.sendMessage(messageData, fallbackThreadId)
      }
      else {
        throw error
      }
    }
  }

  // Helper function để get MIME type từ extension
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
      console.warn('[ZaloService] 💬 upsertConversation', {
        conversationId,
        sender: senderId,
        recipient: recipientId,
      })
      const conversationsService = new this.ItemsService('zalo_conversations', {
        schema,
        accountability: this.systemAccountability,
      })

      // Check if exists
      const existing = await conversationsService.readByQuery({
        filter: { id: { _eq: conversationId } },
        limit: 1,
      })

      if (existing.length === 0) {
        await conversationsService.createOne({
          id: conversationId,
          type: 'direct',
          participant_id: recipientId || null,
          group_id: rawData.groupId || rawData.threadId || null,
          is_pinned: false,
          is_muted: false,
          is_archived: false,
          is_hidden: false,
          unread_count: 0,
        })
      }
    }
    catch (error) {
      console.error('[ZaloService] Error upserting conversation:', error)
    }
  }

  private async fetchAndUpsertUser(userId: string, schema?: SchemaOverview) {
    console.warn('[ZaloService] Starting fetchAndUpsertUser for:', userId)

    // Check for recursive calls
    const currentStack = new Error('Checking recursion depth').stack || ''
    const fetchCallCount = (currentStack.match(/fetchAndUpsertUser/g) || []).length
    console.warn('[ZaloService] Call depth:', fetchCallCount, 'for user:', userId)

    if (fetchCallCount > 3) {
      console.error('[ZaloService] Excessive recursion detected for user:', userId)
      throw new Error('Excessive recursion in fetchAndUpsertUser')
    }

    if (!this.api) {
      console.warn('[ZaloService] API not available, creating basic user record')
      await this.createBasicUser(userId)
      return
    }

    try {
      const currentSchema = schema || await this.getSchemaFn()
      let userInfo: any = null

      try {
        const apiResponse = await this.api.getUserInfo(userId)
        userInfo = apiResponse?.changed_profiles?.[userId] || apiResponse || null
      }
      catch (err: any) {
        console.warn('[ZaloService] Failed to fetch user info:', err.message)
        userInfo = null
      }

      const parseDateOfBirth = (dob: any): Date | null => {
        if (!dob)
          return null

        try {
          if (typeof dob === 'number' && dob > 0) {
            return new Date(dob > 9999999999 ? dob : dob * 1000)
          }

          if (typeof dob === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(dob)) {
            const [day, month, year] = dob.split('/').map(Number)
            const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1)

            if (date.getFullYear() === (year ?? 0) && date.getMonth() === ((month ?? 1) - 1) && date.getDate() === (day ?? 1)) {
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

      const displayName = userInfo?.displayName || 'Unknown User'
      const avatarUrl = userInfo?.avatar
      const coverUrl = userInfo?.cover
      const alias = userInfo?.username
      const dateOfBirth = parseDateOfBirth(userInfo?.sdob || userInfo?.dob)
      const isFriend = userInfo?.isFr === 1 || false
      const lastOnline = userInfo?.lastActionTime ? new Date(Number(userInfo.lastActionTime)) : null
      const statusMessage = userInfo?.status || null
      const zaloName = userInfo?.zaloName

      const usersService = new this.ItemsService('zalo_users', {
        schema: currentSchema,
        accountability: this.systemAccountability,
      })

      const existingUsers = await usersService.readByQuery({
        filter: { id: { _eq: userId } },
        limit: 1,
      })

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

      if (existingUsers.length === 0) {
        await usersService.createOne({
          id: userId,
          ...userData,
        })
      }
      else if (userInfo) {
        await usersService.updateOne(userId, userData)
      }
    }
    catch (error) {
      console.error('[ZaloService] Error in fetchAndUpsertUser:', error)
      await this.createBasicUser(userId)
    }
  }

  private async createBasicUser(userId: string) {
    try {
      console.warn('[ZaloService] 👤 createBasicUser for:', userId)
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

      // ✅ Map theo structure thật
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
      console.log('[ZaloService] 🚀 Starting group sync...')
      const response = await this.api.getAllGroups()

      if (!response || !response.gridVerMap) {
        console.log('[ZaloService] No gridVerMap found')
        return
      }

      const gridVerMap = response.gridVerMap
      const groupIds = Object.keys(gridVerMap)

      console.log(`[ZaloService] Found ${groupIds.length} groups`)

      const schema = await this.getSchemaFn()

      // ✅ GIẢM batch size từ 5 → 2
      const BATCH_SIZE = 2

      let groupCount = 0

      for (let i = 0; i < groupIds.length; i += BATCH_SIZE) {
        const batch = groupIds.slice(i, i + BATCH_SIZE)

        console.log(`[ZaloService] 📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(groupIds.length / BATCH_SIZE)}`)

        const batchPromises = batch.map(async (groupId) => {
          try {
            const response = await this.api.getGroupInfo?.(groupId)
            const groupInfo = response?.gridInfoMap?.[groupId]

            if (!groupInfo) {
              console.warn('[ZaloService] No groupInfo for:', groupId)
              return
            }

            groupCount++
            console.log(`[ZaloService] [${groupCount}/${groupIds.length}] Processing:`, groupInfo.name)

            await this.upsertGroup(groupId, groupInfo, schema)
            await this.upsertConversation(groupId, {
              groupId: groupInfo.groupId || groupId,
              name: groupInfo.name || `Group ${groupId}`,
              avatar: groupInfo.fullAvt || groupInfo.avt || null,
              type: 'group',
            }, schema)

            // ✅ Log trước khi sync members
            console.log(`[ZaloService] 👥 Syncing ${groupInfo.memVerList?.length || 0} members for:`, groupInfo.name)
            await this.syncGroupMembers(groupId, groupInfo)
            console.log(`[ZaloService] ✅ Completed:`, groupInfo.name)
          }
          catch (error: any) {
            console.error('[ZaloService] ❌ Error syncing group', groupId, ':', error.message)
          }
        })

        await Promise.all(batchPromises)

        // ✅ TĂNG delay giữa các batch từ 1s → 3s
        if (i + BATCH_SIZE < groupIds.length) {
          console.log('[ZaloService] ⏸️ Waiting 3s before next batch...')
          await new Promise(resolve => setTimeout(resolve, 3000))
        }
      }

      console.log('[ZaloService] ✅ Completed syncing', groupIds.length, 'groups')
    }
    catch (error: any) {
      console.error('[ZaloService] Error syncing group avatars:', error)
    }
  }

  private async syncGroupMembers(groupId: string, groupInfo: any) {
    try {
      if (!groupInfo.memVerList || !Array.isArray(groupInfo.memVerList)) {
        console.log('[ZaloService] No members for group:', groupId)
        return
      }

      const totalMembers = groupInfo.memVerList.length
      console.log(`[ZaloService] 👥 START syncing ${totalMembers} members for group:`, groupId)

      const MEMBER_BATCH_SIZE = 20

      for (let i = 0; i < groupInfo.memVerList.length; i += MEMBER_BATCH_SIZE) {
        const memberBatch = groupInfo.memVerList.slice(i, i + MEMBER_BATCH_SIZE)

        await Promise.all(
          memberBatch.map(async (memVer: string) => {
            try {
              const userId = memVer.split('_')[0]

              if (!userId) {
                console.warn('[ZaloService] Invalid member format:', memVer)
                return
              }

              await this.upsertGroupMember(groupId, userId, {
                is_active: true,
                joined_at: new Date(),
                left_at: null,
              })
            }
            catch (error: any) {
              console.error('[ZaloService] Error processing member', memVer, ':', error.message)
            }
          }),
        )

        // Progress logging
        const processed = Math.min(i + MEMBER_BATCH_SIZE, totalMembers)
        console.log(`[ZaloService] 👥 Progress: ${processed}/${totalMembers} members`)

        // Small delay between member batches
        if (i + MEMBER_BATCH_SIZE < groupInfo.memVerList.length) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      console.log(`[ZaloService] ✅ COMPLETED syncing ${totalMembers} members for group:`, groupId)
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
          console.error('[ZaloService] ❌ Error creating attachment:', attError.message)
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

      // Upsert reaction
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

      // Check if already exists
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

  public async upsertGroupMember(
    groupId: string,
    userId: string,
    data: {
      is_active?: boolean
      joined_at?: Date | null
      left_at?: Date | null
    },
  ) {
    try {
      console.warn('[ZaloService] 👥 upsertGroupMember', {
        groupId,
        userId,
        isActive: data.is_active,
        action: data.left_at ? 'leave' : (data.joined_at ? 'join' : 'update'),
      })
      const schema = await this.getSchemaFn()

      const collectionExists = schema.collections.zalo_group_members

      if (!collectionExists) {
        console.error('[ZaloService] Available collections:', Object.keys(schema.collections))
        return
      }

      const groupsService = new this.ItemsService('zalo_groups', {
        schema,
        accountability: this.systemAccountability,
      })

      const groupExists = await groupsService.readByQuery({
        filter: { id: { _eq: groupId } },
        limit: 1,
      })

      if (groupExists.length === 0) {
        console.warn('[ZaloService] Group not found:', groupId)
        return
      }

      const usersService = new this.ItemsService('zalo_users', {
        schema,
        accountability: this.systemAccountability,
      })

      const userExists = await usersService.readByQuery({
        filter: { id: { _eq: userId } },
        limit: 1,
      })

      if (userExists.length === 0) {
        await usersService.createOne({
          id: userId,
          display_name: `User ${userId.slice(-6)}`,
          created_at: new Date(),
        })
      }

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

      if (existing.length === 0) {
        await membersService.createOne({
          group_id: groupId,
          user_id: userId,
          is_active: data.is_active ?? true,
          joined_at: data.joined_at ?? new Date(),
          left_at: data.left_at ?? null,
        })
      }
      else {
        await membersService.updateOne(existing[0].id, {
          is_active: data.is_active,
          joined_at: data.joined_at,
          left_at: data.left_at,
        })
      }
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
      is_active: false,
      left_at: new Date(),
    })
  }

  public async markMemberRejoined(groupId: string, userId: string) {
    await this.upsertGroupMember(groupId, userId, {
      is_active: true,
      joined_at: new Date(),
      left_at: null,
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
      console.warn(`[ZaloService] Listener error - will retry in ${delay}ms (attempt ${this.reconnectAttempts})`)
      setTimeout(() => this.restartListener(), delay)
    }
    else {
      console.error('[ZaloService] Max reconnect attempts reached, resetting service')
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

  public async sendMessage(messageData: any, threadId: string): Promise<any> {
    if (!this.api) {
      throw new Error('Not logged in')
    }

    try {
      const result = await this.api.sendMessage(messageData, threadId)
      return result
    }
    catch (error: any) {
      console.error('[ZaloService] Send message error:', error.message)
      throw error
    }
  }

  public async logout(): Promise<void> {
    if (this.api) {
      try {
        if (this.api.listener)
          this.api.listener.stop()
        await this.api.logout?.()
      }
      catch (err) {
        console.warn('[ZaloService] Error during logout', err)
      }
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
