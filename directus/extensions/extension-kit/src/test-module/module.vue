<script setup lang="ts">
import { readItems } from '@directus/sdk'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import client from './utils/sdk'

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
const currentUserId = ref('system')
const isAuthenticated = ref(false)

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

async function autoLogin() {
  try {
    await client.login({
      email: 'admin@example.com',
      password: 'd1r3ctu5',
    })

    isAuthenticated.value = true
    console.log('Authenticated with Directus')
  }
  catch (error) {
    console.error('Authentication failed:', error)
    isAuthenticated.value = false
  }
}

async function loadConversations() {
  if (!isAuthenticated.value) {
    console.warn(' Not authenticated')
    return
  }

  try {
    loading.value = true

    const data = await client.request(
      readItems('zalo_conversations', {
        fields: [
          '*',
          {
            participant_id: ['id', 'display_name', 'zalo_name', 'avatar_url'],
          },
          {
            group_id: ['id', 'name', 'avatar_url'],
          },
          {
            last_message_id: ['content'],
          },
        ],
        filter: {
          is_hidden: { _eq: false },
        },
        sort: ['-is_pinned', '-last_message_time'],
        limit: 50,
      }),
    )

    conversations.value = data.map((conv: any) => {
      let name = 'Unknown'
      if (conv.participant_id?.display_name) {
        name = conv.participant_id.display_name
      }
      else if (conv.participant_id?.zalo_name) {
        name = conv.participant_id.zalo_name
      }
      else if (conv.group_id?.name) {
        name = conv.group_id.name
      }

      let avatar = ''
      if (conv.participant_id?.avatar_url) {
        avatar = conv.participant_id.avatar_url
      }
      else if (conv.group_id?.avatar_url) {
        avatar = conv.group_id.avatar_url
      }
      else {
        avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
      }

      return {
        id: conv.id,
        name,
        avatar,
        lastMessage: conv.last_message_id?.content || '',
        timestamp: formatTime(conv.last_message_time),
        unreadCount: conv.unread_count || 0,
        online: true,
      }
    })

    console.log('Loaded conversations:', conversations.value.length)

    if (conversations.value.length > 0 && !activeConversationId.value) {
      selectConversation(conversations.value[0].id)
    }
  }
  catch (error: any) {
    console.error('Error loading conversations:', error)
  }
  finally {
    loading.value = false
  }
}

async function loadMessages(conversationId: string) {
  if (!isAuthenticated.value)
    return

  try {
    loading.value = true

    const data = await client.request(
      readItems('zalo_messages', {
        fields: [
          '*',
          {
            sender_id: ['id', 'display_name', 'zalo_name', 'avatar_url'],
          },
        ],
        filter: {
          conversation_id: { _eq: conversationId },
        },
        sort: ['sent_at'],
        limit: 100,
      }),
    )

    messages.value = data.map((msg: any) => {
      let senderName = 'Unknown'
      let senderAvatar = ''

      if (msg.sender_id?.display_name) {
        senderName = msg.sender_id.display_name
      }
      else if (msg.sender_id?.zalo_name) {
        senderName = msg.sender_id.zalo_name
      }
      else if (typeof msg.sender_id === 'string') {
        senderName = msg.sender_id
      }

      if (msg.sender_id?.avatar_url) {
        senderAvatar = msg.sender_id.avatar_url
      }
      else {
        senderAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}&background=random`
      }

      const senderId = typeof msg.sender_id === 'object' ? msg.sender_id.id : msg.sender_id
      const direction = senderId === currentUserId.value ? 'out' : 'in'

      return {
        id: msg.id,
        direction,
        text: msg.content || '',
        senderName,
        senderId,
        time: formatTime(msg.sent_at),
        avatar: direction === 'in' ? senderAvatar : undefined,
        status: direction === 'out' ? 'read' : undefined,
      }
    })

    console.log(`Loaded ${messages.value.length} messages`)

    nextTick(() => {
      scrollToBottom()
    })
  }
  catch (error: any) {
    console.error(' Error loading messages:', error)
  }
  finally {
    loading.value = false
  }
}

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

    const token = await client.getToken()
    const response = await fetch(`http://localhost:8055/zalo/conversations/${activeConversationId.value}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ content: messageContent }),
    })

    if (!response.ok) {
      throw new Error('Failed to send message')
    }

    console.log(' Message sent')

    setTimeout(() => {
      loadMessages(activeConversationId.value)
    }, 1000)
  }
  catch (error: any) {
    console.error(' Error sending message:', error)
    messages.value = messages.value.filter(m => m.id !== tempMessage.id)
  }
  finally {
    sendingMessage.value = false
  }
}

