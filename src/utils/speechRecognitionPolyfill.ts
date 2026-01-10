/**
 * Polyfill for Speech Recognition API
 * This ensures compatibility across different browsers
 */

if (typeof window !== 'undefined' && !('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
  console.warn('Speech Recognition API is not supported in this browser')
}

export {}

