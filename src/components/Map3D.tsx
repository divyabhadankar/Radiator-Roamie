import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Loader2 } from "lucide-react";

interface Map3DProps {
  lat: number;
  lng: number;
  name?: string;
  zoom?: number;
  className?: string;
}

export default function Map3D({ lat, lng, name, zoom = 15, className = "" }: Map3DProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!mapRef.current) return;

    // Clean up previous map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "&copy; OpenStreetMap contributors",
          },
          terrain: {
            type: "raster-dem",
            tiles: [
              "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            encoding: "terrarium",
          },
        },
        layers: [
          {
            id: "osm",
            type: "raster",
            source: "osm",
          },
        ],
        terrain: {
          source: "terrain",
          exaggeration: 1.5,
        },
      },
      center: [lng, lat],
      zoom,
      pitch: 60,
      bearing: -20,
      antialias: true,
    });

    mapInstanceRef.current = map;

    map.on("load", () => {
      setLoading(false);

      // Add marker
      const el = document.createElement("div");
      el.className = "map3d-marker";
      el.style.cssText =
        "width:32px;height:32px;background:#ef4444;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;";

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);

      if (name) {
        const popup = new maplibregl.Popup({ offset: 20 }).setHTML(
          `<div style="padding:6px 10px;font-weight:600;font-size:13px;">${name}</div>`
        );
        marker.setPopup(popup).togglePopup();
      }
    });

    // Add nav controls
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [lat, lng, zoom, name]);

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
