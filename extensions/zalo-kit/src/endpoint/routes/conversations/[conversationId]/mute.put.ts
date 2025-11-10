/**
 * PUT /conversations/:conversationId/mute
 * Mute or unmute a conversation
 */
export default function conversationMuteHandler(context: any) {
  const { database } = context

  return async (req: any, res: any) => {
    try {
      const { conversationId } = req.params
      const { is_muted } = req.body as { is_muted: boolean }

      if (typeof is_muted !== 'boolean') {
        return res.status(400).json({ error: 'is_muted (boolean) is required' })
      }

      await (database as any)('zalo_conversations')
        .where('id', conversationId)
        .update({
          is_muted,
          updated_at: new Date().toISOString(),
        })

      res.json({ success: true, message: `Conversation ${is_muted ? 'muted' : 'unmuted'}` })
    }
    catch (error: any) {
      console.error('[Endpoint /conversations/mute] Error:', error)
      res.status(500).json({ error: 'Failed to update mute status', details: error.message })
    }
  }
}
