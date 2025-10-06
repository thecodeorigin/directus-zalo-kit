<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import oliviaAvatar from '../../public/avatars/olivia-avatar.png'

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

// Mock conversations data - sẽ thay thế bằng Zalo API
const conversations = ref<Conversation[]>([
  {
    id: '1',
    name: 'Olivia Rhye',
    lastMessage: 'There are many variations of passages',
    timestamp: '01:10 PM',
    avatar: oliviaAvatar,
    online: true,
    unreadCount: 2,
  },
  {
    id: '2',
    name: 'Adam Levine',
    lastMessage: 'There are many variations of passages',
    timestamp: '01:10 PM',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Adam&backgroundColor=f59e0b',
    online: true,
    unreadCount: 0,
  },
  {
    id: '3',
    name: 'Kadin Botosh',
    lastMessage: 'There are many variations of passages',
    timestamp: '01:10 PM',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Kadin&backgroundColor=10b981',
    online: true,
    unreadCount: 1,
  },
  {
    id: '4',
    name: 'Wilson Press',
    lastMessage: 'There are many variations of passages',
    timestamp: '01:10 PM',
    avatar: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNFQzQ4OTkiLz4KPHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSI4IiB5PSI4Ij4KPHBhdGggZD0iTTEyIDEyQzE0LjIwOTEgMTIgMTYgMTAuMjA5MSAxNiA4QzE2IDUuNzkwODYgMTQuMjA5MSA0IDEyIDRDOS43OTA4NiA0IDggNS43OTA4NiA4IDhDOCAxMC4yMDkxIDkuNzkwODYgMTIgMTIgMTJaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMTIgMTRDOS4zMzk3MiAxNCA2LjkyMTc4IDE1LjMzMzUgNS42ODE3OCAxNy42MzUxQzUuMDc3OCAxOC43NDkxIDUuMDc3OCAxOS45ODQ3IDUuNjgxNzggMjEuMDk4N0M2LjkyMTc4IDIzLjQwMDMgOS4zMzk3MiAyNC43MzM4IDEyIDI0LjczMzhDMTQuNjYwMyAyNC43MzM4IDE3LjA3ODIgMjMuNDAwMyAxOC4zMTgyIDIxLjA5ODdDMTguOTIyMiAxOS45ODQ3IDE4LjkyMjIgMTguNzQ5MSAxOC4zMTgyIDE3LjYzNTFDMTcuMDc4MiAxNS4zMzM1IDE0LjY2MDMgMTQgMTIgMTRaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4KPC9zdmc+',
    online: true,
    unreadCount: 0,
  },
  {
    id: '5',
    name: 'Erin George',
    lastMessage: 'There are many variations of passages',
    timestamp: '01:10 PM',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Erin&backgroundColor=8b5cf6',
    online: true,
    unreadCount: 0,
  },
  {
    id: '6',
    name: 'Giana Baptista',
    lastMessage: 'There are many variations of passages',
    timestamp: '01:10 PM',
    avatar: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiMwNkI2RDQiLz4KPHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSI4IiB5PSI4Ij4KPHBhdGggZD0iTTEyIDEyQzE0LjIwOTEgMTIgMTYgMTAuMjA5MSAxNiA4QzE2IDUuNzkwODYgMTQuMjA5MSA0IDEyIDRDOS43OTA4NiA0IDggNS43OTA4NiA4IDhDOCAxMC4yMDkxIDkuNzkwODYgMTIgMTIgMTJaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMTIgMTRDOS4zMzk3MiAxNCA2LjkyMTc4IDE1LjMzMzUgNS42ODE3OCAxNy42MzUxQzUuMDc3OCAxOC43NDkxIDUuMDc3OCAxOS45ODQ3IDUuNjgxNzggMjEuMDk4N0M2LjkyMTc4IDIzLjQwMDMgOS4zMzk3MiAyNC43MzM4IDEyIDI0LjczMzhDMTQuNjYwMyAyNC43MzM4IDE3LjA3ODIgMjMuNDAwMyAxOC4zMTgyIDIxLjA5ODdDMTguOTIyMiAxOS45ODQ3IDE4LjkyMjIgMTguNzQ5MSAxOC4zMTgyIDE3LjYzNTFDMTcuMDc4MiAxNS4zMzM1IDE0LjY2MDMgMTQgMTIgMTRaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4KPC9zdmc+',
    online: true,
    unreadCount: 0,
  },
  {
    id: '7',
    name: 'Jaydon Good',
    lastMessage: 'There are many variations of passages',
    timestamp: '01:10 PM',
    avatar: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNFRjQ0NDQiLz4KPHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLjIwMDAvc3ZnIiB4PSI4IiB5PSI4Ij4KPHBhdGggZD0iTTEyIDEyQzE0LjIwOTEgMTIgMTYgMTAuMjA5MSAxNiA4QzE2IDUuNzkwODYgMTQuMjA5MSA0IDEyIDRDOS43OTA4NiA0IDggNS43OTA4NiA4IDhDOCAxMC4yMDkxIDkuNzkwODYgMTIgMTIgMTJaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMTIgMTRDOS4zMzk3MiAxNCA2LjkyMTc4IDE1LjMzMzUgNS42ODE3OCAxNy42MzUxQzUuMDc3OCAxOC43NDkxIDUuMDc3OCAxOS45ODQ3IDUuNjgxNzggMjEuMDk4N0M2LjkyMTc4IDIzLjQwMDMgOS4zMzk3MiAyNC43MzM4IDEyIDI0LjczMzhDMTQuNjYwMyAyNC43MzM4IDE3LjA3ODIgMjMuNDAwMyAxOC4zMTgyIDIxLjA5ODdDMTguOTIyMiAxOS45ODQ3IDE4LjkyMjIgMTguNzQ5MSAxOC4zMTgyIDE3LjYzNTFDMTcuMDc4MiAxNS4zMzM1IDE0LjY2MDMgMTQgMTIgMTRaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4KPC9zdmc+',
    online: true,
    unreadCount: 0,
  },
])

