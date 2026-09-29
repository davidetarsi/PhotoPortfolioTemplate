// Isolates exifr dependency: if EXIF is missing or parsing fails (photos from
// screenshots, WhatsApp, downloads — often without EXIF), extraction must never
// block upload — always undefined, never an exception that bubbles to caller.
import { parse } from 'exifr';

/**
 * Extracts the capture date from image EXIF data.
 * If EXIF data is missing or parsing fails, returns undefined without throwing.
 * @param {File} file - The image file to extract EXIF data from.
 * @returns {Promise<number|undefined>} Timestamp in milliseconds, or undefined if not available.
 */
export async function extractCapturedAt(file) {
  try {
    const exif = await parse(file, ['DateTimeOriginal']);
    const date = exif?.DateTimeOriginal;
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : undefined;
  } catch {
    return undefined;
  }
}
