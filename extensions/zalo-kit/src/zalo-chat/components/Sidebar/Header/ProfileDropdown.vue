<script setup lang="ts">
interface Props {
  userName: string
  userId: string
  userAvatar: string
}

defineProps<Props>()

const emit = defineEmits<{
  manageAccounts: []
}>()

function handleImageError(event: Event, name: string) {
  const target = event.target as HTMLImageElement
  target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
}
</script>

<template>
  <div class="account-block">
    <!-- User Profile -->
    <div class="user-profile">
      <div class="user-avatar">
        <img
          :src="userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=random`"
          :alt="userName"
          class="avatar-image"
          @error="handleImageError($event, userName)"
        >
      </div>
      <div class="user-info">
        <div class="user-name">
          {{ userName }}
        </div>
        <div class="user-email">
          {{ userId }}
        </div>
      </div>
    </div>

    <!-- Manage Accounts Button -->
    <button class="manage-accounts-btn" @click="emit('manageAccounts')">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="17" viewBox="0 0 20 17" fill="none">
        <path d="M15.9893 7.0127L16.2871 8.50195L16.2783 8.50391L16.2949 8.51172C16.4945 8.59487 16.6819 8.68641 16.8564 8.78613C17.0307 8.8857 17.2088 9.01061 17.3916 9.16016L17.3848 9.16797L17.4043 9.16211L18.8438 8.66504L19.833 10.3975L18.6914 11.3896L18.6846 11.3818L18.6875 11.4023C18.7207 11.6015 18.7373 11.8095 18.7373 12.0254C18.7373 12.2411 18.7206 12.4484 18.6875 12.6475L18.7002 12.6504L18.6768 12.6465L18.6914 12.6592L19.833 13.6514L18.8438 15.334L17.4033 14.8877L17.4062 14.8799L17.3926 14.8896C17.2097 15.0227 17.0308 15.1352 16.8564 15.2266C16.6819 15.318 16.4945 15.4051 16.2949 15.4883L16.2998 15.5L16.291 15.4795L16.2881 15.4971L15.9893 16.9873H14.0107L13.7119 15.4971L13.7217 15.4961L13.7051 15.4883L13.415 15.3604C13.3215 15.3167 13.2309 15.2723 13.1436 15.2266C12.9692 15.1352 12.7903 15.0227 12.6074 14.8896L12.5996 14.9004L12.6123 14.8828L12.5967 14.8877L11.1553 15.334L10.166 13.6514L11.3076 12.6592L11.3154 12.667L11.3125 12.6484C11.2792 12.4156 11.2627 12.1993 11.2627 12C11.2627 11.8007 11.2783 11.5844 11.3115 11.3516L11.3232 11.3535L11.3086 11.3408L10.166 10.3477L11.1553 8.66504L12.5957 9.11133L12.5938 9.12012L12.6074 9.11035C12.7903 8.97733 12.9692 8.86478 13.1436 8.77344C13.3181 8.682 13.5055 8.59488 13.7051 8.51172L13.709 8.52051L13.7119 8.50293L14.0107 7.0127H15.9893ZM8 9.0127H8.34961C8.4438 9.0127 8.53843 9.02756 8.63281 9.05762C8.5017 9.35428 8.39131 9.66342 8.30078 9.98438C8.20994 10.3065 8.13982 10.6408 8.08984 10.9873H8C6.81562 10.9873 5.7517 11.138 4.80859 11.4385C4.10204 11.6636 3.49116 11.888 2.97656 12.1133L2.49414 12.3389C2.34225 12.4232 2.21971 12.5416 2.12695 12.6934C2.03403 12.8454 1.9873 13.0147 1.9873 13.2002V14.0127H8.29102C8.39091 14.3602 8.52302 14.7038 8.68848 15.043C8.85175 15.3777 9.0313 15.6925 9.22656 15.9873H0.0126953V13.2002C0.0126953 12.6525 0.153335 12.1377 0.435547 11.6562C0.717615 11.1751 1.10775 10.8104 1.60547 10.5615C2.45463 10.1286 3.41252 9.76173 4.47852 9.46191C5.54388 9.1623 6.7177 9.0127 8 9.0127ZM15 9.9873C14.4467 9.9873 13.9731 10.1851 13.5791 10.5791C13.1851 10.9731 12.9873 11.4467 12.9873 12C12.9873 12.5533 13.1851 13.0269 13.5791 13.4209C13.9731 13.8149 14.4467 14.0127 15 14.0127C15.5533 14.0127 16.0269 13.8149 16.4209 13.4209C16.8149 13.0269 17.0127 12.5533 17.0127 12C17.0127 11.4467 16.8149 10.9731 16.4209 10.5791C16.0269 10.1851 15.5533 9.9873 15 9.9873ZM8 0.0126953C9.09666 0.0126953 10.0354 0.402586 10.8164 1.18359C11.5974 1.9646 11.9873 2.90334 11.9873 4C11.9873 5.09666 11.5974 6.0354 10.8164 6.81641C10.0354 7.59741 9.09666 7.9873 8 7.9873C6.90334 7.9873 5.9646 7.59741 5.18359 6.81641C4.40259 6.0354 4.0127 5.09666 4.0127 4C4.0127 2.90334 4.40259 1.9646 5.18359 1.18359C5.9646 0.402586 6.90334 0.0126953 8 0.0126953ZM8 1.9873C7.44666 1.9873 6.97309 2.18511 6.5791 2.5791C6.18511 2.97309 5.9873 3.44666 5.9873 4C5.9873 4.55334 6.18511 5.02691 6.5791 5.4209C6.97309 5.81489 7.44666 6.0127 8 6.0127C8.55334 6.0127 9.02691 5.81489 9.4209 5.4209C9.81489 5.02691 10.0127 4.55334 10.0127 4C10.0127 3.44666 9.81489 2.97309 9.4209 2.5791C9.02691 2.18511 8.55334 1.9873 8 1.9873Z" fill="#6644FF" stroke="#6644FF" stroke-width="0.025" />
      </svg>
      <span>Manage Accounts</span>
    </button>
  </div>
</template>

<style scoped>
.account-block {
  display: flex;
  flex-direction: column;
  padding: 6px 0;
  background: #F0F4F9;
  border-right: 0.5px solid #F0F4F9;
}

.user-profile {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: background-color 0.2s;
}
.user-profile:hover {
  background: rgba(0, 0, 0, 0.04);
}

.user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 9999px;
  overflow: hidden;
  background: #E4EAF1;
  border: 0.75px solid rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
}

.user-avatar .avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.user-name {
  font-family: Inter;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.21;
  color: #172940;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-email {
  font-family: Inter;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.21;
  color: #4F5464;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.manage-accounts-btn {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px;
  margin: 0 6px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
  width: calc(100% - 12px);
}

.manage-accounts-btn:hover {
  background: rgba(0, 0, 0, 0.04);
}

.manage-accounts-btn svg {
  flex-shrink: 0;
}

.manage-accounts-btn span {
  font-family: Inter;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.21;
  color: #172940;
  flex: 1;
  text-align: left;
}
</style>
