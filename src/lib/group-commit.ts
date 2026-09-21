/**
 * Group commit: run `write` so that every caller is answered by a write that
 * started after they called, and concurrent callers share writes.
 *
 * While one write is in flight, all later callers wait on a single follow-up
 * write. That follow-up necessarily contains every one of their changes, so
 * each is acknowledged only once its data is stored, and a burst of N saves
 * costs at most two writes rather than N.
 */
export function groupCommit<T>(write: () => Promise<T>): () => Promise<T> {
  let writing: Promise<T> | null = null;
  let queued: Promise<T> | null = null;

  const run = (): Promise<T> => {
    if (!writing) {
      writing = write().finally(() => { writing = null; });
      return writing;
    }
    queued ??= writing.then(
      () => { queued = null; return run(); },
      () => { queued = null; return run(); },
    );
    return queued;
  };
  return run;
}
