import path from "node:path";
import { readAreas } from "../geom/geojson.js";
import { R } from "../render/palette.js";
import { Pattern } from "../scene/kinds.js";
import { OHIO_RIVER } from "../scene/styles.js";
import { overture } from "../sources/overture.js";
import { overtureAreas } from "../sources/overtureAreas.js";
import { publishedAreas } from "../sources/publishedAreas.js";
import { CURATED } from "./tinyphl.places.js";
import { sectioned } from "./sections.js";
import type { Areas, City } from "./types.js";

/** The parts of town Philadelphians name, by the city's own neighbourhoods. */
export const SECTIONS: Record<string, readonly string[]> = {
  "Center City": [
    "Center City East",
    "Chinatown",
    "Fitler Square",
    "Logan Square",
    "Old City",
    "Rittenhouse",
    "Society Hill",
    "Washington Square West",
  ],
  "South Philadelphia": [
    "Bella Vista",
    "Dickinson Narrows",
    "East Passyunk",
    "Girard Estates",
    "Graduate Hospital",
    "Grays Ferry",
    "Greenwich",
    "Industrial",
    "Lower Moyamensing",
    "Navy Yard",
    "Newbold",
    "Packer Park",
    "Passyunk Square",
    "Pennsport",
    "Point Breeze",
    "Queen Village",
    "Stadium District",
    "West Passyunk",
    "Whitman",
  ],
  "University City": [
    "Cedar Park",
    "Garden Court",
    "Powelton",
    "Spruce Hill",
    "University City",
    "Walnut Hill",
    "West Powelton",
    "Woodland Terrace",
  ],
  "West Philadelphia": [
    "Belmont",
    "Carroll Park",
    "Cobbs Creek",
    "Dunlap",
    "East Parkside",
    "Haddington",
    "Haverford North",
    "Mantua",
    "Mill Creek",
    "Overbrook",
    "West Parkside",
    "Wynnefield",
    "Wynnefield Heights",
  ],
  "Southwest Philadelphia": [
    "Airport",
    "Bartram Village",
    "Eastwick",
    "Elmwood",
    "Kingsessing",
    "Paschall",
    "Penrose",
    "Southwest Schuylkill",
  ],
  Fairmount: ["Brewerytown", "Fairmount", "Francisville", "Spring Garden"],
  "Fairmount Park": ["East Park", "West Park"],
  "North Philadelphia": [
    "Fairhill",
    "Hartranft",
    "Ludlow",
    "North Central",
    "Sharswood",
    "Stanton",
    "Strawberry Mansion",
    "West Poplar",
    "Yorktown",
  ],
  "Northern Liberties": ["Callowhill", "East Poplar", "Northern Liberties"],
  "River Wards": [
    "East Kensington",
    "Fishtown - Lower Kensington",
    "Harrowgate",
    "Old Kensington",
    "Port Richmond",
    "Richmond",
    "Upper Kensington",
    "West Kensington",
  ],
};

/**
 * Philadelphia's neighbourhoods as its people name them (OpenDataPhilly's outlines) and the parts
 * of town they make up, as districts; Camden and the other towns across the rivers as districts
 * of their own, with Camden's neighbourhoods (Overture's) as outlines. Overture's few Philadelphia
 * neighbourhoods ("South Philadelphia") would sit over the city's own, so they are left out.
 */
export function areas(rawDir: string): Areas {
  const overture = readAreas(path.join(rawDir, "areas.geojson"));
  const city = sectioned({
    neighbourhoods: readAreas(path.join(rawDir, "neighborhoods.geojson")),
    nameOf: (f) => String(f.properties.MAPNAME ?? f.properties.LISTNAME),
    sections: SECTIONS,
    fallback: "Philadelphia",
    towns: overture.filter((f) => f.properties.kind === "locality" && f.properties.name !== "Philadelphia"),
    bbox: tinyphl.bbox,
  });
  return {
    districts: city.districts,
    hoods: [
      ...city.hoods,
      ...overture
        .filter((f) => f.properties.kind === "hood" && f.properties.district !== "Philadelphia")
        .map((f) => ({
          name: String(f.properties.name),
          district: String(f.properties.district ?? "Camden"),
          polygons: f.polygons,
        })),
    ],
  };
}

/**
 * Philadelphia, Pennsylvania: Center City between the Delaware and the Schuylkill, Old City and Society Hill, University City, Fairmount and the Parkway, and South Philadelphia down to the stadiums. (The id is the airport's code.)
 */
