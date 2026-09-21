'use client';

import { useEffect } from 'react';

/**
 * Progressive enhancement for the cohort grading sheet.
 *
 * Nothing here is required for the sheet to work: without JavaScript the form
 * is still a plain POST and Tab still moves between fields. What this adds is
 * the two things an assessor marking forty students actually needs.
 *
 *   1. Column-wise keyboard flow. Marking runs down a criterion, not across a
 *      student, so Enter and the arrow keys move down the column. Tab is left
 *      alone because it is the accessible default and some people rely on it.
 *   2. An unsaved-marks guard. A whole sheet of typed marks lives only in the
 *      DOM until Save posts it, and a stray back-gesture used to lose the lot.
 */
export function MarkGrid({ formId }: { formId: string }) {
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    const at = (row: number, col: number) =>
      form.querySelector<HTMLInputElement>(
        `input.mark[data-row="${row}"][data-col="${col}"]:not([disabled])`,
      );

    /** Move focus, wrapping down a column to the next row's first cell. */
    const go = (from: HTMLInputElement, dRow: number, dCol: number) => {
      const row = Number(from.dataset['row']);
      const col = Number(from.dataset['col']);
      if (Number.isNaN(row) || Number.isNaN(col)) return false;
      const next = at(row + dRow, col + dCol);
      if (!next) return false;
      next.focus();
      next.select();
      return true;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null;
      if (!(el instanceof HTMLInputElement) || !el.classList.contains('mark')) return;

      // Enter would submit the whole sheet; down the column is what was meant.
      if (event.key === 'Enter' || event.key === 'ArrowDown') {
        if (go(el, 1, 0) || event.key === 'Enter') event.preventDefault();
        return;
      }
      if (event.key === 'ArrowUp') {
        if (go(el, -1, 0)) event.preventDefault();
        return;
      }
      // Sideways only from the edge of the value, so the caret still works.
      const caret = el.selectionStart ?? 0;
      const len = el.value.length;
      if (event.key === 'ArrowRight' && caret >= len && go(el, 0, 1)) event.preventDefault();
      if (event.key === 'ArrowLeft' && caret === 0 && go(el, 0, -1)) event.preventDefault();
    };

    const onFocusIn = (event: FocusEvent) => {
      const el = event.target;
      if (el instanceof HTMLInputElement && el.classList.contains('mark')) el.select();
    };

    const markDirty = () => { form.dataset['dirty'] = '1'; };
    const onSubmit = () => { delete form.dataset['dirty']; };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (form.dataset['dirty'] === '1') event.preventDefault();
    };

    form.addEventListener('keydown', onKeyDown);
    form.addEventListener('focusin', onFocusIn);
    form.addEventListener('input', markDirty);
    form.addEventListener('submit', onSubmit);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      form.removeEventListener('keydown', onKeyDown);
      form.removeEventListener('focusin', onFocusIn);
      form.removeEventListener('input', markDirty);
      form.removeEventListener('submit', onSubmit);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [formId]);

  return null;
}
