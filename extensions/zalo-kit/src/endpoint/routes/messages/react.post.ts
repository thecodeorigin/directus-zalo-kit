import type { ZaloReaction } from '../../../type'

/**
 * POST /messages/:messageId/react
 * Add or update a reaction to a message
 */
export default function reactHandler(context: any) {
  const { database } = context

  return async (req: any, res: any) => {
    try {
      const { messageId } = req.params
      const { reaction_icon } = req.body as { reaction_icon: string }

      const ZaloLoginModule = await import('../../services/ZaloLoginService')
      const status = ZaloLoginModule.loginGetStatus()
      const zaloUserId = status.userId

      if (status.status !== 'logged_in' || !zaloUserId) {
        return res.status(401).json({ error: 'Zalo user not authenticated' })
      }

      if (!reaction_icon) {
        return res.status(400).json({ error: 'reaction_icon is required' })
      }

      const reactionData: Omit<ZaloReaction, 'id'> = {
        message_id: messageId,
        user_id: zaloUserId,
        reaction_icon,
        created_at: new Date().toISOString(),
      }

      await (database as any)('zalo_reactions')
        .insert(reactionData as any)
        .onConflict((database as any).raw('(message_id, user_id)'))
        .merge({
          reaction_icon,
        })

      res.json({
        success: true,
        message: 'Reaction saved',
        data: reactionData,
      })
    }
    catch (error: any) {
      console.error('[Endpoint /messages/react] Error:', error)
      res.status(500).json({ error: 'Failed to save reaction', details: error.message })
    }
  }
}
