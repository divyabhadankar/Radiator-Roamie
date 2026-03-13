import type { VercelRequest, VercelResponse } from "@vercel/node";

const TOMTOM_BASE = "https://api.tomtom.com";
const ORS_BASE = "https://api.openrouteservice.org";

async function doFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({ raw: await r.text().catch(() => "") }));
  return { ok: r.ok, status: r.status, data };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const tomtomKey = process.env.TRAFFIC_API_KEY || process.env.VITE_TRAFFIC_API_KEY;
  const orsKey = process.env.ORS_API_KEY || process.env.VITE_ORS_API_KEY;

  const { action, ...p } = req.body ?? {};
  if (!action) return res.status(400).json({ error: "action is required" });

  let url: string;
  let fetchOpts: RequestInit | undefined;

  try {
    switch (action) {
      case "traffic-flow": {
        if (!tomtomKey) return res.status(500).json({ error: "TRAFFIC_API_KEY not configured" });
        const { lat, lon, zoom = 10 } = p as any;
        url = `${TOMTOM_BASE}/traffic/services/4/flowSegmentData/absolute/${zoom}/json?point=${lat},${lon}&key=${tomtomKey}`;
        break;
      }
      case "traffic-incidents": {
        if (!tomtomKey) return res.status(500).json({ error: "TRAFFIC_API_KEY not configured" });
        const { minLat, minLon, maxLat, maxLon } = p as any;
        url = `${TOMTOM_BASE}/traffic/services/5/incidentDetails?key=${tomtomKey}&bbox=${minLon},${minLat},${maxLon},${maxLat}&fields=%7Bincidents%7Btype%2Cgeometry%7Btype%2Ccoordinates%7D%2Cproperties%7Bid%2CiconCategory%2CmagnitudeOfDelay%2CstartTime%2CendTime%2Cfrom%2Cto%2Cdescription%2Clength%7D%7D%7D&language=en-GB&t=1111&categoryFilter=0%2C1%2C2%2C3%2C4%2C5%2C6%2C7%2C8%2C9%2C10%2C11&timeValidityFilter=present`;
        break;
      }
      case "tomtom-search": {
        if (!tomtomKey) return res.status(500).json({ error: "TRAFFIC_API_KEY not configured" });
        const { query, lat, lon, limit = 10 } = p as any;
        url = `${TOMTOM_BASE}/search/2/search/${encodeURIComponent(query)}.json?key=${tomtomKey}&limit=${limit}${lat !== undefined ? `&lat=${lat}&lon=${lon}` : ""}`;
        break;
      }
      case "tomtom-nearby": {
        if (!tomtomKey) return res.status(500).json({ error: "TRAFFIC_API_KEY not configured" });
        const { lat, lon, radius = 1000, limit = 10, categorySet } = p as any;
        url = `${TOMTOM_BASE}/search/2/nearbySearch/.json?key=${tomtomKey}&lat=${lat}&lon=${lon}&radius=${radius}&limit=${limit}${categorySet ? `&categorySet=${categorySet}` : ""}`;
        break;
      }
      case "route": {
        if (!orsKey) return res.status(500).json({ error: "ORS_API_KEY not configured" });
        const { profile = "driving-car", coordinates, ...rest } = p as any;
        url = `${ORS_BASE}/v2/directions/${profile}/json`;
        fetchOpts = {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": orsKey },
          body: JSON.stringify({ coordinates, ...rest }),
        };
        break;
      }
      case "geocode": {
        if (!orsKey) return res.status(500).json({ error: "ORS_API_KEY not configured" });
        const { text, size = 5 } = p as any;
        url = `${ORS_BASE}/geocode/search?api_key=${orsKey}&text=${encodeURIComponent(text)}&size=${size}`;
        break;
      }
      case "reverse-geocode": {
        if (!orsKey) return res.status(500).json({ error: "ORS_API_KEY not configured" });
        const { lat, lon } = p as any;
        url = `${ORS_BASE}/geocode/reverse?api_key=${orsKey}&point.lat=${lat}&point.lon=${lon}`;
        break;
      }
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }

  try {
    const { ok, status, data } = await doFetch(url, fetchOpts);
    if (!ok) return res.status(status >= 500 ? 502 : status).json({ error: JSON.stringify(data) });
    return res.status(200).json(data);
  } catch (e: any) {
    return res.status(502).json({ error: `Fetch failed: ${e.message}` });
  }
}
