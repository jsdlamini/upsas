import type { ToastVariant } from './toast';

export type Flash = { message: string; variant: ToastVariant };

/** Raw search params, already coerced to their first string value. */
export type FlashParams = Record<string, string | undefined>;

export type FlashRule = {
  /** Companion params to strip alongside the trigger (e.g. `skipped` next to `added`). */
  strip?: string[];
  /** Builds the toast for this trigger; return null to swallow it but still strip. */
  resolve: (params: FlashParams) => Flash | null;
};

/**
 * Turns a page's URL flash params into toast messages plus the set of param
 * names to strip from the URL once they have been shown.
 *
 * `rules` is keyed by the trigger param: when that param is present the rule's
 * resolver runs (it sees every raw param), and the trigger plus any `strip`
 * keys are removed from the URL so a refresh does not replay the message.
 */
export function resolveFlashes(
  params: FlashParams,
  rules: Record<string, FlashRule>,
): { flashes: Flash[]; keys: string[] } {
  const flashes: Flash[] = [];
  const keys = new Set<string>();
  for (const [trigger, rule] of Object.entries(rules)) {
    if (params[trigger] === undefined) continue;
    keys.add(trigger);
    for (const key of rule.strip ?? []) keys.add(key);
    const flash = rule.resolve(params);
    if (flash) flashes.push(flash);
  }
  return { flashes, keys: [...keys] };
}

/**
 * Cohort and rubrics encode validation failures as a JSON array in `e`. Any
 * other value is treated as a single message.
 */
export function parseErrorList(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // Not JSON: fall through and treat the raw value as one message.
  }
  return [raw];
}
