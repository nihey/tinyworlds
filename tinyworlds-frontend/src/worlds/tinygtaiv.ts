import { gtaWorld } from "./gta";

export const tinygtaiv = {
  ...gtaWorld("gtaiv", "GTA IV", "#9cc8ee", {
    "en-US": {
      card: "A Liberty City-inspired metropolis of steel towers and tight brick neighborhoods on a winding river.",
      cardAlt:
        "Isometric metropolis with steel towers on one bank and brick neighborhoods on the other",
    },
    "pt-BR": {
      card: "Uma metrópole inspirada em Liberty City, com torres de aço e bairros de tijolo às margens de um rio sinuoso.",
      cardAlt: "Metrópole isométrica com torres de aço em uma margem e bairros de tijolo na outra",
    },
    "es-ES": {
      card: "Una metrópoli inspirada en Liberty City, con torres de acero y barrios de ladrillo junto a un río sinuoso.",
      cardAlt:
        "Metrópoli isométrica con torres de acero en una orilla y barrios de ladrillo en la otra",
    },
  }),
  walk: true,
};
