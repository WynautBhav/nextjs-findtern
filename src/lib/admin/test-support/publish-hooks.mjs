// Module-resolution hooks that let `node --test` import the admin CMS route and the project publish / takedown routes:
//  - "@/x" maps to src/x(.ts), and an extensionless relative import tries ".ts";
//  - the database, next/server, next/cache, the auth guard, notify, the live skill-bench count and the takedown offer sweep map to ./publish-fakes.mjs.
// Test-only. Nothing here is imported by the app.
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FAKES = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "publish-fakes.mjs")).href;

const FAKED = new Set(["@/lib/db", "@/lib/guards-mutation", "@/lib/notify", "@/lib/skill-benches", "next/server", "next/cache", "./takedown-withdraw"]);

export async function resolve(specifier, context, next) {
  if (FAKED.has(specifier)) return { url: FAKES, shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const base = path.join(SRC, specifier.slice(2));
    for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
      if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
    }
  }
  // Extensionless relative imports (the app is bundled, not run by node): try ".ts".
  if (specifier.startsWith(".") && !path.extname(specifier) && context.parentURL?.startsWith("file:")) {
    const candidate = path.resolve(path.dirname(fileURLToPath(context.parentURL)), `${specifier}.ts`);
    if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
  }
  return next(specifier, context);
}
