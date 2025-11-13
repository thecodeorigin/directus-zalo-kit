<script setup lang="ts">
interface Props {
  icon: string
  title: string
  close?: boolean
}

defineProps<Props>()
</script>

<template>
  <div class="sidebar-detail">
    <div class="sidebar-detail-header">
      <div class="header-left">
        <v-icon :name="icon" />
        <h3 class="sidebar-title">
          {{ title }}
        </h3>
      </div>
      <button v-if="close" class="close-btn">
        <v-icon name="close" />
      </button>
    </div>
    <div class="sidebar-detail-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.sidebar-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
  border-left: 1px solid #D3DAE4;
}

.sidebar-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #D3DAE4;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sidebar-title {
  font-family: Inter;
  font-size: 16px;
  font-weight: 600;
  color: #172940;
  margin: 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.close-btn:hover {
  background: rgba(0, 0, 0, 0.04);
}

.sidebar-detail-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
</style>
