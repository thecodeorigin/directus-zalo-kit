/**
 * Handle image loading error and fallback to UI avatars
 * @param event The error event
 * @param name Name to use for fallback avatar
 */
export function handleImageError(event: Event, name: string): void {
  const target = event.target as HTMLImageElement
  target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
}

/**
 * Get initials from a name for avatar fallback
 * @param name The full name
 * @returns Initials (max 2 characters)
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Proxy Zalo avatar URL to avoid CORS issues
 * @param avatarUrl Original Zalo avatar URL
 * @param fallbackName Name for fallback avatar if no URL
 * @returns Proxied or fallback avatar URL
 */
export function getProxiedAvatarUrl(avatarUrl: string | null | undefined, fallbackName: string): string {
  if (!avatarUrl) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=4F46E5`
  }

  // Proxy Zalo CDN URLs to avoid CORS
  if (avatarUrl.startsWith('https://s120-ava-talk.zadn.vn/')
    || avatarUrl.startsWith('https://ava-grp-talk.zadn.vn/')) {
    return `http://localhost:8055/zalo/avatar-proxy?url=${encodeURIComponent(avatarUrl)}`
  }

  // Return as-is for other URLs
  return avatarUrl
}
