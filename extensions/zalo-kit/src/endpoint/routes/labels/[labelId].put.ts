/**
 * PUT /labels/:labelId
 * Update an existing label
 */
export default function labelsUpdateHandler(context: any) {
  const { database } = context

  return async (req: any, res: any) => {
    try {
      const { labelId } = req.params
      const { name, color_hex, description } = req.body

      const updateData: any = {
        updated_at: new Date().toISOString(),
      }

      if (name)
        updateData.name = name
      if (color_hex)
        updateData.color_hex = color_hex
      if (description !== undefined)
        updateData.description = description

      await (database as any)('zalo_labels')
        .where('id', Number(labelId))
        .update(updateData)

      res.json({
        success: true,
        message: 'Label updated',
      })
    }
    catch (error: any) {
      console.error('[Endpoint /labels/update] Error:', error)
      res.status(500).json({ error: 'Failed to update label', details: error.message })
    }
  }
}
