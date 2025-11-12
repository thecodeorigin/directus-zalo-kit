<template>
  <div class="success-state">
    <div class="success-icon">
      <svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="48" cy="48" r="48" fill="#E0FFF8" />
        <path d="M32 48L42 58L64 36" stroke="#00C897" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </div>
    <div class="success-text">
      <h2 class="success-title">
        Account switched
      </h2>
      <p class="success-subtitle">
        Welcome back, {{ accountName }}!
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  accountName: string
}

defineProps<Props>()
</script>

<script lang="ts">
export default {
  name: 'AccountSwitchedSuccess',
}
</script>

<style scoped>
.success-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 24px;
  background: #FFFFFF;
}

.success-icon {
  width: 96px;
  height: 96px;
  border-radius: 60px;
}

.success-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 362px;
}

.success-title {
  font-family: Inter, sans-serif;
  font-size: 24px;
  font-weight: 700;
  line-height: 29px;
  text-align: center;
  color: #172940;
}

.success-subtitle {
  font-family: Inter, sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 19px;
  text-align: center;
  color: #4F5464;
}
</style>
