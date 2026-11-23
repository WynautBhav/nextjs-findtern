// Module-resolution hooks for `node --test` on the admin academics route: "@/x" maps to src/x(.ts); the database,
// the mutation guard and next/server map to ./academics-fakes.mjs. Test-only. Nothing here is imported by the app.
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FAKES = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "academics-fakes.mjs")).href;
// The Findtern Pro check is faked too (not under test here; the real one reaches the cache and subscription tables).
const FAKED = new Set(["@/lib/db", "@/lib/guards-mutation", "next/server", "@/lib/candidate-pro-access"]);

export async function resolve(specifier, context, next) {
  if (FAKED.has(specifier)) return { url: FAKES, shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const base = path.join(SRC, specifier.slice(2));
    for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
      if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
    }
  }
  if (specifier.startsWith(".") && !path.extname(specifier) && context.parentURL?.startsWith("file:")) {
    const candidate = path.resolve(path.dirname(fileURLToPath(context.parentURL)), `${specifier}.ts`);
    if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
  }
  return next(specifier, context);
}
