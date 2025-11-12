<template>
  <div class="switch-account-view">
    <!-- Header -->
    <div class="switch-header">
      <h2 class="switch-title">
        Switch account
      </h2>
      <p class="switch-subtitle">
        Choose an account to switch
      </p>
    </div>

    <!-- Account List -->
    <div class="account-list">
      <!-- Active Accounts -->
      <div
        v-for="account in accounts"
        :key="account.id"
        class="account-item"
        :class="{ active: account.isActive }"
        @click="$emit('switch-account', account.id)"
      >
        <div class="account-avatar">
          <img
            :src="account.avatar"
            :alt="account.name"
            @error="handleImageError($event, account.name)"
          >
        </div>
        <div class="account-info">
          <div class="account-name">
            {{ account.name }}
          </div>
          <div class="account-email">
            {{ account.email }}
          </div>
        </div>
        <div v-if="account.isActive" class="check-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="#2563EB" />
          </svg>
        </div>
      </div>

      <!-- Add Account Button -->
      <div class="add-account-btn" @click="$emit('add-account')">
        <div class="add-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="#2563EB" />
          </svg>
        </div>
        <span class="add-text">Add accounts</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Account {
  id: string
  name: string
  email: string
  avatar: string
  isActive: boolean
}

interface Props {
  accounts: Account[]
}

defineProps<Props>()

defineEmits<{
  'switch-account': [accountId: string]
  'add-account': []
}>()

function handleImageError(event: Event, name: string) {
  const target = event.target as HTMLImageElement
  target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=2563EB&color=fff`
}
</script>

<script lang="ts">
export default {
  name: 'SwitchAccountView',
}
</script>

<style scoped>
.switch-account-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 48px 24px;
  background: #FFFFFF;
}

.switch-header {
  text-align: center;
  margin-bottom: 24px;
  width: 400px;
}

.switch-title {
  font-family: Inter, sans-serif;
  font-size: 24px;
  font-weight: 700;
  line-height: 29px;
  text-align: center;
  color: #172940;
  margin-bottom: 12px;
}

.switch-subtitle {
  font-family: Inter, sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 19px;
  text-align: center;
  color: #A2B5CD;
}

.account-list {
  width: 400px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.account-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  background: #FFFFFF;
  border: 2px solid #D3DAE4;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  height: auto;
  min-height: 72px;
}

.account-item:hover {
  border-color: #6644FF;
  background: #FFFFFF;
}

.account-item.active {
  border-color: #6644FF;
  background: #FFFFFF;
}

.account-avatar {
  width: 40px;
  height: 40px;
  border-radius: 9999px;
  overflow: hidden;
  flex-shrink: 0;
  background: #F0F4F9;
  border: 0.75px solid rgba(0, 0, 0, 0.08);
}

.account-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.account-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

.account-name {
  font-family: Inter, sans-serif;
  font-size: 14px;
  font-weight: 600;
  line-height: 17px;
  color: #172940;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-email {
  font-family: Inter, sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 15px;
  color: #4F5464;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.check-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
}

.add-account-btn {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  width: 400px;
  height: 48px;
  background: #FFFFFF;
  border: 2px dashed #6644FF;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.add-account-btn:hover {
  border-color: #6644FF;
  background: #FFFFFF;
  opacity: 0.9;
}

.add-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
}

.add-text {
  font-family: Inter, sans-serif;
  font-size: 16px;
  font-weight: 600;
  line-height: 19px;
  color: #6644FF;
}

@media (max-width: 768px) {
  .switch-account-view {
    padding: 24px 16px;
  }

  .switch-header {
    width: 100%;
    max-width: 400px;
  }

  .account-list {
    width: 100%;
    max-width: 400px;
  }

  .add-account-btn {
    width: 100%;
    max-width: 400px;
  }
}
</style>
