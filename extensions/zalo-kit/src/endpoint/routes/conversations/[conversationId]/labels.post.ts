/**
 * POST /conversations/:conversationId/labels
 * Apply a label to a conversation
 */
export default function conversationLabelsAddHandler(context: any) {
  const { database } = context

  return async (req: any, res: any) => {
    try {
      const { conversationId } = req.params
      const { label_id } = req.body as { label_id: number }

      if (!label_id) {
        return res.status(400).json({ error: 'label_id is required' })
      }

      await (database as any)('zalo_conversation_labels')
        .insert({
          conversation_id: conversationId,
          label_id,
        })
        .onConflict(['conversation_id', 'label_id'])
        .ignore()

      res.json({ success: true, message: 'Label applied' })
    }
    catch (error: any) {
      console.error('[Endpoint /conversations/labels/add] Error:', error)
      res.status(500).json({ error: 'Failed to apply label', details: error.message })
    }
  }
}
