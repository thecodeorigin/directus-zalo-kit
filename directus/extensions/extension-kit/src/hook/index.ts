/* eslint-disable no-console */
import { defineHook } from '@directus/extensions-sdk'
import { ZaloService } from '../endpoint/services/ZaloService'

export default defineHook(({ action, init }, { services, getSchema, emitter }) => {
  // On server start, initialize our singleton ZaloService
  init('app.after', async () => {
    const schema = await getSchema()
    // The `action` function IS the emitter we need.
    ZaloService.getInstance(emitter, schema)
    console.log('Zalo Sync Hook Initialized.')
  })

  // Listen for new Zalo messages emitted by our service
  action('zalo.message.new', async ({ payload }, { schema }) => {
    if (!schema) {
      console.error('Schema is not available in the action context.')
      return
    }

    const zaloMessagesService = new services.ItemsService('zalo_messages', { schema })
    const zaloUsersService = new services.ItemsService('zalo_users', { schema })
    const zaloConvosService = new services.ItemsService('zalo_conversations', { schema })

    try {
      const sender = payload.sender
      const conversation = payload.thread

      // 1. Upsert (update or insert) the sender
      await zaloUsersService.upsertOne({
        id: sender.id,
        display_name: sender.name,
        avatar: sender.profilePicture,
        last_updated: new Date().toISOString(),
      })

      // 2. Upsert the conversation
      await zaloConvosService.upsertOne({
        id: conversation.id,
        display_name: conversation.name,
        is_group: conversation.isGroup,
        last_updated: new Date().toISOString(),
      })

      // 3. Create the new message
      await zaloMessagesService.createOne({
        id: payload.messageId,
        content: payload.body,
        sender: sender.id,
        conversation: conversation.id,
        sent_at: new Date(payload.timestamp).toISOString(),
        type: payload.type,
      })

      console.log(`Synced message ${payload.messageId} to database.`)
    }
    catch (error) {
      console.error('Failed to sync Zalo message:', error)
    }
  })

  // You can add more listeners here, e.g., for reactions
  action('zalo.reaction.new', ({ payload }) => {
    console.log('Reaction sync logic not yet implemented.', payload)
    // TODO: Implement logic to add/update a reaction on a message
  })
})
