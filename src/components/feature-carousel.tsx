/** A contextual feature carousel for the auth pages: one feature (title + its
 *  screenshot) at a time, crossfading through the list. Pure CSS, no JS. */
export interface FeatureSlide {
  title: string;
  image: string;
}

export function FeatureCarousel({ features }: { features: FeatureSlide[] }) {
  const cycle = features.length * 5; // seconds per full loop
  return (
    <div className="feature-carousel" aria-hidden="true" style={{ '--feature-cycle': `${cycle}s` } as React.CSSProperties}>
      {features.map((f, i) => (
        <div className="feature-slide" key={i} style={{ animationDelay: `${i * 5}s` }}>
          <strong>{f.title}</strong>
          <img src={f.image} alt="" loading="lazy" />
        </div>
      ))}
    </div>
  );
}
