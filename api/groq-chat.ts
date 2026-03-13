import type { VercelRequest, VercelResponse } from "@vercel/node";

const GROQ_BASE = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GROQ_API_KEY is not configured on the server." });
  }

  const { messages, temperature = 0.3, max_tokens = 3072, stream = true } = req.body ?? {};

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array is required." });
  }

  let groqRes: Response;
  try {
    groqRes = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature,
        max_tokens,
        stream,
        stop: null,
      }),
    });
  } catch (networkErr: any) {
    return res
      .status(502)
      .json({ error: `Network error reaching Groq: ${networkErr?.message ?? "unknown"}` });
  }

  if (!groqRes.ok) {
    const errText = await groqRes.text().catch(() => "");
    if (groqRes.status === 401)
      return res.status(401).json({ error: "INVALID_API_KEY" });
    if (groqRes.status === 429)
      return res.status(429).json({ error: "RATE_LIMIT" });
    if (groqRes.status >= 500)
      return res
        .status(502)
        .json({ error: `Groq server error [${groqRes.status}]: ${errText.slice(0, 300)}` });
    return res
      .status(groqRes.status)
      .json({ error: `Groq error [${groqRes.status}]: ${errText.slice(0, 300)}` });
  }

  // ── Stream the SSE response straight through to the client ─────────────────
  if (stream && groqRes.body) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.status(200);

    const reader = groqRes.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      reader.releaseLock();
      res.end();
    }
    return;
  }

  // ── Non-streaming fallback ──────────────────────────────────────────────────
  const data = await groqRes.json();
  return res.status(200).json(data);
}
