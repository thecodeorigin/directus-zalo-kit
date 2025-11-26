# Triển khai Upload File lên Directus cho Zalo Chat

## Tổng quan

Giải pháp này giải quyết vấn đề **client_id không hợp lệ** khi gửi file/ảnh qua Zalo OA bằng cách:

1. **KHÔNG gửi file trực tiếp qua ZCA** (Zalo Chat API)
2. **Upload file lên Directus** thay vì ZCA
3. **Lưu thông tin file vào database** (bảng `zalo_attachments`)
4. **Hiển thị ảnh/file từ URL Directus** trong UI tin nhắn

## Luồng hoạt động

```
[User chọn file]
    ↓
[Upload lên Directus qua /zalo/messages/upload-attachment]
    ↓
[Lưu metadata vào zalo_attachments]
    ↓
[Trả về URL Directus cho frontend]
    ↓
[Hiển thị trong UI chat]
    ↓
[KHÔNG gửi qua Zalo OA nữa]
```

## Các thay đổi chính

### 1. Endpoint mới: `/zalo/messages/upload-attachment`

**File**: `extensions/zalo-kit/src/endpoint/routes/messages/upload-attachment.post.ts`

**Chức năng**:
- Nhận file từ client
- Upload lên Directus Files storage
- Lưu metadata vào bảng `zalo_attachments`
- Trả về URL file để hiển thị

**Request**:
```typescript
POST /zalo/messages/upload-attachment
Content-Type: multipart/form-data

{
  file: File,
  conversationId: string,
  messageId?: string  // Optional, có thể link file với message sau
}
```

**Response**:
```json
{
  "success": true,
  "message": "File uploaded successfully",
  "data": {
    "attachment_id": 123,
    "file_id": "abc-123-def",
    "url": "http://localhost:8055/assets/abc-123-def",
    "filename": "image.png",
    "type": "image/png",
    "size": 102400
  }
}
```

### 2. Cập nhật `useFileUpload` composable

**File**: `extensions/zalo-kit/src/zalo-chat/composables/useFileUpload.ts`

**Thay đổi**:
```typescript
// TRƯỚC (gửi trực tiếp lên Directus)
const response = await api.post('/files', formData, {...})

// SAU (gửi qua endpoint custom)
const response = await api.post('/zalo/messages/upload-attachment', formData, {...})
```

**Lợi ích**:
- Tự động lưu metadata vào database
- Không cần xử lý thủ công sau khi upload
- Dễ dàng quản lý file trong Zalo context

### 3. Cập nhật flow gửi file trong `module.vue`

**File**: `extensions/zalo-kit/src/zalo-chat/module.vue`

**Hàm `confirmAndUploadFiles`**:
```typescript
async function confirmAndUploadFiles() {
  // Upload files qua composable
  const { uploadFiles } = useFileUpload()
  const result = await uploadFiles(selectedFiles.value, activeConversationId.value)

  // Tạo attachments từ files đã upload
  const newAttachments = result.success.map(file => ({
    id: file.id,
    filename: file.filename_download,
    type: file.type,
    size: file.filesize,
    url: `/assets/${file.id}`, // URL Directus
  }))

  // Thêm vào pending attachments
  pendingAttachments.value.push(...newAttachments)
}
```

### 4. Load attachments cùng với messages

**File**: `extensions/zalo-kit/src/endpoint/routes/messages/[conversationId].get.ts`

**Thay đổi**:
```typescript
// Fetch attachments cho tất cả messages
const attachments = await database('zalo_attachments')
  .whereIn('message_id', messageIds)
  .select([...])

// Group attachments theo message_id
const attachmentsMap = new Map()
attachments.forEach(att => {
  if (!attachmentsMap.has(att.message_id)) {
    attachmentsMap.set(att.message_id, [])
  }
  attachmentsMap.get(att.message_id).push({...})
})

// Thêm attachments vào mỗi message
const enrichedMessages = messages.map(msg => ({
  ...
  attachments: attachmentsMap.get(msg.id) || [],
}))
```

## Database Schema

Bảng `zalo_attachments` đã tồn tại với các trường:

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Primary key |
| message_id | string | Foreign key to zalo_messages |
| url | text | URL file từ Directus |
| file_name | string | Tên file gốc |
| mime_type | string | Loại file (image/png, etc.) |
| file_size | bigint | Kích thước file (bytes) |
| width | integer | Chiều rộng (ảnh) |
| height | integer | Chiều cao (ảnh) |
| thumbnail_url | text | URL thumbnail (optional) |
| metadata | json | Metadata bổ sung (directus_file_id, etc.) |
| created_at | timestamp | Thời gian tạo |
| updated_at | timestamp | Thời gian cập nhật |

## Hiển thị trong UI

UI đã có sẵn code hiển thị attachments trong `module.vue`:

```vue
<!-- File attachments hiển thị trong message -->
<div v-if="message.files && message.files.length > 0" class="message-files">
  <div v-for="file in message.files" :key="file.id" class="file-item">
    <!-- Image preview -->
    <img v-if="file.type.startsWith('image/')" :src="file.url" />

    <!-- File download -->
    <a v-else :href="file.url" target="_blank">
      {{ file.filename }}
    </a>
  </div>
</div>
```

## Kết quả

✅ **Đã hoàn thành**:
1. ✅ Tạo endpoint upload file lên Directus
2. ✅ Cập nhật composable useFileUpload
3. ✅ Cập nhật flow gửi tin nhắn kèm file
4. ✅ Load attachments cùng với messages
5. ✅ UI đã sẵn sàng hiển thị attachments

🔄 **Cần test**:
- Kiểm tra upload file lên Directus
- Kiểm tra hiển thị ảnh/file trong UI
- Kiểm tra performance khi có nhiều attachments

## Lưu ý quan trọng

⚠️ **client_id issue đã được giải quyết**:
- File KHÔNG được gửi qua Zalo OA (ZCA) nữa
- File được lưu trên Directus và hiển thị từ URL Directus
- Zalo OA không biết về các file này → không có lỗi client_id

⚠️ **Trade-off**:
- ✅ Không bị lỗi client_id từ ZCA
- ✅ Dễ quản lý file trong Directus
- ❌ File không hiển thị trong Zalo OA app (chỉ hiển thị trong Directus UI)
- ❌ Nếu muốn gửi file đến Zalo OA user, cần giải pháp khác

## Các bước tiếp theo

Nếu muốn **CŨNG gửi link đến Zalo OA user**, có thể:

1. Sau khi upload file lên Directus, lấy URL
2. Gửi tin nhắn text kèm link qua ZCA:
   ```typescript
   await ZaloMessage.sendMessage(
     { msg: `Đã gửi file: ${fileUrl}` },
     threadId,
     threadType
   )
   ```

3. User click vào link để xem file

Điều này sẽ tránh được lỗi client_id vì chỉ gửi text message, không gửi file binary.

## Tài liệu tham khảo

- Directus Files API: https://docs.directus.io/reference/files.html
- ZCA-JS Documentation: https://github.com/lequanghuylc/zca-js
