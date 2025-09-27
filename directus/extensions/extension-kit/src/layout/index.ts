import { defineLayout } from '@directus/extensions-sdk'
import { ref } from 'vue'
import LayoutComponent from './layout.vue'

export default defineLayout({
  id: 'custom',
  name: 'Custom Layout',
  icon: 'box',
  component: LayoutComponent,
  slots: {
    options: () => null,
    sidebar: () => null,
    actions: () => null,
  },
  setup() {
    const name = ref('Custom Layout')

    return { name }
  },
})
