<script setup lang="ts">
defineProps<{
  isLoading: boolean
  errorMessage: string | null
}>()

defineEmits<{
  back: []
  submit: []
}>()
const cookiesInput = defineModel<string>('cookies', { default: '' })
const imeiInput = defineModel<string>('imei', { default: '' })
const userAgentInput = defineModel<string>('userAgent', { default: '' })
</script>

<template>
  <div class="login-view cookies-view">
    <div class="view-header">
      <button class="back-btn" @click="$emit('back')">
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
          <v-input
            v-model="cookiesInput"
            placeholder="[{&quot;name&quot;:&quot;zpw_sek&quot;,&quot;value&quot;:&quot;...&quot;,&quot;domain&quot;:&quot;.zalo.me&quot;}]"
            type="textarea"
            rows="5"
          />
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
          <v-input
            v-model="userAgentInput"
            placeholder="Mozilla/5.0 (Windows NT 10.0; Win64; x64)..."
            type="textarea"
            rows="3"
          />
          <span class="field-hint">Browser user agent string</span>
        </div>

        <div v-if="errorMessage" class="form-error">
          <v-notice type="danger">
            <v-icon name="error" left />
            {{ errorMessage }}
          </v-notice>
        </div>

        <v-button
          large
          :loading="isLoading"
          :disabled="isLoading || !cookiesInput || !imeiInput || !userAgentInput"
          class="submit-btn"
          @click="$emit('submit')"
        >
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
            <li>
              Login to
              <a href="https://chat.zalo.me" target="_blank" rel="noopener">chat.zalo.me</a>
            </li>
            <li>Click the extension icon and press <strong>Refresh Page</strong></li>
            <li>Copy each field and paste into the form above</li>
          </ol>
        </div>
      </v-notice>
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

.view-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

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
  width: 100%;
}

.notice-content {
  padding: 8px 0;
}

.notice-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 16px;
  color: var(--foreground-normal);
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

@media (max-width: 768px) {
  .login-view {
    padding: 32px 24px;
  }
}
</style>
