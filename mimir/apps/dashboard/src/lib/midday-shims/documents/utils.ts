const PROCESSABLE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
]);

export function isMimeTypeSupportedForProcessing(type?: string | null) {
  return type ? PROCESSABLE_TYPES.has(type) : false;
}
