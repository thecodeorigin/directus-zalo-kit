<script setup lang="ts">
const modelValue = defineModel<string>({
  default: null,
})
</script>

<template>
  <input v-model="modelValue">
</template>
