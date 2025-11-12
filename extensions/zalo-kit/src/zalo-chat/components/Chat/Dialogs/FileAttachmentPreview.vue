<script setup lang="ts">
import type { FileAttachment } from '../../../types'

interface Props {
  attachments: FileAttachment[]
  getFileIcon: (type: string) => string
}

defineProps<Props>()

defineEmits<{
  edit: [index: number]
  remove: [index: number]
}>()
</script>

<template>
  <div v-if="attachments.length > 0" class="pending-attachments-container">
    <div
      v-for="(attachment, index) in attachments"
      :key="attachment.id"
      class="attachment-preview"
    >
      <!-- File Icon/Preview -->
      <div class="attachment-content">
        <div class="file-icon-wrapper">
          <v-icon
            :name="getFileIcon(attachment.type)"
            class="text-brand-600"
            small
          />
        </div>

        <!-- File Name -->
        <span class="file-name">{{ attachment.filename }}</span>
      </div>

      <!-- Action Buttons -->
      <div class="attachment-actions">
        <!-- Edit button -->
        <v-button
          icon
          secondary
          x-small
          @click="$emit('edit', index)"
        >
          <v-icon name="edit" small />
        </v-button>

        <!-- Remove button -->
        <v-button
          icon
          secondary
          x-small
          @click="$emit('remove', index)"
        >
          <v-icon name="delete" small />
        </v-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pending-attachments-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}

.attachment-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px;
  background: white;
  border: 2px solid #D3DAE4;
  border-radius: 6px;
  transition: border-color 0.2s;
}

.attachment-preview:hover {
  border-color: #B8C5D6;
}

.attachment-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.file-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  background: #F0ECFF;
  border-radius: 6px;
  flex-shrink: 0;
}

.file-name {
  font-family: Inter;
  font-weight: 500;
  font-size: 14px;
  line-height: 1.21;
  color: #0461cc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.attachment-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
