<script setup lang="ts">
import { useApi } from '@directus/extensions-sdk'
import { computed, nextTick, onMounted, ref, watch } from 'vue'

const api = useApi()

interface Conversation {
  id: string
  name: string
  avatar: string
  lastMessage: string
  timestamp: string
  unreadCount: number
  online: boolean
}

interface Message {
  id: string
  direction: 'in' | 'out'
  text: string
  senderName: string
  senderId: string
  time: string
  avatar?: string
  status?: 'sent' | 'delivered' | 'read'
}

// Reactive data
const searchQuery = ref('')
const navSearchQuery = ref('')
const messageText = ref('')
const activeConversationId = ref<string>('')
const messagesContainer = ref<HTMLElement | null>(null)
const conversations = ref<Conversation[]>([])
const messages = ref<Message[]>([])
const loading = ref(false)
const sendingMessage = ref(false)
const currentUserId = ref('')

// Get current user ID
async function getCurrentUser() {
  try {
    const response = await api.get('/users/me?fields=id')
    currentUserId.value = response.data.data.id
    console.log('Current user ID:', currentUserId.value)
  }
  catch (error) {
    console.error('Error getting current user:', error)
  }
}

// Computed properties
const filteredConversations = computed(() => {
  const query = navSearchQuery.value || searchQuery.value
  if (!query)
    return conversations.value

  return conversations.value.filter(conv =>
    conv.name.toLowerCase().includes(query.toLowerCase())
    || conv.lastMessage.toLowerCase().includes(query.toLowerCase()),
  )
})

const activeConversation = computed(() => {
  return conversations.value.find(conv => conv.id === activeConversationId.value)
})

