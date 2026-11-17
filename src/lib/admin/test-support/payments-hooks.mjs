// Module-resolution hooks for `node --test` on the Razorpay webhook route and the verify routes: "@/x" maps to
// src/x(.ts); next/server, the settle functions, the refund webhook and the DB map to ./payments-fakes.mjs.
// Test-only. Nothing here is imported by the app.
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FAKES = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "payments-fakes.mjs")).href;
const FAKED = new Set(["@/lib/payments", "@/lib/refunds/refunds-db", "@/lib/db", "@/lib/guards-mutation", "next/server"]);

export async function resolve(specifier, context, next) {
  if (specifier === "@/lib/razorpay" && process.env.PAY_FAKE_RAZORPAY) return { url: FAKES, shortCircuit: true };
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
