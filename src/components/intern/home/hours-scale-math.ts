/** The top rule of the hours chart: the smallest round value at or above the tallest month (a floor of 40 so one short month is not a full-height bar). */
export function niceMax(max: number): number {
  const steps = [40, 80, 120, 160, 200, 240, 320, 400, 480, 600, 800, 1000];
  return steps.find((s) => s >= max) ?? Math.ceil(max / 200) * 200;
}
