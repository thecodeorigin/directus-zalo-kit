<script setup lang="ts">
interface Account {
  id: string
  name: string
  email: string
  avatar: string
  isActive: boolean
}

interface Props {
  show: boolean
  accounts: Account[]
  currentAccountId: string
}

interface Emits {
  (e: 'close'): void
  (e: 'switchAccount', accountId: string): void
  (e: 'addAccount'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

function handleAccountClick(accountId: string) {
  if (accountId !== props.currentAccountId) {
    emit('switchAccount', accountId)
  }
}

function handleAddAccount() {
  emit('addAccount')
}

function handleClose() {
  emit('close')
}
</script>

<template>
  <div v-if="show" class="manage-accounts-overlay" @click="handleClose">
    <div class="manage-accounts-dialog" @click.stop>
      <!-- Header -->
      <div class="dialog-header">
        <h2 class="dialog-title">
          Switch account
        </h2>
        <p class="dialog-subtitle">
          Choose an account to switch
        </p>
      </div>

      <!-- Account List -->
      <div class="accounts-list">
        <div
          v-for="account in accounts"
          :key="account.id"
          class="account-item"
          :class="{ active: account.id === currentAccountId }"
          @click="handleAccountClick(account.id)"
        >
          <div class="account-avatar">
            <img :src="account.avatar" :alt="account.name">
          </div>
          <div class="account-info">
            <div class="account-name">
              {{ account.name }}
            </div>
            <div class="account-email">
              {{ account.email }}
            </div>
          </div>
          <svg
            v-if="account.id === currentAccountId"
            class="check-icon"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M20 6L9 17L4 12"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </div>

      <!-- Add Account Button -->
      <button class="add-account-btn" @click="handleAddAccount">
        <svg
          class="plus-icon"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 5V19M5 12H19"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span>Add accounts</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.manage-accounts-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.manage-accounts-dialog {
  background: white;
  border-radius: 8px;
  padding: 32px;
  width: 400px;
  max-height: 80vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.dialog-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.dialog-title {
  font-family: Inter, sans-serif;
  font-weight: 700;
  font-size: 24px;
  line-height: 1.21;
  color: #172940;
  margin: 0;
  text-align: center;
}

.dialog-subtitle {
  font-family: Inter, sans-serif;
  font-weight: 500;
  font-size: 16px;
  line-height: 1.21;
  color: #a2b5cd;
  margin: 0;
  text-align: center;
}

.accounts-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.account-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  border: 2px solid #d3dae4;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.account-item:hover {
  border-color: #6644ff;
  background: #f8f7ff;
}

.account-item.active {
  border-color: #6644ff;
  background: #f8f7ff;
}

.account-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  border: 0.75px solid rgba(0, 0, 0, 0.08);
}

.account-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.account-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.account-name {
  font-family: Inter, sans-serif;
  font-weight: 600;
  font-size: 14px;
  line-height: 1.21;
  color: #172940;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.account-email {
  font-family: Inter, sans-serif;
  font-weight: 400;
  font-size: 12px;
  line-height: 1.21;
  color: #4f5464;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.check-icon {
  flex-shrink: 0;
  color: #6644ff;
}

.add-account-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  height: 48px;
  border: 2px dashed #6644ff;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: Inter, sans-serif;
  font-weight: 600;
  font-size: 16px;
  line-height: 1.21;
  color: #6644ff;
}

.add-account-btn:hover {
  background: #f8f7ff;
  border-style: solid;
}

.plus-icon {
  flex-shrink: 0;
}

/* Scrollbar styles */
.manage-accounts-dialog::-webkit-scrollbar {
  width: 6px;
}

.manage-accounts-dialog::-webkit-scrollbar-track {
  background: transparent;
}

.manage-accounts-dialog::-webkit-scrollbar-thumb {
  background: #d3dae4;
  border-radius: 3px;
}

.manage-accounts-dialog::-webkit-scrollbar-thumb:hover {
  background: #a2b5cd;
}
</style>
