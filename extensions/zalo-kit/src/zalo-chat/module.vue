<script setup lang="ts">
import { useApi } from '@directus/extensions-sdk'
import { authentication, createDirectus, realtime, rest } from '@directus/sdk'
import { computed, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref } from 'vue'

// Components imports - sorted by path
import AccountSwitchedSuccess from './components/AccountSwitchedSuccess.vue'
import FileAttachmentPreview from './components/Chat/Dialogs/FileAttachmentPreview.vue'
import MembersDialog from './components/Chat/Dialogs/MembersDialog.vue'
import UploadProgress from './components/Chat/Dialogs/UploadProgress.vue'
import ChatHeader from './components/Chat/Header/ChatHeader.vue'
import MessageInput from './components/Chat/Input/MessageInput.vue'
import EmptyState from './components/EmptyState.vue'
import ConversationList from './components/Sidebar/Conversation/ConversationList.vue'
import ConversationSearch from './components/Sidebar/Conversation/ConversationSearch.vue'
import ProfileDropdown from './components/Sidebar/Header/ProfileDropdown.vue'
import SidebarDetail from './components/Sidebar/SidebarDetail.vue'
import SwitchAccountView from './components/SwitchAccountView.vue'
import SwitchingAccountState from './components/SwitchingAccountState.vue'

// Composables and utils
import { useFileUpload } from './composables/useFileUpload'
import { handleEmojiInsert } from './utils/emoticonConverter'

const currentFunction = ref<string | null>(null)

function showFunctionA() {
  currentFunction.value = 'A'
}

function showFunctionB() {
  currentFunction.value = 'B'
}
interface Conversation {
  id: string
  name: string
  avatar: string
  lastMessage: string
  timestamp: string
  timestampRaw: string
  lastMessageTimestamp: number // Unix timestamp in milliseconds for accurate sorting
  unreadCount: number
  online: boolean
  type: 'group' | 'direct'
  members?: Array<{ id: string, name: string, avatar: string }>
  hasRealAvatar?: boolean // Flag to check if conversation has real avatar or fallback
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
  reactions?: any[]
  isEdited?: boolean
  isUndone?: boolean
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

// Reactive data
const api = useApi()

// Direct Directus client for WebSocket
const directusClient = createDirectus('http://localhost:8055')
  .with(authentication())
  .with(realtime())
  .with(rest())

// WebSocket state
const websocketConnected = ref(false)
const websocketAuthenticated = ref(false)

// Subscription references
let messageUnsubscribe: (() => void) | null = null
let conversationUnsubscribe: (() => void) | null = null

const searchQuery = ref('')
const navSearchQuery = ref('')
const messageSearchQuery = ref('')
const messageText = ref('')
const activeConversationId = ref<string>('')
const messagesContainer = ref<HTMLElement | null>(null)
const messageInputRef = ref<HTMLTextAreaElement | null>(null)
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
const isInitializing = ref(true) // Track khởi động app
const conversationListReady = ref(false) // Track khi conversation list sẵn sàng hiển thị
const showFilterDropdown = ref(false)
const highlightedMessageId = ref<string | null>(null)
const showMembersDialog = ref(false)
const memberSearchQuery = ref('')
const selectedMembers = ref<string[]>([])
const conversationPage = ref(1)
const conversationLimit = ref(50)
const hasMoreConversations = ref(true)
const isLoadingMore = ref(false)

const _conversationTypeFilter = ref<'all' | 'group' | 'direct'>('all')

let conversationPollingInterval: any = null

// File upload composable
const {
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

// Account switching states
const showManageAccountsView = ref(false)
const isSwitchingAccount = ref(false)
const switchAccountSuccess = ref(false)
const switchedAccountName = ref('')
const mockAccounts = ref([
  { id: '1', name: 'Account 1', avatar: 'https://ui-avatars.com/api/?name=A1' },
  { id: '2', name: 'Account 2', avatar: 'https://ui-avatars.com/api/?name=A2' },
])

// File library states
const activeDialog = ref<'upload' | 'choose' | 'url' | null>(null)
const importUrl = ref('')
const importing = ref(false)
const folder = ref(null)

const isValidURL = computed(() => {
  try {
    if (!importUrl.value)
      return false
    // eslint-disable-next-line no-new
    new URL(importUrl.value)
    return true
  }
  catch {
    return false
  }
})

// Filter states
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

const _processedMessageIds = new Set<string>()

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

    // Validate date
    if (!date || date.toString() === 'Invalid Date')
      return ''

    const now = new Date()

    // Đảm bảo tính toán đúng múi giờ
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

    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }
  catch {
    return ''
  }
}

function handleImageError(event: Event, name: string) {
  const target = event.target as HTMLImageElement
  target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
}

