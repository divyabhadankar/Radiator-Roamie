import type { VercelRequest, VercelResponse } from "@vercel/node";

const OTM_BASE = "https://api.opentripmap.com/0.1/en/places";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.OPENTRIPMAP_API_KEY || process.env.VITE_OPENTRIPMAP_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "OPENTRIPMAP_API_KEY is not configured" });

  const { action, ...params } = req.body ?? {};
  if (!action) return res.status(400).json({ error: "action is required" });

  let url: string;
  try {
    switch (action) {
      case "radius": {
        const { lat, lng, radius = 1000, kinds = "", limit = 20 } = params as any;
        if (lat === undefined || lng === undefined) return res.status(400).json({ error: "lat and lng are required" });
        url = `${OTM_BASE}/radius?radius=${radius}&lon=${lng}&lat=${lat}&kinds=${kinds}&limit=${limit}&apikey=${apiKey}`;
        break;
      }
      case "details": {
        const { xid } = params as any;
        if (!xid) return res.status(400).json({ error: "xid is required" });
        url = `${OTM_BASE}/xid/${xid}?apikey=${apiKey}`;
        break;
      }
      case "autosuggest": {
        const { name, lat, lng, radius = 1000, limit = 10 } = params as any;
        if (!name) return res.status(400).json({ error: "name is required" });
        url = `${OTM_BASE}/autosuggest?name=${encodeURIComponent(name)}&radius=${radius}&lon=${lng}&lat=${lat}&limit=${limit}&apikey=${apiKey}`;
        break;
      }
      case "bbox": {
        const { lonMin, latMin, lonMax, latMax, kinds = "", limit = 20 } = params as any;
        url = `${OTM_BASE}/bbox?lon_min=${lonMin}&lat_min=${latMin}&lon_max=${lonMax}&lat_max=${latMax}&kinds=${kinds}&limit=${limit}&apikey=${apiKey}`;
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
    return res.status(502).json({ error: `OpenTripMap fetch failed: ${e.message}` });
  }
}
