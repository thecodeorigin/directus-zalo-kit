<<<<<<< HEAD
<script setup lang="ts">
import { useApi } from '@directus/extensions-sdk'
import { authentication, createDirectus, readItems, readMe, realtime, rest } from '@directus/sdk'
import { computed, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue'
import { useFileUpload } from './composables/useFileUpload'
import { convertEmoticonToEmoji, handleEmojiInsert } from './utils/emoticonConverter'
import { client } from './utils/sdk'

const currentFunction = ref<string | null>(null)
const messageInputRef = ref<HTMLTextAreaElement | null>(null)

function insertEmoji(event: any) {
  const emoji = event?.emoji || event?.data || event?.native || event

  if (!emoji || typeof emoji !== 'string') {
    console.warn('Invalid emoji:', emoji)
    return
  }

  handleEmojiInsert(emoji, messageInputRef, messageText)
}

function showFunctionA() {
  currentFunction.value = 'A'
}

function showFunctionB() {
  currentFunction.value = 'B'
}
function getAvatarUrl(avatarUrl: string | null | undefined, fallbackName: string = 'User'): string {
  if (!avatarUrl) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=random`
  }

  if (avatarUrl.match(/^[a-f0-9-]{36}$/i)) {
    return `http://localhost:8055/assets/${avatarUrl}`
  }

  if (avatarUrl.startsWith('/')) {
    return `http://localhost:8055${avatarUrl}`
  }

  if (avatarUrl.startsWith('http')) {
    return avatarUrl
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=random`
}
interface Conversation {
  id: string
  name: string
  avatar: string
  lastMessage: string
  timestamp: string
  unreadCount: number
  online: boolean
  type: 'group' | 'direct'
  members?: string[]
}

interface Message {
  id: string
  direction: 'in' | 'out'
  text: string
  senderName: string
  senderId: string
  time: string
  avatar?: string
  status?: 'sent' | 'delivered' | 'read' | 'failed'
  type?: 'system' | 'user' | 'file'
  clientId?: string
  files?: FileAttachment[]
}

interface Group {
  id: string
  name: string
  avatar: string
  lastMessage: string
  timestamp: string
  unreadCount: number
  members: string[]
}

interface FileAttachment {
  id: string
  filename: string
  type: string
  size: number
  url: string
  thumbnail?: string
  width?: number
  height?: number
}

interface Message {
  id: string
  direction: 'in' | 'out'
  text: string
  senderName: string
  time: string
  avatar?: string
  status?: 'sent' | 'delivered' | 'read'
  type?: 'system' | 'user' | 'file'
  files?: FileAttachment[]
}

const api = useApi()
const searchQuery = ref('')
const navSearchQuery = ref('')
const messageSearchQuery = ref('')
const messageText = ref('')
const activeConversationId = ref<string>('')
const messagesContainer = ref<HTMLElement | null>(null)
const conversations = ref<Conversation[]>([])
const messages = ref<Message[]>([])
const loading = ref(false)
const sendingMessage = ref(false)
const currentUserId = ref('system')
const currentUserName = ref('You')
const currentUserAvatar = ref('')
const isAuthenticated = ref(false)
const isLoadingMessages = ref(false)
const isLoadingConversations = ref(false)
const showFilterDropdown = ref(false)
const highlightedMessageId = ref<string | null>(null)
const showMembersDialog = ref(false)
const memberSearchQuery = ref('')
const selectedMembers = ref<string[]>([])

const conversationTypeFilter = ref<'all' | 'group' | 'direct'>('all')

const {
  uploadFiles,
  getFileUrl,
  getThumbnailUrl,
  formatFileSize,
  getFileIcon,
  uploadProgress,
  isUploading,
  FILE_CONFIGS,
  MAX_FILES,
} = useFileUpload()
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFiles = ref<File[]>([])
const showFilePreviewDialog = ref(false)
const pendingAttachments = ref<FileAttachment[]>([])

const filterOptions = ref({
  status: {
    online: false,
    offline: false,
  },
  messageType: {
    unread: false,
    important: false,
    archived: false,
  },
})

// Groups data (unused but kept for future implementation)
const _groups = ref<Group[]>([])
const _groupMessages = ref<Record<string, Message[]>>({})

// Directus WebSocket client
const directusClient = createDirectus('http://localhost:8055')
  .with(authentication())
  .with(realtime())
  .with(rest())

let subscriptionCleanup: (() => void) | null = null
const processedMessageIds = new Set<string>()

// Helper function to highlight search text
function highlightSearchText(text: string, searchTerm: string): string {
  if (!searchTerm.trim())
    return text

  const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return text.replace(regex, '<mark class="bg-yellow-200 px-1 rounded">$1</mark>')
}

// Format time helper
function formatTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1)
    return 'Vừa xong'
  if (diffMins < 60)
    return `${diffMins} phút trước`
  if (diffHours < 24)
    return `${diffHours} giờ trước`
  if (diffDays < 7)
    return `${diffDays} ngày trước`

  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Handle image error fallback
function handleImageError(event: Event, name: string) {
  const target = event.target as HTMLImageElement
  target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
}

// Computed properties
const filteredConversations = computed(() => {
  let filtered = conversations.value

  // Apply conversation search filter
  const query = navSearchQuery.value || searchQuery.value
  if (query) {
    filtered = filtered.filter(
      conv =>
        conv.name.toLowerCase().includes(query.toLowerCase())
        || conv.lastMessage.toLowerCase().includes(query.toLowerCase()),
    )
  }

  // Apply status filters
  const { status, messageType } = filterOptions.value

  if (status.online || status.offline) {
    filtered = filtered.filter((conv) => {
      if (status.online && status.offline)
        return true
      if (status.online)
        return conv.online
      if (status.offline)
        return !conv.online
      return true
    })
  }

  // Apply message type filters
  if (messageType.unread || messageType.important || messageType.archived) {
    filtered = filtered.filter((conv) => {
      if (messageType.unread && conv.unreadCount > 0)
        return true
      if (messageType.important)
        return true // Can add important flag to conversations later
      if (messageType.archived)
        return false // Can add archived flag to conversations later
      return (
        !messageType.unread && !messageType.important && !messageType.archived
      )
    })
  }

  return filtered
})

// Search filtered messages
const searchFilteredMessages = computed(() => {
  if (!messageSearchQuery.value.trim()) {
    return []
  }

  const query = messageSearchQuery.value.toLowerCase().trim()

  return messages.value.filter(message =>
    message.text.toLowerCase().includes(query),
  ).map(message => ({
    ...message,
    highlightedText: highlightSearchText(message.text, messageSearchQuery.value),
  }))
})

// Get initials for avatar fallback
function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Methods
function clearAllFilters() {
  filterOptions.value = {
    status: {
      online: false,
      offline: false,
    },
    messageType: {
      unread: false,
      important: false,
      archived: false,
    },
  }
  showFilterDropdown.value = false
}

function applyFilters() {
  showFilterDropdown.value = false
}

async function sendMessage() {
  if (!messageText.value.trim())
    return

  sendingMessage.value = true

  const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const tempId = `temp_${Date.now()}`

  try {
    const tempMessage: Message = {
      id: tempId,
      direction: 'out',
      text: messageText.value,
      senderName: currentUserName.value,
      senderId: currentUserId.value,
      time: formatTime(new Date().toISOString()),
      avatar: currentUserAvatar.value,
      status: 'sent',
      clientId,
    }

    messages.value.push(tempMessage)
    const messageContent = messageText.value
    messageText.value = ''

    nextTick(scrollToBottom)

    // 2. Send via API với clientId
    const token = await directusClient.getToken()
    const response = await fetch('http://localhost:8055/zalo/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        conversationId: activeConversationId.value,
        message: messageContent,
        clientId,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`)
    }

    const result = await response.json()

    const tempIndex = messages.value.findIndex(m => m.id === tempId)
    if (tempIndex !== -1) {
      messages.value[tempIndex].status = 'delivered'
      messages.value[tempIndex].clientId = clientId
      processedMessageIds.add(result.messageId || tempId)
    }
  }
  catch (error: any) {
    console.error(' [SEND] Error:', error)

    const messageIndex = messages.value.findIndex(m => m.id === tempId)
    if (messageIndex !== -1 && messages.value[messageIndex]) {
      messages.value[messageIndex].status = 'failed'
    }
  }
  finally {
    sendingMessage.value = false
  }
}