const filteredConversations = computed(() => {
  let filtered = conversations.value

  const query = navSearchQuery.value || searchQuery.value
  if (query) {
    filtered = filtered.filter(
      conv =>
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

  if (messageType.unread || messageType.important || messageType.archived) {
    filtered = filtered.filter((conv) => {
      if (messageType.unread && conv.unreadCount > 0)
        return true
      if (messageType.important)
        return true
      if (messageType.archived)
        return false
      return (
        !messageType.unread && !messageType.important && !messageType.archived
      )
    })
  }

  return filtered
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

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function _clearAllFilters() {
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

function _applyFilters() {
  showFilterDropdown.value = false
}

/**
 * Send message - with optimistic update
 */

/**
 * Send message - Optimistic update NGAY LẬP TỨC
 */
async function sendMessage() {
  if (!messageText.value.trim() || !activeConversationId.value || sendingMessage.value) {
    return
  }

  const content = messageText.value.trim()
  sendingMessage.value = true
  messageText.value = ''

  try {
    // Always use HTTP API for sending messages
    await api.post('/zalo/send', {
      conversationId: activeConversationId.value,
      message: content,
    })

    // Auto scroll to bottom after sending
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    })

    // WebSocket will receive the new message automatically via subscription
    // No need to manually update UI
  }
  catch (error: any) {
    messageText.value = content
  }
  finally {
    sendingMessage.value = false
  }
}
async function autoLogin() {
  try {
    const res = await api.get('/zalo/status')
    const zaloStatus = res.data

    if (zaloStatus?.userId) {
      currentUserId.value = zaloStatus.userId

      const userResponse = await api.get('/zalo/users', {
        params: {
          userId: zaloStatus.userId,
          fields: 'displayname,zaloname,avatarurl',
        },
      })

      const users = userResponse.data.data
      const currentUser = users[0]

      console.log('🔍 API Response - Current User:', currentUser)

      if (currentUser) {
        currentUserName.value = currentUser.display_name || currentUser.zalo_name || 'You'

        // API trả về avatar_url (snake_case) từ DB
        const avatarUrl = currentUser.avatar_url
        if (avatarUrl) {
          // Sử dụng URL tương đối thay vì hardcode localhost
          const baseUrl = window.location.origin
          if (avatarUrl.startsWith('https://s120-ava-talk.zadn.vn')
            || avatarUrl.startsWith('https://ava-grp-talk.zadn.vn')) {
            currentUserAvatar.value = `${baseUrl}/zalo/avatar-proxy?url=${encodeURIComponent(avatarUrl)}`
            console.log('🖼️ User Avatar (via proxy):', currentUserAvatar.value)
          }
          else {
            currentUserAvatar.value = avatarUrl
            console.log('🖼️ User Avatar (direct):', currentUserAvatar.value)
          }
        }
        else {
          currentUserAvatar.value = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUserName.value)}`
          console.log('🖼️ User Avatar (fallback):', currentUserAvatar.value)
        }

        console.log('👤 Current User:', {
          name: currentUserName.value,
          id: currentUserId.value,
          avatar: currentUserAvatar.value,
        })
      }

      // ✅ Authentication successful
      isAuthenticated.value = true
    }
    else {
      isAuthenticated.value = false
    }
  }
  catch (error: any) {
    isAuthenticated.value = false
  }
}

/**
 * Stop polling for messages
 */
function stopMessagePolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
  }
  isPolling = false
}

/**
 * Scroll messages container to bottom
 */
function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// Initialize WebSocket connection using direct Directus SDK
async function initializeWebSocket() {
  try {
    // Get session token from endpoint
    const tokenResponse = await api.get('/zalo/get-session-token')
    const sessionToken = tokenResponse.data?.sessionToken

    if (!sessionToken) {
      return
    }

    // Set token and connect
    await directusClient.setToken(sessionToken)
    await directusClient.connect()

    websocketConnected.value = true
    websocketAuthenticated.value = true

    // Subscribe to global conversations for real-time updates
    await subscribeToAllConversations()

    // Subscribe to messages for active conversation if any
    if (activeConversationId.value) {
      await subscribeToConversationMessages(activeConversationId.value)
    }
  }
  catch (error) {
    // Silent fail
  }
}

// Subscribe to all conversations for global updates
async function subscribeToAllConversations() {
  try {
    // Subscribe to conversation creation
    const createSub = await directusClient.subscribe('zalo_conversations', {
      event: 'create',
      query: {
        fields: ['*'],
      },
      uid: 'conversations-create',
    })

    // Subscribe to conversation updates (when new messages arrive)
    const updateSub = await directusClient.subscribe('zalo_conversations', {
      event: 'update',
      query: {
        fields: ['*'],
      },
      uid: 'conversations-update',
    })

    // Store unsubscribe functions
    const unsubscribeCreate = createSub.unsubscribe
    const unsubscribeUpdate = updateSub.unsubscribe

    conversationUnsubscribe = () => {
      unsubscribeCreate()
      unsubscribeUpdate()
    }

    // Process create events in background
    ;(async () => {
      for await (const item of createSub.subscription) {
        if (item.type === 'subscription' && item.event === 'create') {
          const conversationData = item.data[0]
          handleNewConversationCreated({ data: conversationData })
        }
      }
    })().catch(() => {})

    // Process update events in background
    ;(async () => {
      for await (const item of updateSub.subscription) {
        if (item.type === 'subscription' && item.event === 'update') {
          const conversationData = item.data[0]
          handleConversationUpdate({ data: conversationData })
        }
      }
    })().catch(() => {})
  }
  catch (error) {
    // Silent fail
  }
}

// Subscribe to messages for a specific conversation
async function subscribeToConversationMessages(conversationId: string) {
  try {
    // Unsubscribe from previous conversation if any
    if (messageUnsubscribe) {
      messageUnsubscribe()
      messageUnsubscribe = null
    }

    const { subscription, unsubscribe } = await directusClient.subscribe('zalo_messages', {
      event: 'create',
      query: {
        fields: ['*', 'sender_id.*'],
        filter: {
          conversation_id: {
            _eq: conversationId,
          },
        },
        sort: ['sent_at'],
      },
      uid: `messages-${conversationId}`,
    })

    messageUnsubscribe = unsubscribe

    // Process events in background
    ;(async () => {
      for await (const item of subscription) {
        if (item.type === 'subscription' && item.event === 'create') {
          const messageData = item.data[0]

          // Check for duplicates
          if (processedMessageIds.has(messageData.id)) {
            continue
          }

          processedMessageIds.add(messageData.id)

          handleNewMessage({
            conversationId,
            message: messageData,
          })
        }
      }
    })().catch(() => {})
  }
  catch (error) {
    // Silent fail
  }
}

// Disconnect WebSocket
async function disconnectWebSocket() {
  try {
    if (messageUnsubscribe) {
      messageUnsubscribe()
      messageUnsubscribe = null
    }

    if (conversationUnsubscribe) {
      conversationUnsubscribe()
      conversationUnsubscribe = null
    }

    await directusClient.disconnect()

    websocketConnected.value = false
    websocketAuthenticated.value = false
  }
  catch (error) {
    // Silent fail
  }
}

function handleNewMessage(data: any) {
  // Extract message data (could be wrapped or direct)
  const messageData = data.message || data.data || data
  const conversationId = data.conversationId || messageData.conversation_id

  if (conversationId !== activeConversationId.value) {
    // Still update conversation preview even if not active
    updateConversationOnNewMessage(conversationId, messageData)
    return
  }

  const messageId = messageData.id
  const exists = messages.value.some(m => m.id === messageId)

  if (!exists) {
    // Handle nested sender_id from ItemsService (could be {id, display_name, avatar_url} or just string)
    const senderIdRaw = messageData.sender_id || messageData.senderId
    const senderId = typeof senderIdRaw === 'object' ? senderIdRaw?.id : senderIdRaw
    const senderName = typeof senderIdRaw === 'object' ? senderIdRaw?.display_name : (messageData.sender_name || messageData.senderName || 'Unknown')
    const senderAvatar = typeof senderIdRaw === 'object' ? senderIdRaw?.avatar_url : messageData.avatar

    const direction = senderId === currentUserId.value ? 'out' : 'in'

    messages.value.push({
      id: messageId,
      direction,
      text: messageData.content || messageData.text || '',
      senderName,
      senderId,
      time: messageData.sent_at || messageData.time || new Date().toISOString(),
      avatar: senderAvatar,
      status: direction === 'out' ? 'sent' : undefined,
      files: messageData.attachments,
      isEdited: messageData.is_edited || messageData.isEdited || false,
      isUndone: messageData.is_undone || messageData.isUndone || false,
      clientId: messageData.client_id || messageData.clientId,
    })

    updateConversationOnNewMessage(conversationId, messageData)

    // Auto scroll to bottom
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    })
  }
}

function handleConversationUpdate(data: any) {
  const conversationData = data.data
  const conversationId = conversationData.id

  const index = conversations.value.findIndex(c => c.id === conversationId)

  if (index !== -1 && conversations.value[index]) {
    // Get timestamp from last_message_time or date_updated
    const rawTimestamp = conversationData.last_message_time
      || conversationData.date_updated
      || conversationData.timestamp
      || new Date().toISOString()
    const newTimestamp = new Date(rawTimestamp).getTime()

    // Create new object to trigger Vue reactivity
    conversations.value[index] = {
      ...conversations.value[index]!,
      lastMessage: conversationData.last_message || conversations.value[index]!.lastMessage,
      timestamp: formatTime(rawTimestamp),
      timestampRaw: rawTimestamp,
      lastMessageTimestamp: newTimestamp,
      unreadCount: conversationData.unread_count ?? conversations.value[index]!.unreadCount,
    }

    sortConversations()
  }
}

function handleNewConversationCreated(data: any) {
  const conversationData = data.data
  const exists = conversations.value.some(c => c.id === conversationData.id)

  if (!exists) {
    const rawTimestamp = conversationData.timestamp || new Date().toISOString()
    const timestampMs = new Date(rawTimestamp).getTime()

    conversations.value.unshift({
      id: conversationData.id,
      name: conversationData.name || 'Unknown',
      avatar: conversationData.avatar || `https://ui-avatars.com/api?name=U&background=random`,
      lastMessage: conversationData.lastMessage || '',
      timestamp: formatTime(rawTimestamp),
      timestampRaw: rawTimestamp,
      lastMessageTimestamp: timestampMs,
      unreadCount: conversationData.unreadCount || 0,
      online: true,
      type: conversationData.type || 'direct',
      members: [],
      hasRealAvatar: !!conversationData.avatar,
    })

    sortConversations()
  }
}

function unsubscribeFromMessages() {
  if (messageUnsubscribe) {
    messageUnsubscribe()
    messageUnsubscribe = null
  }
}

function unsubscribeFromConversations() {
  if (conversationUnsubscribe) {
    conversationUnsubscribe()
    conversationUnsubscribe = null
  }
}

let isSelectingConversation = false

function selectConversation(id: string) {
  if (isSelectingConversation)
    return
  if (activeConversationId.value === id)
    return

  isSelectingConversation = true

  // Unsubscribe from old conversation messages
  unsubscribeFromMessages()

  activeConversationId.value = id
  messages.value = []

  const conversation = conversations.value.find(c => c.id === id)
  if (conversation && conversation.unreadCount > 0) {
    conversation.unreadCount = 0
  }

  // Stop previous polling của conversation cũ
  stopMessagePolling()

  // Load initial messages
  loadMessages(id).finally(() => {
    // Subscribe to new conversation messages via WebSocket
    if (websocketConnected.value && websocketAuthenticated.value) {
      subscribeToConversationMessages(id)
    }

    isSelectingConversation = false
  })
}
function stopConversationPolling() {
  if (conversationPollingInterval) {
    clearInterval(conversationPollingInterval)
    conversationPollingInterval = null
  }
}
async function loadConversations() {
  if (!isAuthenticated.value) {
    conversations.value = []
    return
  }

  try {
    loading.value = true
    isLoadingConversations.value = true

    const convResponse = await api.get('/zalo/index', {
      params: {
        page: 1,
        limit: conversationLimit.value,
      },
    })

    const data = convResponse.data.data
    const meta = convResponse.data.meta

    if (!meta) {
      return
    }

    const newConversations = data.map((conv: any) => {
      const rawTimestamp = conv.timestamp || conv.lastMessageTime || new Date().toISOString()
      const timestampDate = new Date(rawTimestamp)
      const timestampMs = timestampDate.getTime()

      return {
        id: conv.id,
        name: conv.name || 'Unknown',
        avatar: conv.avatar || `https://ui-avatars.com/api?name=U&background=random`,
        lastMessage: conv.lastMessage || '',
        timestamp: formatTime(rawTimestamp),
        timestampRaw: rawTimestamp,
        lastMessageTimestamp: timestampMs,
        unreadCount: conv.unreadCount || 0,
        online: true,
        type: conv.type || 'direct',
        members: Array.isArray(conv.members)
          ? conv.members.map((m: any) => ({
              id: m.id,
              name: m.name || 'Unknown',
              avatar: m.avatar || `https://ui-avatars.com/api?name=U&background=random`,
            }))
          : [],
        hasRealAvatar: !!conv.avatar && !conv.avatar.includes('ui-avatars.com'),
      }
    })

    // Replace with new conversations
    conversations.value = newConversations
    sortConversations()

    hasMoreConversations.value = meta.hasMore

    // Kiểm tra nếu có conversations và chưa select conversation nào
    if (conversations.value.length > 0 && !activeConversationId.value) {
      const firstConversation = conversations.value[0]
      if (firstConversation) {
        selectConversation(firstConversation.id)
      }
    }

    // Mark conversation list as ready khi đã có data hoặc confirm là empty
    if (!conversationListReady.value) {
      if (conversations.value.length > 0) {
        // Có data - mark ready ngay
        conversationListReady.value = true
      }
      else {
        // Không có data - đợi 6 giây trước khi mark ready
        setTimeout(() => {
          conversationListReady.value = true
        }, 6000)
      }
    }
  }
  catch (error: any) {
    console.error('❌ Error loading conversations:', error)
    conversations.value = []
  }
  finally {
    loading.value = false
    isLoadingConversations.value = false
  }
}

async function loadMoreConversations() {
  if (isLoadingMore.value || !hasMoreConversations.value) {
    return
  }

  isLoadingMore.value = true
  conversationPage.value++

  try {
    const convResponse = await api.get('/zalo/conversations', {
      params: {
        page: conversationPage.value,
        limit: conversationLimit.value,
      },
    })

    const data = convResponse.data.data
    const meta = convResponse.data.meta

    if (!meta) {
      return
    }

    const newConversations = data.map((conv: any) => {
      const rawTimestamp = conv.timestamp || conv.lastMessageTime || new Date().toISOString()
      const timestampDate = new Date(rawTimestamp)
      const timestampMs = timestampDate.getTime()

      return {
        id: conv.id,
        name: conv.name || 'Unknown',
        avatar: conv.avatar || `https://ui-avatars.com/api?name=U&background=random`,
        lastMessage: conv.lastMessage || '',
        timestamp: formatTime(rawTimestamp),
        timestampRaw: rawTimestamp,
        lastMessageTimestamp: timestampMs,
        unreadCount: conv.unreadCount || 0,
        online: true,
        type: conv.type || 'direct',
        members: Array.isArray(conv.members)
          ? conv.members.map((m: any) => ({
              id: m.id,
              name: m.name || 'Unknown',
              avatar: m.avatar || `https://ui-avatars.com/api?name=U&background=random`,
            }))
          : [],
        hasRealAvatar: !!conv.avatar && !conv.avatar.includes('ui-avatars.com'),
      }
    })

    // Append unique conversations
    const existingIds = new Set(conversations.value.map(c => c.id))
    const uniqueNew = newConversations.filter((c: Conversation) => !existingIds.has(c.id))
    conversations.value.push(...uniqueNew)

    sortConversations()

    // Update pagination state
    hasMoreConversations.value = meta.hasMore
  }
  catch (error: any) {
    console.error('❌ Error loading more conversations:', error)
  }
  finally {
    isLoadingMore.value = false
  }
}

// Infinite scroll handler
function _handleConversationScroll(event: Event) {
  const target = event.target as HTMLElement
  const scrollTop = target.scrollTop
  const scrollHeight = target.scrollHeight
  const clientHeight = target.clientHeight
  const distanceToBottom = scrollHeight - scrollTop - clientHeight

  const threshold = 200

  if (distanceToBottom < threshold && !isLoadingMore.value && hasMoreConversations.value) {
    loadMoreConversations()
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
        const meResponse = await api.get('/users/me', {
          params: {
            fields: 'id',
          },
        })
        const me = meResponse.data.data
        if (me?.id) {
          currentUserId.value = me.id
        }
      }
      catch {
        // Silently fail - will use default 'system'
      }
    }

    const messagesResponse = await api.get(`/zalo/messages/${conversationId}`)
    const data = messagesResponse.data.data

    messages.value = data.map((msg: any) => ({
      id: msg.id,
      direction: msg.direction,
      text: msg.text || '',
      senderName: msg.senderName,
      senderId: msg.senderId,
      time: msg.time,
      avatar: msg.avatar,
      status: msg.status,
      files: msg.attachments || [],
      reactions: msg.reactions || [],
      isEdited: msg.isEdited,
      isUndone: msg.isUndone,
      clientId: msg.clientId,
    }))

    // Auto scroll to bottom after loading
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    })
  }
  catch (error: any) {
    // Silent fail
  }
  finally {
    isLoadingMessages.value = false

    // Mark conversation list ready after successfully loading messages
    if (!conversationListReady.value) {
      conversationListReady.value = true
    }
  }
}

