/**
 * Helper utilities for parsing and serializing Delivery Order receipt photos.
 * Guarantees 100% backward-compatibility between legacy single-URL strings
 * and new multi-URL JSON array strings.
 */

export function parseReceiptPhotos(
  raw: string | string[] | null | undefined
): string[] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((url) => Boolean(url));
  }

  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Check if it's formatted as a JSON array
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter((url) => Boolean(url));
      }
    } catch {
      // Fallback to single string if JSON parse fails
    }
  }

  // Single URL string fallback
  return [trimmed];
}

export function serializeReceiptPhotos(photos: string[]): string {
  const cleanPhotos = photos
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter((url) => Boolean(url));

  if (cleanPhotos.length === 0) return "";
  if (cleanPhotos.length === 1) return cleanPhotos[0];

  return JSON.stringify(cleanPhotos);
}

export function getFirstReceiptPhoto(
  raw: string | string[] | null | undefined
): string | undefined {
  const photos = parseReceiptPhotos(raw);
  return photos.length > 0 ? photos[0] : undefined;
}
