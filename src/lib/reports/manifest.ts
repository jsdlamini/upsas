import { sha256 } from './csv';
import { requireDefinition } from './catalogue';

/**
 * Provenance travels beside the file, not inside it.
 *
 * A mark schedule gets imported into other systems, so the CSV itself stays pure
 * data — comment lines would break the import. The manifest is the companion
 * record that says what this file is, who pulled it, and proves it has not been
 * edited since.
 */

export interface ManifestContext {
  readonly reportKey: string;
  readonly generatedBy: string;
  readonly generatedAt: string;
  readonly cycleId: string;
  readonly scopeDescription: string;
  readonly rowCount: number;
  readonly configIds: readonly string[];
  readonly snapshotIds: readonly string[];
  readonly includesUnpublished: boolean;
}

export interface Manifest extends ManifestContext {
  readonly format: string;
  readonly filename: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly watermark: string | null;
  readonly notice: string;
}

export function buildManifest(
  ctx: ManifestContext,
  filename: string,
  format: string,
  content: string,
): Manifest {
  const def = requireDefinition(ctx.reportKey);

  if (ctx.includesUnpublished && !def.mayIncludeUnpublished) {
    throw new Error(
      `Report "${ctx.reportKey}" may not include unpublished marks. Publish or exclude them first.`,
    );
  }

  return {
    ...ctx,
    format,
    filename,
    sha256: sha256(content),
    byteLength: Buffer.byteLength(content, 'utf8'),
    watermark: ctx.includesUnpublished ? 'PROVISIONAL — CONTAINS UNPUBLISHED MARKS' : null,
    notice: def.containsPersonalData
      ? 'Contains personal data. Handle under the Data Protection Act 41 of 2022; this extraction is recorded in the audit log.'
      : 'No personal data.',
  };
}