async function autoLogin() {
  try {
    await client.login({
      email: 'admin@example.com',
      password: 'd1r3ctu5',
    })

    const token = await client.getToken()

    if (token) {
      await directusClient.setToken(token)
    }

    await directusClient.connect()

    isAuthenticated.value = true

    try {
      const response = await fetch('http://localhost:8055/zalo/status', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await response.json()
      if (data?.userId) {
        currentUserId.value = data.userId

        try {
          const users = await client.request(
            readItems('zalo_users' as any, {
              fields: ['display_name', 'zalo_name', 'avatar_url'],
              filter: { id: { _eq: data.userId } },
              limit: 1,
            }),
          )

          const currentUser = users[0]
          if (currentUser) {
            currentUserName.value = currentUser.display_name || currentUser.zalo_name || 'You'

            currentUserAvatar.value = getAvatarUrl(currentUser.avatar_url, currentUserName.value)
          }
        }
        catch (e) {
          console.warn('Could not fetch user info:', e)
        }
      }
    }
    catch (e) {
      console.warn('Could not get Zalo User ID:', e)
    }
  }
  catch (error) {
    console.error('Authentication failed:', error)
    isAuthenticated.value = false
  }
}

let isSelectingConversation = false

function selectConversation(id: string) {
  if (isSelectingConversation) {
    return
  }

  if (activeConversationId.value === id) {
    return
  }

  isSelectingConversation = true

  activeConversationId.value = id
  messages.value = []

  loadMessages(id).finally(() => {
    if (isAuthenticated.value) {
      subscribeToMessages(id)
    }
    isSelectingConversation = false
  })
}

async function loadConversations() {
  if (!isAuthenticated.value) {
    console.warn('Not authenticated')
    return
  }

  if (isLoadingConversations.value) {
    return
  }

  try {
    loading.value = true
    isLoadingConversations.value = true

    const data = await client.request(
      readItems('zalo_conversations', {
        fields: ['*'],
        filter: {
          is_hidden: { _eq: false },
        } as any,
        sort: ['-is_pinned', '-last_message_time'],
        limit: 100,
      }),
    )
    const groupIds = [...new Set(
      data
        .filter((conv: any) => conv.group_id && conv.group_id !== null)
        .map((conv: any) => conv.group_id),
    )]

    const participantIds = [...new Set(
      data
        .filter((conv: any) => conv.participant_id && conv.participant_id !== null)
        .map((conv: any) => String(conv.participant_id)),
    )]

    let groupsMap = new Map()
    let groupMembersMap = new Map()
    if (groupIds.length > 0) {
      const groups = await client.request(
        readItems('zalo_groups' as any, {
          fields: ['id', 'name', 'avatar_url'],
          filter: { id: { _in: groupIds } },
          limit: -1,
        }),
      )
      groupsMap = new Map(groups.map((g: any) => [g.id, g]))

      const groupMembers = await client.request(
        readItems('zalo_group_members' as any, {
          fields: ['group_id', 'user_id'],
          filter: { group_id: { _in: groupIds } },
          limit: -1,
        }),
      )

      groupMembers.forEach((gm: any) => {
        if (!groupMembersMap.has(gm.group_id)) {
          groupMembersMap.set(gm.group_id, [])
        }
        groupMembersMap.get(gm.group_id).push(gm.user_id)
      })
    }

    let usersMap = new Map()
    if (participantIds.length > 0) {
      const users = await client.request(
        readItems('zalo_users' as any, {
          fields: ['id', 'display_name', 'zalo_name', 'avatar_url'],
          filter: { id: { _in: participantIds } },
          limit: -1,
        }),
      )
      usersMap = new Map(users.map((u: any) => [u.id, u]))
    }

    conversations.value = data.map((conv: any) => {
      let name = 'Unknown'
      let avatar = ''
      let type: 'group' | 'direct' = 'group'
      let memberAvatars: any[] = []

      if (conv.participant_id && conv.participant_id !== null) {
        type = 'direct'
        const user = usersMap.get(conv.participant_id)
        if (user) {
          name = user.display_name || user.zalo_name || 'Unknown User'

          avatar = getAvatarUrl(user.avatar_url, name)
        }
        else {
          name = `User ${conv.participant_id.substring(0, 8)}`
          avatar = `https://ui-avatars.com/api/?name=U&background=4F46E5`
        }
      }
      else if (conv.group_id && conv.group_id !== null) {
        type = 'group'
        const group = groupsMap.get(conv.group_id)

        const memberUserIds = groupMembersMap.get(conv.group_id) || []

        for (const userId of memberUserIds.slice(0, 3)) {
          const user = usersMap.get(userId)
          if (user) {
            const memberName = user.display_name || user.zalo_name || 'User'
            const memberAvatar = getAvatarUrl(user.avatar_url, memberName)

            memberAvatars.push({
              id: userId,
              name: memberName,
              avatar: memberAvatar,
            })
          }
        }

        if (group) {
          name = group.name || 'Unknown Group'
          avatar = getAvatarUrl(group.avatar_url, name)
        }
        else {
          name = `Group ${conv.group_id.substring(0, 8)}`
          avatar = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHJ4PSI4IiBmaWxsPSIjMTBCOTgxIi8+PHBhdGggZD0iTTE1IDEzQzE1IDExLjM0MzEgMTYuMzQzMSAxMCAxOCAxMEMyMC4yMDkxIDEwIDIyIDExLjc5MDkgMjIgMTRDMjIgMTYuMjA5MSAyMC4yMDkxIDE4IDE4IDE4QzE2LjM0MzEgMTggMTUgMTYuNjU2OSAxNSAxNVYxM1oiIGZpbGw9IndoaXRlIi8+PHBhdGggZD0iTTI1IDEzQzI1IDExLjM0MzEgMjYuMzQzMSAxMCAyOCAxMEMyOS42NTY5IDEwIDMxIDExLjM0MzEgMzEgMTNDMzEgMTQuNjU2OSAyOS42NTY5IDE2IDI4IDE2QzI2LjM0MzEgMTYgMjUgMTQuNjU2OSAyNSAxM1oiIGZpbGw9IndoaXRlIi8+PHBhdGggZD0iTTEwIDI2QzEwIDIzLjIzODYgMTIuMjM4NiAyMSAxNSAyMUgyMUMyMy43NjE0IDIxIDI2IDIzLjIzODYgMjYgMjZWMjhDMjYgMjguNTUyMyAyNS41NTIzIDI5IDI1IDI5SDExQzEwLjQ0NzcgMjkgMTAgMjguNTUyMyAxMCAyOFYyNloiIGZpbGw9IndoaXRlIi8+PHBhdGggZD0iTTI0IDI2QzI0IDI0LjM0MzEgMjUuMzQzMSAyMyAyNyAyM0gzMEMzMS42NTY5IDIzIDMzIDI0LjM0MzEgMzMgMjZWMjhDMzMgMjguNTUyMyAzMi41NTIzIDI5IDMyIDI5SDI1QzI0LjQ0NzcgMjkgMjQgMjguNTUyMyAyNCAyOFYyNloiIGZpbGw9IndoaXRlIiBmaWxsLW9wYWNpdHk9IjAuNyIvPjwvc3ZnPg=='
          console.log('Group not found in map:', conv.group_id)
        }
      }

      return {
        id: conv.id,
        name,
        avatar,
        lastMessage: '',
        timestamp: formatTime(conv.last_message_time),
        unreadCount: conv.unread_count || 0,
        online: true,
        type,
        members: memberAvatars,
      }
    })

    if (conversations.value.length > 0 && !activeConversationId.value) {
      conversations.value[0]?.id && selectConversation(conversations.value[0].id)
    }
  }
  catch (error: any) {
    console.error('Error loading conversations:', error)
  }
  finally {
    loading.value = false
    isLoadingConversations.value = false
  }
}

async function loadMessages(conversationId: string) {
  if (!isAuthenticated.value || !conversationId)
    return

  if (isLoadingMessages.value) {
    return
  }

  try {
    isLoadingMessages.value = true

    if (currentUserId.value === 'system') {
      try {
        const me = await client.request(readMe({ fields: ['id'] }))
        if (me?.id)
          currentUserId.value = me.id
      }
      catch (e) {
        console.warn('Could not get current user ID:', e)
      }
    }

    const data = await client.request(
      readItems('zalo_messages' as any, {
        fields: ['*'],
        filter: {
          conversation_id: { _eq: conversationId },
        },
        sort: ['sent_at'],
        limit: 50,
      }),
    )

    const senderIds = [...new Set(data.map((msg: any) => msg.sender_id).filter(Boolean))]

    let usersMap = new Map()
    if (senderIds.length > 0) {
      const users = await client.request(
        readItems('zalo_users' as any, {
          fields: ['id', 'display_name', 'zalo_name', 'avatar_url'],
          filter: { id: { _in: senderIds } },
          limit: -1,
        }),
      )
      usersMap = new Map(users.map((u: any) => [u.id, u]))
    }

    messages.value = data.map((msg: any) => {
      const user = usersMap.get(msg.sender_id)
      const senderName = user?.display_name || user?.zalo_name || 'Unknown'

      const senderAvatar = getAvatarUrl(user?.avatar_url, senderName)

      const direction: 'in' | 'out' = msg.sender_id === currentUserId.value ? 'out' : 'in'

      return {
        id: msg.id,
        direction,
        text: msg.content || '',
        senderName,
        senderId: msg.sender_id,
        time: formatTime(msg.sent_at),
        avatar: senderAvatar,
        status: direction === 'out' ? 'read' : undefined,
      }
    })

    nextTick(scrollToBottom)
  }
  catch (error: any) {
    console.error('Error loading messages:', error)
  }
  finally {
    isLoadingMessages.value = false
  }
}

async function subscribeToMessages(conversationId: string) {
  if (subscriptionCleanup) {
    subscriptionCleanup()
    subscriptionCleanup = null
  }

  if (!conversationId)
    return
  processedMessageIds.clear()

  try {
    const { subscription, unsubscribe } = await directusClient.subscribe('zalo_messages', {
      event: 'create',
      query: {
        fields: ['*'],
        filter: {
          conversation_id: { _eq: conversationId },
        },
        sort: ['sent_at'],
      },
      uid: `messages-${conversationId}`,
    })

    subscriptionCleanup = unsubscribe

    ;(async () => {
      for await (const item of subscription) {
        if (item.type === 'subscription' && item.event === 'init') {
          console.log('[WEBSOCKET] Subscription initialized')
        }
        else if (item.type === 'subscription' && item.event === 'create') {
          if (!item.data || item.data.length === 0) {
            console.warn('[WEBSOCKET] Empty data received')
            continue
          }

          const newMsg = item.data[0]

          if (!newMsg?.id) {
            console.warn('[WEBSOCKET] Invalid message structure:', newMsg)
            continue
          }
          if (processedMessageIds.has(newMsg.id)) {
            continue
          }

          const exists = messages.value.some(m =>
            m.id === newMsg.id
            || (newMsg.client_id && m.clientId === newMsg.client_id),
          )

          if (exists) {
            continue
          }
          processedMessageIds.add(newMsg.id)

          let senderName = 'Unknown'
          let senderAvatar = ''

          if (newMsg.sender_id) {
            try {
              const users = await client.request(
                readItems('zalo_users' as any, {
                  fields: ['display_name', 'zalo_name', 'avatar_url'],
                  filter: { id: { _eq: newMsg.sender_id } },
                  limit: 1,
                }),
              )

              const user = users[0]

              if (user) {
                senderName = user.display_name || user.zalo_name || 'Unknown'

                senderAvatar = getAvatarUrl(user.avatar_url, senderName)
              }
            }
            catch (e) {
              console.warn('Could not fetch sender info:', e)
            }
          }

          const direction: 'in' | 'out' = newMsg.sender_id === currentUserId.value ? 'out' : 'in'

          const messageToAdd = {
            id: newMsg.id,
            direction,
            text: newMsg.content || '',
            senderName,
            senderId: newMsg.sender_id,
            time: formatTime(newMsg.sent_at),
            avatar: senderAvatar,
            status: direction === 'out' ? 'delivered' : undefined,
            clientId: newMsg.client_id,
          }

          messages.value.push(messageToAdd)

          nextTick(scrollToBottom)
        }
      }
    })()
  }
  catch (error) {
    console.error('[SUBSCRIBE] Failed to subscribe:', error)
  }
}

function autoResize(event: Event) {
  const textarea = event.target as HTMLTextAreaElement
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
}

// File Upload Functions (commented out - not fully implemented in BE yet)
// function triggerFileInput() {
//   activeDialog.value = 'upload'
// }

// function openFilePicker() {
//   fileInput.value?.click()
// }

// function removePendingAttachment(index: number) {
//   pendingAttachments.value.splice(index, 1)
// }

// function handleFileSelect(event: Event) {
//   const target = event.target as HTMLInputElement
//   if (target.files && target.files.length > 0) {
//     const files = Array.from(target.files)
//     selectedFiles.value = files
//     activeDialog.value = null
//     showFilePreviewDialog.value = true
//   }
// }

// function removeFileFromPreview(index: number) {
//   selectedFiles.value.splice(index, 1)
//   if (selectedFiles.value.length === 0) {
//     showFilePreviewDialog.value = false
//   }
// }

// function cancelFileUpload() {
//   selectedFiles.value = []
//   showFilePreviewDialog.value = false
// }

// async function confirmAndUploadFiles() {
//   showFilePreviewDialog.value = false
//   await uploadSelectedFiles()
// }

// async function uploadSelectedFiles() {
//   if (selectedFiles.value.length === 0)
//     return
//   // Upload logic commented out - not fully implemented
// }

// Members dialog functions
function toggleMemberSelection(memberId: string) {
  const index = selectedMembers.value.indexOf(memberId)
  if (index > -1) {
    selectedMembers.value.splice(index, 1)
  }
  else {
    selectedMembers.value.push(memberId)
  }
}

function removeMember(memberId: string) {
  const index = selectedMembers.value.indexOf(memberId)
  if (index > -1) {
    selectedMembers.value.splice(index, 1)
  }
}

const activeConversation = computed(() => {
  return conversations.value.find(
    conv => conv.id === activeConversationId.value,
  )
})
// Thêm vào script
const activeConversationMembers = computed(() => {
  if (!activeConversationId.value) {
    console.log('❌ No active conversation ID')
    return []
  }

  const conv = conversations.value.find(c => c.id === activeConversationId.value)

  if (!conv) {
    console.log('❌ Conversation not found in array')
    return []
  }

  if (conv.type !== 'group') {
    console.log('ℹ️ Not a group conversation')
    return []
  }

  console.log('✅ Found members:', conv.members?.length || 0, conv.members)
  return conv.members || []
})

// Conversation stats by type
const conversationStats = computed(() => {
  const all = conversations.value.length
  const group = conversations.value.filter(c => c.type === 'group').length
  const direct = conversations.value.filter(c => c.type === 'direct').length

  return { all, group, direct }
})

const currentMessages = computed(() => {
  return messages.value
})

const selectedMemberObjects = computed(() => {
  return conversations.value.filter(member =>
    selectedMembers.value.includes(member.id),
  )
})

// Create group function (commented out - not implemented in BE yet)
// function createGroup() {
//   if (selectedMembers.value.length === 0) {
//     return
//   }
//   // Group creation logic not implemented
// }

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

function navigateToMessage(messageId: string) {
  highlightedMessageId.value = messageId

  nextTick(() => {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`)
    if (messageElement && messagesContainer.value) {
      messageElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })

      setTimeout(() => {
        highlightedMessageId.value = null
      }, 3000)
    }
  })
}

function handleFilter() {
  showFilterDropdown.value = !showFilterDropdown.value
}

function handleAddUser() {
  showMembersDialog.value = true
}

function openMembersDialog() {
  showMembersDialog.value = true
}

function closeMembersDialog() {
  showMembersDialog.value = false
  memberSearchQuery.value = ''
  selectedMembers.value = []
}

function handleClickOutside(event: Event) {
  const target = event.target as HTMLElement
  const filterButton = target.closest('.filter-dropdown-container')
  if (!filterButton && showFilterDropdown.value) {
    showFilterDropdown.value = false
  }
}

onMounted(async () => {
  await autoLogin()
  await loadConversations()

  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  if (subscriptionCleanup) {
    subscriptionCleanup()
  }

  directusClient.disconnect()
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

watch(activeConversationId, (newId) => {
  if (newId && isAuthenticated.value) {
    subscribeToMessages(newId)
    nextTick(scrollToBottom)
  }
})
</script>

<template>
<<<<<<< HEAD
  <private-view title="Messages">
    <template #title-outer:prepend>
      <v-button class="header-icon" rounded disabled icon secondary>
        <v-icon name="inbox" />
      </v-button>
    </template>

    <!-- Sidebar tùy biến theo trạng thái -->
    <template #sidebar>
      <sidebar-detail v-if="currentFunction === 'A'" icon="search" class="my-sidebar-detail" title="Search for messages" close>
        <!-- Search and Filter Section -->

        <div class="search-container space-y-4">
          <!-- Search Input với style mới -->
          <div class="search-input-section">
            <div class="relative border rounded-xl shadow-sm">
              <input
                v-model="messageSearchQuery"
                type="text"
                placeholder="Search in conversation"
                class="w-full pl-9 pr-3 py-4 text-sm bg-gray-50 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
              >
            </div>
          </div>

          <div class="flex items-center justify-between">
            <h1 class="text-lg text-gray-900">
              Filter:
            </h1>

            <div
              v-if="showFilterDropdown"
              class="fixed top-13 left-100 w-56 mt-2 bg-white border-neutral-200 rounded-lg shadow-xl z-[9999]"
            />
            <div class="relative filter-dropdown-container">
              <button
                class="flex items-center gap-1 px-2 py-1 text-[14px] font-medium leading-normal not-italic rounded-[var(--Button-Radius-button,6px)] !border !border-solid !border-[var(--border-normal,#D3DAE4)] text-[var(--foreground-normal,#4F5464)] font-[Inter] transition-colors"
                :class="{ 'bg-neutral-100': showFilterDropdown }"
                @click="handleFilter"
              >
                <span>Sender</span>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  :class="{ 'rotate-180': showFilterDropdown }"
                  class="transition-transform duration-200"
                >
                  <path
                    d="M19.92 8.94995L13.4 15.47C12.63 16.24 11.37 16.24 10.6 15.47L4.07996 8.94995"
                    stroke="#4F5464"
                    stroke-width="2"
                    stroke-miterlimit="10"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </div>
            <div class="relative filter-dropdown-container">
              <button
                class="flex items-center gap-1 px-4 py-1 text-[14px] font-medium leading-normal not-italic rounded-[var(--Button-Radius-button,6px)] !border !border-solid !border-[var(--border-normal,#D3DAE4)] text-[var(--foreground-normal,#4F5464)] font-[Inter] transition-colors"
                :class="{ 'bg-neutral-100': showFilterDropdown }"
                @click="handleFilter"
              >
                <span>Date</span>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  :class="{ 'rotate-180': showFilterDropdown }"
                  class="transition-transform duration-200"
                >
                  <path
                    d="M19.92 8.94995L13.4 15.47C12.63 16.24 11.37 16.24 10.6 15.47L4.07996 8.94995"
                    stroke="#4F5464"
                    stroke-width="2"
                    stroke-miterlimit="10"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          <!-- Search Results Summary -->
          <div class="search-results-summary py-3 border-gray-200">
            <div class="flex items-center justify-between">
              <label class="text-xl font-semibold text-gray-900">Messages</label>
              <span v-if="messageSearchQuery.trim()" class="text-sm text-gray-500">
                {{ searchFilteredMessages.length }} {{ searchFilteredMessages.length === 1 ? 'message' : 'messages' }} found
              </span>
            </div>
          </div>

          <!-- No Search Query State -->
          <div v-if="!messageSearchQuery.trim()" class="text-center py-8">
            <svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p class="text-gray-500 text-sm">
              Enter a search term to find messages
            </p>
          </div>

          <!-- No Results State -->
          <div v-else-if="searchFilteredMessages.length === 0" class="text-center py-8">
            <svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 515.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.291.974-5.709 2.291" />
            </svg>
            <p class="text-gray-500 text-sm">
              No messages found for "{{ messageSearchQuery }}"
            </p>
          </div>

          <!-- Search Results -->
          <div v-else class="search-results space-y-3">
            <div
              v-for="message in searchFilteredMessages"
              :key="message.id"
              class="result-item cursor-pointer transition-all"
              title="Click to navigate to this message"
              @click="navigateToMessage(message.id)"
            >
              <div class="flex items-start gap-3">
                <div
                  class="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold text-white"
                  :class="message.senderName === 'Olivia Rhye' ? 'bg-pink-500' : 'bg-gray-500'"
                >
                  {{ getInitials(message.senderName) }}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1 justify-between">
                    <span class="text-sm font-semibold text-gray-900">{{ message.senderName }}</span>
                    <span class="text-xs text-gray-500">{{ message.time }}</span>
                  </div>
                  <p class="text-sm text-gray-600 leading-relaxed" v-html="message.highlightedText" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </sidebar-detail>
      <sidebar-detail v-if="currentFunction === 'B'" class="my-sidebar-detail" icon="info" title="Conversation information" close />
      <sidebar-detail v-if="currentFunction === 'B'" class="my-sidebar-detail" icon="swap_vert" title="Image/video" />
      <sidebar-detail v-if="currentFunction === 'B'" class="my-sidebar-detail" icon="layers" title="Link" />
      <sidebar-detail v-if="currentFunction === 'B'" class="my-sidebar-detail" icon="sync_disabled" title="File" />
    </template>

    <template #navigation>
      <!-- Search and Filter Section -->
      <div class="p-3 border-neutral-200 space-y-3">
        <div class="relative">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            v-model="navSearchQuery"
            placeholder="Search conversation"
            class="w-full pl-10 pr-3 py-3 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          >
        </div>

        <VDivider />

        <div class="flex items-center justify-between">
          <button
            class="w-8 h-8 flex items-center justify-center rounded-md bg-transparent hover:bg-neutral-100 text-text-muted hover:text-text-secondary transition-colors"
            @click="handleAddUser"
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M20 25V23C20 21.9391 19.5786 20.9217 18.8284 20.1716C18.0783 19.4214 17.0609 19 16 19H10C8.93913 19 7.92172 19.4214 7.17157 20.1716C6.42143 20.9217 6 21.9391 6 23V25M23 12V18M26 15H20M17 11C17 13.2091 15.2091 15 13 15C10.7909 15 9 13.2091 9 11C9 8.79086 10.7909 7 13 7C15.2091 7 17 8.79086 17 11Z"
                stroke="black"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          <div class="relative filter-dropdown-container">
            <button
              class="flex items-center gap-1 px-3 py-1 text-[14px] font-medium leading-normal not-italic rounded-[var(--Button-Radius-button,6px)] !border !border-solid !border-[var(--border-normal,#D3DAE4)] text-[var(--foreground-normal,#4F5464)] font-[Inter] transition-colors"
              :class="{ 'bg-neutral-100': showFilterDropdown }"
              @click="handleFilter"
            >
              <span>Filter</span>
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                :class="{ 'rotate-180': showFilterDropdown }"
                class="transition-transform duration-200"
              >
                <path
                  d="M19.92 8.94995L13.4 15.47C12.63 16.24 11.37 16.24 10.6 15.47L4.07996 8.94995"
                  stroke="#4F5464"
                  stroke-width="2"
                  stroke-miterlimit="10"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>

            <!-- Filter Dropdown -->
            <div
              v-if="showFilterDropdown"
              class="fixed top-13 left-100 w-56 mt-2 bg-white border-neutral-200 rounded-lg shadow-xl z-[9999]"
            >
              <div class="p-4">
                <!-- Theo trạng thái -->
                <div class="mb-4">
                  <h4 class="text-sm font-medium text-gray-700 mb-3">
                    Theo trạng thái
                  </h4>
                  <div class="space-y-2">
                    <label class="flex items-center cursor-pointer">
                      <input
                        v-model="filterOptions.status.online"
                        type="checkbox"
                        class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      >
                      <span class="ml-2 text-sm text-gray-700">Tất cả</span>
                    </label>
                    <label class="flex items-center cursor-pointer">
                      <input
                        v-model="filterOptions.status.offline"
                        type="checkbox"
                        class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      >
                      <span class="ml-2 text-sm text-gray-700">Chưa đọc</span>
                    </label>
                    <VDivider />
                  </div>
                </div>

                <!-- Theo thể phân loại -->
                <div class="mb-4">
                  <h4 class="text-sm font-medium text-gray-700 mb-3">
                    Theo thể phân loại
                  </h4>
                  <div class="space-y-2">
                    <label
                      type="checkbox"
                      class="flex items-center cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      >
                      <div
                        class="ml-2 w-3 h-3 rounded-full bg-red-500 mr-3"
                      />
                      <span class="text-sm text-gray-700">Khách hàng</span>
                    </label>
                    <label class="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      >
                      <div
                        class="ml-2 w-3 h-3 rounded-full bg-green-500 mr-3"
                      />
                      <span class="text-sm text-gray-700">Đồng nghiệp</span>
                    </label>
                    <label class="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      >
                      <div
                        class="ml-2 w-3 h-3 rounded-full bg-orange-500 mr-3"
                      />
                      <span class="text-sm text-gray-700">Công việc</span>
                    </label>
                    <label class="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      >
                      <div
                        class="ml-2 w-3 h-3 rounded-full bg-blue-500 mr-3"
                      />
                      <span class="text-sm text-gray-700">Trả lời sau</span>
                    </label>
                    <label class="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      >
                      <div
                        class="ml-2 w-3 h-3 rounded-full bg-gray-800 mr-3"
                      />
                      <span class="text-sm text-gray-700">Tin nhắn từ người lạ</span>
                    </label>
                  </div>
                </div>

                <!-- Quản lý thể phân loại -->
                <div class="pt-3 border-t border-gray-200">
                  <button
                    class="flex items-center text-sm text-blue-600 hover:text-blue-700"
                  >
                    <svg
                      class="w-4 h-4 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                      />
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    Quản lý thể phân loại
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Conversation List -->
      <div class="flex-1 overflow-y-auto">
        <div class="p-2 space-y-1">
          <div
            v-for="conversation in filteredConversations"
            :key="conversation.id"
            class="flex items-center p-2 rounded-lg cursor-pointer transition-colors duration-200 hover:bg-neutral-50"
            :class="[
              {
                'bg-brand-100': conversation.id === activeConversationId,
                'bg-transparent': conversation.id !== activeConversationId,
              },
            ]"
            @click="selectConversation(conversation.id)"
          >
            <div class="flex items-center gap-2 flex-1 min-w-0">
              <!-- Group Avatar with Members (3-avatar composite) -->
              <div v-if="conversation.type === 'group' && conversation.members && conversation.members.length > 0" class="relative w-[40px] h-[40px] inline-block">
                <div
                  v-for="(member, index) in conversation.members.slice(0, 3)"
                  :key="member.id"
                  class="absolute w-[20px] h-[20px] rounded-full overflow-hidden bg-neutral-100 border-2 border-white"
                  :class="{
                    'top-0 left-0': index === 0, // Avatar 1: trên trái
                    'top-0 right-0': index === 1, // Avatar 2: trên phải
                    'bottom-0 left-1/2 -translate-x-1/2': index === 2, // Avatar 3: dưới giữa
                  }"
                >
                  <img
                    :src="member.avatar"
                    :alt="member.name"
                    class="w-full h-full object-cover"
                  >
                </div>
              </div>

              <!-- Group Avatar - single image (has group photo) -->
              <div v-else-if="conversation.type === 'group'" class="relative inline-block">
                <div
                  class="w-13 h-13 relative rounded-full overflow-hidden bg-neutral-100 border border-black/8"
                >
                  <img
                    :src="conversation.avatar"
                    :alt="conversation.name"
                    class="w-10 h-10 object-cover"
                    @error="handleImageError($event, conversation.name)"
                  >
                </div>
              </div>

              <!-- Individual Conversation Avatar -->
              <div v-else class="relative inline-block">
                <div
                  class="w-13 h-13 relative rounded-full overflow-hidden bg-neutral-100 border border-black/8"
                >
                  <img
                    :src="conversation.avatar"
                    :alt="conversation.name"
                    class="w-10 h-10 object-cover"
                    @error="handleImageError($event, conversation.name)"
                  >
                </div>
                <div
                  v-if="conversation.online"
                  class="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-success-500 border-white"
                />
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                  <h4
                    class="font-medium text-sm truncate"
                    :class="[
                      {
                        'text-text-primary':
                          conversation.id === activeConversationId,
                        'text-text-secondary':
                          conversation.id !== activeConversationId,
                      },
=======
  <private-view title="Chat UI Test">
    <template #actions>
      <div class="flex items-center gap-2">
        <input
          v-model="searchQuery"
          placeholder="Search conversations..."
          class="px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          @keydown.enter="handleSearch"
        />
      </div>
    </template>

    <template #navigation>
      <!-- Search and Filter Section -->
      <div class="p-3 space-y-3 bg-neutral-50 border-b border-neutral-200">
        <div class="relative">
          <input
            v-model="navSearchQuery"
            placeholder="Search conversation"
            class="w-full  pl-10 pr-3 py-3 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>
      <div class="border-t-2  rounded-b-lg"> </div>
        
        <div class="flex items-center justify-between">
          <button
            class="w-8 h-8 flex items-center justify-center rounded-md bg-transparent hover:bg-neutral-100 text-text-muted hover:text-text-secondary transition-colors"
            @click="handleAddUser"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </button>
          
          <button
            class="px-3 py-2 text-xs border border-neutral-200 rounded-md bg-white text-text-secondary hover:bg-neutral-50 transition-colors"
            @click="handleFilter"
          >
            Filter
            <svg class="w-4 h-4 ml-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Conversation List -->
      <div class="flex-1 overflow-y-auto bg-white">
        <div class="p-2 space-y-1">
          <div
            v-for="conversation in filteredConversations"
            :key="conversation.id"
            :class="[
              'flex items-center p-2 rounded-lg cursor-pointer transition-colors duration-200',
              'hover:bg-neutral-50',
              {
                'bg-brand-100': conversation.id === activeConversationId,
                'bg-transparent': conversation.id !== activeConversationId
              }
            ]"
            @click="selectConversation(conversation.id)"
          >
            <div class="flex items-center gap-2 flex-1 min-w-0">
              <div class="relative inline-block">
                <div class="w-8 h-8 relative rounded-full overflow-hidden bg-neutral-100 border border-black/8">
                  <img
                    :src="conversation.avatar"
                    :alt="conversation.name"
                    class="w-full h-full object-cover"
                  />
                </div>
                <div
                  v-if="conversation.online"
                  class="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-success-500 border-2 border-white"
                />
              </div>
              
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                  <h4 
                    :class="[
                      'font-medium text-sm truncate',
                      {
                        'text-text-primary': conversation.id === activeConversationId,
                        'text-text-secondary': conversation.id !== activeConversationId
                      }
>>>>>>> 36c86a1 (feat/UI_Chat_v2)
                    ]"
                  >
                    {{ conversation.name }}
                  </h4>
                  <span class="text-xs ml-2 flex-shrink-0 text-text-muted">
                    {{ conversation.timestamp }}
                  </span>
                </div>
<<<<<<< HEAD

=======
                
>>>>>>> 36c86a1 (feat/UI_Chat_v2)
                <p class="text-xs mt-0.5 truncate text-text-tertiary">
                  {{ conversation.lastMessage }}
                </p>
              </div>
            </div>
<<<<<<< HEAD

=======
            
>>>>>>> 36c86a1 (feat/UI_Chat_v2)
            <!-- Unread badge -->
            <div
              v-if="conversation.unreadCount > 0"
              class="ml-2 flex-shrink-0 min-w-[20px] h-5 bg-brand-500 text-white text-xs font-medium rounded-full flex items-center justify-center px-1.5"
            >
<<<<<<< HEAD
              {{
                conversation.unreadCount > 99 ? "99+" : conversation.unreadCount
              }}
=======
              {{ conversation.unreadCount > 99 ? '99+' : conversation.unreadCount }}
>>>>>>> 36c86a1 (feat/UI_Chat_v2)
            </div>
          </div>
        </div>
      </div>
    </template>

<<<<<<< HEAD
    <!-- Main Chat Area với absolute positioning -->
    <div class="chat-container">
      <!-- Chat Header - Fixed tại top -->
      <div v-if="activeConversation" class="chat-header">
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-4">
            <!-- Group Header Avatar -->
            <div
              v-if="activeConversation?.type === 'group'"
              class="relative inline-block w-[36px] h-[36px]"
            >
              <template v-if="activeConversationMembers.length > 0">
                <div
                  v-for="(member, index) in activeConversationMembers.slice(0, 3)"
                  :key="member.id"
                  class="absolute w-[18px] h-[18px] rounded-full overflow-hidden bg-neutral-100 border border-white"
                  :class="{
                    'top-0 left-[-1px]': index === 0,
                    'top-0 right-[-1px]': index === 1,
                    'bottom-0 left-1/2 -translate-x-1/2': index === 2,
                  }"
                >
                  <img
                    :src="member.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name || 'User')}&background=random&size=18`"
                    :alt="member.name || 'User'"
                    class="w-full h-full object-cover"
                  >
                </div>
              </template>

              <!-- Fallback -->
              <div v-else class="w-full h-full rounded-full overflow-hidden bg-neutral-100 border border-white">
=======
    <!-- Main Chat Area -->
    <div class="h-full flex flex-col bg-white">
      <!-- Chat Header -->
      <div
        v-if="activeConversation"
        class="flex-shrink-0 p-4 bg-brand-100 border-b border-neutral-200"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="relative inline-block">
              <div class="w-10 h-10 relative rounded-full overflow-hidden bg-neutral-100 border border-black/8">
>>>>>>> 36c86a1 (feat/UI_Chat_v2)
                <img
                  :src="activeConversation.avatar"
                  :alt="activeConversation.name"
                  class="w-full h-full object-cover"
<<<<<<< HEAD
                >
              </div>
            </div>

            <!-- Individual Conversation Header Avatar -->
            <div v-else class="relative inline-block">
              <div
                class="w-14 h-14 relative rounded-full overflow-hidden bg-neutral-100 border border-black/8"
              >
                <img
                  :src="
                    activeConversation.avatar
                      || `https://ui-avatars.com/api/?name=${encodeURIComponent(
                        activeConversation.name,
                      )}&background=random`
                  "
                  :alt="activeConversation.name"
                  class="w-full h-full object-cover"
                  @error="handleImageError($event, activeConversation.name)"
                >
=======
                />
>>>>>>> 36c86a1 (feat/UI_Chat_v2)
              </div>
              <div
                v-if="activeConversation.online"
                class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-success-500 border-2 border-white"
              />
            </div>
<<<<<<< HEAD

=======
            
>>>>>>> 36c86a1 (feat/UI_Chat_v2)
            <h3 class="font-semibold text-text-secondary">
              {{ activeConversation.name }}
            </h3>
          </div>
<<<<<<< HEAD

          <div class="flex items-center gap-2">
            <button
              class="w-10 h-10 flex items-center justify-center rounded-lg bg-transparent hover:bg-neutral-100 text-text-muted hover:text-text-secondary transition-colors"
              @click="openMembersDialog"
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M20.5 19.95C20.9833 19.4167 21.3542 18.8083 21.6125 18.125C21.8708 17.4417 22 16.7333 22 16C22 15.2667 21.8708 14.5583 21.6125 13.875C21.3542 13.1917 20.9833 12.5833 20.5 12.05C21.5 12.1833 22.3333 12.625 23 13.375C23.6667 14.125 24 15 24 16C24 17 23.6667 17.875 23 18.625C22.3333 19.375 21.5 19.8167 20.5 19.95ZM26 28V25C26 24.4 25.8667 23.8292 25.6 23.2875C25.3333 22.7458 24.9833 22.2667 24.55 21.85C25.4 22.15 26.1875 22.5375 26.9125 23.0125C27.6375 23.4875 28 24.15 28 25V28H26ZM28 21V19H26V17H28V15H30V17H32V19H30V21H28ZM16 20C14.9 20 13.9583 19.6083 13.175 18.825C12.3917 18.0417 12 17.1 12 16C12 14.9 12.3917 13.9583 13.175 13.175C13.9583 12.3917 14.9 12 16 12C17.1 12 18.0417 12.3917 18.825 13.175C19.6083 13.9583 20 14.9 20 16C20 17.1 19.6083 18.0417 18.825 18.825C18.0417 19.6083 17.1 20 16 20ZM8 28V25.2C8 24.6333 8.14583 24.1125 8.4375 23.6375C8.72917 23.1625 9.11667 22.8 9.6 22.55C10.6333 22.0333 11.6833 21.6458 12.75 21.3875C13.8167 21.1292 14.9 21 16 21C17.1 21 18.1833 21.1292 19.25 21.3875C20.3167 21.6458 21.3667 22.0333 22.4 22.55C22.8833 22.8 23.2708 23.1625 23.5625 23.6375C23.8542 24.1125 24 24.6333 24 25.2V28H8ZM16 18C16.55 18 17.0208 17.8042 17.4125 17.4125C17.8042 17.0208 18 16.55 18 16C18 15.45 17.8042 14.9792 17.4125 14.5875C17.0208 14.1958 16.55 14 16 14C15.45 14 14.9792 14.1958 14.5875 14.5875C14.1958 14.9792 14 15.45 14 16C14 16.55 14.1958 17.0208 14.5875 17.4125C14.9792 17.8042 15.45 18 16 18ZM10 26H22V25.2C22 25.0167 21.9542 24.85 21.8625 24.7C21.7708 24.55 21.65 24.4333 21.5 24.35C20.6 23.9 19.6917 23.5625 18.775 23.3375C17.8583 23.1125 16.9333 23 16 23C15.0667 23 14.1417 23.1125 13.225 23.3375C12.3083 23.5625 11.4 23.9 10.5 24.35C10.35 24.4333 10.2292 24.55 10.1375 24.7C10.0458 24.85 10 25.0167 10 25.2V26Z"
                  fill="#1F1F1F"
                />
              </svg>
            </button>
            <button
              class="w-10 h-10 flex items-center justify-center rounded-lg bg-transparent hover:bg-neutral-100 text-text-muted hover:text-text-secondary transition-colors"
              @click="showFunctionA"
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M29 28.9999L24.66 24.6599M27 19C27 23.4183 23.4183 27 19 27C14.5817 27 11 23.4183 11 19C11 14.5817 14.5817 11 19 11C23.4183 11 27 14.5817 27 19Z"
                  stroke="black"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>

            <button
              class="w-10 h-10 flex items-center justify-center rounded-lg bg-transparent hover:bg-neutral-100 text-text-muted hover:text-text-secondary transition-colors"
              @click="showFunctionB"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M12 6C12.5523 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4C11.4477 4 11 4.44772 11 5C11 5.55228 11.4477 6 12 6Z" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M12 20C12.5523 20 13 19.5523 13 19C13 18.4477 12.5523 18 12 18C11.4477 18 11 18.4477 11 19C11 19.5523 11.4477 20 12 20Z" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
=======
          
          <div class="flex items-center gap-2">
            <button class="w-10 h-10 flex items-center justify-center rounded-lg bg-transparent hover:bg-neutral-100 text-text-muted hover:text-text-secondary transition-colors">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button class="w-10 h-10 flex items-center justify-center rounded-lg bg-transparent hover:bg-neutral-100 text-text-muted hover:text-text-secondary transition-colors">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <button class="w-10 h-10 flex items-center justify-center rounded-lg bg-transparent hover:bg-neutral-100 text-text-muted hover:text-text-secondary transition-colors">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
>>>>>>> 36c86a1 (feat/UI_Chat_v2)
              </svg>
            </button>
          </div>
        </div>
      </div>
<<<<<<< HEAD

      <!-- Messages area - Scrollable với padding cho header và input -->
      <div
        v-if="activeConversation"
        ref="messagesContainer"
        class="messages-area"
      >
        <div
          class="min-h-full flex flex-col justify-end"
          :class="{ 'justify-center': currentMessages.length <= 1 }"
        >
          <div class="space-y-1">
            <div
              v-for="message in currentMessages"
              :key="message.id"
              :data-message-id="message.id"
              class="flex gap-4 px-8 py-3 transition-all duration-300"
              :class="[
                {
                  'justify-center': message.type === 'system',
                  'justify-start': message.type !== 'system',
                  'bg-gray-200': highlightedMessageId === message.id,
                },
              ]"
            >
              <!-- System Message (Group creation, etc.) -->
              <div v-if="message.type === 'system'" class="flex flex-col items-center w-full gap-8">
                <!-- Group Avatar and Names Section -->
                <div class="flex flex-col items-center gap-1.5">
                  <!-- Large Group Avatar (64x64) -->
                  <div class="w-16 h-16 relative rounded-full overflow-hidden bg-neutral-100 border border-black/8">
                    <img
                      :src="activeConversation?.members?.[0] ? conversations.find(c => c.id === activeConversation.members[0])?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(conversations.find(c => c.id === activeConversation.members[0])?.name || 'Group')}&background=random&size=64` : `https://ui-avatars.com/api/?name=Group&background=random&size=64`"
                      :alt="activeConversation?.name || 'Group'"
                      class="w-full h-full object-cover"
                    >
                  </div>

                  <!-- Group Member Names -->
                  <h3 class="text-3xl font-semibold text-black">
                    {{ activeConversation?.name || 'Group' }}
                  </h3>
                </div>

                <!-- Today chip - Figma specs: #E4EAF1 bg, #D3DAE4 border, #344054 text -->
                <div
                  class="inline-flex items-center h-6 px-1.5 rounded border"
                  style="background-color: #E4EAF1; border-color: #D3DAE4;"
                >
                  <span class="text-sm font-medium" style="color: #344054;">Today</span>
                </div>

                <!-- System message chip - Figma specs: #F8FAFC bg, #E4E7EC border, #4F5464 text -->
                <div
                  class="inline-flex items-center h-6 px-1.5 rounded border"
                  style="background-color: #F8FAFC; border-color: #E4E7EC;"
                >
                  <span class="text-sm" style="color: #4F5464;">{{ message.text }}</span>
                </div>
              </div>

              <!-- Regular Messages -->
              <template v-else>
                <!-- Avatar -->
                <div class="w-14 h-14 relative rounded-full overflow-hidden bg-neutral-100 border border-black/8 flex-shrink-0">
                  <img
                    :src="
                      message.avatar
                        || `https://ui-avatars.com/api/?name=${encodeURIComponent(
                          message.senderName,
                        )}&background=random`
                    "
                    :alt="message.senderName"
                    class="w-full h-full object-cover"
                    @error="handleImageError($event, message.senderName)"
                  >
                </div>

                <div class="flex flex-col max-w-[70%]">
                  <!-- Message header with name and time -->
                  <div class="flex items-center gap-2 mb-2">
                    <span class="font-semibold text-sm text-text-secondary">
                      {{ message.senderName }}
                    </span>
                    <span class="text-xs text-text-muted">
                      {{ message.time }}
                    </span>
                  </div>

                  <!-- File Attachments -->
                  <div v-if="message.files && message.files.length > 0" class="flex flex-col gap-2 mb-2">
                    <div
                      v-for="file in message.files"
                      :key="file.id"
                      class="rounded-lg overflow-hidden bg-neutral-50 border border-neutral-200"
                    >
                      <!-- Image Preview -->
                      <div v-if="file.type && file.type.startsWith('image/')" class="relative group">
                        <img
                          :src="file.thumbnail || file.url"
                          :alt="file.filename"
                          class="max-w-full h-auto max-h-96 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                          @click="window.open(file.url, '_blank')"
                        >
                        <div class="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                          {{ formatFileSize(Number(file.size)) }}
                        </div>
                      </div>

                      <!-- Document/File Card -->
                      <div v-else class="flex items-center gap-3 p-3">
                        <div class="w-12 h-12 flex items-center justify-center rounded-lg bg-neutral-100">
                          <v-icon
                            :name="getFileIcon(file.type)"
                            class="text-neutral-600"
                          />
                        </div>
                        <div class="flex-1 min-w-0">
                          <div class="font-medium text-sm truncate  text-blue-500">
                            {{ file.filename }}
                          </div>
                          <div class="text-xs text-text-muted">
                            {{ formatFileSize(file.size) }}
                          </div>
                        </div>
                        <button
                          class="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/10 transition-colors"
                          @click="window.open(file.url, '_blank')"
                        >
                          <v-icon
                            name="download"
                            class="text-neutral-600"
                          />
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Message content (text) -->
                  <div
                    v-if="message.text"
                    class="rounded-lg max-w-full break-words text-sm text-text-secondary leading-relaxed border-neutral-200"
                  >
                    <p class="whitespace-pre-wrap" v-html="convertEmoticonToEmoji(message.text)" />
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- Message input - Fixed tại bottom -->
      <div v-if="activeConversation" class="message-input">
        <!-- Hidden file input -->
        <input
          ref="fileInput"
          type="file"
          multiple
          :accept="`${FILE_CONFIGS.images.accept},${FILE_CONFIGS.documents.accept}`"
          :max="MAX_FILES"
          class="hidden"
          @change="handleFileSelect"
        >

        <!-- File Preview Dialog - Show before upload -->
        <v-dialog
          :model-value="showFilePreviewDialog"
          @update:model-value="showFilePreviewDialog = false"
          @esc="cancelFileUpload"
        >
          <v-card>
            <v-card-title>
              Selected Files ({{ selectedFiles.length }})
            </v-card-title>

            <v-card-text>
              <div class="space-y-3">
                <div
                  v-for="(file, index) in selectedFiles"
                  :key="index"
                  class="flex items-center gap-3 p-3 border-2 border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                >
                  <!-- File Icon/Preview -->
                  <div class="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-purple-50 rounded-lg">
                    <svg v-if="file.type.startsWith('image/')" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 19V5C21 3.9 20.1 3 19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19ZM8.5 13.5L11 16.51L14.5 12L19 18H5L8.5 13.5Z" fill="#6644FF" />
                    </svg>
                    <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2ZM16 18H8V16H16V18ZM16 14H8V12H16V14ZM13 9V3.5L18.5 9H13Z" fill="#6644FF" />
                    </svg>
                  </div>

                  <!-- File Info -->
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900 truncate">
                      {{ file.name }}
                    </p>
                    <p class="text-xs text-gray-500">
                      {{ formatFileSize(file.size) }}
                    </p>
                  </div>

                  <!-- Action Buttons -->
                  <div class="flex items-center gap-2">
                    <!-- Edit button (placeholder for now) -->
                    <button
                      class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12.5 2.5L15.5 5.5L5.5 15.5H2.5V12.5L12.5 2.5Z" stroke="#8196B1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                    </button>

                    <!-- Remove button -->
                    <button
                      class="p-2 hover:bg-red-50 rounded-lg transition-colors group"
                      title="Remove"
                      @click="removeFileFromPreview(index)"
                    >
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M13.5 4.5L4.5 13.5M4.5 4.5L13.5 13.5" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="group-hover:stroke-red-600" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </v-card-text>

            <v-card-actions>
              <v-button secondary @click="cancelFileUpload">
                Cancel
              </v-button>
              <v-button
                :disabled="selectedFiles.length === 0"
                @click="confirmAndUploadFiles"
              >
                Upload {{ selectedFiles.length }} file{{ selectedFiles.length > 1 ? 's' : '' }}
              </v-button>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Pending Attachments Preview (above message input) -->
        <div v-if="pendingAttachments.length > 0" class="pending-attachments-container">
          <div
            v-for="(attachment, index) in pendingAttachments"
            :key="attachment.id"
            class="attachment-preview"
          >
            <!-- File Icon/Preview -->
            <div class="attachment-content">
              <div class="file-icon-wrapper">
                <v-icon
                  :name="getFileIcon(attachment.type)"
                  class="text-brand-600"
                  small
                />
              </div>

              <!-- File Name -->
              <span class="file-name">{{ attachment.filename }}</span>
            </div>

            <!-- Action Buttons -->
            <div class="attachment-actions">
              <!-- Edit button - Opens library to replace file -->
              <v-button
                icon
                secondary
                x-small
                @click="activeDialog = 'choose'"
              >
                <v-icon name="edit" small />
              </v-button>

              <!-- Remove button -->
              <v-button
                icon
                secondary
                x-small
                @click="removePendingAttachment(index)"
              >
                <v-icon name="delete" small />
              </v-button>
            </div>
          </div>
        </div>

        <!-- Upload Progress Indicator -->
        <div v-if="isUploading" class="upload-progress-container">
          <div class="flex flex-col gap-2 p-4 bg-white border border-gray-200 rounded-lg shadow-lg max-w-md">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-gray-700">Uploading files...</span>
              <span class="text-xs text-gray-500">{{ uploadProgress.size }} file(s)</span>
            </div>
            <div
              v-for="[fileId, progress] in Array.from(uploadProgress.entries())"
              :key="fileId"
              class="flex flex-col gap-1"
            >
              <div class="flex items-center justify-between text-xs">
                <span class="truncate max-w-[200px] text-gray-600">{{ progress.fileName }}</span>
                <span
                  class="font-medium"
                  :class="{
                    'text-blue-600': progress.status === 'uploading',
                    'text-green-600': progress.status === 'success',
                    'text-red-600': progress.status === 'error',
                  }"
                >
                  {{ progress.status === 'success' ? '✓' : progress.status === 'error' ? '✗' : `${progress.progress}%` }}
                </span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  class="h-1.5 rounded-full transition-all duration-300"
                  :class="{
                    'bg-blue-600': progress.status === 'uploading',
                    'bg-green-600': progress.status === 'success',
                    'bg-red-600': progress.status === 'error',
                  }"
                  :style="{ width: `${progress.progress}%` }"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-end gap-3">
          <div class="flex gap-2">
            <Story>
              <!-- Menu với 3 options upload -->
              <v-menu :offset-y="-150" :offset-x="127">
                <template #activator="{ toggle }">
                  <v-icon
                    clickable
                    class="options"
                    name="attach_file"
                    @click="toggle"
                  />
                </template>

                <v-list>
                  <!-- Option 1: Upload from Device -->
                  <v-list-item clickable @click="triggerFileInput">
                    <v-list-item-icon>
                      <v-icon name="phonelink" />
                    </v-list-item-icon>
                    <v-list-item-content>
                      Upload File from Device
                    </v-list-item-content>
                  </v-list-item>

                  <!-- Option 2: Choose from Library -->
                  <v-list-item clickable @click="activeDialog = 'choose'">
                    <v-list-item-icon>
                      <v-icon name="folder_open" />
                    </v-list-item-icon>
                    <v-list-item-content>
                      Choose File from Library
                    </v-list-item-content>
                  </v-list-item>

                  <!-- Option 3: Import from URL -->
                  <v-list-item clickable @click="activeDialog = 'url'">
                    <v-list-item-icon>
                      <v-icon name="link" />
                    </v-list-item-icon>
                    <v-list-item-content>
                      Import File from URL
                    </v-list-item-content>
                  </v-list-item>
                </v-list>
              </v-menu>

              <!-- Dialog 1: Upload from Device -->
              <v-dialog
                :model-value="activeDialog === 'upload'"
                @update:model-value="activeDialog = null"
                @esc="activeDialog = null"
              >
                <v-card>
                  <v-card-title>Upload File from Device</v-card-title>

                  <v-card-text>
                    <v-upload
                      :multiple="true"
                      @input="onUpload"
                    />
                  </v-card-text>

                  <v-card-actions>
                    <v-button secondary @click="activeDialog = null">
                      Cancel
                    </v-button>
                  </v-card-actions>
                </v-card>
              </v-dialog>

              <!-- Dialog 2: Import from URL -->
              <v-dialog
                :model-value="activeDialog === 'url'"
                @update:model-value="activeDialog = null"
                @esc="activeDialog = null"
              >
                <v-card>
                  <v-card-title>Import File from URL</v-card-title>

                  <v-card-text>
                    <v-input
                      v-model="importUrl"
                      placeholder="https://example.com/file.pdf"
                      :nullable="false"
                    />
                  </v-card-text>

                  <v-card-actions>
                    <v-button secondary @click="activeDialog = null">
                      Cancel
                    </v-button>
                    <v-button
                      :disabled="!isValidURL"
                      :loading="importing"
                      @click="importFromURL"
                    >
                      Import
                    </v-button>
                  </v-card-actions>
                </v-card>
              </v-dialog>

              <!-- Drawer: Choose from Library -->
              <drawer-files
                v-if="activeDialog === 'choose'"
                :active="activeDialog === 'choose'"
                :folder="folder"
                @update:active="activeDialog = null"
                @input="onSelectFromLibrary"
              />
            </Story>
            <VEmojiPicker
              @select="insertEmoji($event)"
              @emoji-click="insertEmoji($event)"
              @emoji-selected="insertEmoji($event)"
              @input="insertEmoji($event)"
              @change="insertEmoji($event)"
            >
              <template #button>
                <button
                  class="w-8 h-8 flex items-center justify-center rounded-md bg-transparent hover:bg-neutral-100 text-text-muted hover:text-text-secondary transition-colors"
                  type="button"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 18.3333C14.6024 18.3333 18.3333 14.6024 18.3333 10C18.3333 5.39763 14.6024 1.66667 10 1.66667C5.39763 1.66667 1.66667 5.39763 1.66667 10C1.66667 14.6024 5.39763 18.3333 10 18.3333Z" stroke="currentColor" stroke-width="1.5" />
                    <path d="M6.66667 11.6667C6.66667 11.6667 7.91667 13.3333 10 13.3333C12.0833 13.3333 13.3333 11.6667 13.3333 11.6667M7.5 7.5H7.50833M12.5 7.5H12.5083" stroke="currentColor" stroke-width="1.5" />
                  </svg>
                </button>
              </template>
            </VEmojiPicker>

            <button
              class="w-8 h-8 flex items-center justify-center rounded-md bg-transparent hover:bg-neutral-100 text-text-muted hover:text-text-secondary transition-colors"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M10.7778 1V4.55556C10.7778 5.02705 10.9651 5.47924 11.2985 5.81263C11.6319 6.14603 12.0841 6.33333 12.5556 6.33333H16.1111M5.44444 9.88889H5.45333M12.5556 9.88889H12.5644M7.22222 12.5556C7.22222 12.5556 7.93333 13.4444 9 13.4444C10.1556 13.4444 10.7778 12.5556 10.7778 12.5556M12.1111 1H2.77778C2.30628 1 1.8541 1.1873 1.5207 1.5207C1.1873 1.8541 1 2.30628 1 2.77778V15.2222C1 16.2 1.8 17 2.77778 17H15.2222C15.6937 17 16.1459 16.8127 16.4793 16.4793C16.8127 16.1459 17 15.6937 17 15.2222V5.88889L12.1111 1Z"
                  stroke="black"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </div>

          <div class="flex-1 flex items-end gap-2">
            <textarea
              ref="messageInputRef"
              v-model="messageText"
              placeholder="Type your message here..."
              rows="1"
              class="flex-1 resize-none px-3 py-2 rounded-lg focus:outline-none focus:ring-0 focus:border-0 font-inter text-base text-text-secondary placeholder-text-muted"
              @keydown.enter.exact.prevent="(messageText.trim() || pendingAttachments.length > 0) && sendMessage()"
              @input="autoResize"
            />

            <button
              :disabled="!messageText.trim() && pendingAttachments.length === 0"
              class="w-9 h-9 flex items-center justify-center rounded-md hover:bg-brand-600 disabled:opacity-60 disabled:cursor-not-allowed text-black transition-colors"
              @click="sendMessage()"
            >
              <svg
                width="21"
                height="21"
                viewBox="0 0 21 21"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M20.0003 10.5C20.0003 10.5948 19.9734 10.6875 19.9227 10.7675C19.872 10.8476 19.7996 10.9115 19.714 10.952L1.71402 19.452C1.62412 19.4956 1.52318 19.5112 1.42434 19.4966C1.32549 19.4821 1.2333 19.4381 1.15974 19.3705C1.08619 19.3029 1.03468 19.2147 1.0119 19.1174C0.989126 19.0202 0.996137 18.9183 1.03202 18.825L3.87402 11.198C4.0417 10.7478 4.0417 10.2523 3.87402 9.80204L1.03102 2.17504C0.994955 2.08168 0.987852 1.97962 1.01064 1.88216C1.03343 1.78471 1.08505 1.69638 1.15878 1.6287C1.23251 1.56102 1.32492 1.51712 1.42396 1.50273C1.523 1.48834 1.62409 1.50413 1.71402 1.54804L19.714 10.048C19.7996 10.0885 19.872 10.1525 19.9227 10.2325C19.9734 10.3126 20.0003 10.4053 20.0003 10.5ZM20.0003 10.5L4.00003 10.5"
                  stroke="#6644FF"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
=======
      
      <!-- Messages area -->
      <div
        v-if="activeConversation"
        ref="messagesContainer"
        class="flex-1 overflow-y-auto bg-white"
      >
        <div class="space-y-1">
          <div
            v-for="message in messages"
            :key="message.id"
            :class="[
              'flex gap-4 px-8 py-3',
              {
                'justify-start': message.direction === 'in',
                'justify-end': message.direction === 'out'
              }
            ]"
          >
            <!-- Avatar for incoming messages -->
            <div
              v-if="message.direction === 'in'"
              class="w-10 h-10 relative rounded-full overflow-hidden bg-neutral-100 border border-black/8 flex-shrink-0"
            >
              <img
                :src="message.avatar"
                :alt="message.senderName"
                class="w-full h-full object-cover"
              />
            </div>
            
            <div
              :class="[
                'flex flex-col max-w-[70%]',
                {
                  'items-start': message.direction === 'in',
                  'items-end': message.direction === 'out'
                }
              ]"
            >
              <!-- Message header with name and time -->
              <div 
                :class="[
                  'flex items-center gap-2 mb-2',
                  {
                    'flex-row': message.direction === 'in',
                    'flex-row-reverse': message.direction === 'out'
                  }
                ]"
              >
                <span class="font-semibold text-sm text-text-secondary">
                  {{ message.senderName }}
                </span>
                <span class="text-xs text-text-muted">
                  {{ message.time }}
                </span>
              </div>
              
              <!-- Message content -->
              <div
                :class="[
                  'p-3 rounded-lg max-w-full break-words',
                  'text-sm text-text-secondary leading-relaxed',
                  {
                    'bg-white border border-neutral-200': message.direction === 'in',
                    'bg-brand-500 text-white': message.direction === 'out'
                  }
                ]"
              >
                <p class="whitespace-pre-wrap">{{ message.text }}</p>
              </div>
              
              <!-- Message status for outgoing messages -->
              <div
                v-if="message.direction === 'out' && message.status"
                class="flex items-center gap-1 mt-1 text-xs text-text-muted"
              >
                <span v-if="message.status === 'sent'">Sent</span>
                <span v-else-if="message.status === 'delivered'">Delivered</span>
                <span v-else-if="message.status === 'read'" class="text-brand-500">Read</span>
              </div>
            </div>
            
            <!-- Spacer for outgoing messages to maintain avatar space -->
            <div v-if="message.direction === 'out'" class="w-10 flex-shrink-0" />
          </div>
        </div>
      </div>
      
      <!-- Message input -->
      <div
        v-if="activeConversation"
        class="flex-shrink-0 p-4 bg-white border-t border-neutral-200"
      >
        <div class="flex items-end gap-3">
          <div class="flex gap-2">
            <button class="w-8 h-8 flex items-center justify-center rounded-md bg-transparent hover:bg-neutral-100 text-text-muted hover:text-text-secondary transition-colors">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            <button class="w-8 h-8 flex items-center justify-center rounded-md bg-transparent hover:bg-neutral-100 text-text-muted hover:text-text-secondary transition-colors">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.01M15 10h1.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button class="w-8 h-8 flex items-center justify-center rounded-md bg-transparent hover:bg-neutral-100 text-text-muted hover:text-text-secondary transition-colors">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
          </div>
          
          <div class="flex-1 flex items-end gap-2">
            <textarea
              v-model="messageText"
              placeholder="Type your message here..."
              rows="1"
              class="flex-1 resize-none px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-inter text-base text-text-secondary placeholder-text-muted"
              @keydown.enter.exact.prevent="sendMessage"
              @input="autoResize"
            />
            
            <button
              :disabled="!messageText.trim()"
              class="w-8 h-8 flex items-center justify-center rounded-md bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              @click="sendMessage"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
