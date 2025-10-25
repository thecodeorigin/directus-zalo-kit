import { defineModule } from '@directus/extensions-sdk'
import ModuleComponent from './module.vue';

export default defineModule({
  id: 'chat-ui-test',
  name: 'Chat UI Test',
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
});
