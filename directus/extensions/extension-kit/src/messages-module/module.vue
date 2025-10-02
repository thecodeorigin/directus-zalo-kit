<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'

// Chat data types
interface Message {
  id: string
  sender: string
  content: string
  timestamp: string
  isCurrentUser: boolean
  avatar?: string
}

interface Conversation {
  id: string
  name: string
  lastMessage: string
  timestamp: string
  unreadCount: number
  avatar?: string
  isOnline?: boolean
}

// Reactive data
const conversations = ref<Conversation[]>([
  {
    id: '1',
    name: 'Olivia Rhye',
    lastMessage: "Great. Also, make sure to highlight the key features—they're very focused on functionality this time.",
    timestamp: '00:00',
    unreadCount: 0,
    avatar: '👤',
    isOnline: true
  },
  {
    id: '2',
    name: 'Nha Khuyen',
    lastMessage: 'Got it. Should I also prepare a short presentation, or just send the draft?',
    timestamp: '00:00',
    unreadCount: 2,
    avatar: '👤',
    isOnline: true
  },
  {
    id: '3',
    name: 'Adam Levine',
    lastMessage: 'There are many variations of passages of Lorem Ipsum available...',
    timestamp: '01:10 PM',
    unreadCount: 0,
    avatar: '👤',
    isOnline: false
  },
  {
    id: '4',
    name: 'Kadin Botosh',
    lastMessage: 'There are many variations of passages of Lorem Ipsum available...',
    timestamp: '01:10 PM',
    unreadCount: 0,
    avatar: '👤',
    isOnline: false
  },
  {
    id: '5',
    name: 'Wilson Press',
    lastMessage: 'There are many variations of passages of Lorem Ipsum available...',
    timestamp: '01:10 PM',
    unreadCount: 0,
    avatar: '👤',
    isOnline: false
  },
  {
    id: '6',
    name: 'Erin George',
    lastMessage: 'There are many variations of passages of Lorem Ipsum available...',
    timestamp: '01:10 PM',
    unreadCount: 0,
    avatar: '👤',
    isOnline: false
  },
  {
    id: '7',
    name: 'Giana Baptista',
    lastMessage: 'There are many variations of passages of Lorem Ipsum available...',
    timestamp: '01:10 PM',
    unreadCount: 0,
    avatar: '👤',
    isOnline: false
  },
  {
    id: '8',
    name: 'Jaydon Good',
    lastMessage: 'There are many variations of passages of Lorem Ipsum available...',
    timestamp: '01:10 PM',
    unreadCount: 0,
    avatar: '👤',
    isOnline: false
  }
])

const messages = ref<Message[]>([
  {
    id: '1',
    sender: 'Olivia Rhye',
    content: 'Hi Khuyen, do you have a moment to talk about the new project?',
    timestamp: '00:00',
    isCurrentUser: false,
    avatar: '👤'
  },
  {
    id: '2',
    sender: 'Nha Khuyen',
    content: "Sure, Olivia. What's on your mind?",
    timestamp: '00:00',
    isCurrentUser: true,
    avatar: '👤'
  },
  {
    id: '3',
    sender: 'Olivia Rhye',
    content: "I've just reviewed the client's requirements, and we need to adjust our timeline. How far along are you with the initial draft?",
    timestamp: '00:00',
    isCurrentUser: false,
    avatar: '👤'
  },
  {
    id: '4',
    sender: 'Nha Khuyen',
    content: "I'm about 70% done. Most of the structure is complete, but I still need to polish the details and add the visuals.",
    timestamp: '00:00',
    isCurrentUser: true,
    avatar: '👤'
  },
  {
    id: '5',
    sender: 'Olivia Rhye',
    content: "That's good progress. The client is asking for a preview by Friday. Do you think you can send me a version before then, maybe by Thursday afternoon?",
    timestamp: '00:00',
    isCurrentUser: false,
    avatar: '👤'
  },
  {
    id: '6',
    sender: 'Nha Khuyen',
    content: 'Yes, I can manage that. I\'ll stay late today and tomorrow if necessary.',
    timestamp: '00:00',
    isCurrentUser: true,
    avatar: '👤'
  },
  {
    id: '7',
    sender: 'Olivia Rhye',
    content: "Great. Also, make sure to highlight the key features—they're very focused on functionality this time.",
    timestamp: '00:00',
    isCurrentUser: false,
    avatar: '👤'
  },
  {
    id: '8',
    sender: 'Nha Khuyen',
    content: 'Got it. Should I also prepare a short presentation, or just send the draft?',
    timestamp: '00:00',
    isCurrentUser: true,
    avatar: '👤'
  },
  {
    id: '9',
    sender: 'Olivia Rhye',
    content: "Great. Also, make sure to highlight the key features—they're very focused on functionality this time.",
    timestamp: '00:00',
    isCurrentUser: false,
    avatar: '👤'
  }
])

