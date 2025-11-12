<script setup lang="ts">
import type { Conversation } from '../../../types'
import { handleImageError } from '../../../utils/avatar'

interface Props {
  show: boolean
  searchQuery: string
  selectedMembers: string[]
  filteredMembers: Conversation[]
  selectedMemberObjects: Conversation[]
}

defineProps<Props>()

defineEmits<{
  'close': []
  'update:searchQuery': [value: string]
  'toggleMember': [memberId: string]
  'removeMember': [memberId: string]
  'createGroup': []
}>()
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000]"
    @click.self="$emit('close')"
  >
    <div class="bg-[#F0F4F9] rounded-lg shadow-xl w-[500px] max-h-[55vh] flex flex-col overflow-hidden">
      <!-- Dialog Header -->
      <div class="flex items-center justify-between pt-4 px-4 border-gray-200">
        <h2 class="text-xl font-medium text-black">
          Select members
        </h2>
        <button
          class="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 transition-colors"
          @click="$emit('close')"
        >
          <svg width="30" height="30" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>

      <!-- Dialog Content -->
      <div class="flex-1 flex flex-col p-3 space-y-3 overflow-hidden">
        <!-- Search Input with Selected Members -->
        <div class="relative border border-gray-200 rounded-lg bg-white">
          <div class="flex flex-wrap gap-1 p-2">
            <!-- Selected Member Chips -->
            <div
              v-for="member in selectedMemberObjects"
              :key="`selected-${member.id}`"
              class="inline-flex items-center gap-1 bg-[#F0F4F9] border border-[#D3DAE4] rounded-md px-2 py-1"
            >
              <!-- Small Avatar -->
              <div class="w-6 h-6 rounded-full overflow-hidden bg-gray-100 border border-gray-200">
                <img
                  :src="member.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=random`"
                  :alt="member.name"
                  class="w-full h-full object-cover"
                  @error="handleImageError($event, member.name)"
                >
              </div>
              <!-- Member Name -->
              <span class="text-xs font-medium text-[#344054]">{{ member.name }}</span>
              <!-- Remove Button -->
              <button
                class="w-3.5 h-3.5 flex items-center justify-center rounded hover:bg-gray-200 transition-colors"
                @click="$emit('removeMember', member.id)"
              >
                <svg width="7" height="7" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 3L3 9M3 3L9 9" stroke="#4F5464" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            </div>

            <!-- Search Input -->
            <input
              :value="searchQuery"
              type="text"
              placeholder="Search a member"
              class="flex-1 min-w-[120px] px-1 py-1 text-sm bg-transparent border-none outline-none"
              @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
            >
          </div>
        </div>

        <!-- Description -->
        <p class="text-base text-gray-400">
          You can add unlimited members
        </p>

        <!-- Members List -->
        <div class="flex-1 space-y-2 pr-1 scroll-style overflow-y-auto">
          <div
            v-for="member in filteredMembers"
            :key="member.id"
            class="flex items-center gap-4 p-2 hover:bg-gray-50 rounded-md cursor-pointer"
            @click="$emit('toggleMember', member.id)"
          >
            <!-- Checkbox -->
            <div class="relative">
              <input
                :id="`member-${member.id}`"
                type="checkbox"
                :checked="selectedMembers.includes(member.id)"
                class="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                @click.stop
                @change="$emit('toggleMember', member.id)"
              >
            </div>

            <!-- Avatar and Name -->
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-full overflow-hidden bg-gray-100 border border-gray-200">
                <img
                  :src="member.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=random`"
                  :alt="member.name"
                  class="w-full h-full object-cover"
                  @error="handleImageError($event, member.name)"
                >
              </div>
              <p class="text-sm font-medium text-gray-900">
                {{ member.name }}
              </p>
            </div>
          </div>
        </div>

        <VDivider />

        <!-- Create Group Button -->
        <div class="pt-2">
          <button
            :disabled="selectedMembers.length === 0"
            class="w-full py-3 text-sm font-medium rounded-md transition-colors"
            :class="selectedMembers.length > 0
              ? 'bg-[#6644FF] text-white hover:bg-[#5533DD]'
              : 'bg-gray-200 text-gray-600 cursor-not-allowed'"
            @click="$emit('createGroup')"
          >
            Create a group
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import "../../../../styles/tailwind.css";

/* Scrollbar styles */
.scroll-style::-webkit-scrollbar {
  width: 6px;
}

.scroll-style::-webkit-scrollbar-track {
  background: transparent;
}

.scroll-style::-webkit-scrollbar-thumb {
  background: var(--border-normal, #d3dae4);
  border-radius: 3px;
}

.scroll-style::-webkit-scrollbar-thumb:hover {
  background: var(--border-subdued, #a2b5cd);
}
</style>
