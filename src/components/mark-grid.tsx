'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Progressive enhancement for the cohort grading sheet.
 *
 * Without JavaScript the sheet is still a plain form with a Save button. With
 * it, each mark is saved the moment the assessor leaves the field, and nothing
 * needs pressing.
 *
 * A mark is not called saved until the server says it is in the database. Until
 * then it is held in this browser, so neither a crash of the server nor a dead
 * connection nor a closed laptop loses it: it is sent again when the page is
 * next open, when the connection returns, and every few seconds meanwhile.
 */

type Tone = 'ok' | 'warn' | 'bad';
interface Toast { id: number; tone: Tone; text: string; sticky?: boolean }

interface PendingMark {
  studentId: string;
  criterionId: string;
  value: number | null;
  /** When it was typed. The newest entry for a cell always wins. */
  at: number;
}

interface SaveResponse {
  ok: boolean;
  durable?: boolean;
  persistence?: 'saved' | 'disabled' | 'failed';
  retry?: boolean;
  error?: string;
  label?: string;
  value?: number | null;
  max?: number | null;
  total?: number | null;
  normalised?: number | null;
}

const RETRY_MS = 8_000;

function storageKey(component: string, assessorId: string) {
  return `upsas:pending-marks:${assessorId}:${component}`;
}

function readQueue(key: string): PendingMark[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as PendingMark[]) : [];
  } catch { return []; }
}

function writeQueue(key: string, queue: PendingMark[]) {
  try {
    if (queue.length) window.localStorage.setItem(key, JSON.stringify(queue));
    else window.localStorage.removeItem(key);
  } catch { /* storage full or disabled: the in-memory queue still retries */ }
}

function valueOf(input: HTMLInputElement): number | null {
  const raw = input.value.trim();
  return raw === '' ? null : Number(raw);
}

function cellKey(studentId: string, criterionId: string) {
  return `${studentId}:${criterionId}`;
}