function updateConversationOnNewMessage(conversationId: string, message: any) {
  const convIndex = conversations.value.findIndex(c => c.id === conversationId)
  if (convIndex === -1)
    return

  const conversation = conversations.value[convIndex]
  if (!conversation)
    return

  const messagePreview = message.content || message.text || ''
  const messageTime = message.sent_at || message.time || message.sentAt || new Date().toISOString()
  const messageTimestamp = new Date(messageTime).getTime()

  conversation.lastMessage = messagePreview.substring(0, 50)
  conversation.timestamp = formatTime(messageTime)
  conversation.timestampRaw = messageTime
  conversation.lastMessageTimestamp = messageTimestamp

  if (conversationId !== activeConversationId.value) {
    conversation.unreadCount = (conversation.unreadCount || 0) + 1
  }

  sortConversations()
}

function startMessagePolling(conversationId: string) {
  stopMessagePolling()

  // Get last message ID
  lastMessageId = messages.value.length > 0
    ? messages.value[messages.value.length - 1].id
    : null

  isPolling = true

  // Poll immediately first time
  pollMessages(conversationId)

  // Then poll every 2 seconds
  pollingInterval = setInterval(() => {
    if (isPolling) {
      pollMessages(conversationId)
    }
  }, 2000)
}

async function pollMessages(conversationId: string) {
  try {
    const response = await api.get(`/zalo/messages/${conversationId}`, {
      params: { limit: 50 },
      timeout: 15000,
    })

    const latestMessages = response.data.data
    if (latestMessages.length === 0)
      return

    const newestMessage = latestMessages[latestMessages.length - 1]

    if (newestMessage.id !== lastMessageId) {
      let addedCount = 0

      for (const msg of latestMessages) {
        const exists = messages.value.some((m) => {
          if (m.id === msg.id)
            return true
          if (m.clientId && msg.clientId && m.clientId === msg.clientId) {
            const index = messages.value.findIndex(
              m2 => m2.clientId === msg.clientId,
            )
            if (index !== -1) {
              messages.value[index] = {
                ...messages.value[index],
                id: msg.id,
                senderName: msg.senderName,
                avatar: msg.avatar,
                time: msg.time,
                status: 'sent',
              }
            }
            return true
          }
          return false
        })

        if (!exists) {
          const direction = msg.senderId === currentUserId.value ? 'out' : 'in'
          const newMessage: Message = {
            id: msg.id,
            direction,
            text: msg.text || '',
            senderName: msg.senderName,
            senderId: msg.senderId,
            time: msg.time,
            avatar: msg.avatar,
            status: direction === 'out' ? 'sent' : undefined,
            isEdited: msg.isEdited,
            isUndone: msg.isUndone,
            clientId: msg.clientId,
          }
          messages.value.push(newMessage)
          addedCount++

          updateConversationOnNewMessage(conversationId, msg)
        }
      }

      lastMessageId = newestMessage.id

      if (addedCount > 0) {
        nextTick(scrollToBottom)
      }
    }
  }
  catch (error) {
    console.error('Polling error:', error)
  }
}

