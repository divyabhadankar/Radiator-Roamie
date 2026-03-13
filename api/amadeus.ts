import type { VercelRequest, VercelResponse } from "@vercel/node";

const AMADEUS_BASE = "https://test.api.amadeus.com";

let _token: string | null = null;
let _tokenExpiry = 0;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (_token && now < _tokenExpiry) return _token;

  const key = process.env.VITE_AMADEUS_API_KEY || process.env.AMADEUS_API_KEY;
  const secret =
    process.env.VITE_AMADEUS_API_SECRET || process.env.AMADEUS_API_SECRET;

  if (!key || !secret) {
    throw new Error(
      "AMADEUS_API_KEY / AMADEUS_API_SECRET are not configured in environment variables.",
    );
  }

  const res = await fetch(`${AMADEUS_BASE}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${key}&client_secret=${secret}`,
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

async function amadeusGet(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

function err(res: VercelResponse, msg: string, status = 500) {
  return res.status(status).json({ error: msg });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return err(res, "Method not allowed", 405);
  }

  const body = req.body;
  if (!body || typeof body.action !== "string") {
    return err(res, "Request body must include an 'action' field.", 400);
  }

  const { action, ...params } = body;

  let token: string;
  try {
    token = await getToken();
  } catch (e: any) {
    return err(res, e.message ?? "Amadeus authentication failed.", 502);
  }

  let url: string;

  try {
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
        } = params as any;

        if (!origin || !destination || !departureDate) {
          return err(
            res,
            "origin, destination and departureDate are required.",
            400,
          );
        }

        url =
          `${AMADEUS_BASE}/v2/shopping/flight-offers` +
          `?originLocationCode=${origin}` +
          `&destinationLocationCode=${destination}` +
          `&departureDate=${departureDate}` +
          `&adults=${adults}` +
          `&max=${max}` +
          `&currencyCode=INR`;

        if (returnDate) url += `&returnDate=${returnDate}`;
        if (travelClass) url += `&travelClass=${travelClass}`;
        if (nonStop !== undefined) url += `&nonStop=${nonStop}`;
        break;
      }

      case "hotel-list": {
        const { cityCode, radius = 5, radiusUnit = "KM", ratings } =
          params as any;

        if (!cityCode) return err(res, "cityCode is required.", 400);

        url =
          `${AMADEUS_BASE}/v1/reference-data/locations/hotels/by-city` +
          `?cityCode=${cityCode}` +
          `&radius=${radius}` +
          `&radiusUnit=${radiusUnit}`;

        if (ratings) url += `&ratings=${ratings}`;
        break;
      }

      case "hotel-offers": {
        const { hotelIds, checkInDate, checkOutDate, adults = 1 } =
          params as any;

        if (!hotelIds || !checkInDate || !checkOutDate) {
          return err(
            res,
            "hotelIds, checkInDate and checkOutDate are required.",
            400,
          );
        }

        url =
          `${AMADEUS_BASE}/v3/shopping/hotel-offers` +
          `?hotelIds=${hotelIds}` +
          `&checkInDate=${checkInDate}` +
          `&checkOutDate=${checkOutDate}` +
          `&adults=${adults}` +
          `&currency=INR`;
        break;
      }

      case "city-search": {
        const { keyword, subType = "CITY,AIRPORT" } = params as any;

        if (!keyword) return err(res, "keyword is required.", 400);

        url =
          `${AMADEUS_BASE}/v1/reference-data/locations` +
          `?subType=${subType}` +
          `&keyword=${encodeURIComponent(keyword)}` +
          `&page%5Blimit%5D=10`;
        break;
      }

      case "flight-inspirations": {
        const { origin, maxPrice, departureDate } = params as any;

        if (!origin) return err(res, "origin is required.", 400);

        url =
          `${AMADEUS_BASE}/v1/shopping/flight-destinations` +
          `?origin=${origin}` +
          `&currencyCode=INR`;

        if (maxPrice) url += `&maxPrice=${maxPrice}`;
        if (departureDate) url += `&departureDate=${departureDate}`;
        break;
      }

      case "flight-dates": {
        const { origin, destination } = params as any;

        if (!origin || !destination) {
          return err(res, "origin and destination are required.", 400);
        }

        url =
          `${AMADEUS_BASE}/v1/shopping/flight-dates` +
          `?origin=${origin}` +
          `&destination=${destination}` +
          `&currencyCode=INR`;
        break;
      }

      case "airport-nearest": {
        const { lat, lng } = params as any;

        if (lat === undefined || lng === undefined) {
          return err(res, "lat and lng are required.", 400);
        }

        url =
          `${AMADEUS_BASE}/v1/reference-data/locations/airports` +
          `?latitude=${lat}` +
          `&longitude=${lng}` +
          `&sort=distance` +
          `&page%5Blimit%5D=5`;
        break;
      }

      case "poi-search": {
        const { lat, lng, radius = 1, categories } = params as any;

        if (lat === undefined || lng === undefined) {
          return err(res, "lat and lng are required.", 400);
        }

        url =
          `${AMADEUS_BASE}/v1/reference-data/locations/pois` +
          `?latitude=${lat}` +
          `&longitude=${lng}` +
          `&radius=${radius}` +
          `&page%5Blimit%5D=20`;

        if (categories) url += `&categories=${categories}`;
        break;
      }

      case "activities": {
        const { lat, lng, radius = 5 } = params as any;

        if (lat === undefined || lng === undefined) {
          return err(res, "lat and lng are required.", 400);
        }

        url =
          `${AMADEUS_BASE}/v1/shopping/activities` +
          `?latitude=${lat}` +
          `&longitude=${lng}` +
          `&radius=${radius}`;
        break;
      }

      case "safe-place": {
        const { lat, lng, radius = 1 } = params as any;

        if (lat === undefined || lng === undefined) {
          return err(res, "lat and lng are required.", 400);
        }

        url =
          `${AMADEUS_BASE}/v1/safety/safety-rated-locations` +
          `?latitude=${lat}` +
          `&longitude=${lng}` +
          `&radius=${radius}` +
          `&page%5Blimit%5D=20`;
        break;
      }

      default:
        return err(
          res,
          `Unknown action: "${action}". Supported: flight-offers, hotel-list, hotel-offers, ` +
            `city-search, flight-inspirations, flight-dates, airport-nearest, poi-search, activities, safe-place`,
          400,
        );
    }
  } catch (e: any) {
    return err(res, e.message ?? "Failed to build request URL.", 400);
  }

  try {
    const { ok, status, data } = await amadeusGet(url, token);
    if (!ok) {
      return err(
        res,
        `Amadeus API error [${status}]: ${JSON.stringify(data)}`,
        status >= 500 ? 502 : status,
      );
    }
    return res.status(200).json(data);
  } catch (e: any) {
    return err(res, e.message ?? "Failed to call Amadeus API.", 502);
  }
}
