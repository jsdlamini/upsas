'use client';

import { useEffect } from 'react';

/**
 * A rendering failure inside the app shell. The message is deliberately not
 * shown: a page in this system can fail while holding another student's marks,
 * and a stack trace is the wrong thing to put on screen. The digest is enough
 * to find the entry in the server log.
 */
export default function AppError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <>
      <h1 className="page">Something went wrong</h1>
      <p className="lede">
        This page could not be rendered. Nothing you had already saved is affected —
        marks are only written by an explicit save.
      </p>
      <div className="box">
        <button className="btn" onClick={reset}>Try again</button>
        {error.digest && (
          <p className="muted" style={{ fontSize: 12.5 }}>
            Quote reference <span className="mono">{error.digest}</span> when reporting this.
          </p>
        )}
      </div>
    </>
  );
}