export function MarkGrid({
  formId, submitFormId, component, assessorId,
}: { formId: string; submitFormId: string; component: 'p1' | 'p2'; assessorId: string }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const queue = useRef<PendingMark[]>([]);
  const inFlight = useRef(new Set<string>());
  const warnedDisabled = useRef(false);
  const key = storageKey(component, assessorId);

  const toast = useCallback((tone: Tone, text: string, sticky = false) => {
    seq.current += 1;
    const id = seq.current;
    // Successes replace each other rather than stacking: tabbing through a row
    // should produce one quiet confirmation, not eight.
    setToasts((current) => [
      ...current.filter((t) => !(tone === 'ok' && t.tone === 'ok')),
      { id, tone, text, sticky },
    ].slice(-4));
    if (!sticky) {
      window.setTimeout(() => setToasts((c) => c.filter((t) => t.id !== id)),
        tone === 'ok' ? 3_000 : 7_000);
    }
  }, []);

  const form = () => document.getElementById(formId) as HTMLFormElement | null;

  const inputFor = (m: { studentId: string; criterionId: string }) =>
    form()?.querySelector<HTMLInputElement>(
      `input.mark[data-student="${CSS.escape(m.studentId)}"][data-criterion="${CSS.escape(m.criterionId)}"]`,
    ) ?? null;

  const syncDirty = useCallback(() => {
    const f = form();
    if (!f) return;
    if (queue.current.length) f.dataset['dirty'] = '1'; else delete f.dataset['dirty'];
    const badge = f.querySelector<HTMLElement>('.dirty');
    if (badge) {
      badge.textContent = queue.current.length === 1
        ? '1 mark waiting to reach the database'
        : `${queue.current.length} marks waiting to reach the database`;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId]);

  const enqueue = useCallback((mark: PendingMark) => {
    queue.current = [
      ...queue.current.filter((m) => cellKey(m.studentId, m.criterionId) !== cellKey(mark.studentId, mark.criterionId)),
      mark,
    ];
    writeQueue(key, queue.current);
    syncDirty();
  }, [key, syncDirty]);

  const settle = useCallback((mark: PendingMark) => {
    // Only drop the entry if nothing newer was typed into the cell meanwhile.
    queue.current = queue.current.filter((m) =>
      !(cellKey(m.studentId, m.criterionId) === cellKey(mark.studentId, mark.criterionId) && m.at <= mark.at));
    writeQueue(key, queue.current);
    syncDirty();
  }, [key, syncDirty]);

  const send = useCallback(async (mark: PendingMark, quiet = false): Promise<void> => {
    const ck = cellKey(mark.studentId, mark.criterionId);
    if (inFlight.current.has(ck)) return;
    inFlight.current.add(ck);
    const input = inputFor(mark);
    input?.classList.add('saving');
    input?.classList.remove('saved-flash');

    let res: Response | null = null;
    let data: SaveResponse | null = null;
    try {
      res = await fetch('/api/marks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        keepalive: true,
        body: JSON.stringify({ component, ...mark }),
      });
      data = (await res.json().catch(() => null)) as SaveResponse | null;
    } catch {
      res = null;
    } finally {
      inFlight.current.delete(ck);
      input?.classList.remove('saving');
    }

    // No answer at all: offline, or the server is gone. Keep it and retry.
    if (!res) {
      if (!quiet) toast('warn', 'No connection. The mark is kept in this browser and will be sent again.');
      return;
    }

    if (res.ok && data?.ok) {
      if (input) {
        input.dataset['saved'] = mark.value === null ? '' : String(mark.value);
        input.removeAttribute('aria-invalid');
      }
      // Live row total, without reloading the sheet.
      const total = document.querySelector<HTMLElement>(`[data-total-for="${CSS.escape(mark.studentId)}"]`);
      const norm = document.querySelector<HTMLElement>(`[data-norm-for="${CSS.escape(mark.studentId)}"]`);
      if (total) total.textContent = data.total == null ? '—' : String(data.total);
      if (norm) norm.textContent = data.normalised == null ? '—' : `${data.normalised.toFixed(1)}%`;

      const shown = mark.value === null ? 'cleared' : `${mark.value}${data.max != null ? `/${data.max}` : ''}`;
      if (data.durable) {
        settle(mark);
        input?.classList.add('saved-flash');
        if (!quiet) toast('ok', `Saved · ${data.label ?? 'mark'} · ${shown}`);
      } else if (data.persistence === 'disabled') {
        // Not something a retry can fix; say so once, plainly.
        settle(mark);
        if (!warnedDisabled.current) {
          warnedDisabled.current = true;
          toast('warn', 'Saved, but this server has no database configured. Marks will be lost if it restarts — tell the coordinator.', true);
        }
      } else {
        // Accepted, but the database write failed. Keep it; send it again.
        toast('warn', `${data.label ?? 'Mark'} accepted but not yet in the database. It is kept here and will be sent again.`);
      }
      return;
    }

    if (res.status === 401) {
      toast('bad', 'You have been signed out. Your marks are kept in this browser; sign in again to send them.', true);
      return;
    }
    if (data?.retry || res.status >= 500) {
      if (!quiet) toast('warn', data?.error ?? 'The server could not save just now. The mark is kept and will be sent again.');
      return;
    }
    // Refused on its merits (above the maximum, sheet locked, not your student):
    // retrying cannot help, so stop and show the field.
    settle(mark);
    if (input) input.setAttribute('aria-invalid', 'true');
    toast('bad', data?.error ?? 'That mark was not accepted.');
  }, [component, settle, toast]);

  const flush = useCallback(async (quiet: boolean) => {
    for (const mark of [...queue.current]) await send(mark, quiet);
  }, [send]);

  useEffect(() => {
    const f = form();
    if (!f) return;

    // Anything left from a previous visit — a crash, a closed lid, a lost
    // connection — is put back into its field and sent again.
    queue.current = readQueue(key);
    if (queue.current.length) {
      for (const mark of queue.current) {
        const input = inputFor(mark);
        if (input) input.value = mark.value === null ? '' : String(mark.value);
      }
      toast('warn', `Sending ${queue.current.length} mark${queue.current.length === 1 ? '' : 's'} saved in this browser earlier…`);
      void flush(true).then(() => {
        if (!queue.current.length) toast('ok', 'Earlier marks are now saved.');
      });
    }
    syncDirty();

    const commit = (input: HTMLInputElement) => {
      const studentId = input.dataset['student'];
      const criterionId = input.dataset['criterion'];
      if (!studentId || !criterionId) return;
      const value = valueOf(input);
      const saved = input.dataset['saved'] ?? '';
      if ((value === null ? '' : String(value)) === saved) return;   // unchanged
      if (value !== null && Number.isNaN(value)) {
        input.setAttribute('aria-invalid', 'true');
        toast('bad', 'A mark must be a number.');
        return;
      }
      const mark: PendingMark = { studentId, criterionId, value, at: Date.now() };
      enqueue(mark);        // durable in the browser before the request even leaves
      void send(mark);
    };

    const onFocusOut = (e: FocusEvent) => {
      const el = e.target;
      if (el instanceof HTMLInputElement && el.classList.contains('mark')) commit(el);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null;
      if (!(el instanceof HTMLInputElement) || !el.classList.contains('mark')) return;
      const row = Number(el.dataset['row']);
      const col = Number(el.dataset['col']);
      const at = (r: number, c: number) =>
        f.querySelector<HTMLInputElement>(`input.mark[data-row="${r}"][data-col="${c}"]:not([disabled])`);
      const go = (dr: number, dc: number) => {
        const next = at(row + dr, col + dc);
        if (!next) return false;
        next.focus();
        next.select();
        return true;
      };
      // Enter would submit the whole sheet; down the column is what was meant.
      if (event.key === 'Enter' || event.key === 'ArrowDown') {
        if (go(1, 0) || event.key === 'Enter') { event.preventDefault(); commit(el); }
        return;
      }
      if (event.key === 'ArrowUp') { if (go(-1, 0)) event.preventDefault(); return; }
      const caret = el.selectionStart ?? 0;
      if (event.key === 'ArrowRight' && caret >= el.value.length && go(0, 1)) event.preventDefault();
      if (event.key === 'ArrowLeft' && caret === 0 && go(0, -1)) event.preventDefault();
    };

    const onFocusIn = (e: FocusEvent) => {
      const el = e.target;
      if (el instanceof HTMLInputElement && el.classList.contains('mark')) el.select();
    };

    // Leaving the page with the cursor still in a changed field: keep that
    // mark too. It is written to the browser first, then sent on its way.
    const onPageHide = () => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement && active.classList.contains('mark')) commit(active);
    };

    // Submitting locks the sheet. Everything still in flight has to land first.
    const submitForm = document.getElementById(submitFormId) as HTMLFormElement | null;
    const onSubmit = async (e: SubmitEvent) => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement && active.classList.contains('mark')) commit(active);
      if (!queue.current.length) return;
      e.preventDefault();
      e.stopPropagation();
      toast('warn', 'Saving your last marks before submitting…');
      await flush(true);
      if (queue.current.length) {
        toast('bad', 'Some marks have not reached the database yet, so the sheet was not submitted. Try again in a moment.', true);
        return;
      }
      submitForm?.requestSubmit();
    };

    f.addEventListener('focusout', onFocusOut);
    f.addEventListener('keydown', onKeyDown);
    f.addEventListener('focusin', onFocusIn);
    window.addEventListener('pagehide', onPageHide);
    submitForm?.addEventListener('submit', onSubmit);
    const onOnline = () => { void flush(true); };
    window.addEventListener('online', onOnline);
    const timer = window.setInterval(() => { if (queue.current.length) void flush(true); }, RETRY_MS);

    return () => {
      f.removeEventListener('focusout', onFocusOut);
      f.removeEventListener('keydown', onKeyDown);
      f.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('pagehide', onPageHide);
      submitForm?.removeEventListener('submit', onSubmit);
      window.removeEventListener('online', onOnline);
      window.clearInterval(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!toasts.length) return null;
  return (
    <div className="save-toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`save-toast ${t.tone}`} role={t.tone === 'bad' ? 'alert' : 'status'}>
          <span className="save-toast-icon" aria-hidden="true">{t.tone === 'ok' ? '✓' : t.tone === 'warn' ? '!' : '×'}</span>
          <span>{t.text}</span>
          <button type="button" aria-label="Dismiss"
                  onClick={() => setToasts((c) => c.filter((x) => x.id !== t.id))}>×</button>
        </div>
      ))}
    </div>
  );
}