>>>>>>> 36c86a1 (feat/UI_Chat_v2)
              </svg>
            </button>
          </div>
        </div>
      </div>
<<<<<<< HEAD

      <!-- Empty state -->
      <div v-else class="flex-1 flex items-center justify-center bg-neutral-50">
=======
      
      <!-- Empty state -->
      <div
        v-else
        class="flex-1 flex items-center justify-center bg-neutral-50"
      >
>>>>>>> 36c86a1 (feat/UI_Chat_v2)
        <div class="text-center">
          <h3 class="text-lg font-medium text-text-secondary mb-2">
            Select a conversation
          </h3>
          <p class="text-text-muted">
            Choose a conversation from the sidebar to start messaging
          </p>
        </div>
<<<<<<< HEAD
      </div>
    </div>

    <!-- Members Selection Dialog -->
    <div
      v-if="showMembersDialog"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000]"
      @click.self="closeMembersDialog"
    >
      <div class="bg-[#F0F4F9] rounded-lg shadow-xl w-[500px] max-h-[55vh] flex flex-col overflow-hidden">
        <!-- Dialog Header -->
        <div class="flex items-center justify-between pt-4 px-4 border-gray-200">
          <h2 class="text-xl font-medium text-black">
            Select members
          </h2>
          <button
            class="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 transition-colors"
            @click="closeMembersDialog"
          >
            <svg width="30" height="30" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>

        <!-- Dialog Content -->
        <div class="flex-1 flex flex-col p-3 space-y-3 overflow-hidden">
          <!-- Search Input with Selected Members -->
          <div class="relative border border-gray-200 rounded-lg bg-white">
            <div class="flex flex-wrap gap-1 p-2">
              <!-- Selected Member Chips -->
              <div
                v-for="member in selectedMemberObjects"
                :key="`selected-${member.id}`"
                class="inline-flex items-center gap-1 bg-[#F0F4F9] border border-[#D3DAE4] rounded-md px-2 py-1"
              >
                <!-- Small Avatar -->
                <div class="w-6 h-6 rounded-full overflow-hidden bg-gray-100 border border-gray-200">
                  <img
                    :src="member.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=random`"
                    :alt="member.name"
                    class="w-full h-full object-cover"
                    @error="handleImageError($event, member.name)"
                  >
                </div>
                <!-- Member Name -->
                <span class="text-xs font-medium text-[#344054]">{{ member.name }}</span>
                <!-- Remove Button -->
                <button
                  class="w-3.5 h-3.5 flex items-center justify-center rounded hover:bg-gray-200 transition-colors"
                  @click="removeMember(member.id)"
                >
                  <svg width="7" height="7" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 3L3 9M3 3L9 9" stroke="#4F5464" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
              </div>

              <!-- Search Input -->
              <input
                v-model="memberSearchQuery"
                type="text"
                placeholder="Search a member"
                class="flex-1 min-w-[120px] px-1 py-1 text-sm bg-transparent border-none outline-none"
              >
            </div>
          </div>

          <!-- Description -->
          <p class="text-base text-gray-400">
            You can add unlimited members
          </p>

          <!-- Members List -->
          <div class="flex-1 space-y-2 pr-1 scroll-style overflow-y-auto">
            <div
              v-for="member in filteredMembers"
              :key="member.id"
              class="flex items-center gap-4 p-2 hover:bg-gray-50 rounded-md cursor-pointer"
              @click="toggleMemberSelection(member.id)"
            >
              <!-- Checkbox -->
              <div class="relative">
                <input
                  :id="`member-${member.id}`"
                  type="checkbox"
                  :checked="selectedMembers.includes(member.id)"
                  class="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 focus:ring-"
                  @click.stop
                  @change="toggleMemberSelection(member.id)"
                >
              </div>

              <!-- Avatar and Name -->
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-full overflow-hidden bg-gray-100 border border-gray-200">
                  <img
                    :src="member.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=random`"
                    :alt="member.name"
                    class="w-full h-full object-cover"
                    @error="handleImageError($event, member.name)"
                  >
                </div>
                <p class="text-sm font-medium text-gray-900">
                  {{ member.name }}
                </p>
              </div>
            </div>
          </div>

          <VDivider />

          <!-- Create Group Button -->
          <div class="pt-2">
            <button
              :disabled="selectedMembers.length === 0"
              class="w-full py-3 text-sm font-medium rounded-md transition-colors"
              :class="selectedMembers.length > 0
                ? 'bg-[#6644FF] text-white hover:bg-[#5533DD]'
                : 'bg-gray-200 text-gray-600 cursor-not-allowed'"
              @click="createGroup"
            >
              Create a group
            </button>
          </div>
        </div>
