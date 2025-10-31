<script setup lang="ts">
defineEmits<{
  selectMethod: [method: 'qr' | 'cookies']
}>()
</script>

<template>
  <div class="method-selection">
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
      <div class="method-card qr-card" @click="$emit('selectMethod', 'qr')">
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

      <div class="method-card cookies-card" @click="$emit('selectMethod', 'cookies')">
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
                  Download from <a
                    href="https://github.com/JustKemForFun/ZaloDataExtractor/" target="_blank"
                    rel="noopener"
                  >GitHub Repository</a>
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
</template>

<style scoped>
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

@media (max-width: 768px) {
  .method-selection {
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
}
</style>
