import { Secret, TOTP } from "otpauth";
import { getInstitution } from "../institution";

/**
 * Offline TOTP (RFC 6238) — no SMS, no push, no external service. Secrets are
 * generated locally and codes are verified against the current time.
 */

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function verifyTotp(secretBase32: string, token: string, window = 1): boolean {
  try {
    const totp = new TOTP({
      issuer: 'Research Chain',
      label: 'Research Chain',
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secretBase32),
    });
    return totp.validate({ token: token.trim(), window }) !== null;
  } catch {
    return false;
  }
}

export async function totpUri(secretBase32: string, username: string): Promise<string> {
  const totp = new TOTP({
    issuer: (await getInstitution()).productName,
    label: username,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
  return totp.toString();
}

/** The current 6-digit code for a secret — used for demo quick-testing. */
export function currentTotpCode(secretBase32: string): string | null {
  try {
    const totp = new TOTP({
      issuer: 'Research Chain',
      label: 'Research Chain',
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secretBase32),
    });
    return totp.generate();
  } catch {
    return null;
  }
}
