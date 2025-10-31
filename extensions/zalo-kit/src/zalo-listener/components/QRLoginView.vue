<script setup lang="ts">
defineProps<{
  qrCodeBase64: string | null
  isLoading: boolean
  errorMessage: string | null
}>()

defineEmits<{
  back: []
  generate: []
  retry: []
}>()
</script>

<template>
  <div class="login-view qr-view">
    <div class="view-header">
      <button class="back-btn" @click="$emit('back')">
        <v-icon name="arrow_back" />
      </button>
      <div class="header-info">
        <div class="header-icon qr-icon">
          <v-icon name="qr_code_2" />
        </div>
        <div class="header-text">
          <h2>QR Code Login</h2>
          <p>Scan with your Zalo mobile app</p>
        </div>
      </div>
    </div>

    <div class="view-content">
      <div v-if="!qrCodeBase64 && !errorMessage" class="initial-state">
        <div class="illustration">
          <v-icon name="qr_code_scanner" x-large />
        </div>

        <v-button
          large
          :loading="isLoading"
          :disabled="isLoading"
          class="primary-action"
          @click="$emit('generate')"
        >
          <v-icon name="qr_code_2" left />
          Generate QR Code
        </v-button>
      </div>

      <div v-if="qrCodeBase64" class="qr-display">
        <div class="qr-frame">
          <img :src="`data:image/png;base64,${qrCodeBase64}`" alt="Zalo QR Code">
          <div class="qr-overlay">
            <div class="scan-line" />
          </div>
        </div>
        <div class="status-indicator">
          <div class="pulse-ring" />
          <span>Waiting for scan...</span>
        </div>
        <v-notice type="info" class="scan-instructions">
          <v-icon name="phone_android" left />
          <span>Open Zalo app → Tap Scan → Point at QR code</span>
        </v-notice>
      </div>

      <div v-if="errorMessage" class="error-state">
        <v-notice type="danger">
          <v-icon name="error" left />
          {{ errorMessage }}
        </v-notice>
        <v-button class="retry-btn" @click="$emit('retry')">
          <v-icon name="refresh" left />
          Try Again
        </v-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-view {
  background: var(--background-page);
  border-radius: 16px;
  padding: 40px;
  max-width: 640px;
  width: 100%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.view-header {
  display: flex;
  align-items: center;
  gap: 20px;
  padding-bottom: 28px;
  margin-bottom: 32px;
  border-bottom: 2px solid var(--border-subdued);
}

.back-btn {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--background-normal);
  border: 2px solid var(--border-normal);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--foreground-subdued);
  flex-shrink: 0;
}

.back-btn:hover {
  background: var(--background-normal-alt);
  border-color: var(--primary);
  color: var(--primary);
  transform: translateX(-3px);
}

.header-info {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
}

.header-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.header-icon.qr-icon {
  background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
  color: #6366f1;
}

.header-text h2 {
  font-size: 22px;
  font-weight: 700;
  color: var(--foreground-normal);
  margin: 0 0 4px 0;
}

.header-text p {
  font-size: 14px;
  color: var(--foreground-subdued);
  margin: 0;
}

.view-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.initial-state {
  text-align: center;
  padding: 40px 0;
}

.illustration {
  width: 120px;
  height: 120px;
  margin: 0 auto 32px;
  background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
  border-radius: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6366f1;
}

.qr-display {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.qr-frame {
  position: relative;
  padding: 28px;
  background: white;
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

.qr-frame img {
  display: block;
  width: 280px;
  height: 280px;
  border-radius: 12px;
}

.qr-overlay {
  position: absolute;
  top: 28px;
  left: 28px;
  right: 28px;
  bottom: 28px;
  pointer-events: none;
}

.scan-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, transparent, #6366f1, transparent);
  animation: scan 2s ease-in-out infinite;
}

@keyframes scan {

  0%,
  100% {
    transform: translateY(0);
    opacity: 0;
  }

  50% {
    opacity: 1;
  }

  100% {
    transform: translateY(280px);
  }
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #6366f1;
  font-weight: 600;
  font-size: 15px;
}

.pulse-ring {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #6366f1;
  position: relative;
  animation: pulse 2s ease-out infinite;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7);
  }

  70% {
    box-shadow: 0 0 0 12px rgba(99, 102, 241, 0);
  }

  100% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0);
  }
}

.scan-instructions {
  width: 100%;
}

.error-state {
  width: 100%;
  text-align: center;
  padding: 20px 0;
}

.retry-btn {
  margin-top: 16px;
}

@media (max-width: 768px) {
  .login-view {
    padding: 32px 24px;
  }

  .qr-frame img {
    width: 240px;
    height: 240px;
  }
}
</style>
