<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  props: {
    value: {
      type: String,
      default: null,
    },
  },
})
</script>

<template>
  <div>Value: {{ value }}</div>
</template>
