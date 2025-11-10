import type { ZaloLabel } from '../../../type'

/**
 * POST /labels
 * Create a new label
 */
export default function labelsCreateHandler(context: any) {
  const { database } = context

  return async (req: any, res: any) => {
    try {
      const { name, color_hex, description } = req.body as {
        name: string
        color_hex?: string
        description?: string
      }

      if (!name) {
        return res.status(400).json({ error: 'name is required' })
      }

      const labelData = {
        name,
        color_hex: color_hex || '#3498db',
        description: description || null,
        is_system: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const [newLabel] = await (database as any)('zalo_labels')
        .insert(labelData)
        .returning('*')

      res.json({
        success: true,
        message: 'Label created',
        data: newLabel,
      })
    }
    catch (error: any) {
      console.error('[Endpoint /labels/create] Error:', error)
      res.status(500).json({ error: 'Failed to create label', details: error.message })
    }
  }
}
