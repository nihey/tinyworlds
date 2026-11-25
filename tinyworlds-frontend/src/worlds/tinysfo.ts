import { EN_RULES } from "@/map/search-rules";
import type { World } from "./types";

export const tinysfo: World = {
  id: "tinysfo",
  wordmark: "sfo",
  homeLocale: "en-US",
  turn: "grid",
  walk: true,
  sights: true,
  quiz: true,
  units: "imperial",
  copy: {
    "en-US": {
      city: "San Francisco",
      card: "The Golden Gate Bridge, the Embarcadero and the neighborhoods between the bay and the ocean.",
      title: "tinysfo · San Francisco, pocket-sized",
      description:
        "Explore San Francisco in isometric pixel art, from the Golden Gate Bridge to the Ferry Building, or go down to street level in Street Walk.",
      cardAlt: "San Francisco Bay and the Golden Gate Bridge in isometric pixel art",
      tagline: "San Francisco, pocket-sized",
      about: {
        intro:
          "An isometric pixel-art map of San Francisco and its waterfront, drawn from open data. Explore the Presidio, Golden Gate Park, the downtown skyline and Alcatraz.",
        notes: [
          "About 94% of the building footprints come with heights. The map uses floor counts and building types to fill in missing heights. The terrain is drawn flat, including the hills.",
          "Use the compass to turn the map to the street grid. Open Street Walk to explore on foot, at the wheel or on the water.",
        ],
      },
      hoodLines: { label: "Neighborhood lines", inSentence: "neighborhood lines" },
      borough: "Area",
      mapLabel: "Isometric pixel-art map of San Francisco. Drag to move, scroll or pinch to zoom.",
      searchPlaceholder: "Search San Francisco",
      splash: "Drawing the bay…",
    },
    "pt-BR": {
      city: "São Francisco",
      card: "A ponte Golden Gate, o Embarcadero e os bairros entre a baía e o oceano.",
      title: "tinysfo · São Francisco, em miniatura",
      description:
        "Explore São Francisco em pixel art isométrica, da ponte Golden Gate ao Ferry Building, ou desça ao nível da rua no passeio pelas ruas.",
      cardAlt: "A baía de São Francisco e a ponte Golden Gate em pixel art isométrica",
      tagline: "São Francisco, em miniatura",
      about: {
        intro:
          "Um mapa isométrico em pixel art de São Francisco e sua orla, feito com dados abertos. Explore o Presidio, o parque Golden Gate, os arranha-céus do centro e Alcatraz.",
        notes: [
          "Cerca de 94% das edificações têm altura nos dados. O mapa usa o número de andares e o tipo de edifício para completar as alturas que faltam. O terreno é representado em plano, inclusive nas áreas de morros.",
          "Use a bússola para alinhar o mapa com as ruas. Abra o passeio pelas ruas para explorar a pé, ao volante ou pela água.",
        ],
      },
      hoodLines: { label: "Linhas dos bairros", inSentence: "as linhas dos bairros" },
      borough: "Região",
      mapLabel:
        "Mapa isométrico em pixel art de São Francisco. Arraste para mover. Role ou faça o gesto de pinça para dar zoom.",
      searchPlaceholder: "Buscar em São Francisco",
      splash: "Desenhando a baía…",
    },
    "es-ES": {
      city: "San Francisco",
      card: "El puente Golden Gate, el Embarcadero y los barrios entre la bahía y el océano.",
      title: "tinysfo · San Francisco, en miniatura",
      description:
        "Explora San Francisco en pixel art isométrico, desde el puente Golden Gate hasta el Ferry Building, o baja a pie de calle con el paseo.",
      cardAlt: "La bahía de San Francisco y el puente Golden Gate en pixel art isométrico",
      tagline: "San Francisco, en miniatura",
      about: {
        intro:
          "Un mapa isométrico en pixel art de San Francisco y su litoral, hecho con datos abiertos. Explora el Presidio, el parque Golden Gate, los rascacielos del centro y Alcatraz.",
        notes: [
          "Cerca del 94% de los edificios tienen altura en los datos. El mapa usa el número de plantas y el tipo de edificio para completar las alturas que faltan. El terreno se representa en plano, incluidas las colinas.",
          "Usa la brújula para alinear el mapa con las calles. Abre el paseo para explorar a pie, al volante o por el agua.",
        ],
      },
      hoodLines: { label: "Límites de barrios", inSentence: "los límites de los barrios" },
      borough: "Zona",
      mapLabel:
        "Mapa isométrico en pixel art de San Francisco. Arrastra para moverte. Usa la rueda o pellizca para hacer zoom.",
      searchPlaceholder: "Buscar en San Francisco",
      splash: "Dibujando la bahía…",
    },
  },
  credit: "© OpenStreetMap · Overture Maps · DataSF",
  accent: { color: "#f07858", ink: "#210d08" },
  search: {
    ...EN_RULES,
    home: [
      "san francisco",
      "sao francisco",
      "sf",
      "sfo",
      "california",
      "ca",
      "usa",
      "united states",
    ],
  },
};
