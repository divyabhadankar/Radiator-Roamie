// OpenRouteService (ORS) API service
// All calls go through /api/openroute server route — zero client-side keys

const ORS_API_URL = "/api/openroute";

type Coord = [number, number]; // [lon, lat]

interface WaypointParam {
  lat: number;
  lon: number;
}

async function callORS(
  action: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(ORS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...params }),
  });
  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error(`ORS API [${res.status}]: failed to parse response`);
  }
  if (!res.ok)
    throw new Error(
      `ORS API [${res.status}]: ${data?.error ?? JSON.stringify(data)}`,
    );
  return data;
}

// ── Directions (JSON) ────────────────────────────────────────────────────────
export async function orsDirections(params: {
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

  const coordinates: Coord[] = [
    [origin.lon, origin.lat],
    ...waypoints.map((w) => [w.lon, w.lat] as Coord),
    [destination.lon, destination.lat],
  ];

  return callORS("directions", {
    profile,
    coordinates,
    alternative_routes: alternatives
      ? { target_count: 3, weight_factor: 1.6, share_factor: 0.6 }
      : undefined,
    instructions: true,
    instructions_format: "text",
    language: "en",
    units: "km",
    geometry: true,
    elevation: false,
  });
}

// ── Directions (GeoJSON) ─────────────────────────────────────────────────────
export async function orsDirectionsGeoJson(params: {
  origin: WaypointParam;
  destination: WaypointParam;
  profile?: string;
  waypoints?: WaypointParam[];
}): Promise<unknown> {
  const {
    origin,
    destination,
    profile = "driving-car",
    waypoints = [],
  } = params;

  const coordinates: Coord[] = [
    [origin.lon, origin.lat],
    ...waypoints.map((w) => [w.lon, w.lat] as Coord),
    [destination.lon, destination.lat],
  ];

  return callORS("directions-geojson", {
    profile,
    coordinates,
    instructions: true,
    language: "en",
    units: "km",
  });
}

// ── Isochrone (reachability zone) ────────────────────────────────────────────
export async function orsIsochrone(params: {
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

  return callORS("isochrone", {
    profile,
    locations: [[lon, lat]],
    range,
    range_type,
    units: "km",
    smoothing,
    ...(interval !== undefined ? { interval } : {}),
  });
}

// ── Distance / Duration Matrix ────────────────────────────────────────────────
export async function orsMatrix(params: {
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

  return callORS("matrix", {
    profile,
    locations,
    metrics,
    units: "km",
    ...(sources !== undefined ? { sources } : {}),
    ...(dests !== undefined ? { destinations: dests } : {}),
  });
}

// ── Forward Geocoding: text → coordinates ────────────────────────────────────
export async function orsGeocode(params: {
  query: string;
  size?: number;
  countryCode?: string;
  focusLat?: number;
  focusLon?: number;
}): Promise<unknown> {
  const { query, size = 5, focusLat, focusLon } = params;
  if (!query || query.trim() === "") throw new Error("query is required");
  return callORS("geocode", {
    text: query.trim(),
    size,
    ...(focusLat !== undefined ? { focusLat, focusLon } : {}),
  });
}

// ── Reverse Geocoding: coordinates → address ─────────────────────────────────
export async function orsReverseGeocode(params: {
  lat: number;
  lon: number;
  size?: number;
}): Promise<unknown> {
  const { lat, lon, size = 1 } = params;
  return callORS("reverse-geocode", { lat, lon, size });
}

// ── Autocomplete ─────────────────────────────────────────────────────────────
export async function orsAutocomplete(params: {
  query: string;
  focusLat?: number;
  focusLon?: number;
}): Promise<unknown> {
  const { query, focusLat, focusLon } = params;
  if (!query || query.trim() === "") throw new Error("query is required");
  return callORS("autocomplete", {
    text: query.trim(),
    ...(focusLat !== undefined ? { focusLat, focusLon } : {}),
  });
}

// ── Unified action-based dispatcher ──────────────────────────────────────────
export async function openroute(body: {
  action: string;
  [key: string]: unknown;
}): Promise<unknown> {
  const { action, ...params } = body;

  switch (action) {
    case "directions":
      return orsDirections(params as Parameters<typeof orsDirections>[0]);
    case "directions-geojson":
      return orsDirectionsGeoJson(
        params as Parameters<typeof orsDirectionsGeoJson>[0],
      );
    case "isochrone":
      return orsIsochrone(params as Parameters<typeof orsIsochrone>[0]);
    case "matrix":
      return orsMatrix(params as Parameters<typeof orsMatrix>[0]);
    case "geocode":
      return orsGeocode(params as Parameters<typeof orsGeocode>[0]);
    case "reverse-geocode":
      return orsReverseGeocode(
        params as Parameters<typeof orsReverseGeocode>[0],
      );
    case "autocomplete":
      return orsAutocomplete(params as Parameters<typeof orsAutocomplete>[0]);
    default:
      throw new Error(
        `Unknown ORS action: "${action}". Supported: directions, directions-geojson, ` +
          `isochrone, matrix, geocode, reverse-geocode, autocomplete`,
      );
  }
}
