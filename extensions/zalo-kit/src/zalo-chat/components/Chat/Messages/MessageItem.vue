<script setup lang="ts">
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
  message: Message
  isHighlighted: boolean
}

defineProps<Props>()

function handleImageError(event: Event, name: string) {
  const target = event.target as HTMLImageElement
  target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
}
</script>

<template>
  <div
    class="message-wrapper"
    :class="message.direction"
    :data-message-id="message.id"
  >
    <!-- System Message -->
    <div v-if="message.type === 'system'" class="system-message">
      <div class="system-message-content">
        {{ message.text }}
      </div>
    </div>

    <!-- Regular Message -->
    <div v-else class="message-row" :class="{ highlighted: isHighlighted }">
      <!-- Avatar (left side for incoming) -->
      <div v-if="message.direction === 'in'" class="message-avatar">
        <img
          :src="message.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(message.senderName)}&background=random`"
          :alt="message.senderName"
          @error="handleImageError($event, message.senderName)"
        >
      </div>

      <!-- Message Content -->
      <div class="message-content">
        <!-- Sender name (for incoming) -->
        <div v-if="message.direction === 'in'" class="sender-name">
          {{ message.senderName }}
        </div>

        <!-- Message bubble -->
        <div class="message-bubble" :class="message.direction">
          <div class="message-text">
            {{ message.text }}
          </div>

          <!-- Files if any -->
          <div v-if="message.files && message.files.length > 0" class="message-files">
            <div
              v-for="file in message.files"
              :key="file.id"
              class="file-item"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M14 2V8H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span>{{ file.filename }}</span>
            </div>
          </div>
        </div>

        <!-- Time and Status -->
        <div class="message-meta">
          <span class="message-time">{{ message.time }}</span>
          <span v-if="message.direction === 'out' && message.status" class="message-status">
            {{ message.status === 'delivered' ? '✓✓' : message.status === 'read' ? '✓✓' : '✓' }}
          </span>
        </div>
      </div>

      <!-- Avatar (right side for outgoing) -->
      <div v-if="message.direction === 'out'" class="message-avatar">
        <img
          :src="message.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(message.senderName)}&background=random`"
          :alt="message.senderName"
          @error="handleImageError($event, message.senderName)"
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-wrapper {
  display: flex;
  width: 100%;
  margin-bottom: 12px;
}

.message-wrapper.in {
  justify-content: flex-start;
}

.message-wrapper.out {
  justify-content: flex-end;
}

.system-message {
  display: flex;
  justify-content: center;
  width: 100%;
  padding: 8px 0;
}

.system-message-content {
  background: rgba(0, 0, 0, 0.05);
  color: #4F5464;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 12px;
  text-align: center;
}

.message-row {
  display: flex;
  gap: 12px;
  max-width: 70%;
  transition: background-color 0.3s;
  padding: 8px;
  border-radius: 8px;
}

.message-row.highlighted {
  background: #FFF9E6;
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  background: #E4EAF1;
  flex-shrink: 0;
}

.message-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.message-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.sender-name {
  font-family: Inter;
  font-size: 12px;
  font-weight: 500;
  color: #172940;
}

.message-bubble {
  padding: 10px 14px;
  border-radius: 12px;
  word-wrap: break-word;
}

.message-bubble.in {
  background: #F0F4F9;
  color: #172940;
  border-top-left-radius: 4px;
}

.message-bubble.out {
  background: #6644FF;
  color: white;
  border-top-right-radius: 4px;
}

.message-text {
  font-family: Inter;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.message-files {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  font-size: 13px;
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #A2B5CD;
}

.message-time {
  font-family: Inter;
}

.message-status {
  color: #17B26A;
}

.message-wrapper.out .message-meta {
  justify-content: flex-end;
}
</style>
