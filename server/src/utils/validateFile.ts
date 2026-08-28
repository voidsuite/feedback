/**
 * Validates uploaded image files by magic bytes (not just the client-supplied
 * Content-Type / extension). SVG is deliberately not accepted anywhere.
 */

const MAGIC: Record<string, (buf: Buffer) => boolean> = {
  'image/jpeg': (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  'image/png': (buf) => buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/gif': (buf) => buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === 'GIF8',
  'image/webp': (buf) => buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP',
};

const ALLOWED_IMAGE_TYPES = Object.keys(MAGIC);

export function isAllowedImageType(type: string): boolean {
  return ALLOWED_IMAGE_TYPES.includes(type);
}

/** Returns true if the buffer matches the magic bytes for the claimed MIME type. */
export function matchesMagicBytes(type: string, buf: Buffer): boolean {
  const check = MAGIC[type];
  return !!check && check(buf);
}

export function allowedImageTypes(): string[] {
  return ALLOWED_IMAGE_TYPES;
}