const selectedConversation = ref<string>('1')
const newMessage = ref<string>('')
const searchQuery = ref<string>('')
const messagesContainer = ref<HTMLElement>()

// Computed properties
const filteredConversations = computed(() => {
  if (!searchQuery.value) return conversations.value
  return conversations.value.filter(conv => 
    conv.name.toLowerCase().includes(searchQuery.value.toLowerCase())
  )
})

const currentConversation = computed(() => {
  return conversations.value.find(conv => conv.id === selectedConversation.value)
})

// Methods
const selectConversation = (conversationId: string) => {
  selectedConversation.value = conversationId
  // Mark as read
  const conv = conversations.value.find(c => c.id === conversationId)
  if (conv) {
    conv.unreadCount = 0
  }
}

const sendMessage = () => {
  if (!newMessage.value.trim()) return
  
  const message: Message = {
    id: Date.now().toString(),
    sender: 'Nha Khuyen',
    content: newMessage.value,
    timestamp: new Date().toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    }),
    isCurrentUser: true,
    avatar: '👤'
  }
  
  messages.value.push(message)
  newMessage.value = ''
  
  // Update conversation last message
  const conv = conversations.value.find(c => c.id === selectedConversation.value)
  if (conv) {
    conv.lastMessage = message.content
    conv.timestamp = message.timestamp
  }
  
  // Scroll to bottom
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

const formatTime = (timestamp: string) => {
  return timestamp
}

onMounted(() => {
  // Scroll to bottom initially
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
})
</script>

<template>
  <private-view title="Messages">
    <div class="messages-container">
      <!-- Sidebar with conversations -->
      <div class="conversations-sidebar">
        <div class="sidebar-header">
          <div class="user-info">
            <div class="user-avatar">👤</div>
            <span class="user-name">Nha Khuyen Directus</span>
          </div>
          <div class="sidebar-actions">
            <v-button icon small>
              <v-icon name="group_add" />
            </v-button>
            <v-button icon small>
              <v-icon name="search" />
            </v-button>
            <v-button icon small>
              <v-icon name="more_horiz" />
            </v-button>
          </div>
        </div>
        
        <div class="search-container">
          <v-input 
            v-model="searchQuery" 
            placeholder="Search conversation"
            :full-width="false"
          >
            <template #prepend>
              <v-icon name="search" />
            </template>
          </v-input>
        </div>
        
        <div class="filter-tabs">
          <button class="filter-tab active">Filter</button>
          <v-icon name="keyboard_arrow_down" small />
        </div>
        
        <div class="conversations-list">
          <div 
            v-for="conversation in filteredConversations" 
            :key="conversation.id"
            class="conversation-item"
            :class="{ active: selectedConversation === conversation.id }"
            @click="selectConversation(conversation.id)"
          >
            <div class="conversation-avatar">
              <span>{{ conversation.avatar }}</span>
              <div v-if="conversation.isOnline" class="online-indicator"></div>
            </div>
            <div class="conversation-content">
              <div class="conversation-header">
                <span class="conversation-name">{{ conversation.name }}</span>
                <span class="conversation-time">{{ conversation.timestamp }}</span>
              </div>
              <div class="conversation-preview">
                <span class="last-message">{{ conversation.lastMessage }}</span>
                <div v-if="conversation.unreadCount > 0" class="unread-badge">
                  {{ conversation.unreadCount }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Main chat area -->
      <div class="chat-main">
        <div class="chat-header">
          <div class="chat-user-info">
            <div class="chat-avatar">👤</div>
            <div class="chat-user-details">
              <h3>{{ currentConversation?.name }}</h3>
            </div>
          </div>
          <div class="chat-actions">
            <v-button icon small>
              <v-icon name="group_add" />
            </v-button>
            <v-button icon small>
              <v-icon name="search" />
            </v-button>
            <v-button icon small>
              <v-icon name="more_horiz" />
            </v-button>
          </div>
        </div>
        
        <div ref="messagesContainer" class="messages-area">
          <div 
            v-for="message in messages" 
            :key="message.id"
            class="message"
            :class="{ 'current-user': message.isCurrentUser }"
          >
            <div v-if="!message.isCurrentUser" class="message-avatar">
              {{ message.avatar }}
            </div>
            <div class="message-content">
              <div class="message-bubble">
                {{ message.content }}
              </div>
              <div class="message-time">
                {{ formatTime(message.timestamp) }}
              </div>
            </div>
            <div v-if="message.isCurrentUser" class="message-avatar">
              {{ message.avatar }}
            </div>
          </div>
        </div>
        
        <div class="message-input-area">
          <div class="input-container">
            <v-button icon small class="input-action">
              <v-icon name="attach_file" />
            </v-button>
            <v-button icon small class="input-action">
              <v-icon name="emoji_emotions" />
            </v-button>
            <v-input 
              v-model="newMessage" 
              placeholder="Type your message here..."
              :full-width="false"
              @keyup.enter="sendMessage"
            />
            <v-button 
              icon 
              :disabled="!newMessage.trim()"
              @click="sendMessage"
            >
              <v-icon name="send" />
            </v-button>
          </div>
        </div>
      </div>
    </div>
  </private-view>
</template>

<style scoped>
.messages-container {
  display: flex;
  height: 100vh;
  background: var(--background-page);
}

/* Sidebar Styles */
.conversations-sidebar {
  width: 320px;
  border-right: 1px solid var(--border-normal);
  display: flex;
  flex-direction: column;
  background: var(--background-page);
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-normal);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.user-name {
  font-weight: 600;
  color: var(--foreground-normal);
}

.sidebar-actions {
  display: flex;
  gap: 8px;
}

.search-container {
  padding: 16px;
  border-bottom: 1px solid var(--border-normal);
}

.filter-tabs {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--border-normal);
}

