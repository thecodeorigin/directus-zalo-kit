<script setup lang="ts">
import { useApi } from '@directus/extensions-sdk'
import { authentication, createDirectus, realtime, rest } from '@directus/sdk'
import { computed, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, watchEffect } from 'vue'

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
  rawData?: any // Raw data from Zalo API
  quote?: {
    content: string
    msgType: string
    uidFrom: string
    msgId: string
    senderName?: string
    avatar?: string
  } // Quoted/replied message info
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

// Direct Directus client for WebSocket - use dynamic URL
const baseUrl = window.location.origin
const directusClient = createDirectus(baseUrl)
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

// Track processed message IDs to avoid duplicates
const processedMessageIds = new Set<string>()

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

// Context menu states
const showContextMenu = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuMessage = ref<Message | null>(null)

// Reply states
const replyingTo = ref<Message | null>(null)

// Forward dialog states
const showForwardDialog = ref(false)
const forwardTargetConversations = ref<string[]>([])
const forwardSearchQuery = ref('')

// Selection mode states
const isSelectionMode = ref(false)
const selectedMessageIds = ref<Set<string>>(new Set())
const longPressTimer = ref<any>(null)
const longPressDuration = 800 // 800ms to trigger selection mode

// Toast notification states
const toastMessage = ref('')
const toastType = ref<'success' | 'error' | 'info'>('success')
const showToast = ref(false)
let toastTimeout: ReturnType<typeof setTimeout> | null = null

// Forward loading state
const isForwarding = ref(false)

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

