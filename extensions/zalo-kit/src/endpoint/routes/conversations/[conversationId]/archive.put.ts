/**
 * PUT /conversations/:conversationId/archive
 * Archive or unarchive a conversation
 */
export default function conversationArchiveHandler(context: any) {
  const { database } = context

  return async (req: any, res: any) => {
    try {
      const { conversationId } = req.params
      const { is_archived } = req.body as { is_archived: boolean }

      if (typeof is_archived !== 'boolean') {
        return res.status(400).json({ error: 'is_archived (boolean) is required' })
      }

      await (database as any)('zalo_conversations')
        .where('id', conversationId)
        .update({
          is_archived,
          updated_at: new Date().toISOString(),
        })

      res.json({ success: true, message: `Conversation ${is_archived ? 'archived' : 'unarchived'}` })
    }
    catch (error: any) {
      console.error('[Endpoint /conversations/archive] Error:', error)
      res.status(500).json({ error: 'Failed to update archive status', details: error.message })
    }
  }
}
