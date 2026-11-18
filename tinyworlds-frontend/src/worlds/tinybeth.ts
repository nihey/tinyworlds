import { EN_RULES } from "@/map/search-rules";
import type { World } from "./types";

export const tinybeth: World = {
  id: "tinybeth",
  wordmark: "beth",
  homeLocale: "en-US",
  turn: "grid",
  walk: true,
  sights: true,
  quiz: true,
  units: "imperial",
  copy: {
    "en-US": {
      city: "Bethlehem, Pennsylvania",
      card: "Across the Lehigh River, from Historic Bethlehem to SteelStacks and Lehigh University.",
      title: "tinybeth · Bethlehem, Pennsylvania, pocket-sized",
      description:
        "Explore Bethlehem, Pennsylvania, in isometric pixel art, from the historic Moravian settlement to the former blast furnaces at SteelStacks.",
      cardAlt: "SteelStacks and the Lehigh River in isometric pixel art",
      tagline: "Bethlehem, pocket-sized",
      about: {
        intro:
          "An isometric pixel-art map of Bethlehem, Pennsylvania, drawn from open data. Follow the Lehigh River from the Moravian settlement on the North Side to SteelStacks and Lehigh University on the South Side.",
        notes: [
          "Building heights come from the map data or are estimated from floor counts and footprints. The blast furnaces use simplified shapes.",
          "Use the compass to align the map with downtown's streets. Open Street Walk to explore at street level.",
        ],
      },
      hoodLines: { label: "District lines", inSentence: "district lines" },
      borough: "Area",
      mapLabel:
        "Isometric pixel-art map of Bethlehem, Pennsylvania. Drag to move, scroll or pinch to zoom.",
      searchPlaceholder: "Search Bethlehem",
      splash: "Drawing the Lehigh River…",
    },
    "pt-BR": {
      city: "Bethlehem",
      card: "Pelo rio Lehigh, do centro histórico de Bethlehem até SteelStacks e a Universidade Lehigh.",
      title: "tinybeth · Bethlehem, Pensilvânia, em miniatura",
      description:
        "Explore Bethlehem, na Pensilvânia, em pixel art isométrica, do assentamento histórico morávio aos antigos altos-fornos de SteelStacks.",
      cardAlt: "SteelStacks e o rio Lehigh em pixel art isométrica",
      tagline: "Bethlehem, em miniatura",
      about: {
        intro:
          "Um mapa isométrico em pixel art de Bethlehem, na Pensilvânia, feito com dados abertos. Siga o rio Lehigh do assentamento morávio no lado norte até SteelStacks e a Universidade Lehigh no lado sul.",
        notes: [
          "As alturas dos prédios vêm dos dados do mapa ou são estimadas pelo número de andares e pelo contorno dos edifícios. Os altos-fornos têm formas simplificadas.",
          "Use a bússola para alinhar o mapa com as ruas do centro. Abra o passeio pelas ruas para explorar ao nível da rua.",
        ],
      },
      hoodLines: { label: "Limites dos distritos", inSentence: "os limites dos distritos" },
      borough: "Região",
      mapLabel:
        "Mapa isométrico em pixel art de Bethlehem, na Pensilvânia. Arraste para mover. Role ou faça o gesto de pinça para dar zoom.",
      searchPlaceholder: "Buscar em Bethlehem",
      splash: "Desenhando o rio Lehigh…",
    },
    "es-ES": {
      city: "Bethlehem",
      card: "Por el río Lehigh, desde el casco histórico de Bethlehem hasta SteelStacks y la Universidad de Lehigh.",
      title: "tinybeth · Bethlehem, Pensilvania, en miniatura",
      description:
        "Explora Bethlehem, Pensilvania, en pixel art isométrico, desde el asentamiento histórico moravo hasta los antiguos altos hornos de SteelStacks.",
      cardAlt: "SteelStacks y el río Lehigh en pixel art isométrico",
      tagline: "Bethlehem, en miniatura",
      about: {
        intro:
          "Un mapa isométrico en pixel art de Bethlehem, Pensilvania, hecho con datos abiertos. Sigue el río Lehigh desde el asentamiento moravo en el lado norte hasta SteelStacks y la Universidad de Lehigh en el lado sur.",
        notes: [
          "Las alturas de los edificios proceden de los datos del mapa o se estiman a partir del número de plantas y del contorno de los edificios. Los altos hornos tienen formas simplificadas.",
          "Usa la brújula para alinear el mapa con las calles del centro. Abre el paseo para explorar a pie de calle.",
        ],
      },
      hoodLines: { label: "Límites de distritos", inSentence: "los límites de los distritos" },
      borough: "Zona",
      mapLabel:
        "Mapa isométrico en pixel art de Bethlehem, Pensilvania. Arrastra para moverte. Usa la rueda o pellizca para hacer zoom.",
      searchPlaceholder: "Buscar en Bethlehem",
      splash: "Dibujando el río Lehigh…",
    },
  },
  credit: "© OpenStreetMap · Overture Maps",
  accent: { color: "#ed996c", ink: "#27140d" },
  search: {
    ...EN_RULES,
    home: ["bethlehem", "bethlehem pa", "bethlehem pennsylvania", "pennsylvania", "pa"],
  },
};
