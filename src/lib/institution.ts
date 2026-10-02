import {
  getStoredInstitution, setStoredInstitution, type InstitutionProfile,
} from './data/store';
import { logoFileExists } from './logo-storage';

/**
 * Institution identity and branding, read from the persisted working-state
 * snapshot. Every value here is neutral — no institution is baked in, so a
 * fresh install shows nothing specific until the setup wizard runs.
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

export function getInstitution(): InstitutionProfile {
  return getStoredInstitution() ?? DEFAULT_INSTITUTION;
}

export function isConfigured(): boolean {
  return getStoredInstitution() !== null;
}

export function saveInstitution(
  patch: Partial<InstitutionProfile>,
): { ok: true } | { ok: false; error: string } {
  const current = getStoredInstitution() ?? DEFAULT_INSTITUTION;
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
  setStoredInstitution(next);
  return { ok: true };
}

export function institutionName(): string {
  return getInstitution().name;
}

export function departmentLine(): string {
  const inst = getInstitution();
  return [inst.department, inst.name].filter((s) => s.trim().length > 0).join(' — ');
}

export function monogramText(): string {
  const inst = getInstitution();
  const mono = inst.monogram.trim();
  if (mono) return mono;
  return inst.name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
}

export function logoUrl(): string | null {
  const logo = getInstitution().logo;
  if (!logo) return null;
  if (logo.kind === 'url') return logo.url;
  return logoFileExists(logo.fileId) ? '/api/institution/logo' : null;
}
