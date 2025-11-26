import type { Accountability } from '@directus/types'
import { ThreadType } from 'zca-js'
import * as ZaloMessage from '../../services/ZaloMessageService'
import { defineEventHandler } from '../../utils'

/**
 * Upload file attachment to Directus and save to zalo_attachments table
 * Then send image to Zalo chat (personal or group)
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

  const { database, services } = context

  try {
    // Get form data from request
    const { messageId, conversationId } = req.body as {
      messageId?: string
      conversationId: string
    }

    if (!conversationId) {
      res.status(400).json({
        error: 'conversationId is required',
      })
      return
    }

    // Check if file is uploaded
    const files = (req as any).files
    if (!files || !files.file) {
      res.status(400).json({
        error: 'No file uploaded',
      })
      return
    }

    const file = Array.isArray(files.file) ? files.file[0] : files.file
    const { FilesService } = services

    // Upload file to Directus
    const filesService = new FilesService({
      schema: await context.getSchema(),
      accountability: _req.accountability,
    })

    // Create file record
    const fileData = {
      filename_download: file.name,
      filename_disk: file.name,
      type: file.mimetype,
      filesize: file.size,
      title: file.name,
      description: `Uploaded from Zalo chat conversation: ${conversationId}`,
      storage: 'local', // or your configured storage (s3, etc.)
    }

    const uploadedFileId = await filesService.uploadOne(file.path, fileData)

    // Generate Directus URL for the file
    const baseUrl = req.get('origin') || `http://localhost:8055`
    const fileUrl = `${baseUrl}/assets/${uploadedFileId}`

    // Save attachment info to zalo_attachments table
    const timestamp = new Date()
    const attachmentData = {
      message_id: messageId || null,
      url: fileUrl,
      file_name: file.name,
      mime_type: file.mimetype,
      file_size: file.size,
      // Store Directus file ID in metadata for future reference
      metadata: {
        directus_file_id: String(uploadedFileId),
        conversation_id: conversationId,
      },
      created_at: timestamp.toISOString(),
      updated_at: timestamp.toISOString(),
    }

    const [attachment] = await database('zalo_attachments')
      .insert(attachmentData)
      .returning('*')

    // Try to send image to Zalo chat if it's an image
    let zaloMessageId = null
    const isImage = file.mimetype.startsWith('image/')

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
            fileUrl,
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
        ? 'File uploaded and sent to Zalo successfully'
        : 'File uploaded to Directus successfully',
      data: {
        attachment_id: attachment.id,
        file_id: String(uploadedFileId),
        url: fileUrl,
        filename: file.name,
        type: file.mimetype,
        size: file.size,
        zalo_message_id: zaloMessageId,
        sent_to_zalo: !!zaloMessageId,
      },
    })
  }
  catch (error: any) {
    console.error('[Upload Attachment Error]:', error)
    res.status(500).json({
      error: 'Failed to upload attachment',
      details: error.message,
    })
  }
})
