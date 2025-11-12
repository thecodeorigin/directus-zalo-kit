/**
 * Format a date string to a human-readable relative time in Vietnamese
 * @param dateString ISO date string
 * @returns Formatted time string
 */
export function formatTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1)
    return 'Vừa xong'
  if (diffMins < 60)
    return `${diffMins} phút trước`
  if (diffHours < 24)
    return `${diffHours} giờ trước`
  if (diffDays < 7)
    return `${diffDays} ngày trước`

  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
