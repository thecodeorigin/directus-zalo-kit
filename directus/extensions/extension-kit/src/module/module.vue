<script setup lang="ts">
import { useApi } from '@directus/extensions-sdk'
import { onMounted, onUnmounted, ref } from 'vue'

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
      if (pollInterval)
        clearInterval(pollInterval)
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
    if (pollInterval)
      clearInterval(pollInterval)
  }
}

async function initiateQRLogin() {
  isLoading.value = true
  qrCodeBase64.value = null
  errorMessage.value = null

  try {
    await api.post('/zalo/init')
    if (pollInterval)
      clearInterval(pollInterval)
    pollInterval = window.setInterval(checkStatus, 2500) // Poll every 2.5 seconds
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

    console.log('[Zalo] Login response:', response.data)

    if (response.data.ok) {
      console.log('[Zalo] Login initializing...')
      await new Promise(resolve => setTimeout(resolve, 2000))
      await checkStatus()

      cookiesInput.value = ''
      imeiInput.value = ''
      userAgentInput.value = ''
      loginMethod.value = null
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
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  }
}

async function logout() {
  try {
    const response = await api.post('/zalo/logout', {
      userId: userId.value,
    })

    console.log('[Zalo] Logout response:', response.data)

    isLoggedIn.value = false
    userId.value = null
    loginMethod.value = null
    errorMessage.value = null

    if (response.data.success) {
      console.log(response.data.message)
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
  if (pollInterval)
    clearInterval(pollInterval)
}

onMounted(() => {
  checkStatus()
})

onUnmounted(() => {
  if (pollInterval)
    clearInterval(pollInterval)
})
</script>

<template>
  <private-view title="Zalo Sync">
    <div class="zalo-sync-container">
      <div v-if="isLoggedIn" class="status-card logged-in">
        <div class="success-animation">
          <div class="success-circle">
            <v-icon name="check" x-large />
          </div>
        </div>
        <h1>Successfully Connected</h1>
        <p class="user-info">
          <span class="label">User ID:</span>
          <code class="user-id">{{ userId }}</code>
        </p>
        <v-button large secondary class="logout-btn" @click="logout">
          <v-icon name="logout" left />
          Disconnect
        </v-button>
      </div>

      <div v-else-if="!loginMethod" class="method-selection">
        <div class="hero-section">
          <div class="logo-badge">
            <v-icon name="chat_bubble" x-large />
          </div>
          <h1 class="main-title">
            Connect to Zalo
          </h1>
          <p class="subtitle">
            Choose your preferred authentication method
          </p>
        </div>

        <div class="methods-container">
          <div class="method-card qr-card" @click="loginMethod = 'qr'">
            <div class="card-header">
              <div class="icon-wrapper qr-icon">
                <v-icon name="qr_code_2" large />
              </div>
              <span class="badge recommended">Recommended</span>
            </div>
            <h3 class="card-title">
              QR Code Login
            </h3>
            <p class="card-description">
              Scan with your Zalo mobile app
            </p>
            <ul class="feature-list">
              <li class="feature-item">
                <v-icon name="check_circle" small />
                <span>Fast and secure</span>
              </li>
              <li class="feature-item">
                <v-icon name="check_circle" small />
                <span>No technical setup</span>
              </li>
              <li class="feature-item info">
                <v-icon name="info" small />
                <span>Requires phone nearby</span>
              </li>
            </ul>
            <div class="card-action">
              <span class="action-text">Get Started</span>
              <v-icon name="arrow_forward" />
            </div>
          </div>

          <div class="method-card cookies-card" @click="loginMethod = 'cookies'">
            <div class="card-header">
              <div class="icon-wrapper cookies-icon">
                <v-icon name="cookie" large />
              </div>
              <span class="badge advanced">Advanced</span>
            </div>
            <h3 class="card-title">
              Manual Cookies
            </h3>
            <p class="card-description">
              Use browser extension data
            </p>
            <ul class="feature-list">
              <li class="feature-item">
                <v-icon name="check_circle" small />
                <span>Persistent session</span>
              </li>
              <li class="feature-item">
                <v-icon name="check_circle" small />
                <span>No QR scanning</span>
              </li>
              <li class="feature-item info">
                <v-icon name="info" small />
                <span>Requires extension</span>
              </li>
            </ul>
            <div class="card-action">
              <span class="action-text">Get Started</span>
              <v-icon name="arrow_forward" />
            </div>
          </div>
        </div>

        <div class="info-section">
          <v-notice type="info">
            <div class="notice-content">
              <div class="notice-header">
                <v-icon name="extension" />
                <strong>ZaloDataExtractor Extension Required</strong>
              </div>
              <div class="installation-guide">
                <div class="guide-section">
                  <h4>Installation Steps:</h4>
                  <ol>
                    <li>
                      Download from <a href="https://github.com/JustKemForFun/ZaloDataExtractor/" target="_blank"
                        rel="noopener">GitHub Repository</a>
                    </li>
                    <li>Open <code>chrome://extensions/</code> or <code>edge://extensions/</code></li>
                    <li>Enable <strong>Developer Mode</strong> (top-right toggle)</li>
                    <li>Click <strong>Load unpacked</strong> and select the folder</li>
                    <li>Enable incognito mode if needed (optional)</li>
                  </ol>
                </div>
                <div class="guide-section">
                  <h4>How to Use:</h4>
                  <ol>
                    <li>
                      Visit <a href="https://chat.zalo.me" target="_blank" rel="noopener">chat.zalo.me</a> and login
                    </li>
                    <li>Click the extension icon in your browser</li>
                    <li>Press <strong>Refresh Page</strong> to extract data</li>
                    <li>Copy cookies, IMEI, and User-Agent values</li>
                  </ol>
                </div>
              </div>
            </div>
          </v-notice>
        </div>
      </div>

      <div v-else-if="loginMethod === 'qr'" class="login-view qr-view">
        <div class="view-header">
          <button class="back-btn" @click="backToMethods">
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

            <v-button large :loading="isLoading" :disabled="isLoading" class="primary-action" @click="initiateQRLogin">
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
            <v-button class="retry-btn" @click="initiateQRLogin">
              <v-icon name="refresh" left />
              Try Again
            </v-button>
          </div>
        </div>
      </div>

      <div v-else-if="loginMethod === 'cookies'" class="login-view cookies-view">
        <div class="view-header">
          <button class="back-btn" @click="backToMethods">
            <v-icon name="arrow_back" />
          </button>
          <div class="header-info">
            <div class="header-icon cookies-icon">
              <v-icon name="cookie" />
            </div>
            <div class="header-text">
              <h2>Manual Cookies Login</h2>
              <p>Enter your Zalo session data</p>
            </div>
          </div>
        </div>

        <div class="view-content">
          <div class="form-container">
            <div class="form-field">
              <label class="field-label">
                <v-icon name="data_object" small />
                <span>Cookies JSON <span class="required">*</span></span>
              </label>
              <v-input v-model="cookiesInput"
                placeholder="[{&quot;name&quot;:&quot;zpw_sek&quot;,&quot;value&quot;:&quot;...&quot;,&quot;domain&quot;:&quot;.zalo.me&quot;}]"
                type="textarea" rows="5" />
              <span class="field-hint">Paste the cookies array from ZaloDataExtractor</span>
            </div>

            <div class="form-field">
              <label class="field-label">
                <v-icon name="fingerprint" small />
                <span>IMEI <span class="required">*</span></span>
              </label>
              <v-input v-model="imeiInput" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
              <span class="field-hint">Device identifier from the extension</span>
            </div>

            <div class="form-field">
              <label class="field-label">
                <v-icon name="computer" small />
                <span>User Agent <span class="required">*</span></span>
              </label>
              <v-input v-model="userAgentInput" placeholder="Mozilla/5.0 (Windows NT 10.0; Win64; x64)..."
                type="textarea" rows="3" />
              <span class="field-hint">Browser user agent string</span>
            </div>

            <div v-if="errorMessage" class="form-error">
              <v-notice type="danger">
                <v-icon name="error" left />
                {{ errorMessage }}
              </v-notice>
            </div>

            <v-button large :loading="isLoading" :disabled="isLoading || !cookiesInput || !imeiInput || !userAgentInput"
              class="submit-btn" @click="initiateCookiesLogin">
              <v-icon name="login" left />
              Login with Cookies
            </v-button>
          </div>

          <v-notice type="warning" class="help-notice">
            <div class="notice-content">
              <div class="notice-header">
                <v-icon name="help_outline" />
                <strong>Need Help?</strong>
              </div>
              <ol class="help-steps">
                <li>Install the <strong>ZaloDataExtractor</strong> extension</li>
                <li>Login to <a href="https://chat.zalo.me" target="_blank" rel="noopener">chat.zalo.me</a></li>
                <li>Click the extension icon and press <strong>Refresh Page</strong></li>
                <li>Copy each field and paste into the form above</li>
              </ol>
            </div>
          </v-notice>
        </div>
      </div>
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

/* Status Card - Logged In */
.status-card {
  background: var(--background-page);
  border-radius: 16px;
  padding: 56px 48px;
  max-width: 500px;
  width: 100%;
  text-align: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.success-animation {
  margin-bottom: 32px;
}

.success-circle {
  width: 96px;
  height: 96px;
  margin: 0 auto;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  animation: scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes scaleIn {
  from {
    transform: scale(0);
    opacity: 0;
  }

  to {
    transform: scale(1);
    opacity: 1;
  }
}

.status-card h1 {
  font-size: 28px;
  font-weight: 700;
  color: var(--foreground-normal);
  margin-bottom: 24px;
}

.user-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 32px;
  font-size: 15px;
}

.user-info .label {
  color: var(--foreground-subdued);
}

.user-id {
  background: var(--background-normal);
  padding: 8px 16px;
  border-radius: 8px;
  font-family: var(--family-monospace);
  font-size: 14px;
  color: var(--primary);
  font-weight: 600;
}

.logout-btn {
  min-width: 200px;
}

/* Method Selection */
.method-selection {
  background: var(--background-page);
  border-radius: 16px;
  padding: 48px;
  max-width: 1000px;
  width: 100%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.hero-section {
  text-align: center;
  margin-bottom: 48px;
}

.logo-badge {
  width: 88px;
  height: 88px;
  margin: 0 auto 24px;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border-radius: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.3);
}

.main-title {
  font-size: 32px;
  font-weight: 800;
  color: var(--foreground-normal);
  margin-bottom: 12px;
  letter-spacing: -0.5px;
}

.subtitle {
  font-size: 16px;
  color: var(--foreground-subdued);
  font-weight: 500;
}

/* Methods Container */
.methods-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 24px;
  margin-bottom: 40px;
}

.method-card {
  background: var(--background-normal);
  border: 2px solid var(--border-normal);
  border-radius: 16px;
  padding: 32px 28px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.method-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  transform: scaleX(0);
  transition: transform 0.3s ease;
}

.qr-card::before {
  background: linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%);
}

.cookies-card::before {
  background: linear-gradient(90deg, #8b5cf6 0%, #a855f7 100%);
}

.method-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
}

.qr-card:hover {
  border-color: #6366f1;
}

.cookies-card:hover {
  border-color: #8b5cf6;
}

.method-card:hover::before {
  transform: scaleX(1);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.icon-wrapper {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s ease;
}

.method-card:hover .icon-wrapper {
  transform: scale(1.1) rotate(5deg);
}

.qr-icon {
  background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
  color: #6366f1;
}

.cookies-icon {
  background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
  color: #8b5cf6;
}

.badge {
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.badge.recommended {
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
  color: #065f46;
}

.badge.advanced {
  background: linear-gradient(135deg, #e9d5ff 0%, #d8b4fe 100%);
  color: #6b21a8;
}

.card-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--foreground-normal);
  margin-bottom: 8px;
}

.card-description {
  font-size: 14px;
  color: var(--foreground-subdued);
  margin-bottom: 24px;
  line-height: 1.5;
}

.feature-list {
  list-style: none;
  padding: 0;
  margin: 0 0 24px 0;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  font-size: 14px;
  color: var(--foreground-normal);
}

.feature-item.info {
  color: var(--foreground-subdued);
}

.feature-item .v-icon {
  color: #10b981;
  flex-shrink: 0;
}

.feature-item.info .v-icon {
  color: var(--warning);
}

.card-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 20px;
  border-top: 1px solid var(--border-subdued);
  color: var(--primary);
  font-weight: 600;
  font-size: 14px;
}

.method-card:hover .card-action {
  gap: 8px;
}

.method-card:hover .card-action .v-icon {
  transform: translateX(4px);
}

.card-action .v-icon {
  transition: transform 0.3s ease;
}

/* Info Section */
.info-section {
  margin-top: 32px;
}

.notice-content {
  padding: 8px 0;
}

.notice-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  font-size: 16px;
  color: var(--foreground-normal);
}

.installation-guide {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
}

.guide-section h4 {
  font-size: 14px;
  font-weight: 700;
  color: var(--foreground-normal);
  margin-bottom: 12px;
}

.guide-section ol {
  margin: 0;
  padding-left: 20px;
}

.guide-section li {
  margin: 10px 0;
  line-height: 1.6;
  font-size: 14px;
}

.guide-section code {
  background: var(--background-normal);
  padding: 3px 8px;
  border-radius: 5px;
  font-family: var(--family-monospace);
  font-size: 12px;
  color: var(--primary);
}

.guide-section a {
  color: var(--primary);
  text-decoration: none;
  font-weight: 600;
}

.guide-section a:hover {
  text-decoration: underline;
}

/* Login Views */
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

.header-icon.cookies-icon {
  background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
  color: #8b5cf6;
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

/* QR View */
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

/* Cookies View */
.form-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground-normal);
}