function selectConversation(id: string) {
  activeConversationId.value = id
  loadMessages(id)
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
  img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
}

let refreshInterval: any = null

function startAutoRefresh() {
  refreshInterval = setInterval(() => {
    if (activeConversationId.value) {
      loadMessages(activeConversationId.value)
    }
  }, 10000)
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}

onMounted(async () => {
  console.log(' Zalo Messages module mounted')

  await autoLogin()

  if (isAuthenticated.value) {
    await loadConversations()
    startAutoRefresh()
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAutoRefresh()
    }
    else {
      if (isAuthenticated.value) {
        loadConversations()
        if (activeConversationId.value) {
          loadMessages(activeConversationId.value)
        }
        startAutoRefresh()
      }
    }
  })
})

onUnmounted(() => {
  stopAutoRefresh()
})

watch(activeConversationId, () => {
  if (activeConversationId.value) {
    nextTick(() => {
      scrollToBottom()
    })
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

        <v-button :loading="loading" small secondary full-width @click="loadConversations">
          <v-icon name="refresh" left />
          Refresh
        </v-button>
      </div>

      <div class="flex-1 overflow-y-auto">
        <div v-if="loading && conversations.length === 0" class="p-4 text-center">
          <v-progress-circular indeterminate />
          <p class="text-sm mt-2" style="color: var(--theme--foreground-subdued);">
            Loading conversations...
          </p>
        </div>

        <div v-else-if="conversations.length === 0" class="p-4 text-center">
          <v-icon name="chat_bubble_outline" large style="color: var(--theme--foreground-subdued);" class="mb-2" />
          <p class="text-sm" style="color: var(--theme--foreground-subdued);">
            No conversations found
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
            <!-- Avatar -->
            <div class="relative flex-shrink-0">
              <div class="w-10 h-10 rounded-full overflow-hidden" style="background-color: var(--theme--background-subdued);">
                <img
                  :src="conversation.avatar"
                  :alt="conversation.name"
                  class="w-full h-full object-cover"
                  @error="handleImageError($event, conversation.name)"
                >
              </div>
              <div
                v-if="conversation.online"
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
                {{ conversation.lastMessage }}
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
            <div class="w-10 h-10 rounded-full overflow-hidden" style="background-color: var(--theme--background-subdued);">
              <img
                :src="activeConversation.avatar"
                :alt="activeConversation.name"
                class="w-full h-full object-cover"
                @error="handleImageError($event, activeConversation.name)"
              >
            </div>
            <div>
              <h3 class="font-semibold text-base" style="color: var(--theme--foreground); margin: 0;">
                {{ activeConversation.name }}
              </h3>
              <p class="text-xs" style="color: var(--theme--success); margin: 0;">
                Online
              </p>
            </div>
          </div>

          <v-button :loading="loading" small icon secondary @click="loadMessages(activeConversationId)">
            <v-icon name="refresh" />
          </v-button>
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
            class="flex gap-3"
            :class="{ 'justify-end': message.direction === 'out' }"
          >
            <div
              v-if="message.direction === 'in'"
              class="w-8 h-8 rounded-full overflow-hidden flex-shrink-0"
              style="background-color: var(--theme--background-subdued);"
            >
              <img
                :src="message.avatar"
                :alt="message.senderName"
                class="w-full h-full object-cover"
                @error="handleImageError($event, message.senderName)"
              >
            </div>

            <div class="flex flex-col max-w-[70%]">
              <div
                class="rounded-2xl px-4 py-2 break-words"
                :style="{
                  backgroundColor: message.direction === 'in' ? 'var(--theme--background-subdued)' : 'var(--theme--primary)',
                  color: message.direction === 'in' ? 'var(--theme--foreground)' : 'white',
                }"
              >
                <p class="text-sm whitespace-pre-wrap" style="margin: 0;">
                  {{ message.text }}
                </p>
              </div>
              <span
                class="text-xs mt-1"
                :class="{ 'text-right': message.direction === 'out' }"
                style="color: var(--theme--foreground-subdued);"
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
  </private-view>
</template>

<style scoped>
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
  overflow-y: auto;
  background: var(--theme--background);
}

.message-input {
  flex-shrink: 0;
  padding: 1rem;
  border-top: var(--theme--border-width) solid var(--theme--border-color-subdued);
}
</style>
