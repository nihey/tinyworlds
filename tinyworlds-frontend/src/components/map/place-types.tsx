import {
  Building2,
  Landmark,
  MapPin,
  Palette,
  Signpost,
  TrainFront,
  Trees,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import type { Strings } from "@/i18n";
import type { PlaceType } from "@/map/manifest";
import type { WorldCopy } from "@/worlds";

/** A suspension bridge, drawn to sit with the lucide set. */
function BridgeIcon(props: LucideProps) {
  const { size = 24, strokeWidth = 2, ...rest } = props;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <path d="M2 16h20" />
      <path d="M6 20V6" />
      <path d="M18 20V6" />
      <path d="M6 7c2 5 10 5 12 0" />
      <path d="M2 11c1.5-.5 3-2 4-4" />
      <path d="M22 11c-1.5-.5-3-2-4-4" />
      <path d="M10 10.4V16" />
      <path d="M14 10.4V16" />
    </svg>
  );
}

interface PlaceTypeMeta {
  icon: LucideIcon | typeof BridgeIcon;
  /** bullet colour and the colour of the glyph on it */
  color: string;
  ink: string;
  /** how much ground to show when flying there, in metres across the shorter side of the view */
  span: number;
}

export const PLACE_TYPES: Record<PlaceType, PlaceTypeMeta> = {
  borough: { icon: Building2, color: "#f4f2ec", ink: "#15171a", span: 16000 },
  hood: { icon: Signpost, color: "#f7c21b", ink: "#1a1503", span: 2600 },
  landmark: { icon: Landmark, color: "#ef5b4c", ink: "#fff7f5", span: 520 },
  park: { icon: Trees, color: "#3faa6c", ink: "#f3fff8", span: 1500 },
  bridge: { icon: BridgeIcon, color: "#f08c2e", ink: "#1f1203", span: 1700 },
  museum: { icon: Palette, color: "#a57bf2", ink: "#fbf8ff", span: 520 },
  station: { icon: TrainFront, color: "#4b93f0", ink: "#f5f9ff", span: 520 },
  street: { icon: MapPin, color: "#8f949b", ink: "#101214", span: 1000 },
  place: { icon: MapPin, color: "#8f949b", ink: "#101214", span: 520 },
};

export function placeMeta(type: PlaceType): PlaceTypeMeta {
  return PLACE_TYPES[type] ?? PLACE_TYPES.place;
}

/** What a kind of place is called, in the visitor's language; a "borough" in the city's own terms. */
export function placeLabel(type: PlaceType, t: Strings, copy: WorldCopy): string {
  if (type === "borough") return copy.borough;
  return t.placeTypes[type] ?? t.placeTypes.place;
}

/** The round badge in front of a search result. */
export function PlaceBullet({ type, className }: { type: PlaceType; className?: string }) {
  const meta = placeMeta(type);
  const Icon = meta.icon;
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 26,
        height: 26,
        flexShrink: 0,
        borderRadius: 9999,
        background: meta.color,
        color: meta.ink,
      }}
    >
      <Icon size={14} strokeWidth={2.4} />
    </span>
  );
}
