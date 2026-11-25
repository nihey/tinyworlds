import { EN_RULES } from "@/map/search-rules";
import type { World } from "./types";

export const tinymke: World = {
  id: "tinymke",
  wordmark: "mke",
  homeLocale: "en-US",
  turn: "grid",
  walk: true,
  sights: true,
  quiz: true,
  units: "imperial",
  copy: {
    "en-US": {
      city: "Milwaukee",
      card: "The Milwaukee River, the Historic Third Ward and the Lake Michigan waterfront.",
      title: "tinymke · Milwaukee, pocket-sized",
      description:
        "Explore Milwaukee in isometric pixel art, from City Hall to the Lake Michigan waterfront, or go down to street level in Street Walk.",
      cardAlt: "Downtown Milwaukee and its Lake Michigan waterfront in isometric pixel art",
      tagline: "Milwaukee, pocket-sized",
      about: {
        intro:
          "An isometric pixel-art map of Milwaukee drawn from open data. Follow the river through downtown and the Historic Third Ward to the harbor, or explore the Lake Michigan shore.",
        notes: [
          "About three quarters of the building footprints have a mapped height, mostly estimated by Microsoft from imagery. Where available, floor counts can raise the estimate.",
          "Use the compass to turn the map to the street grid. Open Street Walk to explore on foot, at the wheel or on the water.",
        ],
      },
      hoodLines: { label: "Neighborhood lines", inSentence: "neighborhood lines" },
      borough: "Area",
      mapLabel: "Isometric pixel-art map of Milwaukee. Drag to move, scroll or pinch to zoom.",
      searchPlaceholder: "Search Milwaukee",
      splash: "Drawing the waterfront…",
    },
    "pt-BR": {
      city: "Milwaukee",
      card: "O rio Milwaukee, o bairro histórico Third Ward e a orla do lago Michigan.",
      title: "tinymke · Milwaukee, em miniatura",
      description:
        "Explore Milwaukee em pixel art isométrica, da prefeitura à margem do lago Michigan, ou desça ao nível da rua no passeio pelas ruas.",
      cardAlt: "O centro de Milwaukee e a orla do lago Michigan em pixel art isométrica",
      tagline: "Milwaukee, em miniatura",
      about: {
        intro:
          "Um mapa isométrico em pixel art de Milwaukee, feito com dados abertos. Siga o rio pelo centro e pelo bairro histórico Third Ward até o porto ou explore a margem do lago Michigan.",
        notes: [
          "Cerca de três quartos das edificações têm altura nos dados, na maioria dos casos estimada pela Microsoft a partir de imagens. Quando registrado, o número de andares pode elevar a estimativa.",
          "Use a bússola para alinhar o mapa com as ruas. Abra o passeio pelas ruas para explorar a pé, ao volante ou pela água.",
        ],
      },
      hoodLines: { label: "Linhas dos bairros", inSentence: "as linhas dos bairros" },
      borough: "Região",
      mapLabel:
        "Mapa isométrico em pixel art de Milwaukee. Arraste para mover. Role ou faça o gesto de pinça para dar zoom.",
      searchPlaceholder: "Buscar em Milwaukee",
      splash: "Desenhando a orla…",
    },
    "es-ES": {
      city: "Milwaukee",
      card: "El río Milwaukee, el barrio histórico Third Ward y la orilla del lago Michigan.",
      title: "tinymke · Milwaukee, en miniatura",
      description:
        "Explora Milwaukee en pixel art isométrico, desde el Ayuntamiento hasta la orilla del lago Michigan, o baja a pie de calle con el paseo.",
      cardAlt: "El centro de Milwaukee y la orilla del lago Michigan en pixel art isométrico",
      tagline: "Milwaukee, en miniatura",
      about: {
        intro:
          "Un mapa isométrico en pixel art de Milwaukee hecho con datos abiertos. Sigue el río por el centro y el barrio histórico Third Ward hasta el puerto, o explora la orilla del lago Michigan.",
        notes: [
          "Cerca de tres cuartas partes de los edificios tienen altura en los datos, en su mayoría estimada por Microsoft a partir de imágenes. El número de plantas puede aumentar la estimación cuando está registrado.",
          "Usa la brújula para alinear el mapa con las calles. Abre el paseo para explorar a pie, al volante o por el agua.",
        ],
      },
      hoodLines: { label: "Límites de barrios", inSentence: "los límites de los barrios" },
      borough: "Zona",
      mapLabel:
        "Mapa isométrico en pixel art de Milwaukee. Arrastra para moverte. Usa la rueda o pellizca para hacer zoom.",
      searchPlaceholder: "Buscar en Milwaukee",
      splash: "Dibujando la orilla…",
    },
  },
  credit: "© OpenStreetMap · Overture Maps · City of Milwaukee Open Data",
  accent: { color: "#f0c879", ink: "#241708" },
  search: {
    ...EN_RULES,
    home: ["milwaukee", "mke", "wisconsin", "wi", "usa", "united states"],
  },
};
