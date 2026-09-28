// Client-side image prep before /api/extract — spec/05 §A.
// Downscale to max 2000 px on the long edge, JPEG q≈0.85, payload < 1 MB target.

const MAX_EDGE = 2000;
const MAX_INPUT_BYTES = 6 * 1024 * 1024; // reject > 6 MB before doing any work

export class ImageTooLargeError extends Error {
  constructor() {
    super('Image is larger than 6 MB — please crop or re-capture it.');
  }
}

export async function fileToDataUrl(file: File | Blob): Promise<string> {
  if (file.size > MAX_INPUT_BYTES) throw new ImageTooLargeError();
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  // White background so transparent PNGs stay readable as JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}
