import type { Accountability } from '@directus/types'
import { ThreadType } from 'zca-js'
import * as ZaloMessage from '../../services/ZaloMessageService'
import { defineEventHandler } from '../../utils'

/**
 * Save attachment metadata to zalo_attachments table and send to Zalo chat
 * This endpoint receives file info after file is uploaded to Directus /files
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

    // Try to send image to Zalo chat if it's an image
    let zaloMessageId = null
    const isImage = mime_type.startsWith('image/')

    if (isImage) {
      try {
        // Get conversation info to determine thread type
        const [conversation] = await database('zalo_conversations')
          .where('id', conversationId)
          .select(['participant_id', 'group_id'])
          .limit(1)

        if (conversation) {
          const zaloThreadId = conversation.group_id || conversation.participant_id
          const threadType = conversation.group_id ? ThreadType.Group : ThreadType.User

          // Send image to Zalo
          const zaloResult = await ZaloMessage.sendImage(
            url,
            String(zaloThreadId),
            threadType,
          )

          if (zaloResult?.data?.msgId || zaloResult?.msgId) {
            zaloMessageId = zaloResult.data?.msgId || zaloResult.msgId

            // Update attachment with Zalo message ID
            await database('zalo_attachments')
              .where('id', attachment.id)
              .update({
                message_id: zaloMessageId,
                updated_at: new Date().toISOString(),
              })
          }
        }
      }
      catch (zaloError: any) {
        console.error('⚠️ Failed to send image to Zalo:', zaloError.message)
        // Continue even if Zalo send fails - file is still uploaded to Directus
      }
    }

    res.json({
      success: true,
      message: zaloMessageId
        ? 'File saved and sent to Zalo successfully'
        : 'File saved to database successfully',
      data: {
        attachment_id: attachment.id,
        file_id,
        url,
        filename: file_name,
        type: mime_type,
        size: file_size,
        zalo_message_id: zaloMessageId,
        sent_to_zalo: !!zaloMessageId,
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