=======
>>>>>>> 36c86a1 (feat/UI_Chat_v2)
      </div>
    </div>

  </private-view>
</template>

<<<<<<< HEAD
<style scoped>
@import "../styles/tailwind.css";

.chat-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: calc(100vh - 109px); /* Trừ đi header của Directus */
  background: white;
  overflow: hidden;
  position: relative;
}
.chat-header {
  flex-shrink: 0;
  height: 80px;
  padding: 16px 31px;
  border-top: 1px solid var(--border-normal, #d3dae4);
  border-bottom: 1px solid var(--border-normal, #d3dae4);
  background: var(--background-page, white);
  z-index: 10;
  display: flex;
  align-items: center;
}
.messages-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 0px;
  background: var(--background-page, white);
  scroll-behavior: smooth;
}

/* Pending Attachments Preview */
.pending-attachments-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}

.attachment-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px;
  background: white;
  border: 2px solid #D3DAE4;
  border-radius: 6px;
  transition: border-color 0.2s;
}

.attachment-preview:hover {
  border-color: #B8C5D6;
}

.attachment-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.file-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  background: #F0ECFF;
  border-radius: 6px;
  flex-shrink: 0;
}

.file-name {
  font-family: Inter;
  font-weight: 500;
  font-size: 14px;
  line-height: 1.21;
  color: #0461cc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.attachment-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 12px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.action-btn:hover {
  background: #F3F4F6;
}

