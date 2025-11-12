<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  searchQuery: string
  showFilterDropdown: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  'update:searchQuery': [value: string]
  'update:showFilterDropdown': [value: boolean]
  'addUser': []
  'filter': []
}>()

const filterOptions = ref({
  status: {
    online: false,
    offline: false,
  },
})
</script>

<template>
  <div class="search-section">
    <div class="search-input-wrapper">
      <input
        :value="searchQuery"
        placeholder="Search Conversation"
        class="search-input"
        @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
      >
    </div>

    <div class="action-buttons">
      <button
        class="add-user-btn"
        title="Add User"
        @click="emit('addUser')"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 21V19C16 17.9391 15.5786 16.9217 14.8284 16.1716C14.0783 15.4214 13.0609 15 12 15H6C4.93913 15 3.92172 15.4214 3.17157 16.1716C2.42143 16.9217 2 17.9391 2 19V21M19 8V14M22 11H16M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>

      <div class="relative filter-dropdown-container">
        <button
          class="filter-btn"
          :class="{ active: showFilterDropdown }"
          @click="emit('filter')"
        >
          <span>Filter</span>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            :class="{ 'rotate-180': showFilterDropdown }"
            class="transition-transform duration-200"
          >
            <path
              d="M19.92 8.94995L13.4 15.47C12.63 16.24 11.37 16.24 10.6 15.47L4.07996 8.94995"
              stroke="#4F5464"
              stroke-width="2"
              stroke-miterlimit="10"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>

        <!-- Filter Dropdown -->
        <div
          v-if="showFilterDropdown"
          class="filter-dropdown"
        >
          <div class="filter-dropdown-content">
            <!-- Theo trạng thái -->
            <div class="filter-section">
              <h4 class="filter-section-title">
                Theo trạng thái
              </h4>
              <div class="filter-options">
                <label class="filter-option">
                  <input
                    v-model="filterOptions.status.online"
                    type="checkbox"
                    class="filter-checkbox"
                  >
                  <span class="filter-label">Tất cả</span>
                </label>
                <label class="filter-option">
                  <input
                    v-model="filterOptions.status.offline"
                    type="checkbox"
                    class="filter-checkbox"
                  >
                  <span class="filter-label">Chưa đọc</span>
                </label>
              </div>
            </div>

            <div class="filter-divider" />

            <!-- Theo thể phân loại -->
            <div class="filter-section">
              <h4 class="filter-section-title">
                Theo thể phân loại
              </h4>
              <div class="filter-options">
                <label class="filter-option">
                  <input
                    type="checkbox"
                    class="filter-checkbox"
                  >
                  <div class="category-dot bg-red-500" />
                  <span class="filter-label">Khách hàng</span>
                </label>
                <label class="filter-option">
                  <input
                    type="checkbox"
                    class="filter-checkbox"
                  >
                  <div class="category-dot bg-green-500" />
                  <span class="filter-label">Đồng nghiệp</span>
                </label>
                <label class="filter-option">
                  <input
                    type="checkbox"
                    class="filter-checkbox"
                  >
                  <div class="category-dot bg-orange-500" />
                  <span class="filter-label">Công việc</span>
                </label>
                <label class="filter-option">
                  <input
                    type="checkbox"
                    class="filter-checkbox"
                  >
                  <div class="category-dot bg-blue-500" />
                  <span class="filter-label">Trả lời sau</span>
                </label>
                <label class="filter-option">
                  <input
                    type="checkbox"
                    class="filter-checkbox"
                  >
                  <div class="category-dot bg-gray-800" />
                  <span class="filter-label">Tin nhắn từ người lạ</span>
                </label>
              </div>
            </div>

            <!-- Quản lý thể phân loại -->
            <div class="filter-manage">
              <button class="manage-btn">
                <svg
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <span>Quản lý thể phân loại</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.search-input-wrapper {
  padding: 6px 12px;
}

.search-input {
  width: 100%;
  padding: 10px 17px;
  font-family: Inter;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.21;
  color: #172940;
  background: white;
  border: 2px solid #D3DAE4;
  border-radius: 6px;
  outline: none;
  transition: border-color 0.2s, background-color 0.2s;
}

.search-input::placeholder {
  color: #A2B5CD;
}

.search-input:focus {
  border-color: #6644FF;
  background: white;
}

.action-buttons {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
}

.add-user-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
  flex-shrink: 0;
}

.add-user-btn:hover {
  background: rgba(0, 0, 0, 0.04);
}

.add-user-btn svg {
  width: 24px;
  height: 24px;
}

.filter-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  height: 32px;
  background: white;
  border: 2px solid #D3DAE4;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s;
}

.filter-btn:hover {
  background: rgba(0, 0, 0, 0.02);
}

.filter-btn.active {
  background: rgba(0, 0, 0, 0.04);
  border-color: #6644FF;
}

.filter-btn span {
  font-family: Inter;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.21;
  color: #4F5464;
}

.filter-btn svg {
  flex-shrink: 0;
}

.filter-dropdown-container {
  position: relative;
}

.filter-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 224px;
  background: white;
  border: 1px solid #D3DAE4;
  border-radius: 8px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  z-index: 9999;
}

.filter-dropdown-content {
  padding: 16px;
}

.filter-section {
  margin-bottom: 16px;
}

.filter-section:last-of-type {
  margin-bottom: 0;
}

.filter-section-title {
  font-family: Inter;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 12px;
}

.filter-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-option {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.filter-checkbox {
  width: 16px;
  height: 16px;
  border: 1px solid #D1D5DB;
  border-radius: 4px;
  cursor: pointer;
  accent-color: #3B82F6;
}

.filter-checkbox:focus {
  outline: 2px solid #3B82F6;
  outline-offset: 2px;
}

.filter-label {
  margin-left: 8px;
  font-family: Inter;
  font-size: 14px;
  color: #374151;
}

.category-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-left: 8px;
  margin-right: 12px;
}

.bg-red-500 {
  background-color: #EF4444;
}

.bg-green-500 {
  background-color: #10B981;
}

.bg-orange-500 {
  background-color: #F97316;
}

.bg-blue-500 {
  background-color: #3B82F6;
}

.bg-gray-800 {
  background-color: #1F2937;
}

.filter-divider {
  height: 1px;
  background: #E5E7EB;
  margin: 16px 0;
}

.filter-manage {
  padding-top: 12px;
  border-top: 1px solid #E5E7EB;
}

.manage-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0;
  background: transparent;
  border: none;
  color: #3B82F6;
  font-family: Inter;
  font-size: 14px;
  cursor: pointer;
  transition: color 0.2s;
}

.manage-btn:hover {
  color: #2563EB;
}

.manage-btn svg {
  flex-shrink: 0;
}
</style>