// Load conversations từ zalo_messages (group by threadId)
async function loadConversations() {
  try {
    loading.value = true

    const response = await api.get('/items/zalo_messages', {
      params: {
        fields: ['id', 'threadId', 'senderId', 'senderName', 'content', 'timestamp'],
        sort: ['-timestamp'],
        limit: 1000,
      },
    })

    const allMessages = response.data.data
    console.log('✅ Loaded messages:', allMessages.length)

    // Group by threadId để tạo conversations
    const threadMap = new Map<string, any>()

    allMessages.forEach((msg: any) => {
      const threadId = msg.threadId

      if (!threadMap.has(threadId)) {
        threadMap.set(threadId, {
          id: threadId,
          name: msg.senderName || msg.senderId || 'Unknown',
          lastMessage: msg.content || '',
          timestamp: formatTime(msg.timestamp),
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.senderName || msg.senderId || 'U')}&background=random`,
          unreadCount: 0,
          online: true,
        })
      }
    })

    conversations.value = Array.from(threadMap.values())
    console.log('✅ Conversations:', conversations.value.length)

    // Auto select first conversation
    if (conversations.value.length > 0 && !activeConversationId.value) {
      selectConversation(conversations.value[0].id)
    }
  }
  catch (error: any) {
    console.error('❌ Error loading conversations:', error)
    if (error.response?.status === 403) {
      console.error('❌ 403 Forbidden - Check permissions!')
      alert('No permission to read zalo_messages. Please check Access Policies.')
    }
  }
  finally {
    loading.value = false
  }
}

// Load messages theo threadId
async function loadMessages(threadId: string) {
  try {
    loading.value = true

    const response = await api.get('/items/zalo_messages', {
      params: {
        filter: {
          threadId: { _eq: threadId },
        },
        fields: ['id', 'msgId', 'senderId', 'senderName', 'content', 'timestamp'],
        sort: ['timestamp'],
        limit: -1,
      },
    })

    const zaloMessages = response.data.data
    console.log(`✅ Loaded ${zaloMessages.length} messages for thread ${threadId}`)

    messages.value = zaloMessages.map((msg: any) => ({
      id: msg.msgId || msg.id,
      direction: msg.senderId === currentUserId.value ? 'out' : 'in',
      text: msg.content || '',
      senderName: msg.senderName || msg.senderId || 'Unknown',
      senderId: msg.senderId,
      time: formatTime(msg.timestamp),
      avatar: msg.senderId !== currentUserId.value
        ? `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.senderName || msg.senderId || 'U')}&background=random`
        : undefined,
      status: msg.senderId === currentUserId.value ? 'read' : undefined,
    }))

    nextTick(() => {
      scrollToBottom()
    })
  }
  catch (error) {
    console.error('❌ Error loading messages:', error)
  }
  finally {
    loading.value = false
  }
}

// Send message (chỉ lưu vào UI, backend sẽ handle thật qua Zalo)
async function sendMessage() {
  if (!messageText.value.trim() || !activeConversationId.value || sendingMessage.value) {
    return
  }

  const tempMessage: Message = {
    id: `temp_${Date.now()}`,
    direction: 'out',
    text: messageText.value.trim(),
    senderName: 'You',
    senderId: currentUserId.value,
    time: formatTime(new Date().toISOString()),
    status: 'sent',
  }

  messages.value.push(tempMessage)
  const messageContent = messageText.value.trim()
  messageText.value = ''

  nextTick(() => {
    scrollToBottom()
  })

  try {
    sendingMessage.value = true

    // Gọi endpoint để gửi message thông qua Zalo
    await api.post('/zalo/send-message', {
      threadId: activeConversationId.value,
      content: messageContent,
    })

    console.log('✅ Message sent via Zalo')

    // Reload messages để lấy message thật từ DB
    setTimeout(() => {
      loadMessages(activeConversationId.value)
    }, 1000)
  }
  catch (error) {
    console.error('❌ Error sending message:', error)
    // Remove temp message on error
    messages.value = messages.value.filter(m => m.id !== tempMessage.id)
  }
  finally {
    sendingMessage.value = false
  }
}

// Select conversation
function selectConversation(id: string) {
  activeConversationId.value = id
  loadMessages(id)
}

// Utility functions
function formatTime(dateString: string): string {
  if (!dateString)
    return ''
  const date = new Date(dateString)
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
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

function handleImageError(event: Event, name: string) {
  const img = event.target as HTMLImageElement
  if (img.src.includes('ui-avatars.com')) {
    img.onerror = null
    img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNFNUU3RUIiLz48L3N2Zz4='
    return
  }
  img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
}

// Auto refresh messages every 5 seconds
let refreshInterval: any = null

function startAutoRefresh() {
  refreshInterval = setInterval(() => {
    if (activeConversationId.value) {
      loadMessages(activeConversationId.value)
    }
  }, 5000) // 5 seconds
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}

// Lifecycle
onMounted(async () => {
  await getCurrentUser()
  await loadConversations()
  startAutoRefresh()
})

// Cleanup
onUnmounted(() => {
  stopAutoRefresh()
})

// Watch for conversation changes
watch(activeConversationId, () => {
  if (activeConversationId.value) {
    scrollToBottom()
  }
})
</script>

<template>
  <private-view title="Zalo Messages">
    <template #title-outer:prepend>
      <v-button class="header-icon" rounded disabled icon secondary>
        <v-icon name="chat" />
      </v-button>
    </template>

    <template #navigation>
      <!-- Search Section -->
      <div class="p-3 border-b space-y-3">
        <div class="relative">
          <v-icon name="search" class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" small />
          <input
            v-model="navSearchQuery"
            placeholder="Search conversation"
            class="w-full pl-10 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
        </div>

        <v-button :loading="loading" small secondary full-width @click="loadConversations">
          <v-icon name="refresh" left />
          Refresh
        </v-button>
      </div>

      <!-- Conversation List -->
      <div class="flex-1 overflow-y-auto">
        <div v-if="loading && conversations.length === 0" class="p-4 text-center">
          <v-progress-circular indeterminate />
          <p class="text-sm text-text-muted mt-2">
            Loading conversations...
          </p>
        </div>

        <div v-else-if="conversations.length === 0" class="p-4 text-center">
          <v-icon name="chat_bubble_outline" large class="text-text-muted mb-2" />
          <p class="text-sm text-text-muted">
            No conversations found
          </p>
        </div>

        <div v-else class="p-2 space-y-1">
          <div
            v-for="conversation in filteredConversations"
            :key="conversation.id"
            class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all hover:bg-neutral-50"
            :class="{ 'bg-brand-50 border-l-2 border-brand-500': conversation.id === activeConversationId }"
            @click="selectConversation(conversation.id)"
          >
            <!-- Avatar -->
            <div class="relative flex-shrink-0">
              <div class="w-10 h-10 rounded-full overflow-hidden bg-neutral-100">
                <img
                  :src="conversation.avatar"
                  :alt="conversation.name"
                  class="w-full h-full object-cover"
                  @error="handleImageError($event, conversation.name)"
                >
              </div>
              <div
                v-if="conversation.online"
                class="absolute bottom-0 right-0 w-3 h-3 bg-success-500 rounded-full border-2 border-white"
              />
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between mb-1">
                <h4 class="font-medium text-sm truncate">
                  {{ conversation.name }}
                </h4>
                <span class="text-xs text-text-muted flex-shrink-0 ml-2">
                  {{ conversation.timestamp }}
                </span>
              </div>
              <p class="text-xs text-text-tertiary truncate">
                {{ conversation.lastMessage }}
              </p>
            </div>

            <!-- Unread badge -->
            <div
              v-if="conversation.unreadCount > 0"
              class="flex-shrink-0 min-w-[20px] h-5 bg-brand-500 text-white text-xs font-medium rounded-full flex items-center justify-center px-1.5"
            >
              {{ conversation.unreadCount > 99 ? '99+' : conversation.unreadCount }}
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Main Chat Area -->
    <div class="chat-container">
      <!-- Chat Header -->
      <div v-if="activeConversation" class="chat-header">
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full overflow-hidden bg-neutral-100">
              <img
                :src="activeConversation.avatar"
                :alt="activeConversation.name"
                class="w-full h-full object-cover"
                @error="handleImageError($event, activeConversation.name)"
              >
            </div>
            <div>
              <h3 class="font-semibold text-base">
                {{ activeConversation.name }}
              </h3>
              <p class="text-xs text-success-500">
                Online
              </p>
            </div>
          </div>

          <v-button :loading="loading" small icon secondary @click="loadMessages(activeConversationId)">
            <v-icon name="refresh" />
          </v-button>
        </div>
      </div>

      <!-- Messages Area -->
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
            <v-icon name="chat_bubble_outline" x-large class="text-text-muted mb-2" />
            <p class="text-text-muted">
              No messages yet
            </p>
          </div>
        </div>

        <div v-else class="p-4 space-y-4">
          <div
            v-for="message in messages"
            :key="message.id"
            class="flex gap-3"
            :class="{ 'justify-end': message.direction === 'out' }"
          >
            <!-- Avatar (incoming only) -->
            <div
              v-if="message.direction === 'in'"
              class="w-8 h-8 rounded-full overflow-hidden bg-neutral-100 flex-shrink-0"
            >
              <img
                :src="message.avatar"
                :alt="message.senderName"
                class="w-full h-full object-cover"
                @error="handleImageError($event, message.senderName)"
              >
            </div>

            <!-- Message Bubble -->
            <div class="flex flex-col max-w-[70%]">
              <div
                class="rounded-2xl px-4 py-2 break-words"
                :class="{
                  'bg-neutral-100 text-text-primary': message.direction === 'in',
                  'bg-brand-500 text-white': message.direction === 'out',
                }"
              >
                <p class="text-sm whitespace-pre-wrap">
                  {{ message.text }}
                </p>
              </div>
              <span
                class="text-xs mt-1"
                :class="{
                  'text-text-muted': message.direction === 'in',
                  'text-text-muted text-right': message.direction === 'out',
                }"
              >
                {{ message.time }}
                <template v-if="message.status && message.direction === 'out'">
                  • {{ message.status }}
                </template>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Message Input -->
      <div v-if="activeConversation" class="message-input">
        <div class="flex items-end gap-2">
          <v-button icon secondary @click="() => {}">
            <v-icon name="attach_file" />
          </v-button>

          <textarea
            v-model="messageText"
            placeholder="Type your message..."
            rows="1"
            class="flex-1 resize-none px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
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

      <!-- Empty State -->
      <div v-else class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <v-icon name="chat" x-large class="text-neutral-300 mb-4" />
          <h3 class="text-lg font-medium text-text-secondary mb-2">
            Select a conversation
          </h3>
          <p class="text-text-muted">
            Choose a conversation to start messaging
          </p>
        </div>
      </div>
    </div>
  </private-view>
</template>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 65px);
  background: white;
}

.chat-header {
  flex-shrink: 0;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-normal);
}

.messages-area {
  flex: 1;
  overflow-y: auto;
  background: white;
}

.message-input {
  flex-shrink: 0;
  padding: 1rem;
  border-top: 1px solid var(--border-normal);
}
</style>