// Mock messages data - sẽ thay thế bằng Zalo API
const messages = ref<Message[]>([
  {
    id: '1',
    direction: 'in',
    text: 'Hi Khuyen, do you have a moment to talk about the new project?',
    senderName: 'Olivia Rhye',
    time: '00:00',
    avatar: oliviaAvatar,
  },
  {
    id: '2',
    direction: 'in',
    text: 'Sure, Olivia. What\'s on your mind?',
    senderName: 'Nha Khuyen',
    time: '00:00',
    status: 'read',
  },
  {
    id: '3',
    direction: 'in',
    text: 'I\'ve just reviewed the client\'s requirements, and we need to adjust our timeline. How far along are you with the initial draft?',
    senderName: 'Olivia Rhye',
    time: '00:00',
    avatar: oliviaAvatar,
  },
  {
    id: '4',
    direction: 'in',
    text: 'I\'m about 70% done. Most of the structure is complete, but I still need to polish the details and add the visuals.',
    senderName: 'Nha Khuyen',
    time: '00:00',
    status: 'read',
  },
  {
    id: '5',
    direction: 'in',
    text: 'That\'s good progress. The client is asking for a preview by Friday. Do you think you can send me a version before then, maybe by Thursday afternoon?',
    senderName: 'Olivia Rhye',
    time: '00:00',
    avatar: oliviaAvatar,
  },
  {
    id: '6',
    direction: 'in',
    text: 'Yes, I can manage that. I\'ll stay late today and tomorrow if necessary.',
    senderName: 'Nha Khuyen',
    time: '00:00',
    status: 'read',
  },
  {
    id: '7',
    direction: 'in',
    text: 'Great. Also, make sure to highlight the key features—they\'re very focused on functionality this time.',
    senderName: 'Olivia Rhye',
    time: '00:00',
    avatar: oliviaAvatar,
  },
  {
    id: '8',
    direction: 'in',
    text: 'Got it. Should I also prepare a short presentation, or just send the draft?',
    senderName: 'Nha Khuyen',
    time: '00:00',
    status: 'read',
  },
  {
    id: '9',
    direction: 'in',
    text: 'Great. Also, make sure to highlight the key features—they\'re very focused on functionality this time.',
    senderName: 'Olivia Rhye',
    time: '00:00',
    avatar: oliviaAvatar,
  },
  {
    id: '10',
    direction: 'in',
    text: 'Great. Also, make sure to highlight the key features—they\'re very focused on functionality this time.',
    senderName: 'Olivia Rhye',
    time: '00:00',
    avatar: oliviaAvatar,
  },
  {
    id: '11',
    direction: 'in',
    text: 'Great. Also, make sure to highlight the key features—they\'re very focused on functionality this time.',
    senderName: 'Olivia Rhye',
    time: '00:00',
    avatar: oliviaAvatar,
  },
  {
    id: '12',
    direction: 'in',
    text: 'Great. Also, make sure to highlight the key features—they\'re very focused on functionality this time.',
    senderName: 'Olivia Rhye',
    time: '00:00',
    avatar: oliviaAvatar,
  },
  {
    id: '13',
    direction: 'in',
    text: 'Great. Also, make sure to highlight the key features—they\'re very focused on functionality this time.',
    senderName: 'Olivia Rhye',
    time: '00:00',
    avatar: oliviaAvatar,
  },
  {
    id: '14',
    direction: 'in',
    text: 'Great. Also, make sure to highlight the key features—they\'re very focused on functionality this time.',
    senderName: 'Olivia Rhye',
    time: '00:00',
    avatar: oliviaAvatar,
  },
  {
    id: '15',
    direction: 'in',
    text: 'Great. Also, make sure to highlight the key features—they\'re very focused on functionality this time.',
    senderName: 'Olivia Rhye',
    time: '00:00',
    avatar: oliviaAvatar,
  },
  {
    id: '16',
    direction: 'in',
    text: 'Great. Also, make sure to highlight the key features—they\'re very focused on functionality this time.',
    senderName: 'Olivia Rhye',
    time: '00:00',
    avatar: oliviaAvatar,
  },
  {
    id: '17',
    direction: 'in',
    text: 'Great. Also, make sure to highlight the key features—they\'re very focused on functionality this time.',
    senderName: 'Olivia Rhye',
    time: '00:00',
    avatar: oliviaAvatar,
  },
  {
    id: '18',
    direction: 'in',
    text: 'Great. Also, make sure to highlight the key features—they\'re very focused on functionality this time.',
    senderName: 'Olivia Rhye',
    time: '00:00',
    avatar: oliviaAvatar,
  },
])

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

