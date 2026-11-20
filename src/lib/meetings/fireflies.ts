import type { FfMeta } from "./transcript-match.ts";
import type { TranscriptLine } from "./review-types.ts";

/**
 * Fireflies client behind an interface, so everything above it (ingestion, matching, flagging, the sweeper, the webhook route)
 * runs against a fake with recorded-shape fixtures. Real HTTP: POST https://api.fireflies.ai/graphql with
 * `Authorization: Bearer <FIREFLIES_API_KEY>` (docs.fireflies.ai/fundamentals/authorization). The key is never logged.
 * Pure parts (query text, normalisation, error classification) are exported for tests. Relative imports only.
 */

export type FfTranscript = FfMeta & {
  organizerEmail: string | null;
  durationMin: number | null;
  sourceUrl: string | null;
  summary: string | null;
  lines: TranscriptLine[];
  /** meeting_info.fred_joined (the bot joined), when Fireflies says. */
  botJoined: boolean | null;
  summaryStatus: string | null;
};

export interface FirefliesClient {
  /** Null when Fireflies has no such transcript (object_not_found). Throws FirefliesError for anything else. */
  getTranscript(id: string): Promise<FfTranscript | null>;
  /** Metadata only (no sentences) for transcripts created at or after `since`, newest first, up to `limit`. */
  listRecent(since: Date, limit: number): Promise<FfMeta[]>;
}

export class FirefliesError extends Error {
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  readonly status: number | null;
  constructor(message: string, retryable: boolean, retryAfterMs: number | null = null, status: number | null = null) {
    super(message);
    this.name = "FirefliesError";
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
    this.status = status;
  }
}

export const FIREFLIES_ENDPOINT = "https://api.fireflies.ai/graphql";

const TRANSCRIPT_FIELDS = `id title organizer_email transcript_url duration date dateString cal_id calendar_id meeting_link`;

export const TRANSCRIPT_QUERY = `query Transcript($id: String!) {
  transcript(id: $id) {
    ${TRANSCRIPT_FIELDS}
    sentences { index text raw_text start_time end_time speaker_name speaker_id }
    summary { overview short_summary gist }
    meeting_info { fred_joined silent_meeting summary_status }
  }
}`;

export const RECENT_QUERY = `query Recent($from: DateTime, $limit: Int, $skip: Int) {
  transcripts(fromDate: $from, limit: $limit, skip: $skip) { ${TRANSCRIPT_FIELDS} }
}`;

type Raw = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

function startedAt(raw: Raw): Date | null {
  const s = str(raw.dateString);
  if (s) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const ms = num(raw.date);
  return ms === null ? null : new Date(ms);
}

export function normalizeMeta(raw: Raw): FfMeta | null {
  const id = str(raw.id);
  if (!id) return null;
  return { id, title: str(raw.title), calId: str(raw.cal_id) ?? str(raw.calendar_id), meetingLink: str(raw.meeting_link), startedAt: startedAt(raw) };
}

/** Docs type `start_time` as String; real responses carry seconds as a number. Both are read as seconds; anything else is null. */
export function normalizeTranscript(raw: Raw): FfTranscript | null {
  const meta = normalizeMeta(raw);
  if (!meta) return null;
  const sentences = Array.isArray(raw.sentences) ? (raw.sentences as Raw[]) : [];
  const lines: TranscriptLine[] = sentences.flatMap((s, n): TranscriptLine[] => {
    const t = str(s.text) ?? str(s.raw_text);
    if (!t) return [];
    return [{ i: num(s.index) ?? n, t, s: num(s.start_time), sp: str(s.speaker_name) }];
  });
  const summary = (raw.summary ?? {}) as Raw;
  const info = (raw.meeting_info ?? {}) as Raw;
  return {
    ...meta,
    organizerEmail: str(raw.organizer_email),
    durationMin: num(raw.duration) === null ? null : Math.round(num(raw.duration) as number),
    sourceUrl: str(raw.transcript_url),
    summary: str(summary.overview) ?? str(summary.short_summary) ?? str(summary.gist),
    lines,
    botJoined: typeof info.fred_joined === "boolean" ? info.fred_joined : null,
    summaryStatus: str(info.summary_status),
  };
}

