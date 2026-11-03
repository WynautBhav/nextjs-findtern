/** Diagonal stripe pattern for "not yet" marks. Colour flips with the theme. */
export function HatchPattern({ id }: { id: string }) {
  return (
    <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="6" stroke="var(--admin-hatch)" strokeWidth="2.5" />
    </pattern>
  );
}
