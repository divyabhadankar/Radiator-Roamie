import type { VercelRequest, VercelResponse } from "@vercel/node";

const ORS_BASE = "https://api.openrouteservice.org";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const orsKey = process.env.ORS_API_KEY || process.env.VITE_ORS_API_KEY;
  if (!orsKey) return res.status(500).json({ error: "ORS_API_KEY is not configured" });

  const { action, ...p } = req.body ?? {};
  if (!action) return res.status(400).json({ error: "action is required" });

  const authHeaders = { "Authorization": orsKey, "Content-Type": "application/json" };

  let url: string;
  let method = "GET";
  let body: string | undefined;

  try {
    switch (action) {
      case "directions": {
        const { profile = "driving-car", ...rest } = p as any;
        url = `${ORS_BASE}/v2/directions/${profile}/json`;
        method = "POST"; body = JSON.stringify(rest);
        break;
      }
      case "directions-geojson": {
        const { profile = "driving-car", ...rest } = p as any;
        url = `${ORS_BASE}/v2/directions/${profile}/geojson`;
        method = "POST"; body = JSON.stringify(rest);
        break;
      }
      case "isochrone": {
        const { profile = "driving-car", ...rest } = p as any;
        url = `${ORS_BASE}/v2/isochrones/${profile}`;
        method = "POST"; body = JSON.stringify(rest);
        break;
      }
      case "matrix": {
        const { profile = "driving-car", ...rest } = p as any;
        url = `${ORS_BASE}/v2/matrix/${profile}/json`;
        method = "POST"; body = JSON.stringify(rest);
        break;
      }
      case "geocode": {
        const { text, size = 5 } = p as any;
        url = `${ORS_BASE}/geocode/search?api_key=${orsKey}&text=${encodeURIComponent(text)}&size=${size}`;
        method = "GET";
        break;
      }
      case "reverse-geocode": {
        const { lat, lon } = p as any;
        url = `${ORS_BASE}/geocode/reverse?api_key=${orsKey}&point.lat=${lat}&point.lon=${lon}`;
        method = "GET";
        break;
      }
      case "autocomplete": {
        const { text, size = 5 } = p as any;
        url = `${ORS_BASE}/geocode/autocomplete?api_key=${orsKey}&text=${encodeURIComponent(text)}&size=${size}`;
        method = "GET";
        break;
      }
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }

  try {
    const fetchOpts: RequestInit = {
      method,
      headers: method === "GET" ? { "Accept": "application/json", "Authorization": orsKey } : authHeaders,
    };
    if (body) fetchOpts.body = body;
    const r = await fetch(url, fetchOpts);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status >= 500 ? 502 : r.status).json({ error: JSON.stringify(data) });
    return res.status(200).json(data);
  } catch (e: any) {
    return res.status(502).json({ error: `ORS fetch failed: ${e.message}` });
  }
}
