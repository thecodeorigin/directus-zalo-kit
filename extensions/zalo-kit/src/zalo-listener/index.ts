import { defineModule } from '@directus/extensions-sdk'
import ModuleComponent from './module.vue'

export default defineModule({
  id: 'zalo-listener',
  name: 'Zalo',
  icon: 'box',
  routes: [
    {
      path: '',
      component: ModuleComponent,
    },
    {
      path: '/messages',
      component: ModuleComponent,
    },
    {
      path: '/:page',
      component: ModuleComponent,
    },
  ],
})