.remove-btn:hover svg path {
  stroke: #EF4444;
}

.upload-progress-container {
  position: absolute;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.message-input {
  position: relative;
  flex-shrink: 0;
  min-height: 50px;
  padding: 16px;
  border-top: 1px solid var(--border-normal, #d3dae4);
  background: var(--background-page, white);
  z-index: 10;
}
.chat-container * {
  box-sizing: border-box;
}
.messages-area::-webkit-scrollbar {
  width: 6px;
}
.messages-area::-webkit-scrollbar-track {
  background: transparent;
}
.messages-area::-webkit-scrollbar-thumb {
  background: var(--border-normal, #d3dae4);
  border-radius: 3px;
}
.messages-area::-webkit-scrollbar-thumb:hover {
  background: var(--border-subdued, #a2b5cd);
}
/* Scroll style dùng chung cho toàn app */
.scroll-style::-webkit-scrollbar {
  width: 6px;
}
.scroll-style::-webkit-scrollbar-track {
  background: transparent;
}
.scroll-style::-webkit-scrollbar-thumb {
  background: var(--border-normal, #d3dae4);
  border-radius: 3px;
}
.scroll-style::-webkit-scrollbar-thumb:hover {
  background: var(--border-subdued, #a2b5cd);
}
</style>
=======
=======
>>>>>>> d0ac1a5 (feat:create_UI_Chat_V3)
<script setup lang="ts">
import { authentication, createDirectus, readItems, readMe, realtime, rest } from '@directus/sdk'
import { computed, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue'

import client from './utils/sdk'

interface Conversation {
  id: string
  name: string
  avatar: string
  lastMessage: string
  timestamp: string
  unreadCount: number
  online: boolean
  type: 'group' | 'direct'
  members?: string[]
}

interface Message {
  id: string
  direction: 'in' | 'out'
  text: string
  senderName: string
  senderId: string
  time: string
  avatar?: string
  status?: 'sent' | 'delivered' | 'read' | 'failed'
  type?: 'system' | 'user'
  clientId?: string
}
const currentFunction = ref<string | null>(null)
const searchQuery = ref('')
const navSearchQuery = ref('')
const messageSearchQuery = ref('')
const messageText = ref('')
const activeConversationId = ref<string>('')
const messagesContainer = ref<HTMLElement | null>(null)
const conversations = ref<Conversation[]>([])
const messages = ref<Message[]>([])
const loading = ref(false)
const sendingMessage = ref(false)
const currentUserId = ref('system')
const isAuthenticated = ref(false)
const isLoadingMessages = ref(false)
const isLoadingConversations = ref(false)
const showFilterDropdown = ref(false)
const highlightedMessageId = ref<string | null>(null)
const showMembersDialog = ref(false)
const memberSearchQuery = ref('')
const selectedMembers = ref<string[]>([])

const conversationTypeFilter = ref<'all' | 'group' | 'direct'>('all')

const filterOptions = ref({
  status: {
    online: false,
    offline: false,
  },
  messageType: {
    unread: false,
    important: false,
    archived: false,
  },
})

function showFunctionA() {
  currentFunction.value = 'A'
}

function showFunctionB() {
  currentFunction.value = 'B'
}

const directusClient = createDirectus('http://localhost:8055')
  .with(authentication())
  .with(realtime())
  .with(rest())

let subscriptionCleanup: (() => void) | null = null

const filteredConversations = computed(() => {
  const query = navSearchQuery.value || searchQuery.value
  let filtered = conversations.value

  if (conversationTypeFilter.value !== 'all') {
    filtered = filtered.filter(conv => conv.type === conversationTypeFilter.value)
  }

  if (query) {
    filtered = filtered.filter(conv =>
      conv.name.toLowerCase().includes(query.toLowerCase())
      || conv.lastMessage.toLowerCase().includes(query.toLowerCase()),
    )
  }

  const { status, messageType } = filterOptions.value

  if (status.online || status.offline) {
    filtered = filtered.filter((conv) => {
      if (status.online && status.offline)
        return true
      if (status.online)
        return conv.online
      if (status.offline)
        return !conv.online
      return true
    })
  }

  if (messageType.unread) {
    filtered = filtered.filter(conv => conv.unreadCount > 0)
  }

  return filtered
})

const activeConversation = computed(() => {
  return conversations.value.find(
    conv => conv.id === activeConversationId.value,
  )
})

const conversationStats = computed(() => {
  return {
    all: conversations.value.length,
    group: conversations.value.filter(c => c.type === 'group').length,
    direct: conversations.value.filter(c => c.type === 'direct').length,
  }
})

const searchFilteredMessages = computed(() => {
  if (!messageSearchQuery.value.trim()) {
    return []
  }

  const query = messageSearchQuery.value.toLowerCase().trim()

  return messages.value.filter(message =>
    message.text.toLowerCase().includes(query),
  ).map(message => ({
    ...message,
    highlightedText: highlightSearchText(message.text, messageSearchQuery.value),
  }))
})

const selectedMemberObjects = computed(() => {
  return conversations.value.filter(member =>
    selectedMembers.value.includes(member.id) && member.type === 'direct',
  )
})

const filteredMembers = computed(() => {
  const directChats = conversations.value.filter(c => c.type === 'direct')

  if (!memberSearchQuery.value.trim()) {
    return directChats
  }

  return directChats.filter(member =>
    member.name.toLowerCase().includes(memberSearchQuery.value.toLowerCase()),
  )
})

// ==================== HELPER FUNCTIONS ====================
function highlightSearchText(text: string, searchTerm: string): string {
  if (!searchTerm.trim())
    return text

  const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return text.replace(regex, '<mark class="bg-yellow-200 px-1 rounded">$1</mark>')
}

function formatTime(dateString: string): string {
  if (!dateString)
    return ''
  try {
    const date = new Date(dateString)
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  }
  catch {
    return ''
  }
}

function handleImageError(event: Event, conversationName: string) {
  const img = event.target as HTMLImageElement

  if (img.src.includes('ui-avatars.com')) {
    img.onerror = null
    img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNFNUU3RUIiLz4KPHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSI4IiB5PSI4Ij4KPHBhdGggZD0iTTEyIDEyQzE0LjIwOTEgMTIgMTYgMTAuMjA5MSAxNiA4QzE2IDUuNzkwODYgMTQuMjA5MSA0IDEyIDRDOS43OTA4NiA0IDggNS43OTA4NiA4IDhDOCAxMC4yMDkxIDkuNzkwODYgMTIgMTIgMTJaIiBmaWxsPSIjOUM5Q0EwIi8+CjxwYXRoIGQ9Ik0xMiAxNEM5LjMzOTcyIDE0IDYuOTIxNzggMTUuMzMzNSA1LjY4MTc4IDE3LjYzNTFDNS4wNzc4IDE4Ljc0OTEgNS4wNzc4IDE5Ljk4NDcgNS42ODE3OCAyMS4wOTg3QzYuOTIxNzggMjMuNDAwMyA5LjMzOTcyIDI0LjczMzggMTIgMjQuNzMzOEMxNC42NjAzIDI0LjczMzggMTcuMDc4MiAyMy40MDAzIDE4LjMxODIgMjEuMDk4N0MxOC45MjIyIDE5Ljk4NDcgMTguOTIyMiAxOC43NDkxIDE4LjMxODIgMTcuNjM1MUMxNy4wNzgyIDE1LjMzMzUgMTQuNjYwMyAxNCAxMiAxNFoiIGZpbGw9IiM5QzlDQTAiLz4KPC9zdmc+Cjwvc3ZnPgo='
    return
  }

  img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(conversationName)}&background=random`
}

async function autoLogin() {
  try {
    // 1. Login REST client
    await client.login({
      email: 'admin@example.com',
      password: 'd1r3ctu5',
    })

    isAuthenticated.value = true

    // 2. Connect & login WebSocket
    await directusClient.connect()
    await directusClient.login({
      email: 'admin@example.com',
      password: 'd1r3ctu5',
    })
    console.log('✅ WebSocket connected and authenticated')

    // 3. Get current Zalo user ID
    try {
      const token = await client.getToken()
      const response = await fetch('http://localhost:8055/zalo/status', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await response.json()
      if (data?.userId) {
        currentUserId.value = data.userId
        console.log('✅ Current Zalo user ID:', currentUserId.value)
      }
    }
    catch (e) {
      console.warn('⚠️ Could not get Zalo User ID:', e)
    }
  }
  catch (error) {
    console.error('❌ Authentication failed:', error)
    isAuthenticated.value = false
  }
}

const processedMessageIds = new Set<string>()

async function subscribeToMessages(conversationId: string) {
  if (subscriptionCleanup) {
    console.log('🔴 Unsubscribing from previous conversation')
    subscriptionCleanup()
    subscriptionCleanup = null
  }

  if (!conversationId)
    return

  console.log('🔵 Subscribing to conversation:', conversationId)
  processedMessageIds.clear()
  console.log('🔵 Cleared processed message IDs')

  try {
    const { subscription, unsubscribe } = await directusClient.subscribe('zalo_messages', {
      event: 'create',
      query: {
        fields: ['*'],
        filter: {
          conversation_id: { _eq: conversationId },
        },
        sort: ['sent_at'],
      },
      uid: `messages-${conversationId}`,
    })

    subscriptionCleanup = unsubscribe
    console.log('✅ Subscribed with UID:', `messages-${conversationId}`)
    let eventCount = 0

    // Handle messages
    ;(async () => {
      for await (const item of subscription) {
        eventCount++
        console.log('📩 WebSocket event:', item.type, item.event)

        if (item.type === 'subscription' && item.event === 'init') {
          console.log('✅ Subscription initialized for:', conversationId)
        }
        else if (item.type === 'subscription' && item.event === 'create') {
          // Validate
          if (!item.data || item.data.length === 0) {
            console.warn('⚠️ Empty data')
            continue
          }

          const newMsg = item.data[0]

          if (!newMsg?.id) {
            console.warn('⚠️ Invalid message')
            continue
          }

          console.log('📥 New message from WebSocket:', newMsg.id)
          if (processedMessageIds.has(newMsg.id)) {
            console.log('⏭️ [DEDUPE] Already processed message:', newMsg.id)
            continue
          }

          // ✅ Check duplicate bằng ID HOẶC client_id
          const exists = messages.value.some(m =>
            m.id === newMsg.id
            || (newMsg.client_id && m.clientId === newMsg.client_id),
          )

          if (exists) {
            console.log('⏭️ Message already exists:', newMsg.id)
            continue
          }
          processedMessageIds.add(newMsg.id)

          // Fetch sender info
          let senderName = 'Unknown'
          let senderAvatar = ''

          if (newMsg.sender_id) {
            try {
              const users = await client.request(
                readItems('zalo_users' as any, {
                  fields: ['display_name', 'zalo_name', 'avatar_url'],
                  filter: { id: { _eq: newMsg.sender_id } },
                  limit: 1,
                }),
              )

              const user = users[0]

              if (user) {
                senderName = user.display_name || user.zalo_name || 'Unknown'
                senderAvatar = user.avatar_url
                  || `https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}`
              }
            }
            catch (e) {
              console.warn('Could not fetch sender info:', e)
            }
          }

          // Determine direction
          const direction: 'in' | 'out' = newMsg.sender_id === currentUserId.value ? 'out' : 'in'

          // ✅ Add message với clientId
          messages.value.push({
            id: newMsg.id,
            direction,
            text: newMsg.content || '',
            senderName,
            senderId: newMsg.sender_id,
            time: formatTime(newMsg.sent_at),
            avatar: senderAvatar,
            status: direction === 'out' ? 'delivered' : undefined,
            clientId: newMsg.client_id, // ✅ Track clientId
          })

          console.log('✅ Message added via WebSocket')
          nextTick(scrollToBottom)
        }
      }
    })()
  }
  catch (error) {
    console.error('❌ Failed to subscribe:', error)
  }
}
async function loadConversations() {
  if (!isAuthenticated.value) {
    console.warn('⚠️ Not authenticated')
    return
  }

  if (isLoadingConversations.value) {
    console.log('⏳ Already loading conversations, skipping...')
    return
  }

  try {
    loading.value = true
    isLoadingConversations.value = true

    const data = await client.request(
      readItems('zalo_conversations', {
        fields: ['*'],
        filter: {
          is_hidden: { _eq: false },
        } as any,
        sort: ['-is_pinned', '-last_message_time'],
        limit: 100,
      }),
    )

    console.log(`📥 Loaded ${data.length} conversations`)

    const groupIds = [...new Set(
      data
        .filter((conv: any) => conv.group_id && conv.group_id !== null)
        .map((conv: any) => conv.group_id),
    )]

    const participantIds = [...new Set(
      data
        .filter((conv: any) => conv.participant_id && conv.participant_id !== null)
        .map((conv: any) => String(conv.participant_id)),
    )]

    let groupsMap = new Map()
    if (groupIds.length > 0) {
      const groups = await client.request(
        readItems('zalo_groups' as any, {
          fields: ['id', 'name', 'avatar_url'],
          filter: { id: { _in: groupIds } },
          limit: -1,
        }),
      )
      groupsMap = new Map(groups.map((g: any) => [g.id, g]))
    }

    let usersMap = new Map()
    if (participantIds.length > 0) {
      const users = await client.request(
        readItems('zalo_users' as any, {
          fields: ['id', 'display_name', 'zalo_name', 'avatar_url'],
          filter: { id: { _in: participantIds } },
          limit: -1,
        }),
      )
      usersMap = new Map(users.map((u: any) => [u.id, u]))
    }

    conversations.value = data.map((conv: any) => {
      let name = 'Unknown'
      let avatar = ''
      let type: 'group' | 'direct' = 'group'

      if (conv.participant_id && conv.participant_id !== null) {
        type = 'direct'
        const user = usersMap.get(conv.participant_id)
        if (user) {
          name = user.display_name || user.zalo_name || 'Unknown User'
          avatar = user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=4F46E5`
        }
        else {
          name = `User ${conv.participant_id.substring(0, 8)}`
          avatar = `https://ui-avatars.com/api/?name=U&background=4F46E5`
        }
      }
      else if (conv.group_id && conv.group_id !== null) {
        type = 'group'
        const group = groupsMap.get(conv.group_id)
        if (group) {
          name = group.name || 'Unknown Group'
          avatar = group.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=10B981`
        }
        else {
          name = `Group ${conv.group_id.substring(0, 8)}`
          avatar = `https://ui-avatars.com/api/?name=G&background=10B981`
        }
      }

      return {
        id: conv.id,
        name,
        avatar,
        lastMessage: '',
        timestamp: formatTime(conv.last_message_time),
        unreadCount: conv.unread_count || 0,
        online: true,
        type,
      }
    })

    console.log(`✅ Groups: ${conversationStats.value.group} | Direct: ${conversationStats.value.direct}`)

    if (conversations.value.length > 0 && !activeConversationId.value) {
      conversations.value[0]?.id && selectConversation(conversations.value[0].id)
    }
  }
  catch (error: any) {
    console.error('❌ Error loading conversations:', error)
  }
  finally {
    loading.value = false
    isLoadingConversations.value = false
  }
}

