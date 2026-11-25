import { EN_RULES } from "@/map/search-rules";
import type { World } from "./types";

export const tinyaus: World = {
  id: "tinyaus",
  wordmark: "aus",
  homeLocale: "en-US",
  turn: "grid",
  walk: true,
  sights: true,
  quiz: true,
  units: "imperial",
  // The music and nightlife blocks along East Sixth Street.
  billboards: [{ lon: -97.73955, lat: 30.26709, radius: 150 }],
  copy: {
    "en-US": {
      city: "Austin",
      card: "The Capitol, the downtown skyline and the shores of Lady Bird Lake.",
      title: "tinyaus · Austin, pocket-sized",
      description:
        "Explore Austin, Texas, as an isometric pixel-art city. Find landmarks from the Capitol to Barton Springs, or take the controls in Street Walk.",
      cardAlt:
        "Downtown Austin and the Congress Avenue Bridge over Lady Bird Lake in isometric pixel art",
      tagline: "Austin, pocket-sized",
      about: {
        intro:
          "An isometric pixel-art map of Austin drawn from open data, from the neighborhoods around Lake Austin to Austin–Bergstrom International Airport. Building heights use the mapped height or floor count where available.",
        notes: [
          "Use the compass to switch between north up and the downtown grid along Congress Avenue.",
          "Open Street Walk to explore at street level, on foot, at the wheel or on the water.",
        ],
      },
      hoodLines: { label: "Neighborhood lines", inSentence: "neighborhood lines" },
      borough: "Area",
      mapLabel: "Isometric pixel-art map of Austin. Drag to move, scroll or pinch to zoom.",
      searchPlaceholder: "Search Austin",
      splash: "Drawing the skyline…",
    },
    "pt-BR": {
      city: "Austin",
      card: "O Capitólio, os arranha-céus do centro e as margens do lago Lady Bird.",
      title: "tinyaus · Austin, em miniatura",
      description:
        "Explore Austin, no Texas, em pixel art isométrica. Encontre pontos turísticos do Capitólio a Barton Springs ou assuma os controles no passeio pelas ruas.",
      cardAlt:
        "O centro de Austin e a ponte da avenida Congress sobre o lago Lady Bird em pixel art isométrica",
      tagline: "Austin, em miniatura",
      about: {
        intro:
          "Um mapa isométrico de Austin em pixel art, feito com dados abertos, dos bairros ao redor do lago Austin ao aeroporto internacional Austin–Bergstrom. Quando disponíveis, usamos as alturas e o número de andares registrados nos dados.",
        notes: [
          "Use a bússola para alternar entre o norte para cima e o alinhamento das ruas do centro pela avenida Congress.",
          "Abra o passeio pelas ruas para explorar no nível da rua, a pé, ao volante ou pela água.",
        ],
      },
      hoodLines: { label: "Linhas dos bairros", inSentence: "as linhas dos bairros" },
      borough: "Região",
      mapLabel:
        "Mapa isométrico em pixel art de Austin. Arraste para mover; role ou faça o gesto de pinça para dar zoom.",
      searchPlaceholder: "Buscar em Austin",
      splash: "Desenhando a cidade…",
    },
    "es-ES": {
      city: "Austin",
      card: "El Capitolio, los rascacielos del centro y las orillas del lago Lady Bird.",
      title: "tinyaus · Austin, en miniatura",
      description:
        "Explora Austin, Texas, en pixel art isométrico. Encuentra lugares desde el Capitolio hasta Barton Springs o toma los mandos en el paseo a pie de calle.",
      cardAlt:
        "El centro de Austin y el puente de Congress Avenue sobre el lago Lady Bird en pixel art isométrico",
      tagline: "Austin, en miniatura",
      about: {
        intro:
          "Un mapa isométrico de Austin en pixel art hecho con datos abiertos, desde los barrios alrededor del lago Austin hasta el aeropuerto internacional Austin–Bergstrom. Las alturas se basan en las medidas y el número de plantas disponibles.",
        notes: [
          "Usa la brújula para alternar entre el norte arriba y la cuadrícula del centro, alineada con Congress Avenue.",
          "Abre el paseo a pie de calle para explorar a pie, al volante o por el agua.",
        ],
      },
      hoodLines: { label: "Límites de barrios", inSentence: "los límites de los barrios" },
      borough: "Zona",
      mapLabel:
        "Mapa isométrico en pixel art de Austin. Arrastra para moverte; usa la rueda o pellizca para hacer zoom.",
      searchPlaceholder: "Buscar en Austin",
      splash: "Dibujando la ciudad…",
    },
  },
  credit: "© OpenStreetMap · Overture Maps · City of Austin Open Data",
  accent: { color: "#ef8a48", ink: "#201008" },
  search: {
    ...EN_RULES,
    home: ["austin", "atx", "texas", "tx", "usa", "united states"],
  },
};
