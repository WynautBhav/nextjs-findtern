/**
 * Per-query timing for the Reports tabs. Off unless REPORTS_TIMING=1, so production logs stay quiet.
 * One line per query: `[reports] tab=interns q=growth ms=12 rows=14`.
 */
export async function timed<T>(tab: string, name: string, run: () => Promise<T>): Promise<T> {
  if (process.env.REPORTS_TIMING !== "1") return run();
  const t0 = performance.now();
  try {
    const out = await run();
    const rows = Array.isArray(out) ? out.length : (out as { rows?: unknown[] } | null)?.rows?.length;
    console.log(`[reports] tab=${tab} q=${name} ms=${Math.round(performance.now() - t0)}${rows === undefined ? "" : ` rows=${rows}`}`);
    return out;
  } catch (e) {
    console.log(`[reports] tab=${tab} q=${name} ms=${Math.round(performance.now() - t0)} FAILED`);
    throw e;
  }
}
