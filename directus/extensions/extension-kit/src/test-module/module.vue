<template>
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
                    ]"
                  >
                    {{ conversation.name }}
                  </h4>
                  <span class="text-xs ml-2 flex-shrink-0 text-text-muted">
                    {{ conversation.timestamp }}
                  </span>
                </div>
                
                <p class="text-xs mt-0.5 truncate text-text-tertiary">
                  {{ conversation.lastMessage }}
                </p>
              </div>
            </div>
            
            <!-- Unread badge -->
            <div
              v-if="conversation.unreadCount > 0"
              class="ml-2 flex-shrink-0 min-w-[20px] h-5 bg-brand-500 text-white text-xs font-medium rounded-full flex items-center justify-center px-1.5"
            >
              {{ conversation.unreadCount > 99 ? '99+' : conversation.unreadCount }}
            </div>
          </div>
        </div>
      </div>
    </template>

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
                <img
                  :src="activeConversation.avatar"
                  :alt="activeConversation.name"
                  class="w-full h-full object-cover"
                />
              </div>
              <div
                v-if="activeConversation.online"
                class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-success-500 border-2 border-white"
              />
            </div>
            
            <h3 class="font-semibold text-text-secondary">
              {{ activeConversation.name }}
            </h3>
          </div>
          
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
              </svg>
            </button>
          </div>
        </div>
      </div>
      
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
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      <!-- Empty state -->
      <div
        v-else
        class="flex-1 flex items-center justify-center bg-neutral-50"
      >
        <div class="text-center">
          <h3 class="text-lg font-medium text-text-secondary mb-2">
            Select a conversation
          </h3>
          <p class="text-text-muted">
            Choose a conversation from the sidebar to start messaging
          </p>
        </div>
      </div>
    </div>

  </private-view>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'

interface Conversation {
  id: string
  name: string
  lastMessage: string
  timestamp: string
  avatar: string
  online: boolean
  unreadCount: number
}

interface Message {
  id: string
  direction: 'in' | 'out'
  text: string
  senderName: string
  time: string
  avatar?: string
  status?: 'sent' | 'delivered' | 'read'
}

// Reactive data
const searchQuery = ref('')
const navSearchQuery = ref('')
const messageText = ref('')
const activeConversationId = ref<string>('1')
const messagesContainer = ref<HTMLElement | null>(null)

// Mock conversations data
const conversations = ref<Conversation[]>([
  {
    id: '1',
    name: 'Olivia Rhye',
    lastMessage: 'There are many variations of passages',
    timestamp: '01:10 PM',
    avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
    online: true,
    unreadCount: 2
  },
  {
    id: '2',
    name: 'Adam Levine',
    lastMessage: 'There are many variations of passages',
    timestamp: '01:10 PM',
    avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
    online: true,
    unreadCount: 0
  },
  {
    id: '3',
    name: 'Kadin Botosh',
    lastMessage: 'There are many variations of passages',
    timestamp: '01:10 PM',
    avatar: 'https://randomuser.me/api/portraits/men/15.jpg',
    online: true,
    unreadCount: 1
  },
  {
    id: '4',
    name: 'Wilson Press',
    lastMessage: 'There are many variations of passages',
    timestamp: '01:10 PM',
    avatar: 'https://randomuser.me/api/portraits/men/25.jpg',
    online: true,
    unreadCount: 0
  },
  {
    id: '5',
    name: 'Erin George',
    lastMessage: 'There are many variations of passages',
    timestamp: '01:10 PM',
    avatar: 'https://randomuser.me/api/portraits/women/25.jpg',
    online: true,
    unreadCount: 0
  },
  {
    id: '6',
    name: 'Giana Baptista',
    lastMessage: 'There are many variations of passages',
    timestamp: '01:10 PM',
    avatar: 'https://randomuser.me/api/portraits/women/35.jpg',
    online: true,
    unreadCount: 0
  },
  {
    id: '7',
    name: 'Jaydon Good',
    lastMessage: 'There are many variations of passages',
    timestamp: '01:10 PM',
    avatar: 'https://randomuser.me/api/portraits/men/45.jpg',
    online: true,
    unreadCount: 0
  }
])

