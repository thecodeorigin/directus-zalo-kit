/**
 * Highlight search text in a string with HTML mark tags
 * @param text The text to search in
 * @param searchTerm The term to highlight
 * @returns HTML string with highlighted text
 */
export function highlightSearchText(text: string, searchTerm: string): string {
  if (!searchTerm.trim())
    return text

  const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return text.replace(regex, '<mark class="bg-yellow-200 px-1 rounded">$1</mark>')
}
