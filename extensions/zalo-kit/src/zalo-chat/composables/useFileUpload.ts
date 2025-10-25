import { useApi } from '@directus/extensions-sdk'
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
  const api = useApi()
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
   * Create folder structure in Directus
   */
  async function createFolder(conversationId: string): Promise<string | null> {
    try {
      // Check if chat_files folder exists
      const chatFilesFolder = await api.get('/folders', {
        params: {
          filter: {
            name: { _eq: 'chat_files' },
          },
        },
      })

      let chatFilesFolderId: string

      if (chatFilesFolder.data.data.length === 0) {
        // Create chat_files folder
        const newChatFolder = await api.post('/folders', {
          name: 'chat_files',
        })
        chatFilesFolderId = newChatFolder.data.data.id
      }
      else {
        chatFilesFolderId = chatFilesFolder.data.data[0].id
      }

      // Check if conversation folder exists
      const conversationFolder = await api.get('/folders', {
        params: {
          filter: {
            name: { _eq: conversationId },
            parent: { _eq: chatFilesFolderId },
          },
        },
      })

      if (conversationFolder.data.data.length === 0) {
        // Create conversation folder
        const newConvFolder = await api.post('/folders', {
          name: conversationId,
          parent: chatFilesFolderId,
        })
        return newConvFolder.data.data.id
      }

      return conversationFolder.data.data[0].id
    }
    catch (error) {
      console.error('Error creating folder:', error)
      return null
    }
  }

  /**
   * Upload single file to Directus
   */
  async function uploadFile(
    file: File,
    conversationId: string,
    onProgress?: (progress: number) => void,
  ): Promise<UploadedFile | null> {
    try {
      // Create FormData - simple approach
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', file.name)
      formData.append('storage', 'local') // Use local storage

      // Upload with progress tracking
      const response = await api.post('/files', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            onProgress?.(percentCompleted)
          }
        },
      })

      console.log('Upload response:', response.data)
      return response.data.data
    }
    catch (error: any) {
      console.error('Error uploading file:', error)
      console.error('Error details:', error.response?.data || error.message)
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
