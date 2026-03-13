// ─────────────────────────────────────────────────────────────────────────────
// imageUtils.ts
// Shared image helpers used across the whole app
// ─────────────────────────────────────────────────────────────────────────────

import type { SyntheticEvent } from "react";

// ── Static local fallback assets ──────────────────────────────────────────────
import destinationAgra from "@/assets/destination-agra.jpg";
import destinationGoa from "@/assets/destination-goa.jpg";
import destinationKerala from "@/assets/destination-kerala.jpg";
import travelBeach from "@/assets/travel-beach.jpg";
import travelBoat from "@/assets/travel-boat.jpg";
import travelOcean from "@/assets/travel-ocean.jpg";
import travelHiker from "@/assets/travel-hiker.jpg";
import travelKayak from "@/assets/travel-kayak.jpg";
import travelSummit from "@/assets/travel-summit.jpg";

export const LOCAL_FALLBACKS: string[] = [
  destinationAgra,
  destinationGoa,
  destinationKerala,
  travelBeach,
  travelBoat,
  travelOcean,
  travelHiker,
  travelKayak,
  travelSummit,
];

// ── Deterministic fallback picker ─────────────────────────────────────────────

/**
 * Pick a local fallback image deterministically from a seed string
 * (e.g. trip id, destination name) so the same trip always gets the same image.
 */
export function getFallbackImage(seed?: string | number): string {
  if (seed === undefined || seed === null) {
    return LOCAL_FALLBACKS[0];
  }
  const str = String(seed);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return LOCAL_FALLBACKS[Math.abs(hash) % LOCAL_FALLBACKS.length];
}

/**
 * Returns the primary image src to use.
 * If `url` is falsy or points at a deleted / old Supabase project,
 * a deterministic local fallback is returned immediately without hitting the network.
 *
 * @param url   - Remote image URL (e.g. trip.image_url)
 * @param seed  - Seed for deterministic fallback selection (e.g. trip.id)
 */
export function getImageSrc(
  url: string | null | undefined,
  seed?: string | number,
): string {
  if (!url || typeof url !== "string" || url.trim() === "") {
    return getFallbackImage(seed);
  }

  // Reject known-stale Supabase project hostnames
  const staleProjects = ["dfvyuqxyjlkoovxmtikq", "zsamypacycdvrhegcqvk"];
  if (staleProjects.some((id) => url.includes(id))) {
    return getFallbackImage(seed);
  }

  return url;
}

/**
 * React onError handler factory.
 * Usage:  <img src={...} onError={onImageError(seed)} />
 *
 * When the browser fails to load the image, it is swapped out for a
 * deterministic local fallback so the UI never shows a broken-image icon.
 *
 * @param seed - Used to pick a deterministic fallback (pass trip.id or index)
 */
export function onImageError(
  seed?: string | number,
): (e: SyntheticEvent<HTMLImageElement>) => void {
  return (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const fallback = getFallbackImage(seed);
    if (img.src !== fallback) {
      img.src = fallback;
    }
  };
}

/**
 * Checks whether a URL is an external URL (starts with http/https).
 */
export function isExternalUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * Build a Supabase Storage public URL for the current project.
 *
 * @param bucket  - Storage bucket name (e.g. "trip-images", "avatars")
 * @param path    - File path inside the bucket (e.g. "user-id/photo.jpg")
 */
export function supabaseStorageUrl(bucket: string, path: string): string {
  const base =
    (import.meta as any).env?.VITE_SUPABASE_URL ||
    "https://abaypbqynikfcdzrfelp.supabase.co";
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}
