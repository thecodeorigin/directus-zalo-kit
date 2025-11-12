<script setup lang="ts">
</script>

<template>
  <div class="empty-state">
    <div class="empty-state-content">
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="60" cy="60" r="50" fill="#F0F4F9" />
        <path d="M40 50C40 45.5817 43.5817 42 48 42H72C76.4183 42 80 45.5817 80 50V70C80 74.4183 76.4183 78 72 78H48C43.5817 78 40 74.4183 40 70V50Z" stroke="#A2B5CD" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M40 55L60 67L80 55" stroke="#A2B5CD" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      </svg>

      <h3 class="empty-title">
        Select a conversation
      </h3>
      <p class="empty-description">
        Choose a conversation from the list to start messaging
      </p>
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: white;
}

.empty-state-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  max-width: 400px;
  text-align: center;
  padding: 32px;
}

.empty-title {
  font-family: Inter;
  font-size: 24px;
  font-weight: 600;
  color: #172940;
  margin: 0;
}

.empty-description {
  font-family: Inter;
  font-size: 14px;
  color: #A2B5CD;
  margin: 0;
  line-height: 1.5;
}
</style>
