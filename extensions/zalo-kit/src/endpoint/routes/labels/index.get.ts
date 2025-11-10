import type { ZaloLabel } from '../../../type'

/**
 * GET /labels
 * Get all labels
 */
export default function labelsGetHandler(context: any) {
  const { database } = context

  return async (req: any, res: any) => {
    try {
      const labels = await (database as any)('zalo_labels')
        .select('*')
        .orderBy('name', 'asc')

      res.json({ data: labels as ZaloLabel[] })
    }
    catch (error: any) {
      console.error('[Endpoint /labels] Error:', error)
      res.status(500).json({ error: 'Failed to fetch labels', details: error.message })
    }
  }
}
