import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";

/**
 * Web Push to a student's devices. Best effort: a failed push never fails the
 * request that caused it, because the in-app banner and the email carry the
 * same message. iOS only delivers to a home-screen web app (iOS 16.4+), so on
 * an iPhone browser tab the banner is the real channel.
 *
 * Off unless VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are set.
 */
let configured: boolean | null = null;

function ready(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  configured = Boolean(pub && priv);
  if (configured) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:tech@findtern.in", pub!, priv!);
  return configured;
}

export function pushEnabled(): boolean {
  return ready();
}

export type PushPayload = { title: string; body: string; url: string; tag?: string };

export async function sendPush(userId: string, payload: PushPayload): Promise<number> {
  if (!ready()) return 0;
  const db = getDb();
  const subs = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 600, urgency: "high" },
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: the browser dropped the subscription. Anything else is transient.
        if (status === 404 || status === 410) gone.push(s.id);
        else console.error("[push] send failed", status ?? err);
      }
    }),
  );
  if (gone.length) await db.delete(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.id, gone));
  return sent;
}
