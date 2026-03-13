// ─────────────────────────────────────────────────────────────────────────────
// Amadeus API Service  v4
// Strategy:
//   1. Try Supabase Edge Function "amadeus" first (keys stay server-side)
//   2. If edge function is not deployed / unreachable, fall back to direct
//      Amadeus REST call using the env-var keys (works on localhost)
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";

// ── Credentials (used only in direct-fallback path) ───────────────────────────
const AMADEUS_API_KEY = import.meta.env.VITE_AMADEUS_API_KEY as
  | string
  | undefined;
const AMADEUS_API_SECRET = import.meta.env.VITE_AMADEUS_API_SECRET as
  | string
  | undefined;
const AMADEUS_BASE = "https://test.api.amadeus.com";

// ── OAuth token cache (direct fallback only) ──────────────────────────────────
let _token: string | null = null;
let _tokenExpiry = 0;

async function getDirectToken(): Promise<string> {
  const now = Date.now();
  if (_token && now < _tokenExpiry) return _token;

  if (!AMADEUS_API_KEY || !AMADEUS_API_SECRET) {
    throw new Error(
      "Amadeus API credentials are not configured. " +
        "Add VITE_AMADEUS_API_KEY and VITE_AMADEUS_API_SECRET to your .env file.",
    );
  }

  const res = await fetch(`${AMADEUS_BASE}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      `grant_type=client_credentials` +
      `&client_id=${AMADEUS_API_KEY}` +
      `&client_secret=${AMADEUS_API_SECRET}`,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Amadeus auth failed [${res.status}]: ${JSON.stringify(data)}`,
    );
  }

  _token = data.access_token as string;
  _tokenExpiry = now + (Number(data.expires_in ?? 1799) - 60) * 1000;
  return _token!;
}

async function directGet(path: string): Promise<unknown> {
  const token = await getDirectToken();
  const res = await fetch(`${AMADEUS_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Amadeus API error [${res.status}]: ${JSON.stringify(data)}`,
    );
  }
  return data;
}

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
// Tries Edge Function first; falls back to direct call automatically.

async function callAmadeus(
  action: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  // ── 1. Try Edge Function ────────────────────────────────────────────────
  try {
    const { data, error } = await supabase.functions.invoke("amadeus", {
      body: { action, ...params },
    });

    // A non-null error from supabase-js means the function is unreachable,
    // not deployed, or returned a non-2xx. We fall through to direct call.
    if (error) {
      const errMsg: string = error?.message?.toLowerCase() ?? "";

      // Definitive server-side errors → don't retry directly
      if (
        errMsg.includes("not configured") ||
        errMsg.includes("amadeus auth") ||
        errMsg.includes("amadeus api error")
      ) {
        throw new Error(error.message);
      }

      // Otherwise (network / not-deployed / 404) → fall through
      console.warn(
        "[amadeus] Edge function unavailable, trying direct call:",
        error.message,
      );
    } else if (data) {
      // Successful edge-function response
      if (typeof data === "object" && data !== null && "error" in data) {
        throw new Error(`Amadeus error: ${(data as any).error}`);
      }
      return data;
    }
  } catch (edgeErr: unknown) {
    const msg = edgeErr instanceof Error ? edgeErr.message.toLowerCase() : "";
    // Re-throw definitive errors; fall through for network/deploy issues
    if (
      msg.includes("not configured") ||
      msg.includes("amadeus auth") ||
      msg.includes("amadeus api error") ||
      msg.includes("amadeus error:")
    ) {
      throw edgeErr;
    }
    console.warn("[amadeus] Edge function error, trying direct call:", edgeErr);
  }

  // ── 2. Direct fallback (localhost / edge function not yet deployed) ─────
  return callDirect(action, params);
}