function openFileInNewTab(url: string) {
  window.open(url, '_blank')
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

function sortConversations() {
  conversations.value.sort((a, b) => {
    const timeA = a.lastMessageTimestamp || 0
    const timeB = b.lastMessageTimestamp || 0
    return timeB - timeA // Sort descending (newest first)
  })
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
 * Send message - with optimistic update and WebSocket sync
 */
async function sendMessage() {
  if ((!messageText.value.trim() && pendingAttachments.value.length === 0) || !activeConversationId.value || sendingMessage.value) {
    return
  }

  const content = messageText.value.trim()
  const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const attachmentsToSend = [...pendingAttachments.value]

  // Save quote data BEFORE clearing replyingTo
  const quoteData = replyingTo.value

  // Build quote object if replying
  const quote = quoteData
    ? {
        content: quoteData.text,
        msgType: 'text',
        uidFrom: quoteData.senderId,
        msgId: quoteData.id,
        // cliMsgId is REQUIRED by Zalo API
        // Priority: 1) clientId from Zalo API (for received messages)
        //           2) Generate timestamp-based ID (for sent messages without cliMsgId)
        cliMsgId: (() => {
          const clientId = quoteData.clientId
          // If clientId exists and is NOT our client-generated format, use it
          if (clientId && !clientId.startsWith('client_')) {
            return clientId
          }
          // Otherwise, generate a timestamp-based cliMsgId (similar to Zalo's format)
          // Extract timestamp from quoteData if available, or use current time
          const timestamp = quoteData.timestamp
            ? new Date(quoteData.timestamp).getTime()
            : Date.now()
          return String(timestamp)
        })(),
        // Format ts as HH:mm - handle both ISO string and already formatted time
        ts: (() => {
          const time = quoteData.time
          // If it's an ISO string (optimistic message), format it
          if (time.includes('T') || time.includes('Z')) {
            return new Date(time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
          }
          // If it's already formatted (HH:mm), use as is
          return time
        })(),
      }
    : undefined

  // Clear input immediately
  messageText.value = ''
  pendingAttachments.value = []
  sendingMessage.value = true

  // Clear reply state
  replyingTo.value = null

  // ✅ Optimistic update - add message to UI immediately
  const optimisticMessage: Message = {
    id: clientId,
    direction: 'out',
    text: content || '',
    senderName: currentUserName.value,
    senderId: currentUserId.value,
    time: new Date().toISOString(),
    avatar: currentUserAvatar.value,
    status: 'sent',
    files: attachmentsToSend,
    reactions: [],
    isEdited: false,
    isUndone: false,
    clientId,
    quote: quoteData
      ? {
          content: quoteData.text,
          msgType: 'text',
          uidFrom: quoteData.senderId,
          msgId: quoteData.id,
          senderName: quoteData.senderName,
          avatar: quoteData.avatar,
        }
      : undefined,
  }

  messages.value.push(optimisticMessage)

  // Scroll to bottom immediately
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })

  try {
    // Build payload
    const payload: any = {
      conversationId: activeConversationId.value,
      message: content || (attachmentsToSend.length > 0 ? `📎 ${attachmentsToSend.length} file(s)` : ''),
      attachments: attachmentsToSend.map(att => ({
        file_id: att.id,
        url: att.url,
        filename: att.filename,
        type: att.type,
        size: att.size,
      })),
      clientId, // Send clientId to match with optimistic update
    }

    // Add quote if replying
    if (quote) {
      payload.quote = quote
    }

    // Send via HTTP API - BE will broadcast via WebSocket
    await api.post('/zalo/send', payload)

    // Update conversation preview
    const now = new Date().toISOString()
    updateConversationOnNewMessage(activeConversationId.value, {
      content: content || `📎 ${attachmentsToSend.length} file(s)`,
      sent_at: now,
    })

    // WebSocket will automatically receive and sync the message
    // The optimistic message will be replaced when real message arrives
  }
  catch (error: any) {
    console.error('❌ Failed to send message:', error)

    // Remove optimistic message on error
    const index = messages.value.findIndex(m => m.clientId === clientId)
    if (index !== -1) {
      messages.value.splice(index, 1)
    }

    // Restore input
    messageText.value = content
    pendingAttachments.value = attachmentsToSend

    // Restore reply state on error
    if (quoteData) {
      replyingTo.value = quoteData
    }
  }
  finally {
    sendingMessage.value = false
  }
}

/**
 * Copy message text to clipboard
 */
function copyMessage() {
  if (!contextMenuMessage.value)
    return

  navigator.clipboard.writeText(contextMenuMessage.value.text)
  closeContextMenu()
  showToastNotification('Đã sao chép tin nhắn', 'success')
}

/**
 * Reply to a message (quick action)
 */
function replyToMessage(message?: Message) {
  const msg = message || contextMenuMessage.value
  if (!msg || msg.isUndone)
    return

  closeContextMenu()

  replyingTo.value = msg

  nextTick(() => {
    messageInputRef.value?.focus()
  })
}

/**
 * Cancel reply
 */
function cancelReply() {
  replyingTo.value = null
}

/**
 * Quick forward a single message
 */
function quickForwardMessage(message: Message) {
  console.warn('[FORWARD] Quick forward triggered for message:', message.id)

  closeContextMenu()

  // Clear any existing selection
  selectedMessageIds.value.clear()

  // Add this message to selection
  selectedMessageIds.value.add(message.id)

  console.warn('[FORWARD] Selected message IDs:', Array.from(selectedMessageIds.value))

  // Open forward dialog
  showForwardDialog.value = true
  forwardTargetConversations.value = []
  forwardSearchQuery.value = ''

  console.warn('[FORWARD] Dialog opened, available conversations:', conversations.value.length)
}

/**
 * Show context menu for message
 */
function showMessageContextMenu(event: MouseEvent, message: Message) {
  event.preventDefault()
  event.stopPropagation()

  // Don't show menu for undone messages
  if (message.isUndone) {
    return
  }

  contextMenuMessage.value = message

  // Calculate position - show menu above the click point
  const menuHeight = 280 // Approximate height of context menu
  const menuWidth = 200

  let x = event.clientX
  let y = event.clientY - menuHeight // Position above the cursor

  // Adjust if menu would go off screen
  if (y < 0) {
    y = event.clientY + 10 // Show below if not enough space above
  }

  if (x + menuWidth > window.innerWidth) {
    x = window.innerWidth - menuWidth - 10
  }

  contextMenuPosition.value = { x, y }
  showContextMenu.value = true

  // Close menu when clicking outside - delay to avoid immediate close
  setTimeout(() => {
    document.addEventListener('click', closeContextMenu, { once: true })
  }, 100)
}

/**
 * Close context menu
 */
function closeContextMenu() {
  showContextMenu.value = false
  contextMenuMessage.value = null
}

/**
 * Enter selection mode for multi-select
 */
function enterSelectionMode(initialMessageId?: string) {
  isSelectionMode.value = true
  selectedMessageIds.value.clear()
  if (initialMessageId) {
    selectedMessageIds.value.add(initialMessageId)
  }
  closeContextMenu()
}

/**
 * Exit selection mode
 */
function exitSelectionMode() {
  isSelectionMode.value = false
  selectedMessageIds.value.clear()
}

/**
 * Handle long press start (to enter selection mode)
 */
function handleLongPressStart(event: MouseEvent | TouchEvent, messageId: string) {
  const message = messages.value.find(m => m.id === messageId)
  if (!message || message.isUndone)
    return

  longPressTimer.value = setTimeout(() => {
    // Vibrate if supported (mobile)
    if ('vibrate' in navigator) {
      navigator.vibrate(50)
    }

    enterSelectionMode(messageId)
  }, longPressDuration)
}

/**
 * Handle long press end (cancel timer if not held long enough)
 */
function handleLongPressEnd() {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
}

/**
 * Handle message click (in selection mode)
 */
function handleMessageClick(messageId: string) {
  if (isSelectionMode.value) {
    toggleMessageSelection(messageId)
  }
}

/**
 * Select all messages
 */
function selectAllMessages() {
  messages.value.forEach((msg) => {
    if (!msg.isUndone) {
      selectedMessageIds.value.add(msg.id)
    }
  })
}

/**
 * Delete selected messages
 */
async function deleteSelectedMessages() {
  if (selectedMessageIds.value.size === 0)
    return

  if (!confirm(`Delete ${selectedMessageIds.value.size} message(s)? They will only be removed for you.`)) {
    return
  }

  const conversationId = activeConversation.value?.id
  if (!conversationId)
    return

  let threadId: string
  let threadType: number

  if (conversationId.startsWith('group_')) {
    const parts = conversationId.split('_')
    threadId = parts[1] || conversationId
    threadType = 2
  }
  else if (conversationId.startsWith('direct_')) {
    const parts = conversationId.split('_')
    const userId1 = parts[1]
    const userId2 = parts[2]
    threadId = (userId1 === currentUserId.value ? userId2 : userId1) || conversationId
    threadType = 1
  }
  else {
    threadId = conversationId
    threadType = 1
  }

  try {
    const deletePromises = Array.from(selectedMessageIds.value).map(messageId =>
      api.delete(`/zalo/messages/${messageId}?threadId=${threadId}&threadType=${threadType}`),
    )

    await Promise.all(deletePromises)

    // Remove from local list
    messages.value = messages.value.filter(m => !selectedMessageIds.value.has(m.id))

    exitSelectionMode()

    // Reload to ensure cleanup
    setTimeout(() => {
      loadMessages(activeConversationId.value)
    }, 500)
  }
  catch (error: any) {
    console.error('Failed to delete messages:', error)
    showToastNotification('Failed to delete some messages. Please try again.', 'error')
  }
}

/**
 * Toggle message selection
 */
function toggleMessageSelection(messageId: string) {
  if (selectedMessageIds.value.has(messageId)) {
    selectedMessageIds.value.delete(messageId)
  }
  else {
    selectedMessageIds.value.add(messageId)
  }

  // Exit selection mode if no messages selected
  if (selectedMessageIds.value.size === 0) {
    exitSelectionMode()
  }
}

/**
 * Select message (from context menu)
 */
function selectMessage() {
  if (contextMenuMessage.value) {
    enterSelectionMode(contextMenuMessage.value.id)
  }
}

/**
 * Open forward dialog for selected messages
 */
async function forwardSelectedMessages() {
  if (selectedMessageIds.value.size === 0)
    return

  showForwardDialog.value = true
  forwardTargetConversations.value = []
  forwardSearchQuery.value = ''
}

/**
 * Toggle conversation selection for forward
 */
function toggleForwardConversation(conversationId: string) {
  const index = forwardTargetConversations.value.indexOf(conversationId)
  if (index > -1) {
    forwardTargetConversations.value.splice(index, 1)
  }
  else {
    forwardTargetConversations.value.push(conversationId)
  }
}

/**
 * Close forward dialog
 */
function closeForwardDialog() {
  showForwardDialog.value = false
  forwardTargetConversations.value = []
  forwardSearchQuery.value = ''
}

/**
 * Confirm and execute forward
 */
async function confirmForward() {
  if (forwardTargetConversations.value.length === 0 || selectedMessageIds.value.size === 0)
    return

  isForwarding.value = true

  try {
    // Get selected messages
    const messagesToForward = messages.value.filter(m =>
      selectedMessageIds.value.has(m.id),
    )

    // Combine message texts
    const combinedText = messagesToForward.map(m => m.text).join('\n')

    // Forward to each selected conversation
    for (const targetConvId of forwardTargetConversations.value) {
      await api.post(`/zalo/messages/forward`, {
        message: combinedText,
        conversationIds: [targetConvId],
        referenceMessageId: messagesToForward[0]?.id,
      })
    }

    showToastNotification(`Đã chuyển tiếp tin nhắn đến ${forwardTargetConversations.value.length} cuộc trò chuyện`, 'success')

    // Close dialog and exit selection mode
    closeForwardDialog()
    exitSelectionMode()
  }
  catch (error) {
    console.error('Error forwarding messages:', error)
    showToastNotification('Không thể chia sẻ tin nhắn. Vui lòng thử lại.', 'error')
  }
  finally {
    isForwarding.value = false
  }
}

/**
 * Filtered conversations for forward dialog
 */
const forwardFilteredConversations = computed(() => {
  if (!forwardSearchQuery.value.trim()) {
    return conversations.value.filter(c => c.id !== activeConversationId.value)
  }

  const query = forwardSearchQuery.value.toLowerCase()
  return conversations.value.filter(
    c => c.id !== activeConversationId.value && c.name.toLowerCase().includes(query),
  )
})

/**
 * Show toast notification
 */
function showToastNotification(message: string, type: 'success' | 'error' | 'info' = 'success') {
  toastMessage.value = message
  toastType.value = type
  showToast.value = true

  // Clear existing timeout
  if (toastTimeout) {
    clearTimeout(toastTimeout)
  }

  // Auto hide after 3 seconds
  toastTimeout = setTimeout(() => {
    showToast.value = false
  }, 3000)
}

/**
 * Undo/recall message
 */
async function undoMessage(message?: Message) {
  const msg = message || contextMenuMessage.value
  if (!msg)
    return

  closeContextMenu()

  if (msg.senderId !== currentUserId.value) {
    showToastNotification('Bạn chỉ có thể thu hồi tin nhắn của mình', 'error')
    return
  }

  try {
    // Parse conversationId to get threadId and threadType
    const conversationId = activeConversationId.value
    let threadId = conversationId
    let threadType = 1 // Default to User (direct chat)

    // Determine thread type based on conversation
    const conversation = conversations.value.find(c => c.id === conversationId)
    if (conversation) {
      threadType = conversation.type === 'group' ? 2 : 1
    }

    const response = await api.post(`/zalo/messages/${msg.id}/undo`, {
      threadId,
      threadType,
    })

    if (response.data.success) {
      // Update local message
      const msgIndex = messages.value.findIndex(m => m.id === msg.id)
      if (msgIndex !== -1) {
        messages.value[msgIndex]!.isUndone = true
        messages.value[msgIndex]!.text = 'Tin nhắn đã được thu hồi'
      }

      // ✅ Reload conversations to update lastMessage
      await loadConversations()

      showToastNotification('Đã thu hồi tin nhắn', 'success')
    }
    else {
      showToastNotification(response.data.message || 'Không thể thu hồi tin nhắn', 'error')
    }
  }
  catch (error: any) {
    console.error('Error undoing message:', error)
    showToastNotification(error.response?.data?.message || 'Không thể thu hồi tin nhắn', 'error')
  }
}

/**
 * Delete message (only for current user)
 */
async function deleteMessage(message?: Message) {
  const msg = message || contextMenuMessage.value
  if (!msg)
    return

  closeContextMenu()

  try {
    // Parse conversationId to get threadId and threadType
    const conversationId = activeConversationId.value
    let threadId = conversationId
    let threadType = 1

    const conversation = conversations.value.find(c => c.id === conversationId)
    if (conversation) {
      threadType = conversation.type === 'group' ? 2 : 1
    }

    const response = await api.delete(`/zalo/messages/${msg.id}`, {
      params: {
        threadId,
        threadType,
      },
    })

    if (response.data.success) {
      // Remove from local messages
      const msgIndex = messages.value.findIndex(m => m.id === msg.id)
      if (msgIndex !== -1) {
        messages.value.splice(msgIndex, 1)
      }

      // ✅ Update conversation lastMessage immediately from response
      const responseData = response.data.data
      console.log('[UI DELETE] Response data:', {
        conversationId: responseData?.conversationId,
        activeConversationId: activeConversationId.value,
        newLastMessage: responseData?.newLastMessage,
        conversationsCount: conversations.value.length,
      })

      if (responseData?.conversationId && responseData?.newLastMessage) {
        const conv = conversations.value.find(c => c.id === responseData.conversationId)
        console.log('[UI DELETE] Found conversation:', !!conv, conv?.id)
        if (conv) {
          conv.lastMessage = responseData.newLastMessage.content || ''
          conv.timestamp = formatTime(responseData.newLastMessage.time)
          conv.timestampRaw = responseData.newLastMessage.time
          conv.lastMessageTimestamp = new Date(responseData.newLastMessage.time).getTime()
          console.log('[UI DELETE] ✅ Updated conversation lastMessage to:', responseData.newLastMessage.content)

          // Force re-sort and trigger reactivity
          sortConversations()
        }
        else {
          console.warn('[UI DELETE] ⚠️ Conversation not found in list:', responseData.conversationId)
        }
      }
      else if (responseData?.conversationId && !responseData?.newLastMessage) {
        // No messages left - clear lastMessage
        const conv = conversations.value.find(c => c.id === responseData.conversationId)
        if (conv) {
          conv.lastMessage = ''
          conv.timestamp = ''
        }
      }

      // ✅ Force reload conversations from backend to ensure sync
      setTimeout(async () => {
        await loadConversations()
        console.log('[UI DELETE] Reloaded conversations from backend')
      }, 200)

      showToastNotification('Đã xóa tin nhắn', 'success')
    }
    else {
      showToastNotification(response.data.message || 'Không thể xóa tin nhắn', 'error')
    }
  }
  catch (error: any) {
    console.error('Error deleting message:', error)
    showToastNotification(error.response?.data?.message || 'Không thể xóa tin nhắn', 'error')
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
 * Scroll messages container to bottom
 */
function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

/**
 * Navigate to quoted message (scroll and highlight)
 */
function navigateToMessage(messageId: string) {
  const messageElement = document.querySelector(`[data-message-id="${messageId}"]`)
  if (messageElement) {
    messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })

    // Highlight temporarily
    highlightedMessageId.value = messageId
    setTimeout(() => {
      highlightedMessageId.value = null
    }, 2000)
  }
}

// Initialize WebSocket connection using direct Directus SDK
async function initializeWebSocket() {
  try {
    console.log('[WebSocket] Initializing WebSocket connection...')

    // Get session token from endpoint
    const tokenResponse = await api.get('/zalo/get-session-token')
    const sessionToken = tokenResponse.data?.sessionToken

    console.log('[WebSocket] Session token received:', !!sessionToken)

    if (!sessionToken) {
      console.warn('[WebSocket] No session token, skipping WebSocket init')
      return
    }

    // Set token and connect
    await directusClient.setToken(sessionToken)
    console.log('[WebSocket] Token set, connecting...')

    await directusClient.connect()
    console.log('[WebSocket] Connected successfully')

    websocketConnected.value = true
    websocketAuthenticated.value = true

    // Subscribe to global conversations for real-time updates
    await subscribeToAllConversations()

    // Subscribe to messages globally (all conversations)
    await subscribeToAllMessages()
  }
  catch (error) {
    console.error('[WebSocket] Failed to initialize:', error)
  }
}

// Subscribe to all conversations for global updates
async function subscribeToAllConversations() {
  try {
    console.log('[WebSocket] Subscribing to conversations...')

    // Subscribe to conversation creation
    const createSub = await directusClient.subscribe('zalo_conversations', {
      event: 'create',
      query: {
        fields: ['*'],
      },
      uid: 'conversations-create',
    })

    console.log('[WebSocket] Subscribed to conversation create events')

    // Subscribe to conversation updates (when new messages arrive)
    const updateSub = await directusClient.subscribe('zalo_conversations', {
      event: 'update',
      query: {
        fields: ['*'],
      },
      uid: 'conversations-update',
    })

    console.log('[WebSocket] Subscribed to conversation update events')

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

// Subscribe to messages globally (all conversations)
async function subscribeToAllMessages() {
  try {
    console.log('[WebSocket] Subscribing to ALL messages (global subscription)')

    // If there's an existing messageUnsubscribe from old logic, clear it
    if (messageUnsubscribe) {
      messageUnsubscribe()
      messageUnsubscribe = null
    }

    const { subscription, unsubscribe } = await directusClient.subscribe('zalo_messages', {
      event: 'create',
      query: {
        fields: ['*', 'sender_id.*', 'reply_to_message_id.*', 'reply_to_message_id.sender_id.*'],
        // no filter - listen to all conversations
        sort: ['sent_at'],
      },
      uid: 'messages-global',
    })

    messageUnsubscribe = unsubscribe

    ;(async () => {
      for await (const item of subscription) {
        if (item.type === 'subscription' && item.event === 'create') {
          if (!item.data || !Array.isArray(item.data) || item.data.length === 0) {
            continue
          }

          const messageData = item.data[0]
          if (!messageData || !messageData.id) {
            continue
          }

          const conversationId = messageData.conversation_id || messageData.conversationId

          // ⚠️ DON'T check or add to processedMessageIds here
          // Let handleNewMessage() or updateConversationOnNewMessage() handle it
          // This allows messages to be properly added to UI when conversation is active

          // Always update conversation preview
          updateConversationOnNewMessage(conversationId, messageData)

          // Only add to messages list if it's the active conversation
          console.log('[WebSocket] Checking if message is for active conversation:', {
            messageConversationId: conversationId,
            activeConversationId: activeConversationId.value,
            shouldAdd: conversationId === activeConversationId.value,
            messageId: messageData.id,
          })

          if (conversationId === activeConversationId.value) {
            console.log('[WebSocket] Adding message to active conversation UI')
            handleNewMessage({ conversationId, message: messageData })
          }
          else {
            console.log('[WebSocket] Message is for different conversation, only updating preview')
          }
        }
      }
    })().catch((err) => {
      console.error('[WebSocket] Global message subscription error:', err)
    })
  }
  catch (error) {
    console.error('[WebSocket] Failed to subscribe to all messages:', error)
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

  console.log('[UI] handleNewMessage called with full data:', {
    rawData: data,
    extractedMessageData: messageData,
    extractedConversationId: conversationId,
    messageId: messageData?.id,
    activeConversationId: activeConversationId.value,
    replyToMessageId: messageData?.reply_to_message_id,
    replyToType: typeof messageData?.reply_to_message_id,
    hasReplyTo: !!messageData?.reply_to_message_id,
    messageDataKeys: Object.keys(messageData || {}),
  })

  // ✅ COMPREHENSIVE FILTER: Block system events (delete/undo notifications)
  // System events have signature: type + actionType + (clientDelMsgId OR globalDelMsgId)
  const messageText = messageData.content || messageData.text || ''

  if (messageText && messageText.trim()) {
    let contentToCheck = messageText.trim()
    let maxDepth = 3

    // Multi-level JSON unwrapping
    while (maxDepth > 0 && (contentToCheck.startsWith('{') || contentToCheck.startsWith('['))) {
      try {
        const parsed = JSON.parse(contentToCheck)
        const data = Array.isArray(parsed) ? parsed[0] : parsed

        // Check comprehensive system event signature
        if (typeof data === 'object' && data !== null) {
          const hasSystemEventSignature = (
            (data.type !== undefined && data.actionType !== undefined)
            && (data.clientDelMsgId !== undefined || data.globalDelMsgId !== undefined)
          )

          if (hasSystemEventSignature) {
            console.log('[UI] ✅ BLOCKING real-time system event:', {
              messageId: messageData.id,
              type: data.type,
              actionType: data.actionType,
            })

            // Extract the message ID to delete
            const msgIdToDelete = data.globalDelMsgId || data.clientDelMsgId
            if (msgIdToDelete) {
              // Remove the deleted message from UI
              const index = messages.value.findIndex(m => m.id === String(msgIdToDelete))
              if (index !== -1) {
                console.log('[UI] Removing deleted message from UI:', msgIdToDelete)
                messages.value.splice(index, 1)
              }
            }

            // Don't add this system event message to UI
            return
          }
        }

        // Try to unwrap one more level
        if (typeof parsed === 'string') {
          contentToCheck = parsed.trim()
        }
        else if (typeof data === 'string') {
          contentToCheck = data.trim()
        }
        else {
          break
        }
      }
      catch {
        break
      }

      maxDepth--
    }
  }

  if (conversationId !== activeConversationId.value) {
    console.log('[UI] Message not for active conversation, skipping UI update')
    // Still update conversation preview even if not active
    updateConversationOnNewMessage(conversationId, messageData)
    return
  }

  const messageId = messageData.id
  const clientId = messageData.client_id || messageData.clientId

  // Check if already processed
  if (processedMessageIds.has(messageId)) {
    return
  }

  processedMessageIds.add(messageId)

  // Check if this is replacing an optimistic update
  if (clientId) {
    const optimisticIndex = messages.value.findIndex(m => m.clientId === clientId)
    if (optimisticIndex !== -1) {
      // Replace optimistic message with real one
      const senderIdRaw = messageData.sender_id || messageData.senderId
      const senderId = typeof senderIdRaw === 'object' ? senderIdRaw?.id : senderIdRaw
      const senderName = typeof senderIdRaw === 'object' ? senderIdRaw?.display_name : (messageData.sender_name || messageData.senderName || 'Unknown')
      const senderAvatar = typeof senderIdRaw === 'object' ? senderIdRaw?.avatar_url : messageData.avatar
      const direction = senderId === currentUserId.value ? 'out' : 'in'

      // Build quote object if this is a reply
      let quoteData = null
      if (messageData.reply_to_message_id) {
        if (typeof messageData.reply_to_message_id === 'object') {
          // reply_to_message_id is already expanded object
          const quotedMsg = messageData.reply_to_message_id
          quoteData = {
            msgId: quotedMsg.id,
            content: quotedMsg.content || '',
            senderName: quotedMsg.sender_id?.display_name || 'Unknown',
            avatar: quotedMsg.sender_id?.avatar_url || null,
          }
          console.log('[UI] Built quote data from object (replace optimistic):', quoteData)
        }
        else if (typeof messageData.reply_to_message_id === 'string') {
          // reply_to_message_id is just an ID string, find the message in local messages
          const quotedMsg = messages.value.find(m => m.id === messageData.reply_to_message_id)
          if (quotedMsg) {
            quoteData = {
              msgId: quotedMsg.id,
              content: quotedMsg.text || '',
              senderName: quotedMsg.senderName || 'Unknown',
              avatar: quotedMsg.avatar || null,
            }
            console.log('[UI] Built quote data from local message (replace optimistic):', quoteData)
          }
          else {
            console.log('[UI] Could not find quoted message in local messages:', messageData.reply_to_message_id)
          }
        }
      }

      messages.value[optimisticIndex] = {
        id: messageId,
        direction,
        text: messageData.content || messageData.text || '',
        senderName,
        senderId,
        time: messageData.sent_at || messageData.time || new Date().toISOString(),
        avatar: senderAvatar,
        status: direction === 'out' ? 'sent' : undefined,
        files: messageData.attachments || [],
        reactions: messageData.reactions || [],
        isEdited: messageData.is_edited || messageData.isEdited || false,
        isUndone: messageData.is_undone || messageData.isUndone || false,
        clientId,
        rawData: messageData.raw_data || messageData.rawData || null,
        quote: quoteData,
      }
      return
    }
  }

  // Check if message already exists (by ID)
  const exists = messages.value.some(m => m.id === messageId)
  if (exists) {
    return
  }

  // Add new message
  const senderIdRaw = messageData.sender_id || messageData.senderId
  const senderId = typeof senderIdRaw === 'object' ? senderIdRaw?.id : senderIdRaw
  const senderName = typeof senderIdRaw === 'object' ? senderIdRaw?.display_name : (messageData.sender_name || messageData.senderName || 'Unknown')
  const senderAvatar = typeof senderIdRaw === 'object' ? senderIdRaw?.avatar_url : messageData.avatar
  const direction = senderId === currentUserId.value ? 'out' : 'in'

  // Build quote object if this is a reply
  let quoteData = null
  if (messageData.reply_to_message_id) {
    if (typeof messageData.reply_to_message_id === 'object') {
      // reply_to_message_id is already expanded object
      const quotedMsg = messageData.reply_to_message_id
      quoteData = {
        msgId: quotedMsg.id,
        content: quotedMsg.content || '',
        senderName: quotedMsg.sender_id?.display_name || 'Unknown',
        avatar: quotedMsg.sender_id?.avatar_url || null,
      }
      console.log('[UI] Built quote data from object (push new):', quoteData)
    }
    else if (typeof messageData.reply_to_message_id === 'string') {
      // reply_to_message_id is just an ID string, find the message in local messages
      const quotedMsg = messages.value.find(m => m.id === messageData.reply_to_message_id)
      if (quotedMsg) {
        quoteData = {
          msgId: quotedMsg.id,
          content: quotedMsg.text || '',
          senderName: quotedMsg.senderName || 'Unknown',
          avatar: quotedMsg.avatar || null,
        }
        console.log('[UI] Built quote data from local message (push new):', quoteData)
      }
      else {
        console.log('[UI] Could not find quoted message in local messages:', messageData.reply_to_message_id)
      }
    }
  }

  // Try to get attachments - fetch async in background if needed
  let attachments = messageData.attachments || []

  // If no attachments in message data, try to fetch them
  if ((!attachments || attachments.length === 0) && messageId) {
    // Fetch attachments asynchronously
    ;(async () => {
      try {
        const attachmentsResponse = await api.get(`/items/zalo_attachments`, {
          params: {
            filter: { message_id: { _eq: messageId } },
            fields: ['id', 'url', 'file_name', 'mime_type', 'file_size', 'width', 'height', 'thumbnail_url'],
          },
        })

        if (attachmentsResponse?.data?.data && attachmentsResponse.data.data.length > 0) {
          const baseUrl = window.location.origin
          const fetchedAttachments = attachmentsResponse.data.data.map((att: any) => ({
            id: att.id,
            url: att.url.startsWith('http') ? att.url : `${baseUrl}${att.url}`,
            filename: att.file_name,
            type: att.mime_type,
            size: att.file_size,
            width: att.width,
            height: att.height,
            thumbnail: att.thumbnail_url || att.url,
          }))

          // Update message with attachments
          const msgIndex = messages.value.findIndex(m => m.id === messageId)
          if (msgIndex !== -1) {
            messages.value[msgIndex].files = fetchedAttachments
          }
        }
      }
      catch (error) {
        console.error('Failed to fetch attachments for message:', messageId, error)
      }
    })()
  }

  messages.value.push({
    id: messageId,
    direction,
    text: messageData.content || messageData.text || '',
    senderName,
    senderId,
    time: messageData.sent_at || messageData.time || new Date().toISOString(),
    avatar: senderAvatar,
    status: direction === 'out' ? 'sent' : undefined,
    files: attachments,
    reactions: messageData.reactions || [],
    isEdited: messageData.is_edited || messageData.isEdited || false,
    isUndone: messageData.is_undone || messageData.isUndone || false,
    clientId,
    rawData: messageData.raw_data || messageData.rawData || null,
    quote: quoteData,
  })

  updateConversationOnNewMessage(conversationId, messageData)

  // Auto scroll to bottom
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
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

  console.log('[UI] Selecting conversation:', id)

  isSelectingConversation = true

  activeConversationId.value = id
  messages.value = []
  processedMessageIds.clear()

  const conversation = conversations.value.find(c => c.id === id)
  if (conversation && conversation.unreadCount > 0) {
    conversation.unreadCount = 0
  }

  // Load initial messages
  loadMessages(id).finally(() => {
    // With global subscription enabled we don't need to subscribe per-conversation
    if (!(websocketConnected.value && websocketAuthenticated.value)) {
      console.warn('[UI] WebSocket not connected, skipping realtime updates')
    }

    isSelectingConversation = false
  })
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

    const newConversations = data
      .map((conv: any) => {
        const rawTimestamp = conv.timestamp || conv.lastMessageTime || new Date().toISOString()
        const timestampDate = new Date(rawTimestamp)
        const timestampMs = timestampDate.getTime()

        let lastMessage = conv.lastMessage || ''

        // Check if lastMessage is JSON system event
        if (lastMessage && lastMessage.trim()) {
          const trimmed = lastMessage.trim()
          // Check if it's JSON with "type" and "actionType" (system event)
          if ((trimmed.startsWith('{') || trimmed.startsWith('['))
            && trimmed.includes('"type":') && trimmed.includes('"actionType":')) {
            console.warn('[UI] Hiding system event JSON in conversation:', conv.id)
            lastMessage = '' // Hide JSON system events
          }
        }

        return {
          id: conv.id,
          name: conv.name || 'Unknown',
          avatar: conv.avatar || `https://ui-avatars.com/api?name=U&background=random`,
          lastMessage,
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

    //  DEDUPLICATE: If multiple conversations have same name, keep the newest one
    const conversationMap = new Map<string, any>()
    newConversations.forEach((conv: any) => {
      const existing = conversationMap.get(conv.name)
      if (!existing || conv.lastMessageTimestamp > existing.lastMessageTimestamp) {
        // Keep newer conversation (or first if no existing)
        conversationMap.set(conv.name, conv)
      }
      else {
        console.log('[UI] 🗑️ Removing duplicate conversation:', {
          name: conv.name,
          id: conv.id,
          kept: existing.id,
        })
      }
    })
    const deduplicatedConversations = Array.from(conversationMap.values())

    // ✅ CHỈ update nếu có thay đổi thực sự
    const hasConversationChanges = conversations.value.length !== deduplicatedConversations.length
      || JSON.stringify(conversations.value.map((c: Conversation) => ({ id: c.id, lastMessage: c.lastMessage, unreadCount: c.unreadCount })))
      !== JSON.stringify(deduplicatedConversations.map((c: Conversation) => ({ id: c.id, lastMessage: c.lastMessage, unreadCount: c.unreadCount })))

    if (hasConversationChanges) {
      console.warn('🔄 Conversations changed, updating...')
      conversations.value = deduplicatedConversations
      sortConversations()
    }
    else {
      console.warn('✅ No conversation changes, skip update')
    }

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

    console.log('[UI] Loaded messages from GET endpoint:', {
      totalMessages: data.length,
      messagesWithQuote: data.filter((m: any) => m.quote).length,
      sampleMessageWithQuote: data.find((m: any) => m.quote),
    })

    messages.value = data
      .filter((msg: any) => {
        // ✅ COMPREHENSIVE FILTER: Block system events (delete/undo notifications)
        // System events have signature: type + actionType + (clientDelMsgId OR globalDelMsgId)
        const text = msg.text || ''

        if (!text || !text.trim()) {
          return true // Keep empty messages
        }

        const trimmed = text.trim()

        // Multi-level JSON unwrapping (up to 3 levels deep)
        let contentToCheck = trimmed
        let maxDepth = 3

        while (maxDepth > 0 && (contentToCheck.startsWith('{') || contentToCheck.startsWith('['))) {
          try {
            const parsed = JSON.parse(contentToCheck)
            const data = Array.isArray(parsed) ? parsed[0] : parsed

            // Check comprehensive system event signature
            if (typeof data === 'object' && data !== null) {
              const hasSystemEventSignature = (
                (data.type !== undefined && data.actionType !== undefined)
                && (data.clientDelMsgId !== undefined || data.globalDelMsgId !== undefined)
              )

              if (hasSystemEventSignature) {
                console.log('[UI] ✅ BLOCKING system event message:', {
                  id: msg.id,
                  type: data.type,
                  actionType: data.actionType,
                  hasDelMsgId: !!(data.clientDelMsgId || data.globalDelMsgId),
                })
                return false
              }
            }

            // Try to unwrap one more level if still stringified
            if (typeof parsed === 'string') {
              contentToCheck = parsed.trim()
            }
            else if (typeof data === 'string') {
              contentToCheck = data.trim()
            }
            else {
              break // No more unwrapping possible
            }
          }
          catch {
            // Not valid JSON, stop unwrapping
            break
          }

          maxDepth--
        }

        return true
      })
      .map((msg: any) => ({
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
        rawData: msg.rawData || null, // Store raw data
        quote: msg.quote || null, // Map quote data for reply display
      }))

    // Auto scroll to bottom after loading
    nextTick(() => {
      // Add small delay to ensure DOM is fully rendered
      setTimeout(() => {
        if (messagesContainer.value) {
          messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
        }
      }, 100)
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

  // ✅ Chỉ sort nếu conversation này cần lên đầu
  // Check xem có cần move lên đầu không
  const currentIndex = conversations.value.findIndex(c => c.id === conversationId)
  if (currentIndex > 0) {
    const prevConv = conversations.value[0]
    // Chỉ sort nếu conversation này có timestamp mới hơn conversation đầu tiên
    if (prevConv && messageTimestamp > prevConv.lastMessageTimestamp) {
      sortConversations()
    }
  }
}

function removeMember(memberId: string) {
  const index = selectedMembers.value.indexOf(memberId)
  if (index > -1) {
    selectedMembers.value.splice(index, 1)
  }
}

function _autoResize(event: Event) {
  const textarea = event.target as HTMLTextAreaElement
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
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

      // Get base URL for assets
      const baseUrl = window.location.origin

      // Create attachments from uploaded files
      const newAttachments: FileAttachment[] = result.success.map(file => ({
        id: file.id,
        filename: file.filename_download,
        type: file.type,
        size: file.filesize,
        url: `${baseUrl}/assets/${file.id}`,
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

function insertEmoji(event: any) {
  const emoji = event?.emoji || event?.detail?.unicode || event
  if (emoji) {
    handleEmojiInsert(emoji, { value: messageInputRef.value }, { value: messageText.value })
  }
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

// 🔍 Debug: Track scroll position changes
watchEffect(() => {
  if (messagesContainer.value) {
    console.warn('📍 ScrollTop changed:', messagesContainer.value.scrollTop)
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
      <!-- Selection Action Bar - Shows when in selection mode -->
      <div
        v-if="isSelectionMode"
        class="fixed top-0 left-0 right-0 z-50 bg-blue-500 text-white px-6 py-4 shadow-lg flex items-center justify-between"
      >
        <div class="flex items-center gap-4">
          <button
            class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
            @click="exitSelectionMode"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M15 5L5 15M5 5L15 15"
                stroke="white"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </button>
          <span class="font-semibold text-lg">
            {{ selectedMessageIds.size }} selected
          </span>
        </div>

        <div class="flex items-center gap-3">
          <button
            class="px-4 py-2 rounded-lg hover:bg-white/20 transition-colors font-medium"
            @click="selectAllMessages"
          >
            Select All
          </button>
          <button
            v-if="selectedMessageIds.size > 0"
            class="px-4 py-2 rounded-lg hover:bg-white/20 transition-colors font-medium flex items-center gap-2"
            @click="forwardSelectedMessages"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M9 3L15 9M15 9L9 15M15 9H3"
                stroke="white"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            Forward
          </button>
          <button
            v-if="selectedMessageIds.size > 0"
            class="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg transition-colors font-medium flex items-center gap-2"
            @click="deleteSelectedMessages"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3 5H15M6 5V3H12V5M7 9V13M11 9V13M4 5L5 15H13L14 5"
                stroke="white"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            Delete
          </button>
        </div>
      </div>

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
                class="group flex gap-4 px-8 py-3 transition-all duration-300 relative"
                :class="[
                  {
                    'justify-center': message.type === 'system',
                    'justify-start': message.type !== 'system',
                    'bg-gray-200': highlightedMessageId === message.id,
                    'bg-blue-50': isSelectionMode && selectedMessageIds.has(message.id),
                  },
                ]"
                @mousedown="message.type !== 'system' ? handleLongPressStart($event, message.id) : null"
                @mouseup="message.type !== 'system' ? handleLongPressEnd() : null"
                @mouseleave="message.type !== 'system' ? handleLongPressEnd() : null"
                @touchstart="message.type !== 'system' ? handleLongPressStart($event, message.id) : null"
                @touchend="message.type !== 'system' ? handleLongPressEnd() : null"
                @click="message.type !== 'system' ? handleMessageClick(message.id) : null"
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
                  <!-- Selection Checkbox (only in selection mode) -->
                  <div
                    v-if="isSelectionMode"
                    class="w-6 h-6 flex items-center justify-center flex-shrink-0 mt-14"
                  >
                    <div
                      class="w-5 h-5 rounded border-2 flex items-center justify-center transition-all"
                      :class="
                        selectedMessageIds.has(message.id)
                          ? 'bg-blue-500 border-blue-500'
                          : 'bg-white border-gray-300'
                      "
                    >
                      <svg
                        v-if="selectedMessageIds.has(message.id)"
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M2 6L5 9L10 3"
                          stroke="white"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </div>
                  </div>

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

                  <div class="flex flex-col max-w-[70%] relative">
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
                            style="min-height: 200px; background: #f3f4f6;"
                            loading="eager"
                            @click="openFileInNewTab(file.url)"
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
                            @click="openFileInNewTab(file.url)"
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
                      v-if="message.text && !message.text.startsWith('📎')"
                      class="rounded-lg max-w-full break-words text-sm text-text-secondary leading-relaxed border-neutral-200"
                    >
                      <!-- Quoted/Replied Message - Discord style -->
                      <div
                        v-if="message.quote"
                        class="mb-1.5 flex items-start gap-2 cursor-pointer hover:bg-gray-50 -ml-1 pl-1 pr-2 py-1 rounded transition-colors"
                        @click="navigateToMessage(message.quote.msgId)"
                      >
                        <!-- Reply line -->
                        <div class="flex flex-col items-center pt-1">
                          <div class="w-0.5 h-2.5 bg-gray-300 rounded-full" />
                          <div class="w-0.5 h-2.5 bg-gray-300 rounded-full -mt-0.5" />
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" class="-ml-0.5 -mt-0.5">
                            <path d="M1.5 5 L1.5 2.5 Q1.5 1.5 2.5 1.5 L8 1.5" stroke="#D1D5DB" stroke-width="1.5" stroke-linecap="round" />
                          </svg>
                        </div>

                        <!-- Avatar + Content -->
                        <div class="flex items-start gap-1.5 min-w-0 flex-1">
                          <!-- Small avatar -->
                          <div class="w-4 h-4 rounded-full overflow-hidden bg-gray-200 flex-shrink-0 mt-0.5">
                            <img
                              :src="message.quote.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(message.quote.senderName?.charAt(0) || '?')}&background=random&size=16`"
                              :alt="message.quote.senderName"
                              class="w-full h-full object-cover"
                            >
                          </div>

                          <!-- Name + message preview -->
                          <div class="flex flex-col min-w-0 flex-1">
                            <span class="text-xs font-semibold text-gray-700">
                              {{ message.quote.senderName || 'Someone' }}
                            </span>
                            <span class="text-xs text-gray-500 truncate">
                              {{ message.quote.content }}
                            </span>
                          </div>
                        </div>
                      </div>

                      <!-- Message text -->
                      <p v-if="!message.isUndone" class="whitespace-pre-wrap pr-2">
                        {{ message.text }}
                      </p>
                      <p v-else class="italic text-neutral-400 text-xs">
                        Tin nhắn đã được thu hồi
                      </p>
                    </div>

                    <!-- Quick action icons (Reply, Forward, More) - Positioned absolutely on the right -->
                    <div
                      v-if="!message.isUndone"
                      class="opacity-0 group-hover:opacity-100 absolute -right-2 top-0 flex items-center gap-0.5 transition-opacity"
                      style="transform: translateX(100%);"
                    >
                      <!-- Quote/Reply icon (format_quote style) -->
                      <button
                        class="w-8 h-8 flex items-center justify-center rounded-full bg-white hover:bg-gray-200 transition-colors shadow-sm"
                        title="Trả lời"
                        @click.stop="replyToMessage(message)"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z" fill="#6B7280" />
                        </svg>
                      </button>

                      <!-- Forward icon (zi-share-solid - mũi tên cong sang phải) -->
                      <button
                        class="w-8 h-8 flex items-center justify-center rounded-full bg-white hover:bg-gray-200 transition-colors shadow-sm"
                        title="Chuyển tiếp"
                        @click.stop="quickForwardMessage(message)"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z" fill="#6B7280" />
                        </svg>
                      </button>

                      <!-- More menu icon (3 chấm ngang) -->
                      <button
                        class="w-8 h-8 flex items-center justify-center rounded-full bg-white hover:bg-gray-200 transition-colors shadow-sm"
                        title="Tùy chọn khác"
                        @click.stop="showMessageContextMenu($event, message)"
                      >
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="4" cy="10" r="1.5" fill="#6B7280" />
                          <circle cx="10" cy="10" r="1.5" fill="#6B7280" />
                          <circle cx="16" cy="10" r="1.5" fill="#6B7280" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>
          <!-- End Messages Content -->
        </div>

        <!-- Reply Preview Bar -->
        <div
          v-if="replyingTo"
          class="reply-preview-bar"
        >
          <div class="flex items-center gap-3 px-4 py-3 bg-blue-50 border-t border-blue-200">
            <!-- Reply Icon -->
            <div class="flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 5L4 10L8 15M4 10H16" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>

            <!-- Reply Content -->
            <div class="flex-1 min-w-0">
              <div class="text-xs font-medium text-blue-600">
                Trả lời {{ replyingTo.senderName }}
              </div>
              <div class="text-sm text-gray-600 truncate mt-0.5">
                {{ replyingTo.text }}
              </div>
            </div>

            <!-- Close Button -->
            <button
              class="flex-shrink-0 p-2 hover:bg-blue-100 rounded-md transition-colors"
              @click="cancelReply"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 4L4 12M4 4L12 12" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
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

    <!-- Context Menu (Zalo-style) -->
    <Teleport to="body">
      <div
        v-if="showContextMenu"
        :style="{
          position: 'fixed',
          left: `${contextMenuPosition.x}px`,
          top: `${contextMenuPosition.y}px`,
          zIndex: 9999,
        }"
        class="context-menu"
      >
        <div class="bg-white rounded-lg shadow-lg border border-neutral-200 py-2 min-w-[200px]">
          <!-- Copy message -->
          <button
            class="w-full px-4 py-2 text-left hover:bg-neutral-50 flex items-center gap-3 text-sm"
            @click="copyMessage"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="5" y="5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1.5" />
              <path d="M3 11V3C3 2.45 3.45 2 4 2H10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
            <span>Copy tin nhắn</span>
          </button>

          <!-- Reply to message -->
          <button
            class="w-full px-4 py-2 text-left hover:bg-neutral-50 flex items-center gap-3 text-sm"
            @click="replyToMessage()"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 4L3 8L6 12M3 8H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span>Trả lời</span>
          </button>

          <!-- Forward message -->
          <button
            class="w-full px-4 py-2 text-left hover:bg-neutral-50 flex items-center gap-3 text-sm"
            @click="quickForwardMessage(contextMenuMessage!)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 4L13 8L10 12M13 8H3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span>Chuyển tiếp</span>
          </button>

          <!-- Select multiple messages -->
          <button
            class="w-full px-4 py-2 text-left hover:bg-neutral-50 flex items-center gap-3 text-sm border-b border-neutral-100"
            @click="selectMessage"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5" />
              <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5" />
              <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5" />
              <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5" />
            </svg>
            <span>Chọn nhiều tin nhắn</span>
          </button>

          <!-- Recall message (only for own messages) -->
          <button
            v-if="contextMenuMessage?.senderId === currentUserId"
            class="w-full px-4 py-2 text-left hover:bg-red-50 flex items-center gap-3 text-sm text-red-600"
            @click="undoMessage()"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 8C3 5.24 5.24 3 8 3C9.65 3 11.1 3.77 12 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              <path d="M10 5H12.5V7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span>Thu hồi</span>
          </button>

          <!-- Delete message (for all messages) -->
          <button
            class="w-full px-4 py-2 text-left hover:bg-red-50 flex items-center gap-3 text-sm text-red-600"
            @click="deleteMessage()"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 4H13M5 4V3C5 2.45 5.45 2 6 2H10C10.55 2 11 2.45 11 3V4M6.5 7.5V11.5M9.5 7.5V11.5M4 4H12L11 13C11 13.55 10.55 14 10 14H6C5.45 14 5 13.55 5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span>Xóa chỉ ở phía tôi</span>
          </button>
        </div>
      </div>
    </Teleport>

    <!-- Forward Dialog -->
    <Teleport to="body">
      <div
        v-if="showForwardDialog"
        class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50"
        @click.self="closeForwardDialog"
      >
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
          <!-- Header -->
          <div class="px-6 py-4 border-b border-neutral-200">
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold text-neutral-900">
                Forward to
              </h3>
              <button
                class="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
                @click="closeForwardDialog"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              </button>
            </div>
            <p class="text-sm text-neutral-500 mt-1">
              {{ selectedMessageIds.size }} message(s) selected
            </p>
          </div>

          <!-- Search -->
          <div class="px-6 py-3 border-b border-neutral-200">
            <div class="relative">
              <svg
                class="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5" />
                <path d="M12 12L15.5 15.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
              <input
                v-model="forwardSearchQuery"
                type="text"
                placeholder="Search conversations..."
                class="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
            </div>
          </div>

          <!-- Conversation List -->
          <div class="flex-1 overflow-y-auto px-6 py-3">
            <div v-if="forwardFilteredConversations.length === 0" class="text-center py-8 text-neutral-500">
              No conversations found
            </div>
            <div v-else class="space-y-2">
              <button
                v-for="conv in forwardFilteredConversations"
                :key="conv.id"
                class="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-neutral-50 transition-colors"
                :class="forwardTargetConversations.includes(conv.id) ? 'bg-blue-50 hover:bg-blue-100' : ''"
                @click="toggleForwardConversation(conv.id)"
              >
                <!-- Checkbox -->
                <div
                  class="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0"
                  :class="forwardTargetConversations.includes(conv.id)
                    ? 'bg-blue-500 border-blue-500'
                    : 'border-neutral-300'"
                >
                  <svg
                    v-if="forwardTargetConversations.includes(conv.id)"
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M2 6L5 9L10 3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </div>

                <!-- Avatar -->
                <div class="relative flex-shrink-0">
                  <img
                    v-if="conv.avatar"
                    :src="conv.avatar"
                    :alt="conv.name"
                    class="w-10 h-10 rounded-full object-cover"
                    @error="(e) => handleImageError(e, conv.name)"
                  >
                  <div
                    v-else
                    class="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                    :style="{ background: `linear-gradient(135deg, #667eea 0%, #764ba2 100%)` }"
                  >
                    {{ getInitials(conv.name) }}
                  </div>
                </div>

                <!-- Info -->
                <div class="flex-1 min-w-0 text-left">
                  <div class="font-medium text-neutral-900 truncate">
                    {{ conv.name }}
                  </div>
                  <div class="text-xs text-neutral-500 truncate">
                    {{ conv.type === 'group' ? 'Group' : 'Direct' }}
                  </div>
                </div>
              </button>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-neutral-200 flex items-center justify-between">
            <div class="text-sm text-neutral-600">
              {{ forwardTargetConversations.length }} selected
            </div>
            <div class="flex gap-2">
              <button
                class="px-4 py-2 text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
                @click="closeForwardDialog"
              >
                Cancel
              </button>
              <button
                class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                :disabled="forwardTargetConversations.length === 0 || isForwarding"
                @click="confirmForward"
              >
                <svg
                  v-if="isForwarding"
                  class="animate-spin"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-opacity="0.25" />
                  <path d="M8 2C4.69 2 2 4.69 2 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
                <span>{{ isForwarding ? 'Forwarding...' : 'Forward' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Toast Notification -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="opacity-0 translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-200 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div
          v-if="showToast"
          class="fixed top-6 left-1/2 -translate-x-1/2 z-[10001] pointer-events-none"
        >
          <div
            class="bg-[#2D2D2D] text-white rounded-xl shadow-2xl px-6 py-4 flex items-center gap-4 min-w-[320px] max-w-md pointer-events-auto"
            :class="{
              'bg-[#2D2D2D]': toastType === 'success',
              'bg-red-600': toastType === 'error',
              'bg-blue-600': toastType === 'info',
            }"
          >
            <!-- Icon -->
            <div class="flex-shrink-0">
              <!-- Success Icon (Checkmark in Circle) -->
              <div v-if="toastType === 'success'" class="relative">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 32 32"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  class="animate-scale-in"
                >
                  <!-- Circle background -->
                  <circle
                    cx="16"
                    cy="16"
                    r="14"
                    stroke="white"
                    stroke-width="2"
                    fill="none"
                    class="animate-draw-circle"
                  />
                  <!-- Checkmark -->
                  <path
                    d="M9 16L14 21L23 11"
                    stroke="white"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="animate-draw-check"
                  />
                </svg>
              </div>

              <!-- Error Icon (X in Circle) -->
              <div v-if="toastType === 'error'">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 32 32"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="16" cy="16" r="14" stroke="white" stroke-width="2" fill="none" />
                  <path d="M11 11L21 21M21 11L11 21" stroke="white" stroke-width="2.5" stroke-linecap="round" />
                </svg>
              </div>

              <!-- Info Icon -->
              <div v-if="toastType === 'info'">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 32 32"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="16" cy="16" r="14" stroke="white" stroke-width="2" fill="none" />
                  <path d="M16 12V16M16 20V21" stroke="white" stroke-width="2.5" stroke-linecap="round" />
                </svg>
              </div>
            </div>

            <!-- Message -->
            <div class="flex-1 font-medium text-[15px] leading-snug">
              {{ toastMessage }}
            </div>

            <!-- Close button -->
            <button
              class="flex-shrink-0 p-1 hover:bg-white/10 rounded-lg transition-colors"
              @click="showToast = false"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M12 4L4 12M4 4L12 12" stroke="white" stroke-width="2" stroke-linecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
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

/* Toast Animations */
@keyframes scale-in {
  from {
    transform: scale(0);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes draw-circle {
  from {
    stroke-dasharray: 0 100;
  }
  to {
    stroke-dasharray: 88 100;
  }
}

@keyframes draw-check {
  from {
    stroke-dasharray: 0 50;
    opacity: 0;
  }
  to {
    stroke-dasharray: 50 50;
    opacity: 1;
  }
}

.animate-scale-in {
  animation: scale-in 0.3s ease-out;
}

.animate-draw-circle {
  stroke-dasharray: 88 100;
  animation: draw-circle 0.4s ease-out;
}

.animate-draw-check {
  stroke-dasharray: 50 50;
  animation: draw-check 0.3s ease-out 0.2s both;
}

/* Context menu styles */
.context-menu {
  animation: fadeIn 0.15s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Reply preview bar */
.reply-preview-bar {
  position: relative;
  z-index: 9;
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Selection mode styles */
.message-selectable {
  cursor: pointer;
  user-select: none;
}

.message-selected {
  background-color: #EFF6FF !important;
  border-left: 4px solid #3B82F6;
}

.selection-checkbox {
  transition: all 0.2s ease;
}

.selection-checkbox:hover {
  transform: scale(1.1);
}
</style>
