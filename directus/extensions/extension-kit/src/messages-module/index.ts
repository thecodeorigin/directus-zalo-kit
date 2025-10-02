import { defineModule } from '@directus/extensions-sdk'
import ModuleComponent from './module.vue'

export default defineModule({
  id: 'messages',
  name: 'Messages Module',
  icon: 'chat',
  color: '#6366F1',
  routes: [
    {
      path: '',
      component: ModuleComponent,
    },
  ],
})