async function callDirect(
  action: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  switch (action) {
    case "flight-offers": {
      const {
        origin,
        destination,
        departureDate,
        adults = 1,
        max = 5,
        returnDate,
        travelClass,
        nonStop,
      } = params as FlightOffersParams;

      let path =
        `/v2/shopping/flight-offers` +
        `?originLocationCode=${origin}` +
        `&destinationLocationCode=${destination}` +
        `&departureDate=${departureDate}` +
        `&adults=${adults}` +
        `&max=${max}` +
        `&currencyCode=INR`;

      if (returnDate) path += `&returnDate=${returnDate}`;
      if (travelClass) path += `&travelClass=${travelClass}`;
      if (nonStop !== undefined) path += `&nonStop=${nonStop}`;
      return directGet(path);
    }

    case "hotel-list": {
      const {
        cityCode,
        radius = 5,
        radiusUnit = "KM",
        ratings,
      } = params as HotelListParams;

      let path =
        `/v1/reference-data/locations/hotels/by-city` +
        `?cityCode=${cityCode}` +
        `&radius=${radius}` +
        `&radiusUnit=${radiusUnit}`;

      if (ratings) path += `&ratings=${ratings}`;
      return directGet(path);
    }

    case "hotel-offers": {
      const {
        hotelIds,
        checkInDate,
        checkOutDate,
        adults = 1,
      } = params as HotelOffersParams;

      const path =
        `/v3/shopping/hotel-offers` +
        `?hotelIds=${hotelIds}` +
        `&checkInDate=${checkInDate}` +
        `&checkOutDate=${checkOutDate}` +
        `&adults=${adults}` +
        `&currency=INR`;
      return directGet(path);
    }

    case "city-search": {
      const { keyword, subType = "CITY,AIRPORT" } = params as CitySearchParams;
      const path =
        `/v1/reference-data/locations` +
        `?subType=${subType}` +
        `&keyword=${encodeURIComponent(keyword)}` +
        `&page%5Blimit%5D=10`;
      return directGet(path);
    }

    case "flight-inspirations": {
      const { origin, maxPrice, departureDate } =
        params as FlightInspirationsParams;

      let path =
        `/v1/shopping/flight-destinations` +
        `?origin=${origin}` +
        `&currencyCode=INR`;

      if (maxPrice) path += `&maxPrice=${maxPrice}`;
      if (departureDate) path += `&departureDate=${departureDate}`;
      return directGet(path);
    }

    case "flight-dates": {
      const { origin, destination } = params as FlightDatesParams;
      const path =
        `/v1/shopping/flight-dates` +
        `?origin=${origin}` +
        `&destination=${destination}` +
        `&currencyCode=INR`;
      return directGet(path);
    }

    case "airport-nearest": {
      const { lat, lng } = params as AirportNearestParams;
      const path =
        `/v1/reference-data/locations/airports` +
        `?latitude=${lat}` +
        `&longitude=${lng}` +
        `&sort=distance` +
        `&page%5Blimit%5D=5`;
      return directGet(path);
    }

    case "poi-search": {
      const { lat, lng, radius = 1, categories } = params as PoiSearchParams;

      let path =
        `/v1/reference-data/locations/pois` +
        `?latitude=${lat}` +
        `&longitude=${lng}` +
        `&radius=${radius}` +
        `&page%5Blimit%5D=20`;

      if (categories) path += `&categories=${categories}`;
      return directGet(path);
    }

    case "activities": {
      const { lat, lng, radius = 5 } = params as ActivitiesParams;
      const path =
        `/v1/shopping/activities` +
        `?latitude=${lat}` +
        `&longitude=${lng}` +
        `&radius=${radius}`;
      return directGet(path);
    }

    case "safe-place": {
      const { lat, lng, radius = 1 } = params as SafePlaceParams;
      const path =
        `/v1/safety/safety-rated-locations` +
        `?latitude=${lat}` +
        `&longitude=${lng}` +
        `&radius=${radius}` +
        `&page%5Blimit%5D=20`;
      return directGet(path);
    }

    default:
      throw new Error(
        `Unknown Amadeus action: "${action}". Supported: flight-offers, hotel-list, ` +
          `hotel-offers, city-search, flight-inspirations, flight-dates, ` +
          `airport-nearest, poi-search, activities, safe-place`,
      );
  }
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
