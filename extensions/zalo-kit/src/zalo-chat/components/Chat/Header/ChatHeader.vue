<script setup lang="ts">
interface Conversation {
  id: string
  name: string
  avatar: string
  online: boolean
  type: 'group' | 'direct'
  members?: any[]
  hasRealAvatar?: boolean
}

interface Props {
  conversation: Conversation | null
}

defineProps<Props>()

const emit = defineEmits<{
  openMembers: []
  openSearch: []
  openInfo: []
}>()

function handleImageError(event: Event, name: string) {
  const target = event.target as HTMLImageElement
  target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
}
</script>

<template>
  <div v-if="conversation" class="chat-header">
    <div class="header-content">
      <div class="header-left">
        <!-- GROUP Avatar -->
        <div v-if="conversation.type === 'group'">
          <!-- Có ảnh thật -->
          <div
            v-if="conversation.avatar && !conversation.avatar.startsWith('data:')"
            class="avatar-large"
          >
            <img
              :src="conversation.avatar"
              :alt="conversation.name"
            >
          </div>

          <!-- Group với 3 members -->
          <div
            v-else-if="conversation.members && conversation.members.length > 0"
            class="avatar-group-header"
          >
            <div
              v-for="(member, index) in conversation.members.slice(0, 3)"
              :key="member.id || index"
              class="avatar-group-item-header"
              :class="`position-${index}`"
            >
              <img
                :src="member.avatar"
                :alt="member.name"
              >
            </div>
          </div>

          <!-- Fallback -->
          <div v-else class="avatar-large">
            <img
              :src="conversation.avatar"
              :alt="conversation.name"
            >
          </div>
        </div>

        <!-- INDIVIDUAL Avatar -->
        <div v-else class="avatar-container">
          <div class="avatar-large">
            <img
              :src="conversation.avatar"
              :alt="conversation.name"
              @error="handleImageError($event, conversation.name)"
            >
          </div>
          <div v-if="conversation.online" class="online-indicator-large" />
        </div>

        <h3 class="conversation-title">
          {{ conversation.name }}
        </h3>
      </div>

      <div class="header-actions">
        <button class="action-btn" @click="emit('openMembers')">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12.5 11.95C12.9833 11.4167 13.3542 10.8083 13.6125 10.125C13.8708 9.44167 14 8.73333 14 8C14 7.26667 13.8708 6.55833 13.6125 5.875C13.3542 5.19167 12.9833 4.58333 12.5 4.05C13.5 4.18333 14.3333 4.625 15 5.375C15.6667 6.125 16 7 16 8C16 9 15.6667 9.875 15 10.625C14.3333 11.375 13.5 11.8167 12.5 11.95ZM18 20V17C18 16.4 17.8667 15.8292 17.6 15.2875C17.3333 14.7458 16.9833 14.2667 16.55 13.85C17.4 14.15 18.1875 14.5375 18.9125 15.0125C19.6375 15.4875 20 16.15 20 17V20H18ZM20 13V11H18V9H20V7H22V9H24V11H22V13H20ZM8 12C6.9 12 5.95833 11.6083 5.175 10.825C4.39167 10.0417 4 9.1 4 8C4 6.9 4.39167 5.95833 5.175 5.175C5.95833 4.39167 6.9 4 8 4C9.1 4 10.0417 4.39167 10.825 5.175C11.6083 5.95833 12 6.9 12 8C12 9.1 11.6083 10.0417 10.825 10.825C10.0417 11.6083 9.1 12 8 12ZM0 20V17.2C0 16.6333 0.145833 16.1125 0.4375 15.6375C0.729167 15.1625 1.11667 14.8 1.6 14.55C2.63333 14.0333 3.68333 13.6458 4.75 13.3875C5.81667 13.1292 6.9 13 8 13C9.1 13 10.1833 13.1292 11.25 13.3875C12.3167 13.6458 13.3667 14.0333 14.4 14.55C14.8833 14.8 15.2708 15.1625 15.5625 15.6375C15.8542 16.1125 16 16.6333 16 17.2V20H0ZM8 10C8.55 10 9.02083 9.80417 9.4125 9.4125C9.80417 9.02083 10 8.55 10 8C10 7.45 9.80417 6.97917 9.4125 6.5875C9.02083 6.19583 8.55 6 8 6C7.45 6 6.97917 6.19583 6.5875 6.5875C6.19583 6.97917 6 7.45 6 8C6 8.55 6.19583 9.02083 6.5875 9.4125C6.97917 9.80417 7.45 10 8 10ZM2 18H14V17.2C14 17.0167 13.9542 16.85 13.8625 16.7C13.7708 16.55 13.65 16.4333 13.5 16.35C12.6 15.9 11.6917 15.5625 10.775 15.3375C9.85833 15.1125 8.93333 15 8 15C7.06667 15 6.14167 15.1125 5.225 15.3375C4.30833 15.5625 3.4 15.9 2.5 16.35C2.35 16.4333 2.22917 16.55 2.1375 16.7C2.04583 16.85 2 17.0167 2 17.2V18Z" fill="#1F1F1F" />
          </svg>
        </button>

        <button class="action-btn" @click="emit('openSearch')">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M21 20.9999L16.66 16.6599M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3C15.4183 3 19 6.58172 19 11Z" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>

        <button class="action-btn" @click="emit('openInfo')">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M12 6C12.5523 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4C11.4477 4 11 4.44772 11 5C11 5.55228 11.4477 6 12 6Z" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M12 20C12.5523 20 13 19.5523 13 19C13 18.4477 12.5523 18 12 18C11.4477 18 11 18.4477 11 19C11 19.5523 11.4477 20 12 20Z" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-header {
  flex-shrink: 0;
  height: 80px;
  padding: 16px 31px;
  border-top: 1px solid var(--border-normal, #d3dae4);
  border-bottom: 1px solid var(--border-normal, #d3dae4);
  background: var(--background-page, white);
  z-index: 10;
  display: flex;
  align-items: center;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 100%;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.avatar-container {
  position: relative;
}

.avatar-large {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  background: #E4EAF1;
  border: 0.75px solid rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
}

.avatar-large img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-group-header {
  position: relative;
  width: 56px;
  height: 56px;
  flex-shrink: 0;
}

.avatar-group-item-header {
  position: absolute;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  overflow: hidden;
  background: white;
  border: 2px solid white;
}

.avatar-group-item-header.position-0 {
  top: 0;
  left: 0;
  z-index: 3;
}

.avatar-group-item-header.position-1 {
  top: 0;
  right: 0;
  z-index: 2;
}

.avatar-group-item-header.position-2 {
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1;
}

.avatar-group-item-header img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.online-indicator-large {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #17B26A;
  border: 2px solid white;
}

.conversation-title {
  font-family: Inter;
  font-size: 18px;
  font-weight: 600;
  color: #172940;
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.action-btn:hover {
  background: rgba(0, 0, 0, 0.04);
}
</style>
