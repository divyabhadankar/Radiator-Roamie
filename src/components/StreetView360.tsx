import { X, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";

interface StreetView360Props {
  lat: number;
  lng: number;
  name: string;
  onClose: () => void;
}

export default function StreetView360({ lat, lng, name, onClose }: StreetView360Props) {
  const [heading, setHeading] = useState(0);
  const [fov, setFov] = useState(90);

  const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}&heading=${heading}&pitch=0&fov=${fov}`;

  const embedUrl = `https://maps.google.com/maps?q=&layer=c&cbll=${lat},${lng}&cbp=12,${heading},0,0,0&output=svembed`;

  return (
    <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <RotateCcw className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-white text-sm font-semibold">{name}</h3>
            <p className="text-white/50 text-xs">360° Street View • {lat.toFixed(4)}°N, {lng.toFixed(4)}°E</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Rotation controls */}
          <div className="flex items-center gap-1 bg-white/10 rounded-lg px-2 py-1">
            <button
              onClick={() => setHeading((h) => (h - 45 + 360) % 360)}
              className="p-1 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors"
              title="Rotate left"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <span className="text-white/60 text-xs font-mono min-w-[32px] text-center">{heading}°</span>
            <button
              onClick={() => setHeading((h) => (h + 45) % 360)}
              className="p-1 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors"
              title="Rotate right"
            >
              <RotateCcw className="w-3.5 h-3.5 scale-x-[-1]" />
            </button>
          </div>
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-white/10 rounded-lg px-2 py-1">
            <button
              onClick={() => setFov((f) => Math.min(120, f + 15))}
              className="p-1 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setFov((f) => Math.max(30, f - 15))}
              className="p-1 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 360° View iframe */}
      <div className="flex-1 relative">
        <iframe
          src={embedUrl}
          className="w-full h-full border-0"
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title={`360° view of ${name}`}
        />

        {/* Bottom info bar */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md rounded-xl px-5 py-2.5 flex items-center gap-4 border border-white/10">
          <span className="text-white text-xs font-medium">🌐 360° Street View</span>
          <span className="text-white/50 text-xs">Drag to look around • Scroll to zoom</span>
          <a
            href={streetViewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary text-xs font-semibold hover:underline"
          >
            Open in Google Maps ↗
          </a>
        </div>
      </div>
    </div>
  );
}