/** Maps an HTTP status / GraphQL error to a FirefliesError (retryable: rate limit, timeouts, 5xx, network) or a "not found" signal. */
export function classifyError(status: number, errors: unknown, retryAfterHeader: string | null): FirefliesError | "not_found" {
  const list = Array.isArray(errors) ? (errors as Raw[]) : [];
  const code = list.map((e) => str(e.code) ?? str((e.extensions as Raw | undefined)?.code)).find(Boolean) ?? null;
  if (code === "object_not_found") return "not_found";
  const header = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  const retryAfterMs = Number.isFinite(header) && header >= 0 ? Math.min(header, 3600) * 1000 : null;
  if (status === 429 || code === "too_many_requests") return new FirefliesError("Fireflies rate limit", true, retryAfterMs ?? 60_000, status);
  if (code === "request_timeout" || status === 408 || status >= 500) return new FirefliesError(`Fireflies unavailable (${status})`, true, retryAfterMs, status);
  if (status === 401 || status === 403 || code === "forbidden" || code === "account_cancelled") return new FirefliesError("Fireflies refused the API key", false, null, status);
  return new FirefliesError(`Fireflies error${code ? ` ${code}` : ""} (${status})`, false, null, status);
}

export type FetchLike = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ status: number; headers: { get(n: string): string | null }; json(): Promise<unknown> }>;

export class HttpFireflies implements FirefliesClient {
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  constructor(apiKey: string, fetchImpl: FetchLike = fetch as unknown as FetchLike, timeoutMs = 20_000) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  private async call(query: string, variables: Record<string, unknown>): Promise<Raw> {
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.fetchImpl(FIREFLIES_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      // The message never includes request headers, so the key cannot leak through it.
      throw new FirefliesError("Fireflies network error", true);
    }
    const body = (await res.json().catch(() => null)) as { data?: Raw; errors?: unknown } | null;
    if (res.status >= 400 || (body?.errors && Array.isArray(body.errors) && body.errors.length > 0)) {
      const c = classifyError(res.status, body?.errors, res.headers.get("retry-after"));
      if (c === "not_found") return { __notFound: true };
      throw c;
    }
    return (body?.data ?? {}) as Raw;
  }

  async getTranscript(id: string): Promise<FfTranscript | null> {
    const data = await this.call(TRANSCRIPT_QUERY, { id });
    if (data.__notFound || !data.transcript) return null;
    return normalizeTranscript(data.transcript as Raw);
  }

  async listRecent(since: Date, limit: number): Promise<FfMeta[]> {
    const data = await this.call(RECENT_QUERY, { from: since.toISOString(), limit: Math.min(limit, 50), skip: 0 });
    const rows = Array.isArray(data.transcripts) ? (data.transcripts as Raw[]) : [];
    return rows.flatMap((r) => normalizeMeta(r) ?? []);
  }
}

/** The client the app uses, or null when FIREFLIES_API_KEY is not set (ingestion then just waits; nothing crashes). */
let override: FirefliesClient | null = null;
export const setFireflies = (c: FirefliesClient | null) => { override = c; };
export function getFireflies(env: Record<string, string | undefined> = process.env): FirefliesClient | null {
  if (override) return override;
  const key = env.FIREFLIES_API_KEY?.trim();
  return key ? new HttpFireflies(key) : null;
}

/** In-memory fake for tests and the harness: no network. `failNext` queues errors thrown by the next calls. */
export class FakeFireflies implements FirefliesClient {
  readonly transcripts = new Map<string, FfTranscript>();
  readonly calls: string[] = [];
  private failures: FirefliesError[] = [];
  add(t: FfTranscript) { this.transcripts.set(t.id, t); return this; }
  failNext(...errs: FirefliesError[]) { this.failures.push(...errs); }
  async getTranscript(id: string) {
    this.calls.push(`get:${id}`);
    const f = this.failures.shift();
    if (f) throw f;
    return this.transcripts.get(id) ?? null;
  }
  async listRecent(since: Date, limit: number) {
    this.calls.push("list");
    const f = this.failures.shift();
    if (f) throw f;
    return [...this.transcripts.values()]
      .filter((t) => !t.startedAt || t.startedAt >= since)
      .slice(0, limit)
      .map(({ id, title, calId, meetingLink, startedAt }) => ({ id, title, calId, meetingLink, startedAt }));
  }
}
