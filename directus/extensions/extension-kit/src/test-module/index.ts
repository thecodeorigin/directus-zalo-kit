import { defineModule } from '@directus/extensions-sdk'
import ModuleComponent from './module.vue';

export default {
  id: 'my-module',
  name: 'My Module',
  icon: 'star',
  routes: [
    {
      path: '',
      component: ModuleComponent,
    },
    {
      path: ':page',
      component: ModuleComponent,
      props: true,
    },
  ],
};
