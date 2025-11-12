<script setup lang="ts">
interface UploadProgressItem {
  fileName: string
  progress: number
  status: 'uploading' | 'success' | 'error' | 'pending'
}

interface Props {
  isUploading: boolean
  uploadProgress: Map<string, UploadProgressItem>
}

defineProps<Props>()
</script>

<template>
  <div v-if="isUploading" class="upload-progress-container">
    <div class="flex flex-col gap-2 p-4 bg-white border border-gray-200 rounded-lg shadow-lg max-w-md">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-gray-700">Uploading files...</span>
        <span class="text-xs text-gray-500">{{ uploadProgress.size }} file(s)</span>
      </div>
      <div
        v-for="[fileId, progress] in Array.from(uploadProgress.entries())"
        :key="fileId"
        class="flex flex-col gap-1"
      >
        <div class="flex items-center justify-between text-xs">
          <span class="truncate max-w-[200px] text-gray-600">{{ progress.fileName }}</span>
          <span
            class="font-medium"
            :class="{
              'text-blue-600': progress.status === 'uploading',
              'text-green-600': progress.status === 'success',
              'text-red-600': progress.status === 'error',
            }"
          >
            {{ progress.status === 'success' ? '✓' : progress.status === 'error' ? '✗' : `${progress.progress}%` }}
          </span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-1.5">
          <div
            class="h-1.5 rounded-full transition-all duration-300"
            :class="{
              'bg-blue-600': progress.status === 'uploading',
              'bg-green-600': progress.status === 'success',
              'bg-red-600': progress.status === 'error',
            }"
            :style="{ width: `${progress.progress}%` }"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import "../../../../styles/tailwind.css";

.upload-progress-container {
  position: absolute;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
</style>
