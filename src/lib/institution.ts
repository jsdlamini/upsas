import {
  getStoredInstitution, setStoredInstitution, type InstitutionProfile,
} from './data/store';
import { logoFileExists } from './logo-storage';

export type { InstitutionProfile } from './data/store';

/**
 * Institution identity and branding, read from Postgres. Every value is
 * neutral — no institution is baked in, so a fresh install shows nothing
 * specific until the setup wizard runs.
 */
export const DEFAULT_INSTITUTION: InstitutionProfile = {
  name: '',
  location: '',
  department: '',
  productName: 'Research Chain',
  monogram: '',
  accentColor: '#2E5AC8',
  logo: null,
  configuredAt: null,
};

const ACCENT_RE = /^#[0-9a-fA-F]{6}$/;

export async function getInstitution(): Promise<InstitutionProfile> {
  return (await getStoredInstitution()) ?? DEFAULT_INSTITUTION;
}

export async function isConfigured(): Promise<boolean> {
  return (await getStoredInstitution()) !== null;
}

export async function saveInstitution(
  patch: Partial<InstitutionProfile>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = (await getStoredInstitution()) ?? DEFAULT_INSTITUTION;
  const next: InstitutionProfile = { ...current, ...patch };

  if (!next.name.trim() || !next.department.trim()) {
    return { ok: false, error: 'Name and department are required.' };
  }
  if (!ACCENT_RE.test(next.accentColor)) {
    return { ok: false, error: 'Accent colour must be a #hex value like #2E5AC8.' };
  }
  if (next.logo?.kind === 'url' && !/^https?:\/\//i.test(next.logo.url)) {
    return { ok: false, error: 'Logo URL must start with http:// or https://.' };
  }

  if (next.configuredAt == null) next.configuredAt = new Date().toISOString();
  await setStoredInstitution(next);
  return { ok: true };
}

export async function institutionName(): Promise<string> {
  return (await getInstitution()).name;
}

export async function departmentLine(): Promise<string> {
  const inst = await getInstitution();
  return [inst.department, inst.name].filter((s) => s.trim().length > 0).join(' — ');
}

export async function monogramText(): Promise<string> {
  const inst = await getInstitution();
  const mono = inst.monogram.trim();
  if (mono) return mono;
  return inst.name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
}

export async function logoUrl(): Promise<string | null> {
  const logo = (await getInstitution()).logo;
  if (!logo) return null;
  if (logo.kind === 'url') return logo.url;
  return logoFileExists(logo.fileId) ? '/api/institution/logo' : null;
}
