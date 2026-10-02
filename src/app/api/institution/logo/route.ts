import { getInstitution } from '@/lib/institution';
import { readLogoFile } from '@/lib/logo-storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Serves the configured institution logo; no auth so it shows on login/setup. */
export async function GET() {
  const logo = getInstitution().logo;
  if (!logo || logo.kind !== 'file') {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const file = await readLogoFile(logo.fileId);
  if (!file) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': file.contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