async function loadMessages(conversationId: string) {
  if (!isAuthenticated.value || !conversationId)
    return

  if (isLoadingMessages.value) {
    console.log('⏭️ Already loading messages')
    return
  }

  console.log('🔵 Loading initial messages for:', conversationId)

  try {
    isLoadingMessages.value = true

    // Get current user ID if needed
    if (currentUserId.value === 'system') {
      try {
        const me = await client.request(readMe({ fields: ['id'] }))
        if (me?.id)
          currentUserId.value = me.id
      }
      catch (e) {
        console.warn('⚠️ Could not get current user ID:', e)
      }
    }

    // Fetch messages from DB
    const data = await client.request(
      readItems('zalo_messages' as any, {
        fields: ['*'],
        filter: {
          conversation_id: { _eq: conversationId },
        },
        sort: ['sent_at'],
        limit: 50,
      }),
    )

    console.log('📥 Loaded', data.length, 'messages from DB')

    // Get unique sender IDs
    const senderIds = [...new Set(data.map((msg: any) => msg.sender_id).filter(Boolean))]

    // Fetch users
    let usersMap = new Map()
    if (senderIds.length > 0) {
      const users = await client.request(
        readItems('zalo_users' as any, {
          fields: ['id', 'display_name', 'zalo_name', 'avatar_url'],
          filter: { id: { _in: senderIds } },
          limit: -1,
        }),
      )
      usersMap = new Map(users.map((u: any) => [u.id, u]))
    }

    // Map messages
    messages.value = data.map((msg: any) => {
      const user = usersMap.get(msg.sender_id)
      const senderName = user?.display_name || user?.zalo_name || 'Unknown'
      const senderAvatar = user?.avatar_url
        || `https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}`

      // ✅ Fix direction logic
      const direction: 'in' | 'out' = msg.sender_id === currentUserId.value ? 'out' : 'in'

      return {
        id: msg.id,
        direction,
        text: msg.content || '',
        senderName,
        senderId: msg.sender_id,
        time: formatTime(msg.sent_at),
        avatar: senderAvatar,
        status: direction === 'out' ? 'read' : undefined,
      }
    })

    console.log('✅ Loaded', messages.value.length, 'messages')

    nextTick(scrollToBottom)
  }
  catch (error: any) {
    console.error('❌ Error loading messages:', error)
  }
  finally {
    isLoadingMessages.value = false
  }
}

