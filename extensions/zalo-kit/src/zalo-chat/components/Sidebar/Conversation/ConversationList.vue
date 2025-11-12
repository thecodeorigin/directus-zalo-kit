<script setup lang="ts">
import ConversationItem from './ConversationItem.vue'

interface Conversation {
  id: string
  name: string
  avatar: string
  lastMessage: string
  timestamp: string
  unreadCount: number
  online: boolean
  type: 'group' | 'direct'
  members?: any[]
  hasRealAvatar?: boolean
}

interface Props {
  conversations: Conversation[]
  activeConversationId: string
}

defineProps<Props>()

const emit = defineEmits<{
  selectConversation: [id: string]
}>()
</script>

<template>
  <div class="conversation-list">
    <ConversationItem
      v-for="conversation in conversations"
      :key="conversation.id"
      :conversation="conversation"
      :is-active="conversation.id === activeConversationId"
      @select="emit('selectConversation', conversation.id)"
    />
  </div>
</template>

<style scoped>
.conversation-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  overflow-y: auto;
  flex: 1;
}

.conversation-list::-webkit-scrollbar {
  width: 6px;
}

.conversation-list::-webkit-scrollbar-track {
  background: transparent;
}

.conversation-list::-webkit-scrollbar-thumb {
  background: #D3DAE4;
  border-radius: 3px;
}

.conversation-list::-webkit-scrollbar-thumb:hover {
  background: #A2B5CD;
}
</style>
