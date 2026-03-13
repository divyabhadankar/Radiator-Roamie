// ─────────────────────────────────────────────────────────────────────────────
// Amadeus API Service  v5
// Strategy:
//   All calls go through the Vercel API route /api/amadeus (server-side proxy).
//   This avoids CORS issues and keeps credentials out of the browser bundle.
// ─────────────────────────────────────────────────────────────────────────────

// Detect the API base at runtime so it works on localhost AND on Vercel
const API_BASE =
  typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:5173";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FlightOffersParams {
  origin: string;
  destination: string;
  departureDate: string;
  adults?: number;
  max?: number;
  returnDate?: string;
  travelClass?: string;
  nonStop?: boolean;
}

export interface HotelListParams {
  cityCode: string;
  radius?: number;
  radiusUnit?: string;
  ratings?: string;
}

export interface HotelOffersParams {
  hotelIds: string;
  checkInDate: string;
  checkOutDate: string;
  adults?: number;
}

export interface CitySearchParams {
  keyword: string;
  subType?: string;
}

export interface FlightInspirationsParams {
  origin: string;
  maxPrice?: number;
  departureDate?: string;
}

export interface FlightDatesParams {
  origin: string;
  destination: string;
}

export interface AirportNearestParams {
  lat: number;
  lng: number;
}

export interface PoiSearchParams {
  lat: number;
  lng: number;
  radius?: number;
  categories?: string;
}

export interface ActivitiesParams {
  lat: number;
  lng: number;
  radius?: number;
}

export interface SafePlaceParams {
  lat: number;
  lng: number;
  radius?: number;
}

// ── Core dispatcher ───────────────────────────────────────────────────────────
// Posts to /api/amadeus Vercel route — runs server-side, no CORS issues.

async function callAmadeus(
  action: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${API_BASE}/api/amadeus`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...params }),
  });

  const data = await res.json();

  if (!res.ok) {
    const msg: string = (data as any)?.error ?? `Amadeus error [${res.status}]`;
    throw new Error(msg);
  }

  return data;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function amadeusFlightOffers(
  params: FlightOffersParams,
): Promise<unknown> {
  const { origin, destination, departureDate } = params;
  if (!origin || !destination || !departureDate) {
    throw new Error("origin, destination, and departureDate are required.");
  }
  return callAmadeus("flight-offers", params as Record<string, unknown>);
}

export async function amadeusHotelList(
  params: HotelListParams,
): Promise<unknown> {
  if (!params.cityCode) throw new Error("cityCode is required.");
  return callAmadeus("hotel-list", params as Record<string, unknown>);
}

export async function amadeusHotelOffers(
  params: HotelOffersParams,
): Promise<unknown> {
  const { hotelIds, checkInDate, checkOutDate } = params;
  if (!hotelIds || !checkInDate || !checkOutDate) {
    throw new Error("hotelIds, checkInDate, and checkOutDate are required.");
  }
  return callAmadeus("hotel-offers", params as Record<string, unknown>);
}

export async function amadeusCitySearch(
  params: CitySearchParams,
): Promise<unknown> {
  if (!params.keyword) throw new Error("keyword is required.");
  return callAmadeus("city-search", params as Record<string, unknown>);
}

export async function amadeusFlightInspirations(
  params: FlightInspirationsParams,
): Promise<unknown> {
  if (!params.origin) throw new Error("origin is required.");
  return callAmadeus("flight-inspirations", params as Record<string, unknown>);
}

export async function amadeusFlightDates(
  params: FlightDatesParams,
): Promise<unknown> {
  if (!params.origin || !params.destination) {
    throw new Error("origin and destination are required.");
  }
  return callAmadeus("flight-dates", params as Record<string, unknown>);
}

export async function amadeusAirportNearest(
  params: AirportNearestParams,
): Promise<unknown> {
  if (params.lat === undefined || params.lng === undefined) {
    throw new Error("lat and lng are required.");
  }
  return callAmadeus("airport-nearest", params as Record<string, unknown>);
}

export async function amadeusPoiSearch(
  params: PoiSearchParams,
): Promise<unknown> {
  if (params.lat === undefined || params.lng === undefined) {
    throw new Error("lat and lng are required.");
  }
  return callAmadeus("poi-search", params as Record<string, unknown>);
}

export async function amadeusActivities(
  params: ActivitiesParams,
): Promise<unknown> {
  if (params.lat === undefined || params.lng === undefined) {
    throw new Error("lat and lng are required.");
  }
  return callAmadeus("activities", params as Record<string, unknown>);
}

export async function amadeusSafePlace(
  params: SafePlaceParams,
): Promise<unknown> {
  if (params.lat === undefined || params.lng === undefined) {
    throw new Error("lat and lng are required.");
  }
  return callAmadeus("safe-place", params as Record<string, unknown>);
}

/**
 * Unified action-based dispatcher.
 * Use this when you have a dynamic action string at call time.
 */
export async function amadeus(body: {
  action: string;
  [key: string]: unknown;
}): Promise<unknown> {
  const { action, ...params } = body;
  if (!action) throw new Error("action is required.");
  return callAmadeus(action, params);
}
