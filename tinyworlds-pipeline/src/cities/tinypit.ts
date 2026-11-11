import path from "node:path";
import { readAreas } from "../geom/geojson.js";
import { R } from "../render/palette.js";
import { Pattern } from "../scene/kinds.js";
import { OHIO_RIVER } from "../scene/styles.js";
import { overture } from "../sources/overture.js";
import { overtureAreas } from "../sources/overtureAreas.js";
import { publishedAreas } from "../sources/publishedAreas.js";
import { CURATED } from "./tinypit.places.js";
import { sectioned } from "./sections.js";
import type { Areas, City } from "./types.js";

/** The parts of town Pittsburghers name, by the city's own neighbourhoods. */
export const SECTIONS: Record<string, readonly string[]> = {
  Downtown: ["Central Business District"],
  "North Side": [
    "Allegheny Center",
    "Allegheny West",
    "Brighton Heights",
    "California-Kirkbride",
    "Central Northside",
    "Chateau",
    "East Allegheny",
    "Fineview",
    "Manchester",
    "Marshall-Shadeland",
    "North Shore",
    "Northview Heights",
    "Perry North",
    "Perry South",
    "Spring Garden",
    "Spring Hill-City View",
    "Summer Hill",
    "Troy Hill",
  ],
  "Hill District": ["Bedford Dwellings", "Crawford-Roberts", "Middle Hill", "Terrace Village", "Upper Hill"],
  "Strip District": ["Strip District"],
  "Polish Hill": ["Polish Hill"],
  Lawrenceville: ["Lower Lawrenceville", "Central Lawrenceville", "Upper Lawrenceville"],
  Oakland: ["Central Oakland", "North Oakland", "South Oakland", "West Oakland"],
  "East End": [
    "Bloomfield",
    "East Hills",
    "East Liberty",
    "Friendship",
    "Garfield",
    "Glen Hazel",
    "Greenfield",
    "Hays",
    "Hazelwood",
    "Highland Park",
    "Homewood North",
    "Homewood South",
    "Homewood West",
    "Larimer",
    "Lincoln Place",
    "Lincoln-Lemington-Belmar",
    "Morningside",
    "New Homestead",
    "Point Breeze",
    "Point Breeze North",
    "Regent Square",
    "Shadyside",
    "Squirrel Hill North",
    "Squirrel Hill South",
    "Stanton Heights",
    "Swisshelm Park",
  ],
  "South Side": ["South Side Flats", "South Side Slopes", "South Shore"],
  "Mount Washington": ["Mount Washington", "Duquesne Heights"],
  Hilltop: [
    "Allentown",
    "Arlington",
    "Arlington Heights",
    "Beltzhoover",
    "Bon Air",
    "Carrick",
    "Knoxville",
    "Mt. Oliver",
    "Overbrook",
    "St. Clair",
  ],
  "South Hills": ["Banksville", "Beechview", "Brookline"],
  "West End": [
    "Chartiers City",
    "Crafton Heights",
    "East Carnegie",
    "Elliott",
    "Esplen",
    "Fairywood",
    "Oakwood",
    "Ridgemont",
    "Sheraden",
    "West End",
    "Westwood",
    "Windgap",
  ],
};

/**
 * Pittsburgh's ninety neighbourhoods (the city's own outlines) as the outlines, the parts of town
 * they make up as districts, and the boroughs round the city (Millvale, Bellevue, Mount Oliver…)
 * as districts of their own.
 */
export function areas(rawDir: string): Areas {
  const towns = readAreas(path.join(rawDir, "areas.geojson")).filter(
    (f) => f.properties.kind === "locality" && f.properties.name !== "Pittsburgh",
  );
  return sectioned({
    neighbourhoods: readAreas(path.join(rawDir, "neighborhoods.geojson")),
    nameOf: (f) => String(f.properties.hood),
    sections: SECTIONS,
    fallback: "Pittsburgh",
    towns,
    bbox: tinypit.bbox,
  });
}

/**
 * Pittsburgh, Pennsylvania: the Golden Triangle where the Allegheny and the Monongahela make the Ohio, the North Shore, the Strip, Oakland and the hills round them. (The id is the airport's code.)
 */
