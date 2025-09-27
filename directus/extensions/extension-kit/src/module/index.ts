import { defineModule } from '@directus/extensions-sdk'
import ModuleComponent from './module.vue'

export default defineModule({
  id: 'custom',
  name: 'Custom Module',
  icon: 'box',
  routes: [
    {
      path: '',
      component: ModuleComponent,
    },
  ],
})
