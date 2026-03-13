// ─────────────────────────────────────────────────────────────────────────────
// Amadeus API Service  v3
// All calls are routed through the Supabase Edge Function "amadeus"
// so that API keys stay server-side and CORS is never an issue.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Core dispatcher — calls the Supabase Edge Function ───────────────────────

async function callEdgeFunction(
  action: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("amadeus", {
    body: { action, ...params },
  });

  if (error) {
    // Try to surface a useful message from the edge function error body
    let detail = error.message ?? "Unknown error";

    // supabase-js wraps the response body in error.context on HTTP errors
    try {
      const ctx = (error as any).context;
      if (ctx) {
        const text = typeof ctx === "string" ? ctx : await ctx.text?.();
        if (text) {
          const parsed = JSON.parse(text);
          detail = parsed?.error ?? parsed?.message ?? text;
        }
      }
    } catch {
      /* ignore parse errors — use original message */
    }

    // Provide friendly messages for common failure modes
    if (
      detail.toLowerCase().includes("amadeus auth") ||
      detail.toLowerCase().includes("client_credentials")
    ) {
      throw new Error(
        "Amadeus API credentials are not configured on the server. " +
          "Please set AMADEUS_API_KEY and AMADEUS_API_SECRET in your Supabase project secrets.",
      );
    }

    if (detail.toLowerCase().includes("not configured")) {
      throw new Error(
        "Amadeus API is not configured. Please add AMADEUS_API_KEY and AMADEUS_API_SECRET to your Supabase Edge Function secrets.",
      );
    }

    throw new Error(`Amadeus request failed: ${detail}`);
  }

  if (!data) {
    throw new Error("Amadeus returned an empty response.");
  }

  // The edge function may return { error: "..." } with a 200 status in some cases
  if (typeof data === "object" && data !== null && "error" in data) {
    throw new Error(`Amadeus error: ${(data as any).error}`);
  }

  return data;
}

// ── Public API functions ─────────────────────────────────────────────────────

/**
 * Search for flight offers.
 * Requires IATA airport codes for origin and destination (e.g. "DEL", "BOM").
 */
export async function amadeusFlightOffers(
  params: FlightOffersParams,
): Promise<unknown> {
  const { origin, destination, departureDate } = params;
  if (!origin || !destination || !departureDate) {
    throw new Error("origin, destination, and departureDate are required.");
  }
  return callEdgeFunction("flight-offers", params as Record<string, unknown>);
}

/**
 * List hotels in a city by IATA city code (e.g. "DEL" for Delhi).
 */
export async function amadeusHotelList(
  params: HotelListParams,
): Promise<unknown> {
  if (!params.cityCode) throw new Error("cityCode is required.");
  return callEdgeFunction("hotel-list", params as Record<string, unknown>);
}

/**
 * Get pricing and availability for specific hotels.
 */
export async function amadeusHotelOffers(
  params: HotelOffersParams,
): Promise<unknown> {
  const { hotelIds, checkInDate, checkOutDate } = params;
  if (!hotelIds || !checkInDate || !checkOutDate) {
    throw new Error("hotelIds, checkInDate, and checkOutDate are required.");
  }
  return callEdgeFunction("hotel-offers", params as Record<string, unknown>);
}

/**
 * Search for cities and airports by keyword.
 */
export async function amadeusCitySearch(
  params: CitySearchParams,
): Promise<unknown> {
  if (!params.keyword) throw new Error("keyword is required.");
  return callEdgeFunction("city-search", params as Record<string, unknown>);
}

/**
 * Get cheap flight destination inspirations from an origin.
 */
export async function amadeusFlightInspirations(
  params: FlightInspirationsParams,
): Promise<unknown> {
  if (!params.origin) throw new Error("origin is required.");
  return callEdgeFunction(
    "flight-inspirations",
    params as Record<string, unknown>,
  );
}

/**
 * Get the cheapest travel dates between two cities.
 */
export async function amadeusFlightDates(
  params: FlightDatesParams,
): Promise<unknown> {
  if (!params.origin || !params.destination) {
    throw new Error("origin and destination are required.");
  }
  return callEdgeFunction("flight-dates", params as Record<string, unknown>);
}

/**
 * Find the nearest airports to a lat/lng coordinate.
 */
export async function amadeusAirportNearest(
  params: AirportNearestParams,
): Promise<unknown> {
  if (params.lat === undefined || params.lng === undefined) {
    throw new Error("lat and lng are required.");
  }
  return callEdgeFunction("airport-nearest", params as Record<string, unknown>);
}

/**
 * Search for points of interest near a coordinate.
 */
export async function amadeusPoiSearch(
  params: PoiSearchParams,
): Promise<unknown> {
  if (params.lat === undefined || params.lng === undefined) {
    throw new Error("lat and lng are required.");
  }
  return callEdgeFunction("poi-search", params as Record<string, unknown>);
}

/**
 * Search for tours and activities near a coordinate.
 */
export async function amadeusActivities(
  params: ActivitiesParams,
): Promise<unknown> {
  if (params.lat === undefined || params.lng === undefined) {
    throw new Error("lat and lng are required.");
  }
  return callEdgeFunction("activities", params as Record<string, unknown>);
}

/**
 * Get safety ratings for locations near a coordinate.
 */
export async function amadeusSafePlace(
  params: SafePlaceParams,
): Promise<unknown> {
  if (params.lat === undefined || params.lng === undefined) {
    throw new Error("lat and lng are required.");
  }
  return callEdgeFunction("safe-place", params as Record<string, unknown>);
}

/**
 * Unified action-based dispatcher — mirrors the edge-function interface.
 * Use this when you have a dynamic action string.
 */
export async function amadeus(body: {
  action: string;
  [key: string]: unknown;
}): Promise<unknown> {
  const { action, ...params } = body;
  if (!action) throw new Error("action is required.");
  return callEdgeFunction(action, params);
}