export const tinypit: City = {
  id: "tinypit",
  title: "Pittsburgh",
  origin: { lon: -80.01164, lat: 40.44174 },
  betaDeg: 61,
  k: 2,
  bbox: { west: -80.07, south: 40.405, east: -79.905, north: 40.485 },
  start: { lon: -80.0035, lat: 40.44, scale: 1 },
  maxScale: 3,
  attribution: [
    "© OpenStreetMap contributors",
    "Overture Maps Foundation",
    "Neighborhoods: City of Pittsburgh, WPRDC (CC BY)",
  ],
  // order matters: the areas are cut from Overture's divisions
  sources: [
    overture,
    overtureAreas(),
    // the city's ninety neighbourhoods, with the Central Business District Overture lacks
    publishedAreas({
      name: "pittsburgh-neighborhoods",
      url: "https://data.wprdc.org/dataset/e672f13d-71c4-4a66-8f38-710e75ed80a4/resource/4af8e160-57e9-4ebf-a501-76ca1b42fc99/download/neighborhoods.geojson",
      file: "neighborhoods.geojson",
    }),
  ],
  accent: "#ffd447",
  card: { lon: -80.0062, lat: 40.4405, shrink: 3.4 },

  limits: { kind: "built-up", parks: ["Schenley Park", "Frick Park", "Highland Park", "Riverview Park"] },
  fog: { start: 900, end: 1900 },
  areas,

  heights: { storey: 3.6, raster: false },
  style: OHIO_RIVER,
  landmarks: {
    // PPG Place: Philip Johnson's dark glass castle round its plaza
    "one ppg place": { wall: R.glassDark, roof: R.glassDark, pattern: Pattern.Curtain, pyramid: 0.06 },
    "two ppg place": { wall: R.glassDark, roof: R.glassDark, pattern: Pattern.Curtain },
    "three ppg place": { wall: R.glassDark, roof: R.glassDark, pattern: Pattern.Curtain },
    "four ppg place": { wall: R.glassDark, roof: R.glassDark, pattern: Pattern.Curtain },
    "five ppg place": { wall: R.glassDark, roof: R.glassDark, pattern: Pattern.Curtain },
    "six ppg place": { wall: R.glassDark, roof: R.glassDark, pattern: Pattern.Curtain },
    "ppg place wintergarden": { wall: R.glassDark, roof: R.glassDark, pattern: Pattern.Curtain },
    // weathering steel, rusted brown
    "u.s. steel tower": {
      wall: R.roofBrown,
      roof: R.roofGravel,
      glass: R.glassBronze,
      pattern: Pattern.Tall,
    },
    "cathedral of learning": { wall: R.limestone, roof: R.limestone, pattern: Pattern.Tall },
    "gulf tower": { wall: R.limestone, roof: R.limestone, pattern: Pattern.Punched, pyramid: 0.1 },
    "fifth avenue place": { wall: R.greyStone, roof: R.greyStone, pattern: Pattern.Tall, pyramid: 0.12 },
    "bny mellon center": { wall: R.darkStone, roof: R.roofGravel, pattern: Pattern.Tall },
    "tower at pnc plaza": { wall: R.glassSilver, roof: R.roofGravel, pattern: Pattern.Curtain },
    "allegheny county courthouse": { wall: R.greyStone, roof: R.roofSlate, pattern: Pattern.Tall },
    "heinz memorial chapel": { wall: R.limestone, roof: R.roofSlate },
    // the stands: the Pirates' blue seats, the Steelers' gold
    "pnc park": { wall: R.concrete, roof: R.sidingBlue },
    "acrisure stadium": { wall: R.concrete, roof: R.taxi },
    "ppg paints arena": { wall: R.glassSilver, roof: R.roofSilver },
  },
  statues: [],
  // the rivers run inside the land polygons: their bridges rise over them
  riverBridges: true,
  sights: {
    placeWords: ["Pittsburgh", "Pennsylvania", "Western Pennsylvania", "Allegheny County", "Steel City"],
    // the context lines say "Downtown" or "Oakland": a question's area is its town
    areaByDistrict: true,
    // the articles a nearby title match misses: their titles are longer
    wikipedia: {
      "phipps conservatory": "Phipps Conservatory and Botanical Gardens",
      "soldiers and sailors memorial hall": "Soldiers and Sailors Memorial Hall and Museum",
      "veterans bridge": "Veterans Bridge (Pittsburgh)",
    },
    // the other names their openings give, which would give them away
    aliases: {
      "u.s. steel tower": ["USX Tower"],
      "acrisure stadium": ["Heinz Field"],
      "ppg paints arena": ["Consol Energy Center"],
      "kamin science center": ["Carnegie Science Center"],
      "roberto clemente bridge": ["Sixth Street Bridge"],
      "andy warhol bridge": ["Seventh Street Bridge"],
      "rachel carson bridge": ["Ninth Street Bridge"],
      "david mccullough bridge": ["16th Street Bridge", "Sixteenth Street Bridge"],
      "fort duquesne bridge": ["Bridge to Nowhere"],
      "eqt plaza": ["CNG Tower", "Dominion Tower"],
      "11 stanwix street": ["Westinghouse Tower"],
      "alumni hall": ["Masonic Temple"],
      "wesley w. posvar hall": ["Forbes Quadrangle"],
      "east liberty presbyterian church": ["Cathedral of Hope"],
      "o'hara student center": ["Concordia Club"],
      "tower two-sixty": ["The Gardens at Market Square", "The Gardens"],
    },
    // the bridges whose pieces are filed under their roads' names alone
    bridges: {
      "smithfield street bridge": ["Smithfield Street"],
      "fort pitt bridge": ["Penn-Lincoln Parkway West"],
      "hot metal bridge": ["Hot Metal Bike/Pedestrian Bridge", "Hot Metal Street"],
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
      minHeight: 40,
      classes: ["church", "civic", "public", "government", "university", "college", "library"],
    },
  },
};
