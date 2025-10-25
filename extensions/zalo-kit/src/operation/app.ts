import { defineOperationApp } from '@directus/extensions-sdk'

export default defineOperationApp({
  id: 'custom',
  name: 'Custom Operation App',
  icon: 'box',
  description: 'This is my custom operation!',
  overview: ({ text }) => [
    {
      label: 'Text',
      text,
    },
  ],
  options: [
    {
      field: 'text',
      name: 'Text',
      type: 'string',
      meta: {
        width: 'full',
        interface: 'input',
      },
    },
  ],
})
