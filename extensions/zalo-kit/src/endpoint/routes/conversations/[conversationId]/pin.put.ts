import type { ZaloConversation } from '../../../../type'

/**
 * PUT /conversations/:conversationId/pin
 * Pin or unpin a conversation
 */
export default function conversationPinHandler(context: any) {
  const { database } = context

  return async (req: any, res: any) => {
    try {
      const { conversationId } = req.params
      const { is_pinned } = req.body as { is_pinned: boolean }

      if (typeof is_pinned !== 'boolean') {
        return res.status(400).json({ error: 'is_pinned (boolean) is required' })
      }

      await (database as any)('zalo_conversations')
        .where('id', conversationId)
        .update({
          is_pinned,
          updated_at: new Date().toISOString(),
        })

      res.json({ success: true, message: `Conversation ${is_pinned ? 'pinned' : 'unpinned'}` })
    }
    catch (error: any) {
      console.error('[Endpoint /conversations/pin] Error:', error)
      res.status(500).json({ error: 'Failed to update pin status', details: error.message })
    }
  }
}
