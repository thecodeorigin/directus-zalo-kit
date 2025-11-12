<script setup lang="ts">
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
  conversation: Conversation
  isActive: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  select: []
}>()

function handleImageError(event: Event, name: string) {
  const target = event.target as HTMLImageElement
  target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
}
</script>

<template>
  <div
    class="conversation-item"
    :class="{ active: isActive }"
    @click="emit('select')"
  >
    <div class="conversation-content">
      <!-- GROUP Avatar với nhiều trường hợp -->
      <div v-if="conversation.type === 'group'">
        <!-- Priority 1: Group có ảnh đại diện thật -->
        <div
          v-if="conversation.hasRealAvatar"
          class="avatar-single"
        >
          <img
            :src="conversation.avatar"
            :alt="conversation.name"
            @error="handleImageError($event, conversation.name)"
          >
        </div>

        <!-- Priority 2: Group với 3 member avatars -->
        <div
          v-else-if="conversation.members && conversation.members.length > 0"
          class="avatar-group"
        >
          <div
            v-for="(member, index) in conversation.members.slice(0, 3)"
            :key="member.id || index"
            class="avatar-group-item"
            :class="`position-${index}`"
          >
            <img
              :src="member.avatar"
              :alt="member.name"
              @error="(e) => handleImageError(e, member.name)"
            >
          </div>
        </div>

        <!-- Priority 3: Fallback icon -->
        <div v-else class="avatar-single">
          <img
            :src="conversation.avatar"
            :alt="conversation.name"
          >
        </div>
      </div>

      <!-- INDIVIDUAL Avatar -->
      <div v-else class="avatar-container">
        <div class="avatar-single">
          <img
            :src="conversation.avatar"
            :alt="conversation.name"
            @error="handleImageError($event, conversation.name)"
          >
        </div>
        <div v-if="conversation.online" class="online-indicator" />
      </div>

      <!-- Conversation Info -->
      <div class="conversation-info">
        <div class="conversation-header">
          <h4 class="conversation-name" :class="{ 'active-text': isActive }">
            {{ conversation.name }}
          </h4>
          <span class="conversation-time">
            {{ conversation.timestamp }}
          </span>
        </div>

        <p class="conversation-last-message">
          {{ conversation.lastMessage }}
        </p>
      </div>
    </div>

    <!-- Unread badge -->
    <div v-if="conversation.unreadCount > 0" class="unread-badge">
      {{ conversation.unreadCount > 99 ? "99+" : conversation.unreadCount }}
    </div>
  </div>
</template>

<style scoped>
.conversation-item {
  display: flex;
  align-items: center;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.conversation-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

.conversation-item.active {
  background: #E8F0FE;
}

.conversation-content {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.avatar-container {
  position: relative;
}

.avatar-single {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  overflow: hidden;
  background: #E4EAF1;
  border: 0.75px solid rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
}

.avatar-single img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-group {
  position: relative;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
}

.avatar-group-item {
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  overflow: hidden;
  background: white;
  border: 2px solid white;
}

.avatar-group-item.position-0 {
  top: 0;
  left: 0;
  z-index: 3;
}

.avatar-group-item.position-1 {
  top: 0;
  right: 0;
  z-index: 2;
}

.avatar-group-item.position-2 {
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1;
}

.avatar-group-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.online-indicator {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #17B26A;
  border: 2px solid white;
}

.conversation-info {
  flex: 1;
  min-width: 0;
}

.conversation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.conversation-name {
  font-family: Inter;
  font-size: 14px;
  font-weight: 500;
  color: #172940;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conversation-name.active-text {
  color: #6644FF;
}

.conversation-time {
  font-family: Inter;
  font-size: 12px;
  color: #A2B5CD;
  flex-shrink: 0;
  margin-left: 8px;
}

.conversation-last-message {
  font-family: Inter;
  font-size: 12px;
  color: #4F5464;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
}

.unread-badge {
  min-width: 20px;
  height: 20px;
  background: #6644FF;
  color: white;
  font-size: 11px;
  font-weight: 600;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  margin-left: 8px;
  flex-shrink: 0;
}
</style>