.required {
  color: var(--danger);
}

.field-hint {
  font-size: 13px;
  color: var(--foreground-subdued);
  padding-left: 4px;
}

.form-error {
  margin: 8px 0;
}

.submit-btn {
  margin-top: 8px;
  width: 100%;
}

.help-notice {
  margin-top: 32px;
}

.help-steps {
  margin: 12px 0 0 0;
  padding-left: 20px;
}

.help-steps li {
  margin: 10px 0;
  line-height: 1.6;
  font-size: 14px;
}

.help-steps a {
  color: var(--primary);
  text-decoration: none;
  font-weight: 600;
}

.help-steps a:hover {
  text-decoration: underline;
}

/* Error State */
.error-state {
  width: 100%;
  text-align: center;
  padding: 20px 0;
}

.retry-btn {
  margin-top: 16px;
}

/* Responsive */
@media (max-width: 768px) {

  .method-selection,
  .login-view,
  .status-card {
    padding: 32px 24px;
  }

  .methods-container {
    grid-template-columns: 1fr;
  }

  .main-title {
    font-size: 28px;
  }

  .logo-badge {
    width: 72px;
    height: 72px;
  }

  .installation-guide {
    grid-template-columns: 1fr;
  }

  .qr-frame img {
    width: 240px;
    height: 240px;
  }
}
</style>