.filter-tab {
  background: none;
  border: none;
  color: var(--foreground-normal);
  font-weight: 500;
  cursor: pointer;
}

.filter-tab.active {
  color: var(--primary);
}

.conversations-list {
  flex: 1;
  overflow-y: auto;
}

.conversation-item {
  padding: 12px 16px;
  display: flex;
  gap: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  border-bottom: 1px solid var(--border-subdued);
}

.conversation-item:hover {
  background: var(--background-normal);
}

.conversation-item.active {
  background: var(--background-normal);
  border-right: 2px solid var(--primary);
}

.conversation-avatar {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--background-normal);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.online-indicator {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  background: #10B981;
  border: 2px solid var(--background-page);
  border-radius: 50%;
}

.conversation-content {
  flex: 1;
  min-width: 0;
}

.conversation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.conversation-name {
  font-weight: 500;
  color: var(--foreground-normal);
}

.conversation-time {
  font-size: 12px;
  color: var(--foreground-subdued);
}

.conversation-preview {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.last-message {
  font-size: 14px;
  color: var(--foreground-subdued);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.unread-badge {
  background: var(--primary);
  color: white;
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 12px;
  font-weight: 500;
  min-width: 18px;
  text-align: center;
}

/* Main Chat Styles */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.chat-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-normal);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--background-page);
}

.chat-user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chat-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.chat-user-details h3 {
  margin: 0;
  font-weight: 600;
  color: var(--foreground-normal);
}

.chat-actions {
  display: flex;
  gap: 8px;
}

.messages-area {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  max-width: 70%;
}

.message.current-user {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.message-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--background-normal);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.message-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message.current-user .message-content {
  align-items: flex-end;
}

.message-bubble {
  background: var(--background-normal);
  padding: 12px 16px;
  border-radius: 18px;
  color: var(--foreground-normal);
  line-height: 1.4;
}

.message.current-user .message-bubble {
  background: var(--primary);
  color: white;
}

.message-time {
  font-size: 12px;
  color: var(--foreground-subdued);
  padding: 0 8px;
}

.message-input-area {
  padding: 16px 20px;
  border-top: 1px solid var(--border-normal);
  background: var(--background-page);
}

.input-container {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--background-normal);
  border-radius: 24px;
  padding: 8px 16px;
}

.input-action {
  color: var(--foreground-subdued);
}

.input-container .v-input {
  flex: 1;
  border: none;
  background: none;
}

.input-container .v-input :deep(.input) {
  border: none;
  background: none;
  padding: 8px 0;
}

.input-container .v-input :deep(.input):focus {
  box-shadow: none;
}
</style>