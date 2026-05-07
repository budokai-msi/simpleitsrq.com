// Detects the user's most likely preferred contact method based on device, platform, and navigator hints.
// Returns one of: 'call', 'sms', 'email', 'book'

export function detectPreferredContact() {
  // Prioritize mobile phone features
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isMobile = isAndroid || isIOS || /Mobile/i.test(ua);

  // If SMS is supported (mobile), prefer SMS
  if (isMobile) {
    // If iOS, prefer iMessage/SMS
    if (isIOS) return 'sms';
    // If Android, prefer SMS
    if (isAndroid) return 'sms';
    // Otherwise, generic mobile
    return 'call';
  }

  // If desktop, prefer email
  if (/Macintosh|Windows|Linux/i.test(ua)) {
    return 'email';
  }

  // Fallback
  return 'book';
}
