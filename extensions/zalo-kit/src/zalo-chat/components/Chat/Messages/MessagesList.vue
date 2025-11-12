<script setup lang="ts">
import { ref } from 'vue'
import MessageItem from './MessageItem.vue'

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
  files?: any[]
}

interface Props {
  messages: Message[]
  highlightedMessageId: string | null
}

defineProps<Props>()

const messagesContainer = ref<HTMLElement | null>(null)

defineExpose({
  messagesContainer,
})
</script>

<template>
  <div ref="messagesContainer" class="messages-area">
    <div class="messages-container">
      <MessageItem
        v-for="message in messages"
        :key="message.id"
        :message="message"
        :is-highlighted="message.id === highlightedMessageId"
      />
    </div>
  </div>
</template>

<style scoped>
.messages-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  background: white;
  scroll-behavior: smooth;
}

.messages-container {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  justify-content: flex-end;
}

.messages-area::-webkit-scrollbar {
  width: 6px;
}

.messages-area::-webkit-scrollbar-track {
  background: transparent;
}

.messages-area::-webkit-scrollbar-thumb {
  background: #D3DAE4;
  border-radius: 3px;
}

.messages-area::-webkit-scrollbar-thumb:hover {
  background: #A2B5CD;
}
</style>
