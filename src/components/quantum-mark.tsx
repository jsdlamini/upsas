/** Research Chain's quantum mark: an original Bloch-sphere glyph.
 *
 *  A qubit's state is a point on the unit sphere, so the mark draws the sphere
 *  outline, its vertical (z) axis, a tilted equator, and the state vector
 *  ending in a point on the surface. The whole glyph is drawn in
 *  `currentColor` (with lighter opacity for the construction lines) so it
 *  inherits the surrounding colour and works unchanged in both themes.
 */
export function QuantumMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      {/* sphere outline */}
      <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="2.5" />
      {/* z-axis through the poles */}
      <line x1="32" y1="6" x2="32" y2="58" stroke="currentColor" strokeWidth="2" opacity="0.4" />
      {/* tilted equator */}
      <ellipse
        cx="32"
        cy="32"
        rx="26"
        ry="9"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.55"
        transform="rotate(-22 32 32)"
      />
      {/* state vector |ψ⟩ */}
      <line
        x1="32"
        y1="32"
        x2="50"
        y2="14"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* the qubit state, a point on the sphere */}
      <circle cx="50" cy="14" r="3.5" fill="currentColor" />
    </svg>
  );
}
