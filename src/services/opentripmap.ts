// OpenTripMap API service
// All calls go through /api/opentripmap server route — zero client-side keys

const OTM_API_URL = "/api/opentripmap";

async function callOTM(
  action: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(OTM_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...params }),
  });
  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error(`OTM API [${res.status}]: failed to parse response`);
  }
  if (!res.ok)
    throw new Error(
      `OTM API [${res.status}]: ${data?.error ?? JSON.stringify(data)}`,
    );
  return data;
}

export interface OTMPlace {
  xid: string;
  name: string;
  dist?: number;
  rate?: number;
  osm?: string;
  kinds?: string;
  point?: {
    lon: number;
    lat: number;
  };
}

export interface OTMPlaceDetail {
  xid: string;
  name: string;
  address?: {
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
    road?: string;
    house_number?: string;
    country_code?: string;
  };
  rate?: number;
  osm?: string;
  kinds?: string;
  sources?: {
    geometry?: string;
    attributes?: string[];
  };
  otm?: string;
  wikipedia?: string;
  image?: string;
  preview?: {
    source?: string;
    height?: number;
    width?: number;
  };
  wikipedia_extracts?: {
    title?: string;
    text?: string;
    html?: string;
  };
  point?: {
    lon: number;
    lat: number;
  };
  bbox?: {
    lon_min: number;
    lat_min: number;
    lon_max: number;
    lat_max: number;
  };
  url?: string;
  wikidata?: string;
  info?: {
    descr?: string;
    image?: string;
    img_width?: number;
    img_height?: number;
    src?: string;
    src_id?: number;
  };
}

// ── Places within radius ─────────────────────────────────────────────────────
export async function otmRadius(params: {
  lat: number;
  lon: number;
  radius?: number;
  kinds?: string;
  limit?: number;
  rate?: number;
  format?: string;
}): Promise<OTMPlace[]> {
  const {
    lat,
    lon,
    radius = 5000,
    kinds = "interesting_places",
    limit = 20,
    rate,
    format = "json",
  } = params;

  if (lat === undefined || lon === undefined) {
    throw new Error("lat and lon are required for radius search");
  }

  if (radius < 0 || radius > 100_000) {
    throw new Error("radius must be between 0 and 100000 metres");
  }

  return callOTM("radius", { lat, lng: lon, radius, kinds, limit });
}

// ── Place details by XID ─────────────────────────────────────────────────────
export async function otmDetails(xid: string): Promise<OTMPlaceDetail> {
  if (!xid || xid.trim() === "") {
    throw new Error("xid is required for details");
  }

  return callOTM("details", { xid: xid.trim() }) as Promise<OTMPlaceDetail>;
}

// ── Autosuggest: search by name near coordinates ─────────────────────────────
export async function otmAutosuggest(params: {
  name: string;
  lat: number;
  lon: number;
  radius?: number;
  limit?: number;
  kinds?: string;
}): Promise<OTMPlace[]> {
  const { name, lat, lon, radius = 50_000, limit = 10, kinds } = params;

  if (!name || name.trim() === "") {
    throw new Error("name is required for autosuggest");
  }

  if (lat === undefined || lon === undefined) {
    throw new Error("lat and lon are required for autosuggest");
  }

  return callOTM("autosuggest", {
    name: name.trim(),
    lat,
    lng: lon,
    radius,
    limit,
    kinds,
  }) as Promise<OTMPlace[]>;
}

// ── Places within bounding box ───────────────────────────────────────────────
export async function otmBbox(params: {
  bbox: {
    lon_min: number;
    lat_min: number;
    lon_max: number;
    lat_max: number;
  };
  kinds?: string;
  limit?: number;
  rate?: number;
  format?: string;
}): Promise<OTMPlace[]> {
  const {
    bbox,
    kinds = "interesting_places",
    limit = 20,
    rate,
    format = "json",
  } = params;

  if (
    !bbox ||
    bbox.lon_min === undefined ||
    bbox.lat_min === undefined ||
    bbox.lon_max === undefined ||
    bbox.lat_max === undefined
  ) {
    throw new Error("bbox with lon_min, lat_min, lon_max, lat_max is required");
  }

  return callOTM("bbox", {
    lonMin: bbox.lon_min,
    latMin: bbox.lat_min,
    lonMax: bbox.lon_max,
    latMax: bbox.lat_max,
    kinds,
    limit,
  }) as Promise<OTMPlace[]>;
}

// ── Unified action-based dispatcher (mirrors the edge-function interface) ─────
export async function opentripmap(body: {
  action: "radius" | "details" | "autosuggest" | "bbox";
  [key: string]: unknown;
}): Promise<OTMPlace[] | OTMPlaceDetail> {
  const { action, ...params } = body;

  switch (action) {
    case "radius":
      return otmRadius(params as Parameters<typeof otmRadius>[0]);

    case "details":
      return otmDetails(params.xid as string);

    case "autosuggest":
      return otmAutosuggest(params as Parameters<typeof otmAutosuggest>[0]);

    case "bbox":
      return otmBbox(params as Parameters<typeof otmBbox>[0]);

    default:
      throw new Error(
        `Unknown action: "${action}". Supported: radius, details, autosuggest, bbox`,
      );
  }
}
