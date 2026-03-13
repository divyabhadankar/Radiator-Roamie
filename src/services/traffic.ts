// TomTom Traffic + OpenRouteService — all calls via /api/traffic server route
// Zero client-side API keys — keys live in Vercel environment variables

const TRAFFIC_API_URL = "/api/traffic";

type Coord = [number, number]; // [lon, lat]

interface WaypointParam {
  lat: number;
  lon: number;
}

async function callTrafficAPI(
  action: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(TRAFFIC_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...params }),
  });

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Traffic API [${res.status}]: failed to parse response`);
  }

  if (!res.ok) {
    throw new Error(
      `Traffic API [${res.status}]: ${data?.error ?? JSON.stringify(data)}`,
    );
  }

  return data;
}

// ── Traffic flow at a point ───────────────────────────────────────────────────
export async function trafficFlow(params: {
  lat: number;
  lon: number;
  zoom?: number;
}): Promise<unknown> {
  const { lat, lon, zoom = 10 } = params;
  if (lat === undefined || lon === undefined)
    throw new Error("lat and lon are required");
  return callTrafficAPI("traffic-flow", { lat, lon, zoom });
}

// ── Traffic incidents in a bounding box ──────────────────────────────────────
export async function trafficIncidents(params: {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}): Promise<unknown> {
  const { minLat, minLon, maxLat, maxLon } = params;
  if (
    minLat === undefined ||
    minLon === undefined ||
    maxLat === undefined ||
    maxLon === undefined
  ) {
    throw new Error("minLat, minLon, maxLat and maxLon are required");
  }
  return callTrafficAPI("traffic-incidents", {
    minLat,
    minLon,
    maxLat,
    maxLon,
  });
}

// ── Place / POI text search ───────────────────────────────────────────────────
export async function tomtomSearch(params: {
  query: string;
  lat?: number;
  lon?: number;
  radius?: number;
  limit?: number;
}): Promise<unknown> {
  const { query, lat, lon, radius = 50000, limit = 10 } = params;
  if (!query || query.trim() === "") throw new Error("query is required");
  return callTrafficAPI("tomtom-search", {
    query: query.trim(),
    lat,
    lon,
    radius,
    limit,
  });
}

// ── Category search near coordinates ─────────────────────────────────────────
export async function tomtomCategorySearch(params: {
  query: string;
  lat: number;
  lon: number;
  radius?: number;
  limit?: number;
  categorySet?: string;
}): Promise<unknown> {
  const { query, lat, lon, radius = 10000, limit = 10, categorySet } = params;
  if (!query || query.trim() === "") throw new Error("query is required");
  if (lat === undefined || lon === undefined)
    throw new Error("lat and lon are required");
  return callTrafficAPI("tomtom-search", {
    query: query.trim(),
    lat,
    lon,
    radius,
    limit,
    categorySet,
  });
}

// ── Nearby search ─────────────────────────────────────────────────────────────
export async function tomtomNearbySearch(params: {
  lat: number;
  lon: number;
  radius?: number;
  limit?: number;
  categorySet?: string;
}): Promise<unknown> {
  const { lat, lon, radius = 1000, limit = 10, categorySet } = params;
  if (lat === undefined || lon === undefined)
    throw new Error("lat and lon are required");
  return callTrafficAPI("tomtom-nearby", {
    lat,
    lon,
    radius,
    limit,
    categorySet,
  });
}

// ── Route calculation (OpenRouteService) ─────────────────────────────────────
export async function trafficRoute(params: {
  origin: WaypointParam;
  destination: WaypointParam;
  profile?: string;
  alternatives?: boolean;
  waypoints?: WaypointParam[];
}): Promise<unknown> {
  const {
    origin,
    destination,
    profile = "driving-car",
    alternatives = false,
    waypoints = [],
  } = params;
  if (!origin || !destination)
    throw new Error("origin and destination are required");

  const coordinates: Coord[] = [
    [origin.lon, origin.lat],
    ...waypoints.map((w) => [w.lon, w.lat] as Coord),
    [destination.lon, destination.lat],
  ];

  return callTrafficAPI("route", {
    profile,
    coordinates,
    alternative_routes: alternatives
      ? { target_count: 3, weight_factor: 1.6 }
      : undefined,
    instructions: true,
    instructions_format: "text",
    language: "en",
    units: "km",
    geometry: true,
  });
}

// ── Isochrone / reachability zone (OpenRouteService) ─────────────────────────
export async function trafficIsochrone(params: {
  lat: number;
  lon: number;
  range?: number[];
  range_type?: string;
  profile?: string;
  interval?: number;
  smoothing?: number;
}): Promise<unknown> {
  const {
    lat,
    lon,
    range = [1800],
    range_type = "time",
    profile = "driving-car",
    interval,
    smoothing = 0.25,
  } = params;
  if (lat === undefined || lon === undefined)
    throw new Error("lat and lon are required");
  return callTrafficAPI("route", {
    profile,
    coordinates: [[lon, lat]],
    range,
    range_type,
    units: "km",
    smoothing,
    ...(interval !== undefined ? { interval } : {}),
  });
}

// ── Distance / Duration Matrix (OpenRouteService) ─────────────────────────────
export async function trafficMatrix(params: {
  locations: Coord[];
  sources?: number[];
  destinations?: number[];
  profile?: string;
  metrics?: string[];
}): Promise<unknown> {
  const {
    locations,
    sources,
    destinations: dests,
    profile = "driving-car",
    metrics = ["duration", "distance"],
  } = params;
  if (!locations || locations.length < 2) {
    throw new Error(
      "locations must be an array of at least 2 [lon, lat] pairs",
    );
  }
  return callTrafficAPI("route", {
    profile,
    coordinates: locations,
    metrics,
    units: "km",
    ...(sources !== undefined ? { sources } : {}),
    ...(dests !== undefined ? { destinations: dests } : {}),
  });
}

// ── Forward geocoding (OpenRouteService) ─────────────────────────────────────
export async function trafficGeocode(params: {
  query: string;
  size?: number;
  focusLat?: number;
  focusLon?: number;
}): Promise<unknown> {
  const { query, size = 5, focusLat, focusLon } = params;
  if (!query || query.trim() === "") throw new Error("query is required");
  return callTrafficAPI("geocode", {
    text: query.trim(),
    size,
    ...(focusLat !== undefined ? { focusLat, focusLon } : {}),
  });
}

// ── Reverse geocoding (OpenRouteService) ─────────────────────────────────────
export async function trafficReverseGeocode(params: {
  lat: number;
  lon: number;
  size?: number;
}): Promise<unknown> {
  const { lat, lon, size = 1 } = params;
  if (lat === undefined || lon === undefined)
    throw new Error("lat and lon are required");
  return callTrafficAPI("reverse-geocode", { lat, lon, size });
}

// ── Unified action-based dispatcher ──────────────────────────────────────────
export async function tomtom(body: {
  action: string;
  [key: string]: unknown;
}): Promise<unknown> {
  const { action, ...params } = body;

  switch (action) {
    case "traffic-flow":
      return trafficFlow(params as Parameters<typeof trafficFlow>[0]);
    case "traffic-incidents":
      return trafficIncidents(params as Parameters<typeof trafficIncidents>[0]);
    case "search":
      return tomtomSearch(params as Parameters<typeof tomtomSearch>[0]);
    case "category-search":
      return tomtomCategorySearch(
        params as Parameters<typeof tomtomCategorySearch>[0],
      );
    case "nearby-search":
      return tomtomNearbySearch(
        params as Parameters<typeof tomtomNearbySearch>[0],
      );
    case "route":
      return trafficRoute(params as Parameters<typeof trafficRoute>[0]);
    case "isochrone":
      return trafficIsochrone(params as Parameters<typeof trafficIsochrone>[0]);
    case "matrix":
      return trafficMatrix(params as Parameters<typeof trafficMatrix>[0]);
    case "geocode":
      return trafficGeocode(params as Parameters<typeof trafficGeocode>[0]);
    case "reverse-geocode":
      return trafficReverseGeocode(
        params as Parameters<typeof trafficReverseGeocode>[0],
      );
    default:
      throw new Error(
        `Unknown action: "${action}". Supported: traffic-flow, traffic-incidents, search, ` +
          `category-search, nearby-search, route, isochrone, matrix, geocode, reverse-geocode`,
      );
  }
}