async function sendMessage() {
  if (!messageText.value.trim())
    return

  sendingMessage.value = true

  // ✅ Tạo client_id duy nhất
  const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const tempId = `temp_${Date.now()}`

  try {
    // 1. Create temp message
    const tempMessage: Message = {
      id: tempId,
      direction: 'out',
      text: messageText.value,
      senderName: 'You',
      senderId: currentUserId.value,
      time: formatTime(new Date().toISOString()),
      status: 'sent',
      clientId, // ✅ Thêm clientId để track
    }

    messages.value.push(tempMessage)
    const messageContent = messageText.value
    messageText.value = ''

    nextTick(scrollToBottom)

    console.log('🔵 [SEND] Sending with clientId:', clientId)

    // 2. Send via API với clientId
    const token = await client.getToken()
    const response = await fetch('http://localhost:8055/zalo/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        conversationId: activeConversationId.value,
        message: messageContent,
        clientId, // ✅ Gửi clientId lên backend
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`)
    }

    const result = await response.json()
    console.log('✅ [SEND] Success:', result)

    // 3. ✅ Remove temp message (sẽ được thay bằng message từ WebSocket)
    const tempIndex = messages.value.findIndex(m => m.id === tempId)
    if (tempIndex !== -1) {
      messages.value.splice(tempIndex, 1)
      console.log('✅ [SEND] Removed temp message, waiting for WebSocket...')
    }
  }
  catch (error: any) {
    console.error('❌ [SEND] Error:', error)

    // Mark temp message as failed
    const messageIndex = messages.value.findIndex(m => m.id === tempId)
    if (messageIndex !== -1) {
      messages.value[messageIndex].status = 'failed'
    }
  }
  finally {
    sendingMessage.value = false
  }
}
let isSelectingConversation = false

function selectConversation(id: string) {
  if (isSelectingConversation) {
    console.log('⏭️ Already selecting conversation, skipping')
    return
  }

  if (activeConversationId.value === id) {
    console.log('⏭️ Conversation already active:', id)
    return
  }

  isSelectingConversation = true

  console.log('🔵 Selecting conversation:', id)

  activeConversationId.value = id
  messages.value = []

  loadMessages(id).finally(() => {
    if (isAuthenticated.value) {
      subscribeToMessages(id)
    }
    isSelectingConversation = false
  })
}

function autoResize(event: Event) {
  const textarea = event.target as HTMLTextAreaElement
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

function navigateToMessage(messageId: string) {
  highlightedMessageId.value = messageId

  nextTick(() => {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`)
    if (messageElement && messagesContainer.value) {
      messageElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })

      setTimeout(() => {
        highlightedMessageId.value = null
      }, 3000)
    }
  })
}

function handleFilter() {
  showFilterDropdown.value = !showFilterDropdown.value
}

function handleAddUser() {
  showMembersDialog.value = true
}

function openMembersDialog() {
  showMembersDialog.value = true
}

function closeMembersDialog() {
  showMembersDialog.value = false
  memberSearchQuery.value = ''
  selectedMembers.value = []
}

function toggleMemberSelection(memberId: string) {
  const index = selectedMembers.value.indexOf(memberId)
  if (index > -1) {
    selectedMembers.value.splice(index, 1)
  }
  else {
    selectedMembers.value.push(memberId)
  }
}

function removeMember(memberId: string) {
  const index = selectedMembers.value.indexOf(memberId)
  if (index > -1) {
    selectedMembers.value.splice(index, 1)
  }
}

function createGroup() {
  if (selectedMembers.value.length === 0) {
    return
  }

  const memberNames = selectedMemberObjects.value.map(member => member.name)

  console.log('🔨 Creating group with members:', memberNames)

  closeMembersDialog()
}

function handleClickOutside(event: Event) {
  const target = event.target as HTMLElement
  const filterButton = target.closest('.filter-dropdown-container')
  if (!filterButton && showFilterDropdown.value) {
    showFilterDropdown.value = false
  }
}

onMounted(async () => {
  console.log('🔵 Component mounted')

  await autoLogin()
  await loadConversations()

  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  console.log(' Cleaning up WebSocket')

  if (subscriptionCleanup) {
    subscriptionCleanup()
  }

  directusClient.disconnect()
})

onUnmounted(() => {
  stopAutoRefresh()
  document.removeEventListener('click', handleClickOutside)
})

watch(activeConversationId, (newId) => {
  if (newId && isAuthenticated.value) {
    subscribeToMessages(newId)
    nextTick(scrollToBottom)
  }
})
</script>

