/* eslint-disable no-console */
import { defineOperationApi } from '@directus/extensions-sdk'

interface Options {
  text: string
}

export default defineOperationApi<Options>({
  id: 'custom',
  handler: ({ text }) => {
    console.log(text)
  },
})
