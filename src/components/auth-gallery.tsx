/** A self-scrolling strip of app screenshots shown on the auth pages, so a
 *  visitor can see what the system looks like before signing in. Purely CSS —
 *  no JavaScript. */
const SHOTS = [
  { src: '/screenshots/02-dashboard.png', alt: 'Supervisees dashboard' },
  { src: '/screenshots/03-topics.png', alt: 'Topics' },
  { src: '/screenshots/04-people.png', alt: 'People and roles' },
  { src: '/screenshots/05-settings.png', alt: 'Institution settings' },
  { src: '/screenshots/06-book.png', alt: 'Booking calendar' },
  { src: '/screenshots/01-login.png', alt: 'Sign in' },
];

export function AuthGallery() {
  const images = [...SHOTS, ...SHOTS]; // duplicated for a seamless loop
  return (
    <div className="auth-gallery" aria-hidden="true">
      <div className="auth-gallery-track">
        {images.map((s, i) => (
          <img key={i} src={s.src} alt={s.alt} loading="lazy" />
        ))}
      </div>
    </div>
  );
}
