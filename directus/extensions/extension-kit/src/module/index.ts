import { defineModule } from '@directus/extensions-sdk'
import ModuleComponent from './module.vue'

export default defineModule({
  id: 'zalo',
  name: 'Zalo Module',
  icon: 'box',
  routes: [
    {
      path: '',
      component: ModuleComponent,
    },
  ],
})
