<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  messageText: string
  sendingMessage: boolean
  pendingAttachmentsCount?: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:messageText': [value: string]
  'send': []
  'openEmoji': []
  'openAttachMenu': []
  'openSticker': []
}>()

const messageInputRef = ref<HTMLTextAreaElement | null>(null)

function autoResize(event: Event) {
  const textarea = event.target as HTMLTextAreaElement
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    if (props.messageText.trim() || (props.pendingAttachmentsCount && props.pendingAttachmentsCount > 0)) {
      emit('send')
    }
  }
}

defineExpose({
  messageInputRef,
})
</script>

<template>
  <div class="message-input">
    <div class="input-container">
      <!-- Action Buttons -->
      <div class="action-buttons">
        <!-- File Upload Menu Slot -->
        <slot name="attach-menu" />

        <!-- Emoji Picker Slot -->
        <slot name="emoji-picker" />

        <!-- Sticker Button -->
        <button
          class="input-action-btn"
          title="Sticker"
          @click="emit('openSticker')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M13.7778 4V7.55556C13.7778 8.02705 13.9651 8.47924 14.2985 8.81263C14.6319 9.14603 15.0841 9.33333 15.5556 9.33333H19.1111M8.44444 12.8889H8.45333M15.5556 12.8889H15.5644M10.2222 15.5556C10.2222 15.5556 10.9333 16.4444 12 16.4444C13.1556 16.4444 13.7778 15.5556 13.7778 15.5556M15.1111 4H5.77778C5.30628 4 4.8541 4.1873 4.5207 4.5207C4.1873 4.8541 4 5.30628 4 5.77778V18.2222C4 19.2 4.8 20 5.77778 20H18.2222C18.6937 20 19.1459 19.8127 19.4793 19.4793C19.8127 19.1459 20 18.6937 20 18.2222V8.88889L15.1111 4Z" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>

      <!-- Text Input -->
      <textarea
        ref="messageInputRef"
        :value="messageText"
        placeholder="Type a message..."
        class="message-textarea"
        rows="1"
        :disabled="sendingMessage"
        @input="emit('update:messageText', ($event.target as HTMLTextAreaElement).value); autoResize($event)"
        @keydown="handleKeydown"
      />

      <!-- Send Button -->
      <button
        class="send-btn"
        :disabled="(!messageText.trim() && !pendingAttachmentsCount) || sendingMessage"
        @click="emit('send')"
      >
        <svg v-if="!sendingMessage" width="21" height="21" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20.0003 10.5C20.0003 10.5948 19.9734 10.6875 19.9227 10.7675C19.872 10.8476 19.7996 10.9115 19.714 10.952L1.71402 19.452C1.62412 19.4956 1.52318 19.5112 1.42434 19.4966C1.32549 19.4821 1.2333 19.4381 1.15974 19.3705C1.08619 19.3029 1.03468 19.2147 1.0119 19.1174C0.989126 19.0202 0.996137 18.9183 1.03202 18.825L3.87402 11.198C4.0417 10.7478 4.0417 10.2523 3.87402 9.80204L1.03102 2.17504C0.994955 2.08168 0.987852 1.97962 1.01064 1.88216C1.03343 1.78471 1.08505 1.69638 1.15878 1.6287C1.23251 1.56102 1.32492 1.51712 1.42396 1.50273C1.523 1.48834 1.62409 1.50413 1.71402 1.54804L19.714 10.048C19.7996 10.0885 19.872 10.1525 19.9227 10.2325C19.9734 10.3126 20.0003 10.4053 20.0003 10.5ZM20.0003 10.5L4.00003 10.5" stroke="#6644FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span v-else class="spinner" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.message-input {
  position: relative;
  flex-shrink: 0;
  border-top: 1px solid #D3DAE4;
  background: white;
  z-index: 10;
}

.input-container {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  border-radius: 12px;
  padding: 8px 16px;
}

.action-buttons {
  display: flex;
  gap: 10px;
  align-items: center;
  padding-bottom: 4px;
}

.input-action-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
  flex-shrink: 0;
}

.input-action-btn:hover {
  background: rgba(0, 0, 0, 0.04);
}

.message-textarea {
  flex: 1;
  min-height: 36px;
  max-height: 120px;
  padding: 8px 12px;
  font-family: Inter;
  font-size: 14px;
  line-height: 1.5;
  color: #172940;
  background: white;
  border: none;
  border-radius: 8px;
  outline: none;
  resize: none;
  overflow-y: auto;
}

.message-textarea::placeholder {
  color: #A2B5CD;
}

.message-textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.send-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s, opacity 0.2s;
  flex-shrink: 0;
  margin-bottom: 4px;
}

.send-btn:hover:not(:disabled) {
  background: #5533EE;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid white;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