<template>
  <private-view title="Messages">
    <template #title-outer:prepend>
      <v-button class="header-icon" rounded disabled icon secondary>
        <v-icon name="inbox" />
      </v-button>
    </template>

    <!-- Sidebar -->
    <template #sidebar>
      <sidebar-detail v-if="currentFunction === 'A'" icon="search" class="my-sidebar-detail" title="Search for messages" close>
        <div class="search-container space-y-4">
          <div class="search-input-section">
            <div class="relative border rounded-xl shadow-sm">
              <input
                v-model="messageSearchQuery"
                type="text"
                placeholder="Search in conversation"
                class="w-full pl-9 pr-3 py-4 text-sm bg-gray-50 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
              >
            </div>
          </div>

          <div v-if="!messageSearchQuery.trim()" class="text-center py-8">
            <svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p class="text-gray-500 text-sm">
              Enter a search term to find messages
            </p>
          </div>

          <div v-else-if="searchFilteredMessages.length === 0" class="text-center py-8">
            <svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 515.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.291.974-5.709 2.291" />
            </svg>
            <p class="text-gray-500 text-sm">
              No messages found for "{{ messageSearchQuery }}"
            </p>
          </div>

          <div v-else class="search-results space-y-3">
            <div class="search-results-summary py-3">
              <div class="flex items-center justify-between">
                <label class="text-xl font-semibold text-gray-900">Messages</label>
                <span class="text-sm text-gray-500">
                  {{ searchFilteredMessages.length }} {{ searchFilteredMessages.length === 1 ? 'message' : 'messages' }} found
                </span>
              </div>
            </div>

            <div
              v-for="message in searchFilteredMessages"
              :key="message.id"
              class="result-item cursor-pointer transition-all p-3 hover:bg-gray-50 rounded-lg"
              @click="navigateToMessage(message.id)"
            >
              <div class="flex items-start gap-3">
                <div class="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0">
                  <img
                    :src="message.avatar"
                    :alt="message.senderName"
                    class="w-full h-full rounded-full object-cover"
                  >
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1 justify-between">
                    <span class="text-sm font-semibold text-gray-900">{{ message.senderName }}</span>
                    <span class="text-xs text-gray-500">{{ message.time }}</span>
                  </div>
                  <p class="text-sm text-gray-600 leading-relaxed" v-html="message.highlightedText" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </sidebar-detail>

      <sidebar-detail v-if="currentFunction === 'B'" class="my-sidebar-detail" icon="info" title="Conversation information" close />
    </template>

    <template #navigation>
      <div class="p-3 border-b space-y-3" style="border-color: var(--theme--border-color-subdued);">
        <div class="relative">
          <v-icon name="search" class="absolute left-3 top-1/2 -translate-y-1/2" small style="color: var(--theme--foreground-subdued);" />
          <input
            v-model="navSearchQuery"
            placeholder="Search conversation"
            class="w-full pl-10 pr-3 py-2 border rounded-lg text-sm"
            style="border-color: var(--theme--border-color-subdued); outline: none;"
          >
        </div>

        <div class="flex gap-1">
          <v-button
            small
            :secondary="conversationTypeFilter !== 'all'"

            @click="conversationTypeFilter = 'all'"
          >
            Filter ({{ conversationStats.all }})
          </v-button>
          <v-button
            small
            :secondary="conversationTypeFilter !== 'direct'"
            full-width
            @click="conversationTypeFilter = 'direct'"
          >
            <v-icon name="person" left x-small />
            {{ conversationStats.direct }}
          </v-button>
          <v-button
            small
            :secondary="conversationTypeFilter !== 'group'"
            full-width
            @click="conversationTypeFilter = 'group'"
          >
            <v-icon name="group" left x-small />
            {{ conversationStats.group }}
          </v-button>
        </div>

        <div class="flex items-center justify-between gap-2">
          <v-button :loading="loading" small secondary full-width @click="loadConversations">
            <v-icon name="refresh" left />
            Refresh
          </v-button>

          <v-button small secondary icon @click="handleAddUser">
            <v-icon name="person_add" />
          </v-button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto">
        <div v-if="loading && conversations.length === 0" class="p-4 text-center">
          <v-progress-circular indeterminate />
          <p class="text-sm mt-2" style="color: var(--theme--foreground-subdued);">
            Loading...
          </p>
        </div>

        <div v-else-if="filteredConversations.length === 0" class="p-4 text-center">
          <v-icon name="chat_bubble_outline" large style="color: var(--theme--foreground-subdued);" class="mb-2" />
          <p class="text-sm" style="color: var(--theme--foreground-subdued);">
            {{ conversationTypeFilter === 'all' ? 'No conversations' : `No ${conversationTypeFilter} chats` }}
          </p>
        </div>

        <div v-else class="p-2 space-y-1">
          <div
            v-for="conversation in filteredConversations"
            :key="conversation.id"
            class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all"
            :style="{
              backgroundColor: conversation.id === activeConversationId ? 'var(--theme--primary-background)' : 'transparent',
              borderLeft: conversation.id === activeConversationId ? '2px solid var(--theme--primary)' : 'none',
            }"
            @click="selectConversation(conversation.id)"
            @mouseenter="$event.currentTarget.style.backgroundColor = conversation.id === activeConversationId ? 'var(--theme--primary-background)' : 'var(--theme--background-subdued)'"
            @mouseleave="$event.currentTarget.style.backgroundColor = conversation.id === activeConversationId ? 'var(--theme--primary-background)' : 'transparent'"
          >
            <div class="w-11 h-11 rounded-full overflow-hidden border border-gray-200 bg-white flex items-center justify-center relative">
              <img
                :src="conversation.avatar || '/default-avatar.png'"
                :alt="conversation.name"
                class="avatar-img"
                @error="(e) => handleImageError(e, conversation.name)"
              >
              <div
                v-if="conversation.type === 'group'"
                class="absolute bottom-0 right-0 w-4 h-4 rounded-full flex items-center justify-center"
                style="background-color: var(--theme--success); border: 2px solid white;"
              >
                <v-icon name="group" x-small style="color: white;" />
              </div>
              <div
                v-else
                class="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
                style="background-color: var(--theme--success); border-color: white;"
              />
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between mb-1">
                <h4 class="font-medium text-sm truncate" style="color: var(--theme--foreground);">
                  {{ conversation.name }}
                </h4>
                <span class="text-xs flex-shrink-0 ml-2" style="color: var(--theme--foreground-subdued);">
                  {{ conversation.timestamp }}
                </span>
              </div>
              <p class="text-xs truncate" style="color: var(--theme--foreground-subdued); margin: 0;">
                {{ conversation.lastMessage || 'No messages' }}
              </p>
            </div>
            <v-badge
              v-if="conversation.unreadCount > 0"
              :value="conversation.unreadCount > 99 ? '99+' : conversation.unreadCount"
            />
          </div>
        </div>
      </div>
    </template>

    <div class="chat-container">
      <div v-if="activeConversation" class="chat-header">
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-full overflow-hidden border-2 border-white shadow-sm relative" style="background-color: var(--theme--background-subdued);">
              <img
                :src="activeConversation.avatar"
                :alt="activeConversation.name"
                class="avatar-img"
              >
            </div>
            <div class="flex flex-col">
              <h3 class="font-semibold text-base" style="color: var(--theme--foreground); margin: 0;">
                {{ activeConversation.name }}
              </h3>
              <p class="text-xs" style="color: var(--theme--success); margin: 0;">
                Online
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <v-button small icon secondary @click="showFunctionA">
              <v-icon name="search" />
            </v-button>

            <v-button :loading="loading" small icon secondary @click="loadMessages(activeConversationId)">
              <v-icon name="refresh" />
            </v-button>

            <v-button small icon secondary @click="showFunctionB">
              <v-icon name="more_vert" />
            </v-button>
          </div>
        </div>
      </div>

      <div
        v-if="activeConversation"
        ref="messagesContainer"
        class="messages-area"
      >
        <div v-if="loading && messages.length === 0" class="flex items-center justify-center h-full">
          <v-progress-circular indeterminate />
        </div>

        <div v-else-if="messages.length === 0" class="flex items-center justify-center h-full">
          <div class="text-center">
            <v-icon name="chat_bubble_outline" x-large style="color: var(--theme--foreground-subdued);" class="mb-2" />
            <p style="color: var(--theme--foreground-subdued);">
              No messages yet
            </p>
          </div>
        </div>

        <div v-else class="p-4 space-y-4">
          <div
            v-for="message in messages"
            :key="message.id"
            :data-message-id="message.id"
            class="flex items-start mb-3"
            :class="{ 'bg-yellow-50 transition-all': message.id === highlightedMessageId }"
          >
            <img
              :src="message.avatar"
              :alt="message.senderName"
              class="w-10 h-10 rounded-full mr-3 object-cover border flex-shrink-0"
              @error="(e) => handleImageError(e, message.senderName)"
            >

            <div class="flex-1 max-w-[70%]">
              <div class="flex items-center gap-2 mt-1">
                <p class="text-xs m-0 font-medium">
                  {{ message.senderName }} • {{ message.time }}
                </p>
                <v-icon
                  v-if="message.status === 'sent'"
                  name="check"
                  x-small
                  style="color: #9CA3AF;"
                />
                <v-icon
                  v-if="message.status === 'delivered'"
                  name="done_all"
                  x-small
                  style="color: #9CA3AF;"
                />
                <v-icon
                  v-if="message.status === 'read'"
                  name="done_all"
                  x-small
                  style="color: #3B82F6;"
                />
                <v-icon
                  v-if="message.status === 'failed'"
                  name="error_outline"
                  x-small
                  style="color: #EF4444;"
                  title="Failed to send"
                />
              </div>
              <div class="text-gray-900 py-2 break-words">
                <p class="text-sm whitespace-pre-wrap m-0">
                  {{ message.text }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="activeConversation" class="message-input">
        <div class="flex items-end gap-2">
          <v-button icon secondary>
            <v-icon name="attach_file" />
          </v-button>

          <textarea
            v-model="messageText"
            placeholder="Type your message..."
            rows="1"
            class="flex-1 resize-none px-3 py-2 border rounded-lg"
            :class="{ 'opacity-50 cursor-not-allowed': sendingMessage }"
            style="border-color: var(--theme--border-color-subdued); outline: none;"
            @keydown.enter.exact.prevent="sendMessage"
            @input="autoResize"
          />

          <v-button
            :disabled="!messageText.trim()"
            :loading="sendingMessage"
            @click="sendMessage"
          >
            <v-icon name="send" />
          </v-button>
        </div>
      </div>

      <div v-else class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <v-icon name="chat" x-large style="color: var(--theme--foreground-subdued);" class="mb-4" />
          <h3 class="text-lg font-medium mb-2" style="color: var(--theme--foreground); margin: 0;">
            Select a conversation
          </h3>
          <p style="color: var(--theme--foreground-subdued); margin: 0;">
            Choose a conversation to start messaging
          </p>
        </div>
      </div>
    </div>

    <div
      v-if="showMembersDialog"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000]"
      @click.self="closeMembersDialog"
    >
      <div class="bg-white rounded-lg shadow-xl w-[500px] max-h-[70vh] flex flex-col overflow-hidden">
        <div class="flex items-center justify-between p-4 border-b">
          <h2 class="text-xl font-medium">
            Select members
          </h2>
          <button
            class="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100"
            @click="closeMembersDialog"
          >
            <v-icon name="close" />
          </button>
        </div>

        <div class="flex-1 flex flex-col p-4 space-y-3 overflow-hidden">
          <div class="relative border rounded-lg bg-white">
            <div class="flex flex-wrap gap-2 p-2">
              <div
                v-for="member in selectedMemberObjects"
                :key="`selected-${member.id}`"
                class="inline-flex items-center gap-2 bg-gray-100 rounded-md px-2 py-1"
              >
                <div class="w-6 h-6 rounded-full overflow-hidden">
                  <img
                    :src="member.avatar"
                    :alt="member.name"
                    class="w-full h-full object-cover"
                  >
                </div>
                <span class="text-sm">{{ member.name }}</span>
                <button
                  class="w-4 h-4 flex items-center justify-center"
                  @click="removeMember(member.id)"
                >
                  <v-icon name="close" x-small />
                </button>
              </div>

              <input
                v-model="memberSearchQuery"
                type="text"
                placeholder="Search a member"
                class="flex-1 min-w-[120px] px-2 py-1 text-sm outline-none"
              >
            </div>
          </div>

          <div class="flex-1 space-y-2 overflow-y-auto">
            <div
              v-for="member in filteredMembers"
              :key="member.id"
              class="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-md cursor-pointer"
              @click="toggleMemberSelection(member.id)"
            >
              <input
                type="checkbox"
                :checked="selectedMembers.includes(member.id)"
                class="w-4 h-4"
                @click.stop
                @change="toggleMemberSelection(member.id)"
              >

              <div class="w-10 h-10 rounded-full overflow-hidden">
                <img
                  :src="member.avatar"
                  :alt="member.name"
                  class="w-full h-full object-cover"
                >
              </div>
              <p class="text-sm font-medium">
                {{ member.name }}
              </p>
            </div>
          </div>

          <v-button
            :disabled="selectedMembers.length === 0"
            full-width
            @click="createGroup"
          >
            Create a group
          </v-button>
        </div>
      </div>
    </div>
  </private-view>
</template>

<style scoped>
@import "../styles/tailwind.css";
.chat-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 65px);
  background: var(--theme--background);
}

.chat-header {
  flex-shrink: 0;
  padding: 1rem 1.5rem;
  border-bottom: var(--theme--border-width) solid var(--theme--border-color-subdued);
}

.messages-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: var(--theme--background);
}

.message-input {
  flex-shrink: 0;
  padding: 1rem;
  border-top: var(--theme--border-width) solid var(--theme--border-color-subdued);
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.search-container {
  padding: 1rem;
}
</style>
<<<<<<< HEAD
>>>>>>> 36c86a1 (feat/UI_Chat_v2)
=======
>>>>>>> d0ac1a5 (feat:create_UI_Chat_V3)
