import type { ZaloConversationLabel } from '../../../type'

/**
 * DELETE /labels/:labelId
 * Delete a label and remove all associations
 */
export default function labelsDeleteHandler(context: any) {
  const { database } = context

  return async (req: any, res: any) => {
    try {
      const { labelId } = req.params

      // Remove all conversation label associations first
      await (database as any)('zalo_conversation_labels')
        .where('label_id', Number(labelId))
        .del()

      // Then delete the label itself
      await (database as any)('zalo_labels')
        .where('id', Number(labelId))
        .del()

      res.json({
        success: true,
        message: 'Label deleted',
      })
    }
    catch (error: any) {
      console.error('[Endpoint /labels/delete] Error:', error)
      res.status(500).json({ error: 'Failed to delete label', details: error.message })
    }
  }
}