function _autoResize(event: Event) {
  const textarea = event.target as HTMLTextAreaElement
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
}

function onSelectFromLibrary(files: any[]) {
  // Handle files selected from library
  console.warn('Select from library:', files)
  activeDialog.value = null
}

async function importFromURL() {
  if (!isValidURL.value)
    return

  importing.value = true

  try {
    // Import logic would go here
    console.warn('Import from URL:', importUrl.value)
    importUrl.value = ''
    activeDialog.value = null
  }
  catch (error) {
    console.error('Error importing from URL:', error)
  }
  finally {
    importing.value = false
  }
}

function removeMember(memberId: string) {
  const index = selectedMembers.value.indexOf(memberId)
  if (index > -1) {
    selectedMembers.value.splice(index, 1)
  }
}

// Account management functions
function handleManageAccounts() {
  showManageAccountsView.value = true
}

function handleSwitchAccount(accountId: string) {
  isSwitchingAccount.value = true

  // Simulate switching account
  setTimeout(() => {
    const account = mockAccounts.value.find(acc => acc.id === accountId)
    if (account) {
      switchedAccountName.value = account.name
      isSwitchingAccount.value = false
      switchAccountSuccess.value = true

      // After 2 seconds, reload
      setTimeout(() => {
        switchAccountSuccess.value = false
        showManageAccountsView.value = false
        // Reload conversations for new account
        loadConversations()
      }, 2000)
    }
  }, 1500)
}

