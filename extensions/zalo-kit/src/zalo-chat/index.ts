import { defineModule } from '@directus/extensions-sdk'
import ModuleComponent from './module.vue'

export default defineModule({
  id: 'zalo-chat',
  name: 'Zalo Chat',
  icon: 'chat',
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
      props: true,
    },
  ],
})
