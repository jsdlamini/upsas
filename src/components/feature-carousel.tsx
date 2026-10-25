/** A contextual feature carousel for the auth pages: one feature (caption +
 *  its real screenshot) at a time, crossfading through the list. Pure CSS,
 *  no JS, and marked decorative so it never competes with the form. */
export interface FeatureSlide {
  title: string;
  image: string;
}

export function FeatureCarousel({ features }: { features: FeatureSlide[] }) {
  const cycle = features.length * 6; // seconds per full loop
  return (
    <div className="feature-carousel" aria-hidden="true" style={{ '--feature-cycle': `${cycle}s` } as React.CSSProperties}>
      {features.map((f, i) => (
        <div className="feature-slide" key={i} style={{ animationDelay: `${i * 6}s` }}>
          <strong>{f.title}</strong>
          <img src={f.image} alt="" loading="lazy" />
        </div>
      ))}
    </div>
  );
}
