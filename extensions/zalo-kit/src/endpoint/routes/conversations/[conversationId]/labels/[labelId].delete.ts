/**
 * DELETE /conversations/:conversationId/labels/:labelId
 * Remove a label from a conversation
 */
export default function conversationLabelsRemoveHandler(context: any) {
  const { database } = context

  return async (req: any, res: any) => {
    try {
      const { conversationId, labelId } = req.params

      await (database as any)('zalo_conversation_labels')
        .where({
          conversation_id: conversationId,
          label_id: Number(labelId),
        })
        .del()

      res.json({ success: true, message: 'Label removed' })
    }
    catch (error: any) {
      console.error('[Endpoint /conversations/labels/remove] Error:', error)
      res.status(500).json({ error: 'Failed to remove label', details: error.message })
    }
  }
}
