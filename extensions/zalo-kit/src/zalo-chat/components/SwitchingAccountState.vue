<template>
  <div class="switching-state">
    <div class="loading-spinner">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="20" stroke="#D3DAE4" stroke-width="4" />
        <path d="M24 4C35.0457 4 44 12.9543 44 24" stroke="#6644FF" stroke-width="4" stroke-linecap="round">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 24 24"
            to="360 24 24"
            dur="1s"
            repeatCount="indefinite"
          />
        </path>
      </svg>
    </div>
    <div class="switching-text">
      <h2 class="switching-title">
        Switching account
      </h2>
      <p class="switching-subtitle">
        Please wait while we load your account...
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>

<script lang="ts">
export default {
  name: 'SwitchingAccountState',
}
</script>

<style scoped>
.switching-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 24px;
  background: #FFFFFF;
}

.loading-spinner {
  width: 48px;
  height: 48px;
}

.switching-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 362px;
}

.switching-title {
  font-family: Inter, sans-serif;
  font-size: 24px;
  font-weight: 700;
  line-height: 29px;
  text-align: center;
  color: #172940;
}

.switching-subtitle {
  font-family: Inter, sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 19px;
  text-align: center;
  color: #4F5464;
}
</style>
