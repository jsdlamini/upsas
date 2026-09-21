/**
 * Shown while a server-rendered page is being produced. Without it a
 * navigation on a slow link looks like nothing happened, and people click
 * twice. Structure mirrors a typical page: heading, lede, table.
 */
export default function Loading() {
  return (
    <div className="skeleton" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <i className="wide" />
      <i style={{ width: '62%' }} />
      <i className="box" />
    </div>
  );
}
