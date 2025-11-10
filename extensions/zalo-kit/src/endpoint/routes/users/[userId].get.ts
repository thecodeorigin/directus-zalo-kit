/**
 * GET /users/:userId
 * Get a specific user by ID
 */
export default function userDetailHandler(context: any) {
  const { database } = context

  return async (req: any, res: any) => {
    try {
      const { userId } = req.params

      const user = await (database as any)('zalo_users')
        .where('id', userId)
        .first()

      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      res.json({ data: user })
    }
    catch (error: any) {
      console.error('[Endpoint /users/:userId] Error:', error)
      res.status(500).json({ error: 'Failed to fetch user', details: error.message })
    }
  }
}
