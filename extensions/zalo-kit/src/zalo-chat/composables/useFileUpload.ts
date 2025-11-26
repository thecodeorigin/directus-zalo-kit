import { ref } from 'vue'

interface FileUploadProgress {
  fileId: string
  fileName: string
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}

interface UploadedFile {
  id: string
  filename_download: string
  filename_disk: string
  type: string
  filesize: number
  width?: number
  height?: number
  title?: string
  description?: string
  folder?: string
  uploaded_on: string
  storage: string
  uploaded_by: string
}

// File type configurations
const FILE_CONFIGS = {
  images: {
    accept: 'image/*',
    maxSize: 10 * 1024 * 1024, // 10MB
    types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  },
  documents: {
    accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt',
    maxSize: 50 * 1024 * 1024, // 50MB
    types: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
    ],
  },
  all: {
    accept: '*',
    maxSize: 50 * 1024 * 1024, // 50MB
    types: [],
  },
}

const MAX_FILES = 10

export function useFileUpload() {
  const uploadProgress = ref<Map<string, FileUploadProgress>>(new Map())
  const isUploading = ref(false)

  /**
   * Validate file type and size
   */
  function validateFile(file: File): { valid: boolean, error?: string } {
    // Check file type
    const isImage = file.type.startsWith('image/')
    const isDocument = FILE_CONFIGS.documents.types.includes(file.type)

    if (!isImage && !isDocument) {
      return {
        valid: false,
        error: `File type "${file.type}" is not supported. Please upload images or documents.`,
      }
    }

    // Check file size
    const maxSize = isImage ? FILE_CONFIGS.images.maxSize : FILE_CONFIGS.documents.maxSize
    if (file.size > maxSize) {
      const maxSizeMB = maxSize / (1024 * 1024)
      return {
        valid: false,
        error: `File size exceeds ${maxSizeMB}MB limit. Current size: ${(file.size / (1024 * 1024)).toFixed(2)}MB`,
      }
    }

    return { valid: true }
  }

  /**
   * Validate multiple files
   */
  function validateFiles(files: File[]): { valid: boolean, errors: string[] } {
    const errors: string[] = []

    if (files.length > MAX_FILES) {
      errors.push(`Maximum ${MAX_FILES} files allowed. You selected ${files.length} files.`)
      return { valid: false, errors }
    }

    files.forEach((file, index) => {
      const validation = validateFile(file)
      if (!validation.valid) {
        errors.push(`File ${index + 1} (${file.name}): ${validation.error}`)
      }
    })

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * Upload single file to Directus via Zalo endpoint
   */
  async function uploadFile(
    file: File,
    conversationId: string,
    _onProgress?: (progress: number) => void,
  ): Promise<UploadedFile | null> {
    try {
      // Step 1: Upload to Directus /files endpoint first
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', file.name)
      formData.append('description', `Uploaded from Zalo chat conversation: ${conversationId}`)

      const baseUrl = window.location.origin

      // Upload to Directus files
      const uploadResponse = await fetch(`${baseUrl}/files`, {
        method: 'POST',
        body: formData,
      })

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({ message: uploadResponse.statusText }))
        throw new Error(errorData.errors?.[0]?.message || errorData.message || `Upload failed with status ${uploadResponse.status}`)
      }

      const uploadResult = await uploadResponse.json()
      const uploadedFile = uploadResult.data

      // Step 2: Save to zalo_attachments table via our endpoint
      const attachmentResponse = await fetch(`${baseUrl}/zalo/messages/save-attachment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          file_id: uploadedFile.id,
          url: `${baseUrl}/assets/${uploadedFile.id}`,
          file_name: uploadedFile.filename_download,
          mime_type: uploadedFile.type,
          file_size: uploadedFile.filesize,
        }),
      })

      if (!attachmentResponse.ok) {
        console.error('⚠️ Failed to save attachment metadata, but file uploaded successfully')
      }

      const attachmentResult = await attachmentResponse.json()

      // Return uploaded file info
      return {
        id: uploadedFile.id,
        filename_download: uploadedFile.filename_download,
        filename_disk: uploadedFile.filename_disk,
        type: uploadedFile.type,
        filesize: uploadedFile.filesize,
        uploaded_on: uploadedFile.uploaded_on,
        storage: uploadedFile.storage,
        uploaded_by: uploadedFile.uploaded_by,
        // Include Zalo info if available
        ...(attachmentResult.data?.sent_to_zalo && {
          zalo_message_id: attachmentResult.data.zalo_message_id,
        }),
      }
    }
    catch (error: any) {
      console.error('❌ Upload failed:', error)
      console.error('Error details:', error.message)
      throw error
    }
  }

  /**
   * Upload multiple files
   */
  async function uploadFiles(
    files: File[],
    conversationId: string,
  ): Promise<{ success: UploadedFile[], errors: Array<{ file: string, error: string }> }> {
    // Validate files first
    const validation = validateFiles(files)
    if (!validation.valid) {
      throw new Error(validation.errors.join('\n'))
    }

    isUploading.value = true
    const success: UploadedFile[] = []
    const errors: Array<{ file: string, error: string }> = []

    // Initialize progress tracking
    files.forEach((file) => {
      const fileId = `${file.name}_${Date.now()}_${Math.random()}`
      uploadProgress.value.set(fileId, {
        fileId,
        fileName: file.name,
        progress: 0,
        status: 'pending',
      })
    })

    // Upload files sequentially (to avoid overwhelming the server)
    for (const file of files) {
      const fileId = Array.from(uploadProgress.value.keys()).find(
        key => uploadProgress.value.get(key)?.fileName === file.name,
      )

      if (!fileId)
        continue

      try {
        // Update status to uploading
        const progressData = uploadProgress.value.get(fileId)!
        progressData.status = 'uploading'
        uploadProgress.value.set(fileId, progressData)

        // Upload file
        const uploadedFile = await uploadFile(file, conversationId, (progress) => {
          const progressData = uploadProgress.value.get(fileId)!
          progressData.progress = progress
          uploadProgress.value.set(fileId, progressData)
        })

        if (uploadedFile) {
          success.push(uploadedFile)

          // Update status to success
          const progressData = uploadProgress.value.get(fileId)!
          progressData.status = 'success'
          progressData.progress = 100
          uploadProgress.value.set(fileId, progressData)
        }
      }
      catch (error) {
        errors.push({
          file: file.name,
          error: error instanceof Error ? error.message : 'Upload failed',
        })

        // Update status to error
        const progressData = uploadProgress.value.get(fileId)!
        progressData.status = 'error'
        progressData.error = error instanceof Error ? error.message : 'Upload failed'
        uploadProgress.value.set(fileId, progressData)
      }
    }

    isUploading.value = false

    // Clear progress after 3 seconds
    setTimeout(() => {
      uploadProgress.value.clear()
    }, 3000)

    return { success, errors }
  }

  /**
   * Get file URL
   */
  function getFileUrl(fileId: string): string {
    // In Directus extensions, the API endpoint is relative
    return `/assets/${fileId}`
  }

  /**
   * Get thumbnail URL for images
   */
  function getThumbnailUrl(fileId: string, width = 200, height = 200): string {
    return `/assets/${fileId}?width=${width}&height=${height}&fit=cover`
  }

  /**
   * Format file size
   */
  function formatFileSize(bytes: number): string {
    if (bytes === 0)
      return '0 Bytes'

    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`
  }

  /**
   * Get file icon based on file type
   */
  function getFileIcon(fileType: string): string {
    if (fileType.startsWith('image/'))
      return 'image'
    if (fileType === 'application/pdf')
      return 'picture_as_pdf'
    if (fileType.includes('word'))
      return 'description'
    if (fileType.includes('excel') || fileType.includes('spreadsheet'))
      return 'table_chart'
    if (fileType.includes('powerpoint') || fileType.includes('presentation'))
      return 'slideshow'
    if (fileType === 'text/plain')
      return 'text_snippet'
    return 'folder_open'
  }

  return {
    uploadFile,
    uploadFiles,
    validateFile,
    validateFiles,
    getFileUrl,
    getThumbnailUrl,
    formatFileSize,
    getFileIcon,
    uploadProgress,
    isUploading,
    FILE_CONFIGS,
    MAX_FILES,
  }
}
