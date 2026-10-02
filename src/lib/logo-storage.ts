import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

/** Small, self-contained storage for the uploaded institution logo. */
const dir = path.join(process.env.UPLOADS_DIR ?? '/var/lib/upsas/uploads', 'logo');

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

const TYPE_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(EXT_BY_TYPE).map(([t, e]) => [e, t]),
);

function contentTypeFor(fileId: string): string {
  const ext = fileId.split('.').pop() ?? '';
  return TYPE_BY_EXT[ext] ?? 'application/octet-stream';
}

export async function saveLogoFile(bytes: Uint8Array, contentType: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const ext = EXT_BY_TYPE[contentType] ?? 'img';
  const fileId = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}.${ext}`;
  await writeFile(path.join(dir, fileId), bytes);
  return fileId;
}

export async function readLogoFile(fileId: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  try {
    const bytes = await readFile(path.join(dir, fileId));
    return { bytes, contentType: contentTypeFor(fileId) };
  } catch {
    return null;
  }
}

/** Cheap sync check so `logoUrl()` can fall back to the monogram. */
export function logoFileExists(fileId: string): boolean {
  try {
    return existsSync(path.join(dir, fileId));
  } catch {
    return false;
  }
}
