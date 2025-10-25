/**
 * Zalo Emoticon & Icon to Emoji Converter
 * Complete list including Zalo's /- format icons
 */

export const emoticonMap: Record<string, string> = {
  // ===== ZALO SPECIAL ICONS (/-format) =====
  '/-strong': '👍', // Like/Thumbs up
  '/-weak': '👎', // Dislike/Thumbs down
  '/-heart': '❤️', // Heart/Love
  '/-break': '💔', // Broken heart
  '/-shy': '😊', // Shy/Blushing
  '/-hug': '🤗', // Hug
  '/-kiss': '😘', // Kiss
  '/-angry': '😠', // Angry
  '/-cry': '😭', // Crying
  '/-surprise': '😮', // Surprised
  '/-cool': '😎', // Cool/Sunglasses
  '/-sad': '😢', // Sad
  '/-happy': '😄', // Happy
  '/-angry2': '😡', // Very angry
  '/-love': '😍', // Love eyes
  '/-sleep': '😴', // Sleeping
  '/-think': '🤔', // Thinking
  '/-wait': '⏳', // Waiting
  // Wave/Hi
  '/-tongue': '😛', // Tongue out
  '/-fun': '😆', // Fun/Laughing
  '/-what': '🤷', // What/Shrug
  '/-party': '🎉', // Party
  '/-fail': '😓', // Fail/Sweat
  '/-cold': '🥶', // Cold
  '/-hot': '🥵', // Hot
  '/-sick': '🤢', // Sick
  '/-money': '💰', // Money
  '/-clap': '👏', // Clap
  '/-pray': '🙏', // Pray
  '/-muscle': '💪', // Muscle/Strong
  '/-beer': '🍺', // Beer
  '/-cake': '🍰', // Cake
  '/-gift': '🎁', // Gift
  '/-coffee': '☕', // Coffee
  '/-rose': '🌹', // Rose
  '/-bye': '👋', // Bye/Wave
  '/-sorry': '🙇', // Sorry/Bow
  '/-ok': '👌', // OK sign
  '/-no': '🙅', // No
  '/-yes': '🙆', // Yes

  // ===== STANDARD TEXT EMOTICONS =====
  // Happy/Smile
  ':)': '😊',
  ':-)': '😊',
  ':d': '😁',
  'XD': '😆',
  'xD': '😆',
  ';)': '😉',
  ';-)': '😉',
  ':P': '😛',
  ':-P': '😛',
  ':p': '😛',
  ':-p': '😛',
  '^_^': '😊',
  '^.^': '😊',
  '^_~': '😉',
  ':>': '🤣',

  // Sad/Cry
  ':(': '😢',
  ':-(': '😢',
  ':\'(': '😭',
  'T_T': '😭',
  'T-T': '😭',
  'ToT': '😭',
  ';_;': '😭',

  // Surprised/Shocked
  ':O': '😮',
  ':-O': '😮',
  ':o': '😮',
  ':-o': '😮',
  'o_O': '😳',
  'O_o': '😳',
  'o_o': '😮',
  'O_O': '😲',

  // Love/Kiss
  '<3': '❤️',
  '♥': '❤️',
  ':*': '😘',
  ':-*': '😘',
  ':x': '😘',
  ':-x': '😘',

  // Angry/Mad
  '>:(': '😠',
  '>:-(': '😠',
  '/-hi': '😡',
  ':@': '😠',
  ':-@': '😠',

  // Neutral/Uncertain
  ':|': '😐',
  ':-|': '😐',
  ':/': '😕',
  ':-/': '😕',
  ':\\': '😕',
  ':-\\': '😕',

  // Cool/Confident
  'B-)': '😎',
  '8-)': '😎',
  'B)': '😎',
  '8)': '😎',

  // Embarrassed/Shy
  ':$': '😳',
  ':-$': '😳',
  ':">': '😊',

  // Special
  'O:)': '😇',
  'O:-)': '😇',
  '>:)': '😈',
  '>:-)': '😈',
  '3:)': '😈',
  '3:-)': '😈',

  ';;)': '😏',
  ':c': '☹️',
  ':-c': '☎️',
  '>:D<': '🤗',
  '~X(': '😫',
  ':-h': '👋',
  ':o3': '🐶',
  'I-)': '😴',
  '8-}': '🤪',

  // Thinking/Confused
  '/:)': '🤔',
  ':-??': '🤷',

  // Actions
  '[-O<': '🙏',
  '=D>': '👏',
  'L-)': '💪',
  '<:-P': '🎉',

  // Time
  ':-t': '⏰',
  ':-w': '⏳',

  // Dizzy/Tired
  '@-)': '😵‍💫',
  '%-(': '🙉',
  '#:-S': '😓',

  // Frustrated/Annoyed
  ':-&': '😣',
  ':-L': '😤',
  ':-S': '😰',
  ':-SS': '😰',

  // Other
  '(:||': '🥱',
  ':^o': '🤥',
  '=P~': '🤤',
  '8->': '💭',
  '[-(': '😡',
  ':O)': '🤡',
  '8-|': '🙄',
  '3:-O': '🐮',

  // Lock/Unlock
  ':-X': '🤐',
  ':-#': '🤐',

}

/**
 * Convert Zalo emoticons & icons to Unicode emojis
 */
export function convertEmoticonToEmoji(text: string): string {
  if (!text || typeof text !== 'string') {
    return ''
  }

  let converted = text

  // Sort by length (longest first) to match complex patterns first
  // Important: Match "/-strong" before ":)"
  const sortedEmoticons = Object.keys(emoticonMap)
    .sort((a, b) => b.length - a.length)

  for (const emoticon of sortedEmoticons) {
    // Escape regex special characters
    const escapedEmoticon = emoticon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escapedEmoticon, 'g')
    converted = converted.replace(regex, emoticonMap[emoticon])
  }

  return converted
}

/**
 * Check if text contains emoticons
 */
export function hasEmoticon(text: string): boolean {
  if (!text)
    return false
  return Object.keys(emoticonMap).some(emoticon => text.includes(emoticon))
}

/**
 * Get list of emoticons found in text
 */
export function findEmoticons(text: string): string[] {
  if (!text)
    return []

  const found: string[] = []
  const sortedEmoticons = Object.keys(emoticonMap)
    .sort((a, b) => b.length - a.length)

  for (const emoticon of sortedEmoticons) {
    if (text.includes(emoticon)) {
      found.push(emoticon)
    }
  }

  return [...new Set(found)]
}

export function handleEmojiInsert(
  emoji: string,
  textareaRef: { value: HTMLTextAreaElement | null },
  messageText: { value: string },
): string {
  const textarea = textareaRef.value

  if (!textarea) {
    // If no textarea ref, append to end
    messageText.value += emoji
    return messageText.value
  }

  // Get current cursor position
  const startPos = textarea.selectionStart || 0
  const endPos = textarea.selectionEnd || 0

  // Insert emoji at cursor position
  const textBefore = messageText.value.substring(0, startPos)
  const textAfter = messageText.value.substring(endPos)

  messageText.value = textBefore + emoji + textAfter

  // Set cursor position after emoji
  // Need to use setTimeout/nextTick to wait for Vue reactivity
  setTimeout(() => {
    if (textarea) {
      const newPos = startPos + emoji.length
      textarea.focus()
      textarea.setSelectionRange(newPos, newPos)
    }
  }, 0)

  return messageText.value
}
