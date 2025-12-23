import { ref } from 'vue'

interface FileUploadProgress {
  fileId: string
  fileName: string
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
  preview?: string // Preview URL for images
  originalSize?: number // Original file size before compression
  compressedSize?: number // Compressed file size
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

// Compression settings
const COMPRESSION_SETTINGS = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.85,
  minSizeForCompression: 500 * 1024, // Only compress files > 500KB
}

/**
 * Format file size helper
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
 * Compress image before upload to reduce bandwidth
 */
async function compressImage(
  file: File,
  maxWidth = COMPRESSION_SETTINGS.maxWidth,
  maxHeight = COMPRESSION_SETTINGS.maxHeight,
  quality = COMPRESSION_SETTINGS.quality,
): Promise<File> {
  // Skip compression for small files or non-images
  if (!file.type.startsWith('image/') || file.size < COMPRESSION_SETTINGS.minSizeForCompression) {
    return file
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      reject(new Error('Canvas context not available'))
      return
    }

    img.onload = () => {
      // Calculate new dimensions while maintaining aspect ratio
      let { width, height } = img
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height)
        width = Math.floor(width * ratio)
        height = Math.floor(height * ratio)
      }

      canvas.width = width
      canvas.height = height
      ctx.drawImage(img, 0, 0, width, height)

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Image compression failed'))
            return
          }

          // Only use compressed version if it's actually smaller
          if (blob.size < file.size) {
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            })
            // Log compression success (development only)
            if (process.env.NODE_ENV === 'development') {
              // eslint-disable-next-line no-console
              console.log(`🗜️ Compressed: ${file.name} from ${formatFileSize(file.size)} → ${formatFileSize(compressedFile.size)}`)
            }
            resolve(compressedFile)
          }
          else {
            // Compression didn't help, use original
            resolve(file)
          }
        },
        file.type,
        quality,
      )
    }

    img.onerror = () => reject(new Error('Failed to load image for compression'))
    img.src = URL.createObjectURL(file)
  })
}

/**
 * Generate preview URL for file (images only)
 */
async function generatePreview(file: File): Promise<string | undefined> {
  if (!file.type.startsWith('image/')) {
    return undefined
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target?.result as string)
    reader.onerror = () => reject(new Error('Failed to generate preview'))
    reader.readAsDataURL(file)
  })
}

export function useFileUpload(apiInstance: any) {
  // Accept API instance from component instead of calling useApi()
  const api = apiInstance
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
   * Upload single file to Directus via Zalo endpoint with retry logic
   */
  async function uploadFileWithRetry(
    file: File,
    conversationId: string,
    maxRetries = 3,
    _onProgress?: (progress: number) => void,
  ): Promise<UploadedFile | null> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await uploadFile(file, conversationId, _onProgress)
      }
      catch (error: any) {
        lastError = error

        // Only retry on network/fetch errors
        const isNetworkError = error.message?.toLowerCase().includes('fetch')
          || error.message?.toLowerCase().includes('network')
          || error.message?.toLowerCase().includes('failed to fetch')

        if (isNetworkError && attempt < maxRetries) {
          const waitTime = 1000 * attempt // Exponential backoff: 1s, 2s, 3s
          console.warn(`⚠️ Upload attempt ${attempt}/${maxRetries} failed, retrying in ${waitTime}ms...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          continue
        }

        // Don't retry validation errors or if max retries reached
        throw error
      }
    }

    throw lastError || new Error('Upload failed after retries')
  }

  /**
   * Upload single file to Directus (internal function)
   */
  async function uploadFile(
    file: File,
    conversationId: string,
    _onProgress?: (progress: number) => void,
  ): Promise<UploadedFile | null> {
    try {
      const originalSize = file.size

      // Step 0: Compress image if needed
      const fileToUpload = await compressImage(file)
      const compressedSize = fileToUpload.size

      // Step 1: Upload to Directus /files endpoint
      // Note: Use fetch() instead of api.post() for FormData to avoid Content-Type issues
      const formData = new FormData()
      formData.append('file', fileToUpload)
      formData.append('title', file.name)
      formData.append('description', `Uploaded from Zalo chat conversation: ${conversationId}`)

      const baseUrl = window.location.origin

      // Use fetch for file upload (FormData), api.post() has issues with multipart
      const uploadResponse = await fetch(`${baseUrl}/files`, {
        method: 'POST',
        body: formData,
        // Don't set Content-Type - browser will set multipart/form-data with boundary
      })

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({ message: uploadResponse.statusText }))
        throw new Error(errorData.errors?.[0]?.message || errorData.message || `Upload failed with status ${uploadResponse.status}`)
      }

      const uploadResult = await uploadResponse.json()
      const uploadedFile = uploadResult.data

      // Step 2: Save to zalo_attachments table via our endpoint (use api here for JSON)
      const attachmentResponse = await api.post('/zalo/messages/save-attachment', {
        conversationId,
        file_id: uploadedFile.id,
        url: `/assets/${uploadedFile.id}`,
        file_name: uploadedFile.filename_download,
        mime_type: uploadedFile.type,
        file_size: uploadedFile.filesize,
      })

      if (!attachmentResponse) {
        console.error('⚠️ Failed to save attachment metadata, but file uploaded successfully')
      }

      const attachmentResult = attachmentResponse?.data

      // Return uploaded file info with compression stats
      return {
        id: uploadedFile.id,
        filename_download: uploadedFile.filename_download,
        filename_disk: uploadedFile.filename_disk,
        type: uploadedFile.type,
        filesize: uploadedFile.filesize,
        uploaded_on: uploadedFile.uploaded_on,
        storage: uploadedFile.storage,
        uploaded_by: uploadedFile.uploaded_by,
        // Include compression info
        ...(originalSize !== compressedSize && {
          originalSize,
          compressedSize,
        }),
        // Include Zalo info if available
        ...(attachmentResult?.sent_to_zalo && {
          zalo_message_id: attachmentResult.zalo_message_id,
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
   * Upload multiple files with preview generation and retry logic
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

    // Initialize progress tracking with preview
    for (const file of files) {
      const fileId = `${file.name}_${Date.now()}_${Math.random()}`
      const preview = await generatePreview(file).catch(() => undefined)

      uploadProgress.value.set(fileId, {
        fileId,
        fileName: file.name,
        progress: 0,
        status: 'pending',
        preview,
        originalSize: file.size,
      })
    }

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

        // Upload file with retry logic
        const uploadedFile = await uploadFileWithRetry(file, conversationId, 3, (progress) => {
          const progressData = uploadProgress.value.get(fileId)!
          progressData.progress = progress
          uploadProgress.value.set(fileId, progressData)
        })

        if (uploadedFile) {
          success.push(uploadedFile)

          // Update status to success with compression info
          const progressData = uploadProgress.value.get(fileId)!
          progressData.status = 'success'
          progressData.progress = 100
          progressData.compressedSize = uploadedFile.filesize
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
    uploadFileWithRetry,
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
    COMPRESSION_SETTINGS,
  }
}