export const tinyphl: City = {
  id: "tinyphl",
  title: "Philadelphia",
  origin: { lon: -75.16352, lat: 39.95234 },
  betaDeg: -8.1,
  k: 2,
  // north past 40°: Overture's land comes in one-degree tiles, and the fog's margin needs the next one
  bbox: { west: -75.235, south: 39.895, east: -75.105, north: 40.003 },
  start: { lon: -75.1636, lat: 39.9526, scale: 1 },
  maxScale: 3,
  attribution: [
    "© OpenStreetMap contributors",
    "Overture Maps Foundation",
    "Neighborhoods: Abaca Labs, OpenDataPhilly (CC BY 4.0)",
  ],
  // order matters: the areas are cut from Overture's divisions
  sources: [
    overture,
    overtureAreas(),
    publishedAreas({
      name: "philly-neighborhoods",
      url: "https://raw.githubusercontent.com/opendataphilly/open-geo-data/master/philadelphia-neighborhoods/philadelphia-neighborhoods.geojson",
      file: "neighborhoods.geojson",
    }),
  ],
  accent: "#5b7cfa",
  card: { lon: -75.1683, lat: 39.9552, shrink: 3.9 },

  limits: {
    kind: "built-up",
    parks: ["West Fairmount Park", "East Fairmount Park", "Franklin Delano Roosevelt Park"],
  },
  fog: { start: 900, end: 1900 },
  areas,

  heights: { storey: 3.6, raster: false },
  style: OHIO_RIVER,
  landmarks: {
    "comcast technology center": { wall: R.glassSilver, roof: R.roofSilver, pattern: Pattern.Curtain },
    "comcast center": { wall: R.glassBlue, roof: R.glassBlue, pattern: Pattern.Curtain },
    // the two Liberty Places with their spires, after the Chrysler's
    "one liberty place": { wall: R.glassBlue, roof: R.glassBlue, pattern: Pattern.Curtain, pyramid: 0.22 },
    "two liberty place": { wall: R.glassBlue, roof: R.glassBlue, pattern: Pattern.Curtain, pyramid: 0.14 },
    "fmc tower": { wall: R.glassSilver, roof: R.roofSilver, pattern: Pattern.Curtain },
    "bny mellon center": { wall: R.rose, roof: R.rose, pattern: Pattern.Tall, pyramid: 0.08 },
    "three logan square": { wall: R.greyStone, roof: R.greyStone, pattern: Pattern.Tall, pyramid: 0.06 },
    // City Hall's white marble and granite; the Art Museum's golden dolomite
    "philadelphia city hall": { wall: R.whiteBrick, roof: R.roofSlate, pattern: Pattern.Tall },
    "philadelphia museum of art": { wall: R.tan, roof: R.roofCopper, pattern: Pattern.Tall },
    "independence hall": { wall: R.brickRed, roof: R.roofSlate, pattern: Pattern.Punched },
    "william h. gray iii 30th street station": {
      wall: R.limestone,
      roof: R.roofGravel,
      pattern: Pattern.Tall,
    },
  },
  // mapped far too low: the museum stands about this tall, Independence Hall to its eaves
  heightFixes: { "philadelphia museum of art": 28, "independence hall": 14 },
  statues: [],
  // one small house in Camden is mapped 434 m tall
  heightCaps: [{ lon: -75.12332, lat: 39.93088, radius: 25, max: 15 }],
  // the rivers run inside the land polygons: their bridges rise over them
  riverBridges: true,
  sights: {
    placeWords: ["Philadelphia", "Pennsylvania", "Philly", "Camden", "New Jersey", "Delaware Valley"],
    // the context lines say "Rittenhouse" or "Old City": a question's area is its town
    areaByDistrict: true,
    // its curated name is the walkways'; the article's is the full one
    // the articles a nearby title match misses: another name, a longer title, or too far from the
    // building's point
    wikipedia: {
      "ben franklin bridge": "Benjamin Franklin Bridge",
      "one liberty place": "One Liberty Place",
      "two liberty place": "Two Liberty Place",
      "franklin institute": "The Franklin Institute",
      "william h. gray iii 30th street station": "30th Street Station",
      "fmc tower": "FMC Tower at Cira Centre South",
      "christ church philadelphia": "Christ Church, Philadelphia",
      "cathedral of saints peter and paul": "Cathedral Basilica of Saints Peter and Paul",
      "elfreth's alley museum": "Elfreth's Alley",
      "wanamaker building": "Wanamaker Building",
    },
    // the other names their openings give, which would give them away
    aliases: {
      "ben franklin bridge": ["Benjamin Franklin Bridge", "Delaware River Bridge"],
      "three logan square": ["Bell Atlantic Tower"],
      "g. fred dibona jr. building": ["Blue Cross-Blue Shield Tower", "IBX Tower"],
      "one south broad": ["Lincoln-Liberty Building", "PNB Building"],
      "jefferson tower": ["Aramark Tower", "One Reading Center"],
      "inquirer building": ["Elverson Building"],
      "psfs building": ["Loews Philadelphia Hotel"],
      "laurel hill mansion": ["Randolph House"],
      "university of pennsylvania graduate school of education": ["Penn GSE"],
    },
  },
  roofs: { waterTanks: false },
  // no street-tree survey: the streets are lined by rule
  trees: { street: { spacing: 13, chance: 0.3 } },
  flora: "temperate",
  ground: {},

  curated: CURATED,
  flights: [],
  search: {
    districtOnly: false,
    bridge: /bridge/i,
    stationSuffix: " station",
    districtRank: 80,
    namedBuildings: {
      minHeight: 60,
      classes: ["church", "civic", "public", "government", "university", "college", "library"],
    },
  },
};
