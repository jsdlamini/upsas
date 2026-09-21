export default function NotFound() {
  return (
    <main style={{ padding: '64px 20px', maxWidth: 640, margin: '0 auto' }}>
      <h1 className="page">Page not found</h1>
      <p className="lede">
        That address does not exist. If you followed a link to a student record, the
        record may be outside the cycle you have a role in.
      </p>
      <a className="btn" href="/">Back to your dashboard</a>
    </main>
  );
}
