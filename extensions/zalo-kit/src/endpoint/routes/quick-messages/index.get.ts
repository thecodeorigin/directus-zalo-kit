import type { ZaloQuickMessage } from '../../../type'

/**
 * GET /quick-messages
 * Get all active quick messages
 */
export default function quickMessagesHandler(context: any) {
  const { database } = context

  return async (req: any, res: any) => {
    try {
      const messages = await (database as any)('zalo_quick_messages')
        .where('is_active', true)
        .orderBy('keyword', 'asc')
        .select('*')

      res.json({ data: messages as ZaloQuickMessage[] })
    }
    catch (error: any) {
      console.error('[Endpoint /quick-messages] Error:', error)
      res.status(500).json({ error: 'Failed to fetch quick messages', details: error.message })
    }
  }
}