// Mock messages data
const messages = ref<Message[]>([
  {
    id: '1',
    direction: 'in',
    text: 'Hi Khuyen, do you have a moment to talk about the new project?',
    senderName: 'Olivia Rhye',
    time: '00:00',
    avatar: 'https://randomuser.me/api/portraits/women/44.jpg'
  },
  {
    id: '2',
    direction: 'out',
    text: 'Sure, Olivia. What\'s on your mind?',
    senderName: 'Nha Khuyen',
    time: '00:00',
    status: 'read'
  },
  {
    id: '3',
    direction: 'in',
    text: 'I\'ve just reviewed the client\'s requirements, and we need to adjust our timeline. How far along are you with the initial draft?',
    senderName: 'Olivia Rhye',
    time: '00:00',
    avatar: 'https://randomuser.me/api/portraits/women/44.jpg'
  },
  {
    id: '4',
    direction: 'out',
    text: 'I\'m about 70% done. Most of the structure is complete, but I still need to polish the details and add the visuals.',
    senderName: 'Nha Khuyen',
    time: '00:00',
    status: 'read'
  },
  {
    id: '5',
    direction: 'in',
    text: 'That\'s good progress. The client is asking for a preview by Friday. Do you think you can send me a version before then, maybe by Thursday afternoon?',
    senderName: 'Olivia Rhye',
    time: '00:00',
    avatar: 'https://randomuser.me/api/portraits/women/44.jpg'
  },
  {
    id: '6',
    direction: 'out',
    text: 'Yes, I can manage that. I\'ll stay late today and tomorrow if necessary.',
    senderName: 'Nha Khuyen',
    time: '00:00',
    status: 'read'
  },
  {
    id: '7',
    direction: 'in',
    text: 'Great. Also, make sure to highlight the key features—they\'re very focused on functionality this time.',
    senderName: 'Olivia Rhye',
    time: '00:00',
    avatar: 'https://randomuser.me/api/portraits/women/44.jpg'
  },
  {
    id: '8',
    direction: 'out',
    text: 'Got it. Should I also prepare a short presentation, or just send the draft?',
    senderName: 'Nha Khuyen',
    time: '00:00',
    status: 'read'
  },
  {
    id: '9',
    direction: 'in',
    text: 'Great. Also, make sure to highlight the key features—they\'re very focused on functionality this time.',
    senderName: 'Olivia Rhye',
    time: '00:00',
    avatar: 'https://randomuser.me/api/portraits/women/44.jpg'
  }
])

// Computed properties
const filteredConversations = computed(() => {
  const query = navSearchQuery.value || searchQuery.value
  if (!query) return conversations.value
  
  return conversations.value.filter(conv =>
    conv.name.toLowerCase().includes(query.toLowerCase()) ||
    conv.lastMessage.toLowerCase().includes(query.toLowerCase())
  )
})

const activeConversation = computed(() => {
  return conversations.value.find(conv => conv.id === activeConversationId.value)
})

// Methods
const selectConversation = (id: string) => {
  activeConversationId.value = id
  scrollToBottom()
}

const handleSearch = () => {
  // Search functionality handled by computed property
}

const handleNavSearch = () => {
  // Nav search functionality handled by computed property
}

const handleAddUser = () => {
  console.log('Add user clicked')
}

const handleFilter = () => {
  console.log('Filter clicked')
}

const sendMessage = () => {
  if (!messageText.value.trim()) return
  
  const newMessage: Message = {
    id: Date.now().toString(),
    direction: 'out',
    text: messageText.value.trim(),
    senderName: 'Nha Khuyen',
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    status: 'sent'
  }
  
  messages.value.push(newMessage)
  messageText.value = ''
  
  nextTick(() => {
    scrollToBottom()
  })
}

const autoResize = (event: Event) => {
  const textarea = event.target as HTMLTextAreaElement
  textarea.style.height = 'auto'
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
}

const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// Lifecycle
onMounted(() => {
  scrollToBottom()
})
</script>

<style scoped>
@import '../styles/tailwind.css';
</style>