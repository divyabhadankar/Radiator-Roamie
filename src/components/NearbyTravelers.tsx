import { useState, useEffect, useRef, useCallback } from "react";
import {
  MapPin,
  Navigation,
  Users,
  Radio,
  Locate,
  LocateOff,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTrips } from "@/hooks/useTrips";

// ── Types ──────────────────────────────────────────────────────────────────

interface TripBrief {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
}

interface NearbyPresence {
  userId: string;
  userName: string;
  lat: number;
  lng: number;
  timestamp: number;
  trips: TripBrief[];
}

interface NearbyTraveler extends NearbyPresence {
  distanceKm: number;
  color: string;
  initials: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const RADIUS_KM = 1;
const CHANNEL_NAME = "nearby-travelers-global";
const COLORS = [
  "#f97316", "#3b82f6", "#10b981", "#8b5cf6",
  "#ec4899", "#f59e0b", "#06b6d4", "#ef4444",
];

// ── Helpers ────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h << 5) - h + userId.charCodeAt(i);
    h |= 0;
  }
  return COLORS[Math.abs(h) % COLORS.length];
}

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function fmtDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`;
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
}

// ── Auto-fit bounds helper ─────────────────────────────────────────────────

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14, { animate: true });
      return;
    }
    map.fitBounds(points as LatLngBoundsExpression, { padding: [32, 32], maxZoom: 16, animate: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(points)]);
  return null;
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function NearbyTravelers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: myTrips = [] } = useTrips();

  const [broadcasting, setBroadcasting] = useState(false);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [nearby, setNearby] = useState<NearbyTraveler[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [channelReady, setChannelReady] = useState(false);

  const watchRef = useRef<number | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const broadcastingRef = useRef(false);

  const userName =
    user?.user_metadata?.name || user?.email?.split("@")[0] || "Traveler";

  // ── Build presence payload ───────────────────────────────────────────────

  const buildPayload = useCallback(
    (lat: number, lng: number): NearbyPresence => ({
      userId: user!.id,
      userName,
      lat,
      lng,
      timestamp: Date.now(),
      trips: myTrips.map((t) => ({
        id: t.id,
        name: t.name,
        destination: t.destination,
        start_date: t.start_date,
        end_date: t.end_date,
      })),
    }),
    [user, userName, myTrips],
  );

  // ── Subscribe to presence channel ───────────────────────────────────────

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel(CHANNEL_NAME, {
      config: { presence: { key: user.id } },
    });
    channelRef.current = channel;

    const syncNearby = (myLat: number, myLng: number) => {
      const state = channel.presenceState<NearbyPresence>();
      const travelers: NearbyTraveler[] = [];

      for (const [uid, presences] of Object.entries(state)) {
        if (uid === user.id) continue;
        const latest = (presences as NearbyPresence[]).sort(
          (a, b) => b.timestamp - a.timestamp,
        )[0];
        if (!latest?.lat || !latest?.lng) continue;

        const dist = haversineKm(myLat, myLng, latest.lat, latest.lng);
        if (dist > RADIUS_KM) continue;

        travelers.push({
          ...latest,
          distanceKm: dist,
          color: getColor(uid),
          initials: getInitials(latest.userName ?? "T"),
        });
      }

      travelers.sort((a, b) => a.distanceKm - b.distanceKm);
      setNearby(travelers);
    };

    channel
      .on("presence", { event: "sync" }, () => {
        if (myLocation) syncNearby(myLocation.lat, myLocation.lng);
      })
      .on("presence", { event: "join" }, ({ newPresences }) => {
        const p = (newPresences as NearbyPresence[])[0];
        if (!p || p.userId === user.id || !myLocation) return;
        const dist = haversineKm(myLocation.lat, myLocation.lng, p.lat, p.lng);
        if (dist <= RADIUS_KM) {
          toast({
            title: `📍 ${p.userName} is nearby!`,
            description:
              p.trips.length > 0
                ? `Going to ${p.trips.map((t) => t.destination).join(", ")}`
                : "A traveler is within 1 km of you",
          });
        }
      })
      .subscribe((status) => {
        setChannelReady(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setChannelReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Re-sync nearby whenever myLocation updates
  useEffect(() => {
    if (!myLocation || !channelRef.current) return;
    const state = channelRef.current.presenceState<NearbyPresence>();
    const travelers: NearbyTraveler[] = [];

    for (const [uid, presences] of Object.entries(state)) {
      if (uid === user?.id) continue;
      const latest = (presences as NearbyPresence[]).sort(
        (a, b) => b.timestamp - a.timestamp,
      )[0];
      if (!latest?.lat || !latest?.lng) continue;

      const dist = haversineKm(myLocation.lat, myLocation.lng, latest.lat, latest.lng);
      if (dist > RADIUS_KM) continue;

      travelers.push({
        ...latest,
        distanceKm: dist,
        color: getColor(uid),
        initials: getInitials(latest.userName ?? "T"),
      });
    }

    travelers.sort((a, b) => a.distanceKm - b.distanceKm);
    setNearby(travelers);
  }, [myLocation, user?.id]);

  // ── Start broadcasting ───────────────────────────────────────────────────

  const startBroadcast = useCallback(() => {
    if (!navigator.geolocation) {
      toast({
        title: "Geolocation not supported",
        description: "Your browser doesn't support location sharing.",
        variant: "destructive",
      });
      return;
    }
    if (!channelReady) {
      toast({
        title: "Connecting…",
        description: "Please wait a moment then try again.",
      });
      return;
    }

    broadcastingRef.current = true;
    setBroadcasting(true);

    const publish = (lat: number, lng: number) => {
      setMyLocation({ lat, lng });
      channelRef.current?.track(buildPayload(lat, lng)).catch(console.warn);
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => publish(pos.coords.latitude, pos.coords.longitude),
      (err) => {
        broadcastingRef.current = false;
        setBroadcasting(false);
        toast({
          title: "Location error",
          description:
            err.code === 1
              ? "Please allow location access in browser settings."
              : "Could not get your position.",
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (!broadcastingRef.current) return;
        publish(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        broadcastingRef.current = false;
        setBroadcasting(false);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
  }, [channelReady, buildPayload, toast]);

  // ── Stop broadcasting ────────────────────────────────────────────────────

  const stopBroadcast = useCallback(async () => {
    broadcastingRef.current = false;
    setBroadcasting(false);
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    try {
      await channelRef.current?.untrack();
    } catch {
      /* ignore */
    }
  }, []);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      broadcastingRef.current = false;
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
      }
    };
  }, []);

  // ── Map points ───────────────────────────────────────────────────────────

  const allPoints: [number, number][] = [];
  if (myLocation) allPoints.push([myLocation.lat, myLocation.lng]);
  nearby.forEach((t) => allPoints.push([t.lat, t.lng]));
  const mapCenter: [number, number] = allPoints[0] ?? [20.5937, 78.9629];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Users className="w-4 h-4 text-primary" />
            {nearby.length > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full flex items-center justify-center text-[8px] text-white font-bold">
                {nearby.length}
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-card-foreground">
            Nearby Travelers
          </h3>
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            within 1 km
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Broadcast toggle */}
          <button
            onClick={broadcasting ? stopBroadcast : startBroadcast}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
              broadcasting
                ? "bg-orange-500/10 text-orange-600 hover:bg-orange-500/20"
                : "bg-primary/10 text-primary hover:bg-primary/20"
            }`}
            title={broadcasting ? "Stop sharing your location" : "Share your location to discover nearby travelers"}
          >
            {broadcasting ? (
              <>
                <Radio className="w-3 h-3 animate-pulse" />
                Live
              </>
            ) : (
              <>
                <Locate className="w-3 h-3" />
                Share
              </>
            )}
          </button>

          {/* Expand / collapse */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Status bar */}
      {!broadcasting && (
        <div className="px-4 py-2 bg-muted/50 border-b border-border">
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <LocateOff className="w-3 h-3" />
            Click <strong>Share</strong> to broadcast your location and discover travelers near you
          </p>
        </div>
      )}

      {broadcasting && nearby.length === 0 && (
        <div className="px-4 py-2 bg-orange-500/5 border-b border-border">
          <p className="text-[11px] text-orange-600 flex items-center gap-1">
            <Radio className="w-3 h-3 animate-pulse" />
            Broadcasting — no other travelers within 1 km yet
          </p>
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div>
          {/* Mini map */}
          {myLocation && (
            <div className="h-44 w-full border-b border-border">
              <MapContainer
                center={mapCenter}
                zoom={14}
                className="w-full h-full"
                zoomControl={false}
                attributionControl={false}
                scrollWheelZoom={false}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                {/* Self */}
                <CircleMarker
                  center={[myLocation.lat, myLocation.lng]}
                  radius={10}
                  pathOptions={{ fillColor: "#3b82f6", fillOpacity: 0.9, color: "#fff", weight: 2.5 }}
                >
                  <Popup>
                    <span className="text-xs font-semibold">📍 You</span>
                  </Popup>
                </CircleMarker>

                {/* Nearby travelers */}
                {nearby.map((t) => (
                  <CircleMarker
                    key={t.userId}
                    center={[t.lat, t.lng]}
                    radius={9}
                    pathOptions={{ fillColor: t.color, fillOpacity: 0.92, color: "#fff", weight: 2 }}
                  >
                    <Popup minWidth={180}>
                      <div className="text-xs space-y-1">
                        <p className="font-bold text-sm">{t.userName}</p>
                        <p className="text-muted-foreground">{fmtDist(t.distanceKm)} away</p>
                        {t.trips.length === 0 ? (
                          <p className="text-muted-foreground italic">No active trips</p>
                        ) : (
                          <div className="space-y-1 mt-1">
                            {t.trips.map((trip) => (
                              <div key={trip.id} className="bg-orange-50 rounded p-1.5 border border-orange-100">
                                <p className="font-semibold text-orange-700 flex items-center gap-1">
                                  <Navigation className="w-3 h-3" />
                                  {trip.destination}
                                </p>
                                <p className="text-[10px] text-gray-500">{trip.name}</p>
                                <p className="text-[10px] text-gray-400">
                                  {fmtDate(trip.start_date)} → {fmtDate(trip.end_date)}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}

                <FitBounds points={allPoints} />
              </MapContainer>
            </div>
          )}

          {/* Traveler list */}
          <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
            {nearby.length === 0 ? (
              <div className="text-center py-4">
                <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                <p className="text-xs text-muted-foreground">
                  {broadcasting
                    ? "No travelers found within 1 km yet"
                    : "Share your location to see nearby travelers"}
                </p>
              </div>
            ) : (
              nearby.map((t) => (
                <div
                  key={t.userId}
                  className="flex items-start gap-2.5 p-2 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                >
                  {/* Avatar */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style={{ backgroundColor: t.color }}
                  >
                    {t.initials}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-card-foreground truncate">
                        {t.userName}
                      </p>
                      <span className="text-[10px] text-muted-foreground ml-1 shrink-0">
                        {fmtDist(t.distanceKm)}
                      </span>
                    </div>

                    {/* All trips for this traveler */}
                    {t.trips.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground italic">No trips listed</p>
                    ) : (
                      <div className="mt-1 space-y-1">
                        {t.trips.map((trip) => (
                          <div key={trip.id} className="flex items-start gap-1">
                            <Navigation className="w-3 h-3 text-orange-500 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[11px] text-orange-600 font-medium truncate">
                                {trip.destination}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {trip.name} · {fmtDate(trip.start_date)} → {fmtDate(trip.end_date)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
