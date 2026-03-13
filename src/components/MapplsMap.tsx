import { useEffect, useRef, useState } from "react";
import { MAPPLS_FRONTEND_KEY } from "@/lib/mapConfig";
import { Loader2 } from "lucide-react";

interface MapplsMapProps {
  lat: number;
  lng: number;
  name?: string;
  zoom?: number;
  className?: string;
}

// Track script loading globally
let scriptLoaded = false;
let scriptLoading = false;
const callbacks: (() => void)[] = [];

function loadMapplsScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    if (scriptLoading) {
      callbacks.push(resolve);
      return;
    }
    scriptLoading = true;
    const script = document.createElement("script");
    script.src = `https://apis.mappls.com/advancedmaps/api/${MAPPLS_FRONTEND_KEY}/map_sdk?v=3.0&layer=vector`;
    script.async = true;
    script.onload = () => {
      scriptLoaded = true;
      scriptLoading = false;
      resolve();
      callbacks.forEach((cb) => cb());
      callbacks.length = 0;
    };
    script.onerror = () => {
      scriptLoading = false;
      resolve(); // resolve anyway to avoid hanging
    };
    document.head.appendChild(script);
  });
}

export default function MapplsMap({ lat, lng, name, zoom = 14, className = "" }: MapplsMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const initMap = async () => {
      await loadMapplsScript();
      if (cancelled || !mapRef.current) return;

      const mappls = (window as any).mappls;
      if (!mappls) {
        setError(true);
        setLoading(false);
        return;
      }

      try {
        // Remove old map if exists
        if (mapInstanceRef.current) {
          try { mapInstanceRef.current.remove(); } catch {}
        }

        const map = new mappls.Map(mapRef.current, {
          center: { lat, lng },
          zoom,
          zoomControl: true,
          search: false,
        });

        mapInstanceRef.current = map;

        map.addListener("load", () => {
          if (cancelled) return;
          setLoading(false);

          // Add marker
          const marker = new mappls.Marker({
            map,
            position: { lat, lng },
            popupHtml: name ? `<div style="padding:8px;font-weight:600;font-size:13px;">${name}</div>` : undefined,
          });
          markerRef.current = marker;

          if (name) {
            marker.setPopup(marker);
          }
        });
      } catch {
        setError(true);
        setLoading(false);
      }
    };

    initMap();

    return () => {
      cancelled = true;
      if (markerRef.current) {
        try { markerRef.current.remove?.(); } catch {}
      }
    };
  }, [lat, lng, zoom, name]);

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-secondary rounded-xl ${className}`}>
        <p className="text-sm text-muted-foreground">Map unavailable</p>
      </div>
    );
  }

  return (
    <div className={`relative rounded-xl overflow-hidden ${className}`}>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-secondary">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}
      <div ref={mapRef} className="w-full h-full" />
    </div>
  );
}
