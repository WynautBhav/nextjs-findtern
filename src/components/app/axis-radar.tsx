/**
 * The four axes on one 0–10 radar, values written at each tip. The SVG is
 * decoration for sighted readers; the list beside it carries the same data.
 */
export function AxisRadar({ axes }: { axes: { key: string; label: string; value: number | null }[] }) {
  const cx = 180;
  const cy = 130;
  const R = 76;
  // Top, right, bottom, left.
  const dir = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ] as const;
  const pt = (i: number, v: number) => [cx + dir[i][0] * R * (v / 10), cy + dir[i][1] * R * (v / 10)] as const;
  const ring = (v: number) => axes.map((_, i) => pt(i, v).join(",")).join(" ");
  const shape = axes.map((a, i) => pt(i, a.value ?? 0).join(",")).join(" ");
  const anchor = ["middle", "start", "middle", "end"] as const;
  // Label positions just outside each tip.
  const labelAt = [
    [cx, cy - R - 26],
    [cx + R + 12, cy - 4],
    [cx, cy + R + 22],
    [cx - R - 12, cy - 4],
  ] as const;

  return (
    <div className="w-full max-w-sm">
      <svg viewBox="0 0 340 260" className="w-full" aria-hidden>
        {[2.5, 5, 7.5, 10].map((v) => (
          <polygon key={v} points={ring(v)} fill="none" strokeWidth="1" className="stroke-ink-200" />
        ))}
        {axes.map((_, i) => (
          <line key={i} x1={cx} y1={cy} x2={cx + dir[i][0] * R} y2={cy + dir[i][1] * R} strokeWidth="1" className="stroke-ink-200" />
        ))}
        <polygon points={shape} strokeWidth="2" strokeLinejoin="round" className="fill-brand-700/15 stroke-brand-700" />
        {axes.map((a, i) =>
          a.value !== null ? <circle key={a.key} cx={pt(i, a.value)[0]} cy={pt(i, a.value)[1]} r="4" className="fill-brand-700" /> : null,
        )}
        {axes.map((a, i) => (
          <text key={a.key} x={labelAt[i][0]} y={labelAt[i][1]} textAnchor={anchor[i]} className="fill-ink-700 text-sm">
            {a.label}
            <tspan x={labelAt[i][0]} dy="18" className="nums fill-ink-900 font-semibold">
              {a.value !== null ? a.value.toFixed(1) : "Not rated"}
            </tspan>
          </text>
        ))}
      </svg>
      <dl className="sr-only">
        {axes.map((a) => (
          <div key={a.key}>
            <dt>{a.label}</dt>
            <dd>{a.value !== null ? `${a.value.toFixed(1)} out of 10` : "Not rated"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
