import type { Locale } from "@/i18n/locale";
import { EN_RULES } from "@/map/search-rules";
import type { World, WorldCopy } from "./types";

const COPY = {
  "en-US": {
    tagline: "An original isometric miniature",
    note: "An unofficial, fan-made map inspired by Rockstar Games. The geography, streets and landmarks were invented for this map.",
    hoodLines: { label: "Districts", inSentence: "the districts" },
    borough: "District",
    mapLabel: "Isometric pixel-art map. Drag to move, scroll or pinch to zoom.",
    searchPlaceholder: "Search places and districts",
    splash: "Drawing the map…",
  },
  "pt-BR": {
    tagline: "Uma miniatura isométrica original",
    note: "Mapa não oficial feito por fãs, inspirado nos jogos da Rockstar Games. A geografia, as ruas e os pontos de interesse foram inventados para este mapa.",
    hoodLines: { label: "Distritos", inSentence: "os distritos" },
    borough: "Distrito",
    mapLabel:
      "Mapa isométrico em pixel art. Arraste para mover, role ou faça o gesto de pinça para dar zoom.",
    searchPlaceholder: "Buscar lugares e distritos",
    splash: "Desenhando o mapa…",
  },
  "es-ES": {
    tagline: "Una miniatura isométrica original",
    note: "Mapa no oficial hecho por fans, inspirado en los juegos de Rockstar Games. La geografía, las calles y los puntos de interés se inventaron para este mapa.",
    hoodLines: { label: "Distritos", inSentence: "los distritos" },
    borough: "Distrito",
    mapLabel:
      "Mapa isométrico en pixel art. Arrastra para moverte, usa la rueda o pellizca para hacer zoom.",
    searchPlaceholder: "Buscar lugares y distritos",
    splash: "Dibujando el mapa…",
  },
} satisfies Record<
  Locale,
  Omit<WorldCopy, "city" | "card" | "title" | "description" | "cardAlt" | "about"> & {
    note: string;
  }
>;

export function gtaWorld(
  wordmark: string,
  city: string,
  color: string,
  captions: Record<Locale, { card: string; cardAlt: string }>,
): World {
  const id = `tiny${wordmark}`;
  const copy = (locale: Locale): WorldCopy => {
    const { note, ...labels } = COPY[locale];
    const { card, cardAlt } = captions[locale];
    return {
      ...labels,
      city,
      card,
      cardAlt,
      title: `${id} · ${city}`,
      description: `${card} ${note}`,
      about: { intro: card, notes: [note] },
    };
  };
  return {
    id,
    wordmark,
    homeLocale: "en-US",
    fictional: true,
    units: "imperial",
    copy: { "en-US": copy("en-US"), "pt-BR": copy("pt-BR"), "es-ES": copy("es-ES") },
    credit: "Fan-made · original map inspired by Rockstar Games",
    accent: { color, ink: "#15171a" },
    search: EN_RULES,
  };
}
