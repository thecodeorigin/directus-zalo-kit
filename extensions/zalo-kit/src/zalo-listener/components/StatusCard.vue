<script setup lang="ts">
defineProps<{
  userId: string | null
}>()

defineEmits<{
  logout: []
}>()
</script>

<template>
  <div class="status-card logged-in">
    <div class="success-animation">
      <div class="success-circle">
        <v-icon name="check" x-large />
      </div>
    </div>
    <h1>Successfully Connected</h1>
    <p class="user-info">
      <span class="label">User ID:</span>
      <code v-if="userId" class="user-id">{{ userId }}</code>
      <code v-else class="user-id loading">Loading...</code>
    </p>
    <v-button large secondary class="logout-btn" @click="$emit('logout')">
      <v-icon name="logout" left />
      Disconnect
    </v-button>
  </div>
</template>

<style scoped>
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

.user-id.loading {
  color: var(--foreground-subdued);
  font-style: italic;
}

.logout-btn {
  min-width: 200px;
}
</style>