// Methods
function selectConversation(id: string) {
  activeConversationId.value = id
  scrollToBottom()
}

function handleAddUser() {
  console.warn('Add user clicked')
}

function handleFilter() {
  console.warn('Filter clicked')
}

function sendMessage() {
  if (!messageText.value.trim())
    return

  const newMessage: Message = {
    id: Date.now().toString(),
    direction: 'out',
    text: messageText.value.trim(),
    senderName: 'Nha Khuyen',
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    status: 'sent',
  }

  messages.value.push(newMessage)
  messageText.value = ''

  nextTick(() => {
    scrollToBottom()
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

function handleImageError(event: Event, conversationName: string) {
  const img = event.target as HTMLImageElement

  // Check if we've already tried the fallback to avoid infinite loop
  if (img.src.includes('ui-avatars.com')) {
    console.error(`Both original and fallback avatar failed for ${conversationName}`)
    // Remove the error handler to prevent further loops
    img.onerror = null
    // Set a simple data URL as last resort
    img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNFNUU3RUIiLz4KPHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSI4IiB5PSI4Ij4KPHBhdGggZD0iTTEyIDEyQzE0LjIwOTEgMTIgMTYgMTAuMjA5MSAxNiA4QzE2IDUuNzkwODYgMTQuMjA5MSA0IDEyIDRDOS43OTA4NiA0IDggNS43OTA4NiA4IDhDOCAxMC4yMDkxIDkuNzkwODYgMTIgMTIgMTJaIiBmaWxsPSIjOUM5Q0EwIi8+CjxwYXRoIGQ9Ik0xMiAxNEM5LjMzOTcyIDE0IDYuOTIxNzggMTUuMzMzNSA1LjY4MTc4IDE3LjYzNTFDNS4wNzc4IDE4Ljc0OTEgNS4wNzc4IDE5Ljk4NDcgNS42ODE3OCAyMS4wOTg3QzYuOTIxNzggMjMuNDAwMyA5LjMzOTcyIDI0LjczMzggMTIgMjQuNzMzOEMxNC42NjAzIDI0LjczMzggMTcuMDc4MiAyMy40MDAzIDE4LjMxODIgMjEuMDk4N0MxOC45MjIyIDE5Ljk4NDcgMTguOTIyMiAxOC43NDkxIDE4LjMxODIgMTcuNjM1MUMxNy4wNzgyIDE1LjMzMzUgMTQuNjYwMyAxNCAxMiAxNFoiIGZpbGw9IiM5QzlDQTAiLz4KPC9zdmc+Cjwvc3ZnPgo='
    return
  }

  console.error(`Failed to load avatar for ${conversationName}`, event)
  // Set fallback avatar
  img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(conversationName)}&background=random`
}

// Future: Load conversations from Zalo API
async function _loadZaloConversations() {
  // TODO: Implement Zalo API integration
  // const response = await fetch('zalo-api-endpoint', {
  //   headers: { 'Authorization': `Bearer ${zaloAccessToken}` }
  // })
  // const data = await response.json()
  // conversations.value = data.conversations
  console.warn('Zalo API integration pending')
}

// Future: Load messages from Zalo API
async function _loadZaloMessages(_conversationId: string) {
  // TODO: Implement Zalo API integration
  // const response = await fetch(`zalo-api-endpoint/messages/${conversationId}`)
  // const data = await response.json()
  // messages.value = data.messages
  console.warn('Zalo API integration pending')
}

// Lifecycle
onMounted(() => {
  scrollToBottom()
  // loadZaloConversations() // Sẽ enable sau khi có Zalo API
})
</script>

<template>
  <private-view title="Messages">
    <template #title-outer:prepend>
      <v-button class="header-icon" rounded disabled icon secondary>
        <v-icon name="inbox" />
      </v-button>
    </template>
    <template #navigation>
      <!-- Search and Filter Section -->
      <div class="p-3 border-neutral-200 space-y-3">
        <div class="relative">
          <input
            v-model="navSearchQuery"
            placeholder="Search conversation"
            class="w-full pl-10 pr-3 py-3 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          >
        </div>

        <VDivider />

        <div class="flex items-center justify-between">
          <button class="w-8 h-8 flex items-center justify-center rounded-md bg-transparent hover:bg-neutral-100 text-text-muted hover:text-text-secondary transition-colors" @click="handleAddUser">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M20 25V23C20 21.9391 19.5786 20.9217 18.8284 20.1716C18.0783 19.4214 17.0609 19 16 19H10C8.93913 19 7.92172 19.4214 7.17157 20.1716C6.42143 20.9217 6 21.9391 6 23V25M23 12V18M26 15H20M17 11C17 13.2091 15.2091 15 13 15C10.7909 15 9 13.2091 9 11C9 8.79086 10.7909 7 13 7C15.2091 7 17 8.79086 17 11Z" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /> </svg>
          </button>

          <button
            class="flex items-center gap-1 px-3 py-1 text-[14px] font-medium leading-normal not-italic
         rounded-[var(--Button-Radius-button,6px)]
         !border !border-solid !border-[var(--border-normal,#D3DAE4)]
         text-[var(--foreground-normal,#4F5464)]
         font-[Inter] transition-colors"
            @click="handleFilter"
          >
            <span>Filter</span>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19.92 8.94995L13.4 15.47C12.63 16.24 11.37 16.24 10.6 15.47L4.07996 8.94995" stroke="#4F5464" stroke-width="2" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Conversation List -->
      <div class="flex-1 overflow-y-auto ">
        <div class="p-2 space-y-1">
          <div
            v-for="conversation in filteredConversations"
            :key="conversation.id"
            class="flex items-center p-2 rounded-lg cursor-pointer transition-colors duration-200 hover:bg-neutral-50" :class="[
              {
                'bg-brand-100': conversation.id === activeConversationId,
                'bg-transparent': conversation.id !== activeConversationId,
              },
            ]"
            @click="selectConversation(conversation.id)"
          >
            <div class="flex items-center gap-2 flex-1 min-w-0">
              <div class="relative inline-block">
                <div class="w-8 h-8 relative rounded-full overflow-hidden bg-neutral-100 border border-black/8">
                  <img
                    :src="conversation.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(conversation.name)}&background=random`"
                    :alt="conversation.name"
                    class="w-full h-full object-cover"
                    @error="handleImageError($event, conversation.name)"
                  >
                </div>
                <div
                  v-if="conversation.online"
                  class="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-success-500 border-2 border-white"
                />
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                  <h4
                    class="font-medium text-sm truncate" :class="[
                      {
                        'text-text-primary': conversation.id === activeConversationId,
                        'text-text-secondary': conversation.id !== activeConversationId,
                      },
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
    <template #sidebar>
    <sidebar-detail icon="info" title="Information" close>
        <div v-md="page_description" class="page-description" />
    </sidebar-detail>
    <sidebar-detail icon="layers" title="SIDEBAR ITEM">
        SIDEBAR ITEM CONTENT
    </sidebar-detail>
    </template>


    <!-- Main Chat Area với absolute positioning -->
    <div class="chat-container">
      <!-- Chat Header - Fixed tại top -->
      <div
        v-if="activeConversation"
        class="chat-header"
      >
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-4">
            <div class="relative inline-block">
              <div class="w-10 h-10 relative rounded-full overflow-hidden bg-neutral-100 border border-black/8">
                <img
                  :src="activeConversation.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(activeConversation.name)}&background=random`"
                  :alt="activeConversation.name"
                  class="w-full h-full object-cover"
                  @error="handleImageError($event, activeConversation.name)"
                >
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
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20.5 19.95C20.9833 19.4167 21.3542 18.8083 21.6125 18.125C21.8708 17.4417 22 16.7333 22 16C22 15.2667 21.8708 14.5583 21.6125 13.875C21.3542 13.1917 20.9833 12.5833 20.5 12.05C21.5 12.1833 22.3333 12.625 23 13.375C23.6667 14.125 24 15 24 16C24 17 23.6667 17.875 23 18.625C22.3333 19.375 21.5 19.8167 20.5 19.95ZM26 28V25C26 24.4 25.8667 23.8292 25.6 23.2875C25.3333 22.7458 24.9833 22.2667 24.55 21.85C25.4 22.15 26.1875 22.5375 26.9125 23.0125C27.6375 23.4875 28 24.15 28 25V28H26ZM28 21V19H26V17H28V15H30V17H32V19H30V21H28ZM16 20C14.9 20 13.9583 19.6083 13.175 18.825C12.3917 18.0417 12 17.1 12 16C12 14.9 12.3917 13.9583 13.175 13.175C13.9583 12.3917 14.9 12 16 12C17.1 12 18.0417 12.3917 18.825 13.175C19.6083 13.9583 20 14.9 20 16C20 17.1 19.6083 18.0417 18.825 18.825C18.0417 19.6083 17.1 20 16 20ZM8 28V25.2C8 24.6333 8.14583 24.1125 8.4375 23.6375C8.72917 23.1625 9.11667 22.8 9.6 22.55C10.6333 22.0333 11.6833 21.6458 12.75 21.3875C13.8167 21.1292 14.9 21 16 21C17.1 21 18.1833 21.1292 19.25 21.3875C20.3167 21.6458 21.3667 22.0333 22.4 22.55C22.8833 22.8 23.2708 23.1625 23.5625 23.6375C23.8542 24.1125 24 24.6333 24 25.2V28H8ZM16 18C16.55 18 17.0208 17.8042 17.4125 17.4125C17.8042 17.0208 18 16.55 18 16C18 15.45 17.8042 14.9792 17.4125 14.5875C17.0208 14.1958 16.55 14 16 14C15.45 14 14.9792 14.1958 14.5875 14.5875C14.1958 14.9792 14 15.45 14 16C14 16.55 14.1958 17.0208 14.5875 17.4125C14.9792 17.8042 15.45 18 16 18ZM10 26H22V25.2C22 25.0167 21.9542 24.85 21.8625 24.7C21.7708 24.55 21.65 24.4333 21.5 24.35C20.6 23.9 19.6917 23.5625 18.775 23.3375C17.8583 23.1125 16.9333 23 16 23C15.0667 23 14.1417 23.1125 13.225 23.3375C12.3083 23.5625 11.4 23.9 10.5 24.35C10.35 24.4333 10.2292 24.55 10.1375 24.7C10.0458 24.85 10 25.0167 10 25.2V26Z" fill="#1F1F1F" />
              </svg>
            </button>
            <button class="w-10 h-10 flex items-center justify-center rounded-lg bg-transparent hover:bg-neutral-100 text-text-muted hover:text-text-secondary transition-colors">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M29 28.9999L24.66 24.6599M27 19C27 23.4183 23.4183 27 19 27C14.5817 27 11 23.4183 11 19C11 14.5817 14.5817 11 19 11C23.4183 11 27 14.5817 27 19Z" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>

            <Story title="VMenu">
              <v-menu>
                <template #activator="{ toggle }">
                  <v-icon clickable class="options" name="more_vert" @click="toggle" />
                </template>
                <v-list>
                  <v-list-item clickable>
                    <v-list-item-icon><v-icon name="folder_open" /></v-list-item-icon>
                    <v-list-item-content>Choose from Library</v-list-item-content>
                  </v-list-item>

                  <v-list-item clickable>
                    <v-list-item-icon><v-icon name="link" /></v-list-item-icon>
                    <v-list-item-content>Choose from Url</v-list-item-content>
                  </v-list-item>
                </v-list>
              </v-menu>
            </Story>
          </div>
        </div>
      </div>

      <!-- Messages area - Scrollable với padding cho header và input -->
      <div
        v-if="activeConversation"
        ref="messagesContainer"
        class="messages-area"
      >
        <div class="space-y-1">
          <div
            v-for="message in messages"
            :key="message.id"
            class="flex gap-4 px-8 py-3" :class="[
              {
                'justify-start': message.direction === 'in',
                'justify-end': message.direction === 'out',
              },
            ]"
          >
            <!-- Avatar for incoming messages -->
            <div
              v-if="message.direction === 'in'"
              class="w-13 h-13 relative rounded-full overflow-hidden bg-neutral-100 border border-black/8 flex-shrink-0"
            >
              <img
                :src="message.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(message.senderName)}&background=random`"
                :alt="message.senderName"
                class="w-full h-full object-cover"
                @error="handleImageError($event, message.senderName)
                "
              >
            </div>

            <div
              class="flex flex-col max-w-[70%]" :class="[
                {
                  'items-start': message.direction === 'in',
                  'items-end': message.direction === 'out',
                },
              ]"
            >
              <!-- Message header with name and time -->
              <div
                class="flex items-center gap-2 mb-2" :class="[
                  {
                    'flex-row ': message.direction === 'in',
                    'flex-row-reverse': message.direction === 'out',
                  },
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
                class="rounded-lg max-w-full break-words text-sm text-text-secondary leading-relaxed" :class="[
                  {
                    '  border-neutral-200': message.direction === 'in',
                    'bg-brand-500 text-white': message.direction === 'out',
                  },
                ]"
              >
                <p class="whitespace-pre-wrap">
                  {{ message.text }}
                </p>
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

      <!-- Message input - Fixed tại bottom -->
      <div
        v-if="activeConversation"
        class="message-input"
      >
        <div class="flex items-end gap-3">
          <div class="flex gap-2">
            <Story title="VMenu">
              <v-menu>
                <template #activator="{ toggle }">
                  <v-icon clickable class="options" name="attach_file" @click="toggle" />
                </template>
                <v-list>
                  <v-list-item clickable>
                    <v-list-item-icon><v-icon name="folder_open" /></v-list-item-icon>
                    <v-list-item-content>Choose from Library</v-list-item-content>
                  </v-list-item>

                  <v-list-item clickable>
                    <v-list-item-icon><v-icon name="link" /></v-list-item-icon>
                    <v-list-item-content>Choose from Url</v-list-item-content>
                  </v-list-item>
                </v-list>
              </v-menu>
            </Story>
            <VEmojiPicker @emoji-selected="logEvent('emoji-selected', $event)">
              My Button
            </VEmojiPicker>
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