function handleAddAccount() {
  // Navigate to add account flow
  console.warn('Add account functionality not implemented yet')
}

// File upload functions
function triggerFileInput() {
  fileInput.value?.click()
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    selectedFiles.value = Array.from(input.files).slice(0, MAX_FILES)
    showFilePreviewDialog.value = true
  }
}

function removeFileFromPreview(index: number) {
  selectedFiles.value.splice(index, 1)
  if (selectedFiles.value.length === 0) {
    showFilePreviewDialog.value = false
  }
}

function cancelFileUpload() {
  selectedFiles.value = []
  showFilePreviewDialog.value = false
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

async function confirmAndUploadFiles() {
  if (selectedFiles.value.length === 0 || !activeConversationId.value)
    return

  showFilePreviewDialog.value = false

  try {
    // Use the composable to upload files
    const { uploadFiles } = useFileUpload()

    console.log('📤 Uploading files to Directus...')
    const result = await uploadFiles(selectedFiles.value, activeConversationId.value)

    if (result.success.length > 0) {
      console.log('✅ Files uploaded successfully:', result.success)

      // Create attachments from uploaded files
      const newAttachments: FileAttachment[] = result.success.map(file => ({
        id: file.id,
        filename: file.filename_download,
        type: file.type,
        size: file.filesize,
        url: `/assets/${file.id}`,
        width: file.width,
        height: file.height,
      }))

      pendingAttachments.value.push(...newAttachments)
    }

    if (result.errors.length > 0) {
      console.error('❌ Some files failed to upload:', result.errors)
    }

    selectedFiles.value = []
    if (fileInput.value) {
      fileInput.value.value = ''
    }
  }
  catch (error) {
    console.error('Error uploading files:', error)
  }
}

function removePendingAttachment(index: number) {
  pendingAttachments.value.splice(index, 1)
}

function onUpload(files: File[]) {
  selectedFiles.value = files.slice(0, MAX_FILES)
  showFilePreviewDialog.value = true
  activeDialog.value = null
}

function onSelectFromLibrary(files: any[]) {
  // Handle files selected from library
  console.warn('Select from library:', files)
  activeDialog.value = null
}

async function importFromURL() {
  if (!isValidURL.value)
    return

  importing.value = true

  try {
    // Import logic would go here
    console.warn('Import from URL:', importUrl.value)
    importUrl.value = ''
    activeDialog.value = null
  }
  catch (error) {
    console.error('Error importing from URL:', error)
  }
  finally {
    importing.value = false
  }
}

function openStickerMenu() {
  // Open sticker/emoji menu
  console.warn('Sticker menu not implemented yet')
}

function createGroup() {
  if (selectedMembers.value.length === 0) {
    return
  }
  // Group creation logic not implemented
  console.warn('Create group functionality not implemented yet')
  closeMembersDialog()
}

// Get active conversation object
const activeConversation = computed(() => {
  if (!activeConversationId.value || !conversations.value) {
    return null
  }
  return conversations.value.find(c => c.id === activeConversationId.value) || null
})

// Conversation stats by type
const _conversationStats = computed(() => {
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
  try {
    isInitializing.value = true
    await autoLogin()

    if (isAuthenticated.value) {
      await loadConversations()
      await initializeWebSocket()
    }
    else {
      conversations.value = []
    }
  }
  catch (error: any) {
    conversations.value = []
  }
  finally {
    isInitializing.value = false
  }
})

onBeforeUnmount(() => {
  unsubscribeFromMessages()
  unsubscribeFromConversations()
  disconnectWebSocket()
})

onUnmounted(() => {
  unsubscribeFromMessages()
  unsubscribeFromConversations()
  disconnectWebSocket()
  document.removeEventListener('click', handleClickOutside)
})

const filteredMembers = computed(() => {
  if (!memberSearchQuery.value.trim()) {
    return conversations.value
  }

  return conversations.value.filter(member =>
    member.name.toLowerCase().includes(memberSearchQuery.value.toLowerCase()),
  )
})
</script>

<template>
  <PrivateView title="Messages">
    <template #title-outer:prepend>
      <v-button class="header-icon" rounded disabled icon secondary>
        <v-icon name="inbox" />
      </v-button>
    </template>

    <!-- Sidebar tùy biến theo trạng thái -->
    <template #sidebar>
      <SidebarDetail v-if="currentFunction === 'A'" icon="search" class="my-sidebar-detail" title="Search for messages" close>
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
                    <span class="text-xs text-gray-500">{{ formatTime(message.time) }}</span>
                  </div>
                  <p class="text-sm text-gray-600 leading-relaxed" v-html="message.highlightedText" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </SidebarDetail>
      <SidebarDetail v-if="currentFunction === 'B'" class="my-sidebar-detail" icon="info" title="Conversation information" close />
      <SidebarDetail v-if="currentFunction === 'B'" class="my-sidebar-detail" icon="swap_vert" title="Image/video" />
      <SidebarDetail v-if="currentFunction === 'B'" class="my-sidebar-detail" icon="layers" title="Link" />
      <SidebarDetail v-if="currentFunction === 'B'" class="my-sidebar-detail" icon="sync_disabled" title="File" />
    </template>

    <template #navigation>
      <!-- User Profile Component -->
      <ProfileDropdown
        :user-name="currentUserName"
        :user-id="currentUserId"
        :user-avatar="currentUserAvatar"
        @manage-accounts="handleManageAccounts"
      />

      <!-- Separator -->
      <div class="nav-separator" />

      <!-- Conversation Panel -->
      <div class="conversation-panel">
        <!-- Search Component -->
        <ConversationSearch
          v-model:search-query="navSearchQuery"
          v-model:show-filter-dropdown="showFilterDropdown"
          @add-user="handleAddUser"
          @filter="handleFilter"
        />

        <!-- Loading State for Conversations -->
        <div
          v-if="isLoadingConversations && conversations.length === 0"
          class="flex flex-col items-center justify-center flex-1 gap-3 py-8"
        >
          <v-progress-circular indeterminate />
          <p class="text-sm text-text-subdued">
            Đang tải danh sách hội thoại...
          </p>
        </div>

        <!-- Conversation List -->
        <ConversationList
          v-else
          :conversations="filteredConversations"
          :active-conversation-id="activeConversationId"
          @select-conversation="selectConversation"
        />
      </div>
    </template>

    <!-- Main Chat Area với absolute positioning -->
    <div class="chat-container">
      <!-- App Initialization Loading State -->
      <div
        v-if="isInitializing"
        class="flex flex-col items-center justify-center h-full gap-4"
      >
        <v-progress-circular indeterminate size="large" />
        <div class="flex flex-col items-center gap-2">
          <p class="text-lg font-semibold text-text-normal">
            Đang khởi tạo ứng dụng...
          </p>
          <p class="text-sm text-text-subdued">
            Vui lòng đợi trong giây lát
          </p>
        </div>
      </div>

      <!-- Switch Account View -->
      <SwitchAccountView
        v-else-if="showManageAccountsView && !isSwitchingAccount && !switchAccountSuccess"
        :accounts="mockAccounts"
        @switch-account="handleSwitchAccount"
        @add-account="handleAddAccount"
      />

      <!-- Switching Account Loading State -->
      <SwitchingAccountState v-else-if="isSwitchingAccount" />

      <!-- Account Switched Success State -->
      <AccountSwitchedSuccess
        v-else-if="switchAccountSuccess"
        :account-name="switchedAccountName"
      />

      <!-- Normal Chat View -->
      <template v-else>
        <!-- Chat Header - Fixed tại top -->
        <ChatHeader
          v-if="activeConversation"
          :conversation="activeConversation"
          @open-members="openMembersDialog"
          @open-search="showFunctionA"
          @open-info="showFunctionB"
        />

        <!-- Messages area - Scrollable với padding cho header và input -->
        <div
          v-if="activeConversation"
          ref="messagesContainer"
          class="messages-area"
        >
          <!-- Loading State -->
          <div
            v-if="isLoadingMessages"
            class="flex flex-col items-center justify-center h-full gap-4"
          >
            <v-progress-circular indeterminate />
            <p class="text-base text-text-subdued">
              Đang tải tin nhắn...
            </p>
          </div>

          <!-- Messages Content -->
          <div
            v-else
            class="min-h-full flex flex-col justify-end"
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
                    <!-- Priority 1: Group has real avatar -->
                    <div v-if="activeConversation?.avatar && !activeConversation?.avatar?.startsWith('data:')" class="w-16 h-16 relative rounded-full overflow-hidden bg-neutral-100 border border-black/8">
                      <img
                        :src="activeConversation.avatar"
                        :alt="activeConversation?.name || 'Group'"
                        class="w-full h-full object-cover"
                      >
                    </div>

                    <!-- Priority 2: Group has no avatar, show 3 member avatars composite -->
                    <div v-else-if="activeConversation?.members && activeConversation.members.length > 0" class="relative w-16 h-16 inline-block">
                      <div
                        v-for="(member, index) in activeConversation.members.slice(0, 3)"
                        :key="member.id"
                        class="absolute w-8 h-8 rounded-full overflow-hidden bg-neutral-100 border-2 border-white"
                        :class="{
                          'top-0 left-0': index === 0,
                          'top-0 right-0': index === 1,
                          'bottom-0 left-1/2 -translate-x-1/2': index === 2,
                        }"
                      >
                        <img
                          :src="member.avatar"
                          :alt="member.name"
                          class="w-full h-full object-cover"
                        >
                      </div>
                    </div>

                    <!-- Priority 3: Fallback icon -->
                    <div v-else class="w-16 h-16 relative rounded-full overflow-hidden bg-neutral-100 border border-black/8">
                      <img
                        :src="activeConversation?.avatar || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHJ4PSI4IiBmaWxsPSIjMTBCOTgxIi8+PHBhdGggZD0iTTE1IDEzQzE1IDExLjM0MzEgMTYuMzQzMSAxMCAxOCAxMEMyMC4yMDkxIDEwIDIyIDExLjc5MDkgMjIgMTRDMjIgMTYuMjA5MSAyMC4yMDkxIDE4IDE4IDE4QzE2LjM0MzEgMTggMTUgMTYuNjU2OSAxNSAxNVYxM1oiIGZpbGw9IndoaXRlIi8+PHBhdGggZD0iTTI1IDEzQzI1IDExLjM0MzEgMjYuMzQzMSAxMCAyOCAxMEMyOS42NTY5IDEwIDMxIDExLjM0MzEgMzEgMTNDMzEgMTQuNjU2OSAyOS42NTY5IDE2IDI4IDE2QzI2LjM0MzEgMTYgMjUgMTQuNjU2OSAyNSAxM1oiIGZpbGw9IndoaXRlIi8+PHBhdGggZD0iTTEwIDI2QzEwIDIzLjIzODYgMTIuMjM4NiAyMSAxNSAyMUgyMUMyMy43NjE0IDIxIDI2IDIzLjIzODYgMjYgMjZWMjhDMjYgMjguNTUyMyAyNS41NTIzIDI5IDI1IDI5SDExQzEwLjQ0NzcgMjkgMTAgMjguNTUyMyAxMCAyOFYyNloiIGZpbGw9IndoaXRlIi8+PHBhdGggZD0iTTI0IDI2QzI0IDI0LjM0MzEgMjUuMzQzMSAyMyAyNyAyM0gzMEMzMS42NTY5IDIzIDMzIDI0LjM0MzEgMzMgMjZWMjhDMzMgMjguNTUyMyAzMi41NTIzIDI5IDMyIDI5SDI1QzI0LjQ0NzcgMjkgMjQgMjguNTUyMyAyNCAyOFYyNloiIGZpbGw9IndoaXRlIiBmaWxsLW9wYWNpdHk9IjAuNyIvPjwvc3ZnPg=='"
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
                      {{ formatTime(message.time) }}
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
                      <p class="">
                        {{ message.text }}
                      </p>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>
          <!-- End Messages Content -->
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
          <FileAttachmentPreview
            :attachments="pendingAttachments"
            :get-file-icon="getFileIcon"
            @edit="activeDialog = 'choose'"
            @remove="removePendingAttachment"
          />

          <!-- Upload Progress Indicator -->
          <UploadProgress
            :is-uploading="isUploading"
            :upload-progress="uploadProgress"
          />

          <!-- Message Input -->
          <MessageInput
            ref="messageInputRef"
            v-model:message-text="messageText"
            :sending-message="sendingMessage"
            :pending-attachments-count="pendingAttachments.length"
            @send="sendMessage"
            @open-sticker="openStickerMenu"
          >
            <!-- File Upload Menu Slot -->
            <template #attach-menu>
              <v-menu :offset-y="-150" :offset-x="127">
                <template #activator="{ toggle }">
                  <button
                    class="input-action-btn"
                    title="attach_file"
                    @click="toggle"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M18 15.75C18 17.4833 17.3917 18.9583 16.175 20.175C14.9583 21.3917 13.4833 22 11.75 22C10.0167 22 8.54167 21.3917 7.325 20.175C6.10833 18.9583 5.5 17.4833 5.5 15.75V6.5C5.5 5.25 5.9375 4.1875 6.8125 3.3125C7.6875 2.4375 8.75 2 10 2C11.25 2 12.3125 2.4375 13.1875 3.3125C14.0625 4.1875 14.5 5.25 14.5 6.5V15.25C14.5 16.0167 14.2333 16.6667 13.7 17.2C13.1667 17.7333 12.5167 18 11.75 18C10.9833 18 10.3333 17.7333 9.8 17.2C9.26667 16.6667 9 16.0167 9 15.25V6H11V15.25C11 15.4667 11.0708 15.6458 11.2125 15.7875C11.3542 15.9292 11.5333 16 11.75 16C11.9667 16 12.1458 15.9292 12.2875 15.7875C12.4292 15.6458 12.5 15.4667 12.5 15.25V6.5C12.4833 5.8 12.2375 5.20833 11.7625 4.725C11.2875 4.24167 10.7 4 10 4C9.3 4 8.70833 4.24167 8.225 4.725C7.74167 5.20833 7.5 5.8 7.5 6.5V15.75C7.48333 16.9333 7.89167 17.9375 8.725 18.7625C9.55833 19.5875 10.5667 20 11.75 20C12.9167 20 13.9083 19.5875 14.725 18.7625C15.5417 17.9375 15.9667 16.9333 16 15.75V6H18V15.75Z" fill="#1F1F1F" />
                    </svg>
                  </button>
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
            </template>

            <!-- Emoji Picker Slot -->
            <template #emoji-picker>
              <VEmojiPicker
                @select="insertEmoji($event)"
                @emoji-click="insertEmoji($event)"
                @emoji-selected="insertEmoji($event)"
                @input="insertEmoji($event)"
                @change="insertEmoji($event)"
              />
            </template>
          </MessageInput>
        </div>

        <!-- Loading state - hiển thị cho đến khi conversation list sẵn sàng -->
        <div
          v-else-if="!conversationListReady"
          class="flex flex-col items-center justify-center h-full gap-6 p-8"
        >
          <v-notice type="info" icon="info">
            <div class="flex flex-col gap-2">
              <div class="font-semibold text-base">
                Đang tải dữ liệu từ Zalo...
              </div>
              <div class="text-sm">
                Vui lòng đợi trong giây lát, hệ thống đang kết nối và tải danh sách hội thoại của bạn.
              </div>
            </div>
          </v-notice>
          <v-progress-circular indeterminate />
        </div>

        <!-- Empty state when no conversation available and list is ready -->
        <EmptyState v-else-if="conversations.length === 0" />

        <!-- Select conversation prompt -->
        <EmptyState v-else />
      </template>
    </div>

    <!-- Members Selection Dialog -->
    <MembersDialog
      :show="showMembersDialog"
      :search-query="memberSearchQuery"
      :selected-members="selectedMembers"
      :filtered-members="filteredMembers"
      :selected-member-objects="selectedMemberObjects"
      @close="closeMembersDialog"
      @update:search-query="memberSearchQuery = $event"
      @toggle-member="toggleMemberSelection"
      @remove-member="removeMember"
      @create-group="createGroup"
    />
  </PrivateView>
</template>

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

.messages-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 4px;
  background: var(--background-page, white);
  scroll-behavior: smooth;
}

.chat-container * {
  box-sizing: border-box;
}

/* Scrollbar styles - dùng chung cho messages area và dialogs */
.messages-area::-webkit-scrollbar,
.scroll-style::-webkit-scrollbar {
  width: 6px;
}

.messages-area::-webkit-scrollbar-track,
.scroll-style::-webkit-scrollbar-track {
  background: transparent;
}

.messages-area::-webkit-scrollbar-thumb,
.scroll-style::-webkit-scrollbar-thumb {
  background: var(--border-normal, #d3dae4);
  border-radius: 3px;
}

.messages-area::-webkit-scrollbar-thumb:hover,
.scroll-style::-webkit-scrollbar-thumb:hover {
  background: var(--border-subdued, #a2b5cd);
}

/* Navigation Panel Styles */
.nav-separator {
  height: 2px;
  background: #D3DAE4;
  margin: 6px 12px;
}

.conversation-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-height: 0;
  background: #F0F4F9;
}
</style>
