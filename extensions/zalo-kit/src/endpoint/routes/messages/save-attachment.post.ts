import type { Accountability } from '@directus/types'
import { defineEventHandler } from '../../utils'

/**
 * Save attachment metadata to zalo_attachments table
 * This endpoint receives file info after file is uploaded to Directus /files
 * NOTE: ZCA does not support sending files/images for personal Zalo chat,
 * so we only save to database and display in UI
 */
export default defineEventHandler(async (context, { req, res }) => {
  const _req = req as typeof req & { accountability: Accountability | null }

  if (!_req.accountability?.user) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'User not authenticated',
    })
    return
  }

  const { database } = context

  try {
    const {
      conversationId,
      file_id,
      url,
      file_name,
      mime_type,
      file_size,
      message_id,
    } = req.body as {
      conversationId: string
      file_id: string
      url: string
      file_name: string
      mime_type: string
      file_size: number
      message_id?: string
    }

    if (!conversationId || !file_id || !url) {
      res.status(400).json({
        error: 'Missing required fields: conversationId, file_id, url',
      })
      return
    }

    // Save attachment metadata to database
    const timestamp = new Date()
    const attachmentData = {
      message_id: message_id || null,
      url,
      file_name,
      mime_type,
      file_size,
      metadata: JSON.stringify({
        directus_file_id: file_id,
        conversation_id: conversationId,
      }),
      created_at: timestamp.toISOString(),
      updated_at: timestamp.toISOString(),
    }

    const [attachment] = await database('zalo_attachments')
      .insert(attachmentData)
      .returning('*')

    res.json({
      success: true,
      message: 'File saved to database successfully',
      data: {
        attachment_id: attachment.id,
        file_id,
        url,
        filename: file_name,
        type: mime_type,
        size: file_size,
      },
    })
  }
  catch (error: any) {
    console.error('Error saving attachment:', error)
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: error.message || 'Failed to save attachment',
    })
  }
})
