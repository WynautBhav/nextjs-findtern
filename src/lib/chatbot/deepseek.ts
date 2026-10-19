/**
 * DeepSeek server client for the Findtern chatbot.
 *
 * OpenAI-compatible chat endpoint. Key lives server-side only
 * (DEEPSEEK_API_KEY) - never exposed to the browser.
 */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const ENDPOINT = "https://api.deepseek.com/chat/completions";
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

export async function deepseekChat(
  messages: ChatMessage[],
  opts?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: opts?.temperature ?? 0.6,
        max_tokens: opts?.maxTokens ?? 600,
        stream: false,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`DeepSeek ${res.status}: ${text.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("DeepSeek returned an empty reply");
    return content;
  } finally {
    clearTimeout(timeout);
  }
}
