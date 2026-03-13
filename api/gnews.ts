import type { VercelRequest, VercelResponse } from "@vercel/node";

const GNEWS_BASE = "https://gnews.io/api/v4";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey =
    process.env.GNEWS_API_KEY ||
    process.env.VITE_GNEWS_API_KEY ||
    "8345779e346229659945cc498c821838";

  const { action, ...params } = req.body ?? {};

  if (!action) return res.status(400).json({ error: "action is required" });

  let url: string;
  try {
    switch (action) {
      case "search": {
        const { q, lang = "en", max = 10, sortby = "publishedAt" } = params as any;
        if (!q) return res.status(400).json({ error: "q is required" });
        url = `${GNEWS_BASE}/search?q=${encodeURIComponent(q)}&lang=${lang}&max=${max}&sortby=${sortby}&apikey=${apiKey}`;
        break;
      }
      case "top-headlines": {
        const { topic, lang = "en", country = "in", max = 10 } = params as any;
        url = `${GNEWS_BASE}/top-headlines?lang=${lang}&country=${country}&max=${max}&apikey=${apiKey}`;
        if (topic) url += `&topic=${topic}`;
        break;
      }
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }

  try {
    const r = await fetch(url, { headers: { "Accept": "application/json" } });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: JSON.stringify(data) });
    return res.status(200).json(data);
  } catch (e: any) {
    return res.status(502).json({ error: `GNews fetch failed: ${e.message}` });
  }
}