<style scoped>
@import '../styles/tailwind.css';

/* Override Directus global styles */
.chat-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: calc(100vh - 65px); /* Trừ đi header của Directus */
  background: white;
  overflow: hidden;
  position: relative;
}

/* Header cố định */
.chat-header {
  flex-shrink: 0;
  height: 80px;
  padding: 16px 40px;
  border-top: 1px solid var(--border-normal, #D3DAE4);
  border-bottom: 1px solid var(--border-normal, #D3DAE4);
  background: var(--background-page, white);
  z-index: 10;
  display: flex;
  align-items: center;
}

/* Messages area - flex-grow để chiếm không gian còn lại */
.messages-area {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 16px;
  background: var(--background-page, white);
  min-height: 0; /* Important cho flex shrinking */
  height:10px !important;
}

/* Input cố định ở dưới */
.message-input {
  flex-shrink: 0;
  height: 120px !important;
  min-height: 80px;
  padding: 16px;
  border-top: 1px solid var(--border-normal, #D3DAE4);
  background: var(--background-page, white);
  z-index: 10;
}

/* Reset Directus global styles that interfere */
.chat-container * {
  box-sizing: border-box;
}

/* Ensure proper scrolling behavior */
.messages-area::-webkit-scrollbar {
  width: 6px;
}

.messages-area::-webkit-scrollbar-track {
  background: transparent;
}

.messages-area::-webkit-scrollbar-thumb {
  background: var(--border-normal, #D3DAE4);
  border-radius: 3px;
}

.messages-area::-webkit-scrollbar-thumb:hover {
  background: var(--border-subdued, #A2B5CD);
}
html, body, #app, .directus, .private-view, main.content, .content--wrap, .main-content.content {
    height: 100% !important;
    min-height: 0 !important;
    overflow: hidden !important;
}
:deep(main.content),
:deep(.content--wrap),
:deep(.private-view) {
  overflow: hidden !important;
  height: 100% !important;
}
</style>
