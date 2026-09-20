import { createHash } from 'node:crypto';

/**
 * RFC 4180 CSV. Deterministic by construction: fixed column order, CRLF line
 * endings, no locale-dependent formatting. The same input produces the same
 * bytes, which is what makes the manifest hash worth having.
 */

export interface Column<T> {
  readonly header: string;
  readonly value: (row: T) => string | number | null | undefined;
  /**
   * Force quoting. Student numbers and any other digit string that must not be
   * read as a number — Excel will otherwise strip a leading zero and silently
   * corrupt the identifier.
   */
  readonly asText?: boolean;
}

export function escapeField(raw: string, forceQuote = false): string {
  const needsQuote = forceQuote || /[",\r\n]/.test(raw);
  if (!needsQuote) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

export function toCsv<T>(rows: readonly T[], columns: readonly Column<T>[]): string {
  const lines: string[] = [columns.map((c) => escapeField(c.header)).join(',')];
  for (const row of rows) {
    lines.push(
      columns
        .map((c) => {
          const v = c.value(row);
          if (v === null || v === undefined) return '';
          return escapeField(String(v), c.asText === true);
        })
        .join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}

export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
