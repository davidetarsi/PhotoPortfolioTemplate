// Browser-only (canvas + createImageBitmap): no jsdom tests, manual verification
// in rollout. Safari cannot encode WebP → lazy WASM fallback: Chrome/Android
// never download the @jsquash/webp chunk.

import { extractCapturedAt } from './exif.js';

function drawTo(bitmap, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob ha restituito null'))), type, quality);
  });
}

async function nativeWebpSupported() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  try {
    const blob = await canvasToBlob(canvas, 'image/webp', 0.8);
    return blob.type === 'image/webp'; // Safari responds with PNG
  } catch {
    return false;
  }
}

/**
 * Creates image processing dependencies for the admin panel.
 * Detects native WebP support and provides either native or WASM-based encoder.
 * @returns {Promise<{decode: Function, encode: Function, extractCapturedAt: Function}>} Object with image processing functions.
 */
export async function makeProcessDeps() {
  const decode = async file => {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { bitmap, width: bitmap.width, height: bitmap.height };
  };

  if (await nativeWebpSupported()) {
    return {
      decode,
      encode: async (bitmap, w, h, q) => canvasToBlob(drawTo(bitmap, w, h), 'image/webp', q),
      extractCapturedAt,
    };
  }

  // Safari fallback: libwebp compiled to WASM, dynamic import (lazy chunk).
  const { encode: wasmEncode } = await import('@jsquash/webp');
  return {
    decode,
    encode: async (bitmap, w, h, q) => {
      const imageData = drawTo(bitmap, w, h).getContext('2d').getImageData(0, 0, w, h);
      const buffer = await wasmEncode(imageData, { quality: Math.round(q * 100) });
      return new Blob([buffer], { type: 'image/webp' });
    },
    extractCapturedAt,
  };
}
