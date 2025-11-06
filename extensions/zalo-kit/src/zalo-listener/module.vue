<script setup lang="ts">
import { useApi } from '@directus/extensions-sdk'
import { onMounted, onUnmounted, ref } from 'vue'
import CookiesLoginView from './components/CookiesLoginView.vue'
import MethodSelection from './components/MethodSelection.vue'
import QRLoginView from './components/QRLoginView.vue'
import StatusCard from './components/StatusCard.vue'

const api = useApi()

const loginMethod = ref<'qr' | 'cookies' | null>(null)
const isLoading = ref(false)
const qrCodeBase64 = ref<string | null>(null)
const isLoggedIn = ref(false)
const userId = ref<string | null>(null)
const errorMessage = ref<string | null>(null)

const cookiesInput = ref('')
const imeiInput = ref('')
const userAgentInput = ref('')

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
      loginMethod.value = null // Reset login method to show status

      // Clear form inputs when successfully logged in
      cookiesInput.value = ''
      imeiInput.value = ''
      userAgentInput.value = ''

      if (pollInterval) {
        clearInterval(pollInterval)
        pollInterval = null
      }

      console.warn('[Zalo] Login successful, redirecting to status card')
    }
    else if (status === 'pending_qr') {
      isLoading.value = true
      qrCodeBase64.value = qrCode
    }
    else {
      isLoggedIn.value = false
    }
  }
  catch (error) {
    console.error('Failed to get Zalo status:', error)
    isLoading.value = false
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  }
}

async function initiateQRLogin() {
  isLoading.value = true
  qrCodeBase64.value = null
  errorMessage.value = null

  try {
    await api.post('/zalo/login/qr')

    // if (res.data.status === LoginQRCallbackEventType.QRCodeGenerated) {
    //   qrCodeBase64.value = res.data.qrCode
    // }
    if (pollInterval)
      clearInterval(pollInterval)
    pollInterval = window.setInterval(checkStatus, 2500)
  }
  catch (error: any) {
    console.error('Failed to initiate login:', error)
    errorMessage.value = 'Failed to generate QR code. Please try again.'
    isLoading.value = false
  }
}

async function initiateCookiesLogin() {
  if (!cookiesInput.value || !imeiInput.value || !userAgentInput.value) {
    errorMessage.value = 'All fields are required'
    return
  }

  isLoading.value = true
  errorMessage.value = null

  try {
    let cookiesArray
    try {
      cookiesArray = JSON.parse(cookiesInput.value)
    }
    catch {
      throw new Error('Invalid cookies format. Please provide a valid JSON array.')
    }

    const response = await api.post('/zalo/login/cookies', {
      cookies: cookiesArray,
      imei: imeiInput.value,
      userAgent: userAgentInput.value,
    })

    console.warn('[Zalo] Login response:', response.data)

    if (response.data.ok) {
      console.warn('[Zalo] Login successful! Setting up session...')
      isLoggedIn.value = true
      userId.value = response.data.userId
      loginMethod.value = null

      // Clear form
      cookiesInput.value = ''
      imeiInput.value = ''
      userAgentInput.value = ''

      setTimeout(checkStatus, 1000)
    }
    else {
      throw new Error(response.data.message || 'Login failed')
    }
  }
  catch (error: any) {
    console.error('Failed to login with cookies:', error)
    errorMessage.value
      = error.message || 'Failed to login. Please check your data and try again.'
  }
  finally {
    isLoading.value = false
  }
}

async function logout() {
  try {
    const response = await api.post('/zalo/logout', {
      userId: userId.value,
    })

    isLoggedIn.value = false
    userId.value = null
    loginMethod.value = null
    errorMessage.value = null

    if (response.data.success) {
      console.warn(response.data.message)
    }
  }
  catch (error: any) {
    console.error('Failed to logout:', error)
    errorMessage.value = error.message || 'Logout failed'
    isLoggedIn.value = false
    userId.value = null
    loginMethod.value = null
  }
}

function backToMethods() {
  loginMethod.value = null
  errorMessage.value = null
  qrCodeBase64.value = null
  isLoading.value = false
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}

onMounted(() => {
  checkStatus()
})

onUnmounted(() => {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
})
</script>

<template>
  <private-view title="Zalo Sync Thiện Hoàn">
    <div class="zalo-sync-container">
      <StatusCard
        v-if="isLoggedIn"
        :user-id="userId"
        @logout="logout"
      />

      <MethodSelection
        v-else-if="!loginMethod"
        @select-method="loginMethod = $event"
      />

      <QRLoginView
        v-else-if="loginMethod === 'qr'"
        :qr-code-base64="qrCodeBase64"
        :is-loading="isLoading"
        :error-message="errorMessage"
        @back="backToMethods"
        @generate="initiateQRLogin"
        @retry="initiateQRLogin"
      />

      <CookiesLoginView
        v-else-if="loginMethod === 'cookies'"
        v-model:cookies="cookiesInput"
        v-model:imei="imeiInput"
        v-model:user-agent="userAgentInput"
        :is-loading="isLoading"
        :error-message="errorMessage"
        @back="backToMethods"
        @submit="initiateCookiesLogin"
      />
    </div>
  </private-view>
</template>

<style scoped>
.zalo-sync-container {
  padding: var(--content-padding);
  padding-top: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  height: calc(100vh - 120px);
  overflow: auto;
}
</style>
