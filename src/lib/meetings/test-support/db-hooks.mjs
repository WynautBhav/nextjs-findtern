// Module hooks for the DB-backed meetings route test (test-only, never imported by the app):
//  "@/x" -> src/x(.ts); next/server -> a tiny NextResponse; the session guard, intern lock and takedown guard -> stand-ins.
// The database is REAL (a scratch Postgres on 127.0.0.1, enforced by the test); Google is the FakeCalendar.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FAKES = "file:///__meetings_test_fakes__";
const MAP = { "next/server": "next-server", "next/headers": "next-headers", "server-only": "empty", "@/lib/guards-mutation": "guard", "@/lib/intern-unlock": "intern-unlock", "@/lib/projects/takedown-guard-server": "takedown" };

export async function resolve(specifier, context, next) {
  if (MAP[specifier]) return { url: `${FAKES}?${MAP[specifier]}`, shortCircuit: true };
  if (/^next\/[a-z-]+$/.test(specifier)) return next(`${specifier}.js`, context);
  if (specifier.startsWith("@/")) {
    const base = path.join(SRC, specifier.slice(2));
    for (const c of [`${base}.ts`, path.join(base, "index.ts")]) if (existsSync(c)) return next(pathToFileURL(c).href, context);
  }
  if (specifier.startsWith(".") && !path.extname(specifier) && context.parentURL?.startsWith("file:")) {
    const b = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    for (const c of [`${b}.ts`, path.join(b, "index.ts")]) if (existsSync(c)) return next(pathToFileURL(c).href, context);
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.startsWith(FAKES)) {
    const kind = new URL(url).search.slice(1);
    const src = {
      "next-server": `export const NextResponse = { json: (body, init) => ({ status: init?.status ?? 200, body }), redirect: (u) => ({ status: 302, location: String(u) }) }; export const after = (fn) => fn();`,
      guard: `export const requireMutation = async ({ roles }) => { const s = globalThis.__session; return s && roles.includes(s.role) ? { ok: true, session: s } : { ok: false, response: { status: 401, body: { error: "Unauthenticated" } } }; };`,
      "next-headers": `export const cookies = async () => ({ get: () => undefined, set() {}, delete() {} }); export const headers = async () => new Headers();`,
      empty: `export {};`,
      "intern-unlock": `export const internLockResponse = async () => null;`,
      takedown: `const ok = async () => ({ ok: true }); export const assertInterviewActionable = ok; export const assertProjectActionable = ok; export const assertProposalActionable = ok;`,
    }[kind];
    return { format: "module", source: src, shortCircuit: true };
  }
  return next(url, context);
}
