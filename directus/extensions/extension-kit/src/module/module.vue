<script setup lang="ts">
import { useApi } from '@directus/extensions-sdk'
import { onMounted, onUnmounted, ref } from 'vue'

const isLoading = ref(false)
const qrCodeBase64 = ref<string | null>(null)
const isLoggedIn = ref(false)
const userId = ref<string | null>(null)
const api = useApi()
let pollInterval: number | null = null

async function checkStatus() {
  try {
    const response = await api.get('/zalo/status')
    const { status, qrCode, userId: loggedInUserId } = response.data

    if (status === 'logged_in') {
      isLoggedIn.value = true
      userId.value = loggedInUserId
      isLoading.value = false
      qrCodeBase64.value = null
      if (pollInterval)
        clearInterval(pollInterval)
    }
    else if (status === 'pending_qr') {
      isLoading.value = true // Still loading while waiting for scan
      qrCodeBase64.value = qrCode
    }
    else {
      isLoggedIn.value = false
    }
  }
  catch (error) {
    console.error('Failed to get Zalo status:', error)
    isLoading.value = false
    if (pollInterval)
      clearInterval(pollInterval)
  }
}

async function initiateLogin() {
  isLoading.value = true
  qrCodeBase64.value = null
  try {
    await api.post('/zalo/init')
    // Start polling for status after initiating login
    if (pollInterval)
      clearInterval(pollInterval)
    pollInterval = window.setInterval(checkStatus, 2500) // Poll every 2.5 seconds
  }
  catch (error) {
    console.error('Failed to initiate login:', error)
    isLoading.value = false
  }
}

onMounted(() => {
  // Check initial status when the module is loaded to see if already logged in
  checkStatus()
})

onUnmounted(() => {
  // Clean up the interval when the component is destroyed to prevent memory leaks
  if (pollInterval)
    clearInterval(pollInterval)
})
</script>

<template>
  <private-view title="Zalo Sync">
    <div class="zalo-sync-container">
      <div v-if="!isLoggedIn" class="login-card">
        <h1>Zalo Synchronization</h1>
        <p>Connect your Zalo account to start syncing messages.</p>
        <v-button :loading="isLoading" :disabled="isLoading" @click="initiateLogin">
          Login with Zalo
        </v-button>

        <div v-if="qrCodeBase64" class="qr-container">
          <h2>Scan to Log In</h2>
          <img :src="`data:image/png;base64,${qrCodeBase64}`" alt="Zalo Login QR Code">
          <p>Open Zalo and scan the code to continue.</p>
        </div>
      </div>

      <div v-else class="status-card">
        <h1>✓ Connected</h1>
        <p>Successfully logged in and listening for events.</p>
        <p><strong>User ID:</strong> {{ userId }}</p>
        <v-notice type="success">
          All new messages and reactions will be automatically synced to your Directus collections.
        </v-notice>
      </div>
    </div>
  </private-view>
</template>

<style scoped>
.zalo-sync-container {
  padding: 2rem;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}
.login-card, .status-card {
  background-color: var(--background-page);
  padding: 2rem 3rem;
  border-radius: var(--border-radius);
  box-shadow: var(--box-shadow);
  max-width: 500px;
  width: 100%;
  text-align: center;
}
.qr-container {
  margin-top: 2rem;
  border-top: 1px solid var(--border-normal);
  padding-top: 2rem;
}
h1 {
  color: var(--primary);
}
p {
  color: var(--foreground-normal);
  margin-bottom: 1.5rem;
}
img {
  display: block;
  margin: 1rem auto;
  border: 6px solid var(--background-normal);
  border-radius: var(--border-radius);
}
</style>
