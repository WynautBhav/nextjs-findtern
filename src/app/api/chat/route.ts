import { NextResponse } from "next/server";
import { z } from "zod";

import { RateLimiter, bucketKey, clientIp } from "@/lib/security/rate-limit";
import {
  SYSTEM_PROMPT,
  localAnswer,
  retrieveContext,
} from "@/lib/chatbot/knowledge";
import { deepseekChat, type ChatMessage } from "@/lib/chatbot/deepseek";

/**
 * POST /api/chat — Fintern chatbot.
 *
 * Public route (no session): like /api/website/contact, it is anonymous by
 * design, so `requireMutation` does not apply. Abuse is handled with a tight
 * per-IP rate limit, strict input validation, and short history instead.
 */

const limiter = new RateLimiter(20, 10 * 60_000);

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(20),
});

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!limiter.take(bucketKey(ip, "chat"))) {
    return NextResponse.json(
      { error: "Too many messages — please wait a bit and try again." },
      { status: 429 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const history = parsed.data.messages.slice(-8);
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const query = lastUser?.content ?? "";

  try {
    const context = await retrieveContext(query);

    // Offline/dev fallback: answer extractively from the CMS when no key.
    if (!process.env.DEEPSEEK_API_KEY) {
      const reply = await localAnswer(query);
      return NextResponse.json({ reply, source: "local" });
    }

    const messages: ChatMessage[] = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n--- FINDTERN CONTEXT ---\n${context}` },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const reply = await deepseekChat(messages);
    return NextResponse.json({ reply, source: "deepseek" });
  } catch (err) {
    // Never leak provider errors to the client; fall back to local retrieval.
    console.error("[chat] failed, falling back to local:", err);
    try {
      const reply = await localAnswer(query);
      return NextResponse.json({ reply, source: "local-fallback" });
    } catch {
      return NextResponse.json(
        { error: "Chat is temporarily unavailable. Please try again or write to admin@findtern.in." },
        { status: 503 },
      );
    }
  }
}
